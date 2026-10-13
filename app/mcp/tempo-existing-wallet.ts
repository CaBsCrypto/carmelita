import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";
import { requireMcpSubject } from "@/app/mcp/auth";
import { getCanonicalEvmWallet } from "@/app/multichain-account";
import { getExistingUserEvmWallet, isValidWalletAddress } from "@/app/wallets/privy";
import { isTempoTestnetEnabled, TEMPO_MODERATO_CAIP2, TEMPO_MODERATO_CHAIN_ID, TEMPO_MODERATO_EXPLORER_URL, TEMPO_MODERATO_TOKEN } from "@/app/wallets/networks";
import { readTempoWallet, type TempoReadOptions } from "@/app/wallets/tempo";
import type { TempoReadErrorCode, TempoWalletReading, UserWallet } from "@/app/wallets/types";

export const tempoExistingWalletInputSchema = z.object({}).strict();

export type TempoExistingWalletDependencies = {
  getCanonicalWallet: (userId: string) => Promise<Awaited<ReturnType<typeof getCanonicalEvmWallet>> | null>;
  getExistingWallet: typeof getExistingUserEvmWallet;
  read: (address: string, options?: TempoReadOptions) => Promise<TempoWalletReading>;
  enabled: () => boolean;
  now: () => Date;
  signal?: AbortSignal;
};

const errorMessages: Record<TempoReadErrorCode, string> = {
  tempo_disabled: "Tempo testnet is disabled in this environment.",
  tempo_configuration_incomplete: "Tempo testnet configuration is incomplete.",
  tempo_wrong_chain: "The RPC did not report Tempo Moderato chain 42431.",
  tempo_rpc_timeout: "The Tempo testnet reading timed out.",
  tempo_rpc_unavailable: "The Tempo testnet RPC is unavailable.",
  tempo_rpc_invalid_response: "The Tempo testnet reading could not be verified.",
  tempo_token_metadata_mismatch: "The Tempo testnet token metadata did not match its configuration.",
  tempo_invalid_address: "The existing EVM address is invalid.",
};
const integer = z.string().regex(/^(?:0|[1-9]\d*)$/);
const contextSchema = z.object({
  network: z.literal("tempo:moderato"), caip2: z.literal(TEMPO_MODERATO_CAIP2), testnet: z.literal(true),
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/), queriedAt: z.iso.datetime(),
});
const readingSchema = z.discriminatedUnion("status", [
  contextSchema.extend({
    status: z.literal("available"), chainId: z.literal(TEMPO_MODERATO_CHAIN_ID),
    token: z.object({
      standard: z.literal("TIP-20"), address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      name: z.literal(TEMPO_MODERATO_TOKEN.name), symbol: z.literal(TEMPO_MODERATO_TOKEN.symbol),
      decimals: z.literal(TEMPO_MODERATO_TOKEN.decimals), metadataVerified: z.literal(true),
      balanceAtomic: integer, balance: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/),
    }),
    block: z.object({ number: integer, hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/), timestamp: integer }),
  }),
  contextSchema.extend({
    status: z.enum(["disabled", "misconfigured", "wrong_network", "unavailable"]), token: z.null(), block: z.null(),
    error: z.object({ code: z.enum(Object.keys(errorMessages) as [TempoReadErrorCode, ...TempoReadErrorCode[]]) }),
  }),
]);

/** Validate owner-bound public fields; never forward provider messages or additional fields. */
export function projectTempoReading(address: string, input: unknown, queriedAt: string): TempoWalletReading {
  const context = { network: "tempo:moderato" as const, caip2: TEMPO_MODERATO_CAIP2, testnet: true as const,
    address, queriedAt, explorerUrl: `${TEMPO_MODERATO_EXPLORER_URL}/address/${address}` };
  const failure = (code: TempoReadErrorCode, at = queriedAt): TempoWalletReading => ({
    ...context, queriedAt: at, status: code === "tempo_disabled" ? "disabled"
      : code === "tempo_configuration_incomplete" ? "misconfigured" : code === "tempo_wrong_chain" ? "wrong_network" : "unavailable",
    token: null, block: null, error: { code, message: errorMessages[code] },
  });
  const parsed = readingSchema.safeParse(input);
  if (!parsed.success || parsed.data.address.toLowerCase() !== address.toLowerCase()) return failure("tempo_rpc_invalid_response");
  const reading = parsed.data;
  if (reading.status !== "available") return failure(reading.error.code, reading.queriedAt);
  if (reading.token.address.toLowerCase() !== TEMPO_MODERATO_TOKEN.address.toLowerCase()) return failure("tempo_token_metadata_mismatch");
  const [whole, fraction = ""] = reading.token.balance.split(".");
  if (fraction.length > reading.token.decimals
    || BigInt(whole) * BigInt(10) ** BigInt(reading.token.decimals) + BigInt(fraction.padEnd(reading.token.decimals, "0")) !== BigInt(reading.token.balanceAtomic)) {
    return failure("tempo_rpc_invalid_response");
  }
  return { ...context, queriedAt: reading.queriedAt, status: "available", chainId: TEMPO_MODERATO_CHAIN_ID,
    token: { ...reading.token, address: TEMPO_MODERATO_TOKEN.address },
    block: { number: reading.block.number, hash: reading.block.hash as `0x${string}`, timestamp: reading.block.timestamp } };
}

const walletErrors = new Set(["existing_evm_wallet_required", "wallet_identity_conflict", "wallet_ownership_conflict",
  "privy_evm_wallet_ambiguous", "wallet_persistence_unavailable", "database_not_configured", "privy_not_configured"]);

/** Reads an existing owner EVM on Moderato without checking or writing a Tempo registration. */
export async function readTempoExistingWallet(input: unknown, authInfo: AuthInfo | undefined, dependencies: Partial<TempoExistingWalletDependencies> = {}) {
  const userId = requireMcpSubject(authInfo, "user", "userId", "agent:read");
  if (!/^did:privy:[A-Za-z0-9_-]{1,256}$/.test(userId)) throw new Error("invalid_privy_user_id");
  tempoExistingWalletInputSchema.parse(input);
  if (!(dependencies.enabled ?? isTempoTestnetEnabled)()) throw new Error("tempo_disabled");
  if (dependencies.signal?.aborted) throw new Error("tempo_rpc_unavailable");
  let wallet: UserWallet;
  let canonical: Awaited<ReturnType<typeof getCanonicalEvmWallet>> | null;
  try {
    canonical = await (dependencies.getCanonicalWallet ?? getCanonicalEvmWallet)(userId);
    if (!canonical) throw new Error("existing_evm_wallet_required");
    if (!canonical.id || canonical.userId !== userId || canonical.chainType !== "ethereum"
      || !isValidWalletAddress("evm", canonical.address)) throw new Error("wallet_identity_conflict");
    wallet = await (dependencies.getExistingWallet ?? getExistingUserEvmWallet)(userId, { canonicalEvmWallet: async () => canonical });
  }
  catch (error) {
    const code = error instanceof Error ? error.message : "";
    throw new Error(walletErrors.has(code) ? code : "existing_evm_wallet_unavailable");
  }
  if (!wallet.id || wallet.owner !== "user" || wallet.created !== false || wallet.family !== "evm"
    || wallet.chainType !== "ethereum" || !isValidWalletAddress("evm", wallet.address)
    || wallet.id !== canonical.id || wallet.address.toLowerCase() !== canonical.address.toLowerCase()) throw new Error("wallet_identity_conflict");
  // Keep the SQL canonical casing even if a provider returns lowercase.
  wallet = { ...wallet, address: canonical.address };
  const queriedAt = (dependencies.now ?? (() => new Date()))().toISOString();
  let reading: unknown;
  try { reading = await (dependencies.read ?? readTempoWallet)(wallet.address, { signal: dependencies.signal }); }
  catch { reading = { network: "tempo:moderato", caip2: TEMPO_MODERATO_CAIP2, testnet: true, address: wallet.address,
    queriedAt, status: "unavailable", token: null, block: null, error: { code: "tempo_rpc_unavailable" } }; }
  return {
    source: "existingEVM" as const,
    evm: { address: wallet.address, family: "evm" as const, chainType: "ethereum" as const, ownershipVerified: true as const },
    tempo: projectTempoReading(wallet.address, reading, queriedAt),
    registryChanged: false as const, walletCreated: false as const, fundsMoved: false as const,
    signingRequired: false as const, tempoRegistrationChecked: false as const,
  };
}

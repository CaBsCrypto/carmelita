import { getCanonicalStellarWallet } from "@/app/multichain-account";
import { fundStellarTestnetWallet, getStellarTestnetAccount, isValidStellarAddress } from "@/app/privy-stellar";
import type { UserWallet } from "@/app/wallets/types";
import { stellarActivationClaims, STELLAR_ACTIVATION_COOLDOWN_MS,
  type StellarActivationClaimStore, type StellarActivationLease } from "./stellar-activation-claim";

export type StellarAccount = Awaited<ReturnType<typeof getStellarTestnetAccount>>;
export type StellarActivationResult = {
  account: StellarAccount | null; activation: "active" | "pending" | "unknown";
  fundsMoved: false | true | null; faucetRequested: boolean; transactionHash: string | null;
  error: string | null; retryable: boolean; retryAfterMs: number | null;
};
export type StellarActivationDependencies = {
  canonical: (userId: string) => Promise<Awaited<ReturnType<typeof getCanonicalStellarWallet>> | null>;
  claims: StellarActivationClaimStore;
  read: typeof getStellarTestnetAccount;
  fund: typeof fundStellarTestnetWallet;
  now: () => number;
  budgetMs: number;
  readBudgetMs: number;
  fundBudgetMs: number;
};
const defaults: StellarActivationDependencies = {
  canonical: getCanonicalStellarWallet, claims: stellarActivationClaims,
  read: getStellarTestnetAccount, fund: fundStellarTestnetWallet, now: Date.now,
  budgetMs: 20_000, readBudgetMs: 4_000, fundBudgetMs: 8_000,
};
class ActivationDeadline extends Error {}

/** Abort and race every operation: a transport ignoring AbortSignal cannot resume
 * the workflow after its deadline or write a late confirmation. */
async function bounded<T>(work: (signal: AbortSignal) => Promise<T>, signal: AbortSignal, budgetMs?: number) {
  if (signal.aborted) throw new ActivationDeadline();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectDeadline!: (error: Error) => void;
  const cancelled = new Promise<never>((_, reject) => { rejectDeadline = reject; });
  const abort = () => { controller.abort(); rejectDeadline(new ActivationDeadline()); };
  signal.addEventListener("abort", abort, { once: true });
  if (budgetMs !== undefined) timer = setTimeout(abort, budgetMs);
  try {
    if (controller.signal.aborted) throw new ActivationDeadline();
    const result = await Promise.race([work(controller.signal), cancelled]);
    if (controller.signal.aborted || signal.aborted) throw new ActivationDeadline();
    return result;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

export async function ensureStellarTestnetActivation(
  input: { userId: string; wallet: UserWallet; account: StellarAccount | null },
  overrides: Partial<StellarActivationDependencies> = {},
): Promise<StellarActivationResult> {
  const deps = { ...defaults, ...overrides };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(20_000, deps.budgetMs)));
  let account = input.account;
  let faucetRequested = false;
  let transactionHash: string | null = null;
  let lease: StellarActivationLease | null = null;
  const result = (error: string | null, retryable = false, retryAfterMs: number | null = null): StellarActivationResult => ({
    account, activation: account?.exists === true ? "active" : account?.exists === false ? "pending" : "unknown",
    fundsMoved: !faucetRequested ? false : transactionHash && account?.exists === true ? true : null,
    faucetRequested, transactionHash, error, retryable, retryAfterMs,
  });
  const read = () => bounded(signal => deps.read(input.wallet.address, signal), controller.signal, Math.max(1, deps.readBudgetMs));
  const write = (status: "funding" | "confirmed" | "uncertain" | "pending", error: string | null) => bounded(() => deps.claims.write(lease!, {
    status, error, transactionHash, now: new Date(deps.now()),
  }), controller.signal);
  try {
    if (!/^did:privy:[^\s:]+$/.test(input.userId) || !input.wallet.id || input.wallet.owner !== "user"
      || input.wallet.family !== "stellar" || input.wallet.chainType !== "stellar" || !isValidStellarAddress(input.wallet.address)) {
      account = null;
      return result("wallet_identity_conflict");
    }
    let canonical: Awaited<ReturnType<typeof getCanonicalStellarWallet>> | null;
    try { canonical = await bounded(() => deps.canonical(input.userId), controller.signal); }
    catch {
      return result("stellar_activation_storage_unavailable", true);
    }
    if (!canonical || canonical.userId !== input.userId || canonical.id !== input.wallet.id
      || canonical.address !== input.wallet.address || canonical.chainType !== "stellar") {
      account = null;
      return result("wallet_identity_conflict");
    }
    if (!account) return result("stellar_account_unavailable", true);
    if (account.exists === true) return result(null);
    if (account.exists !== false) { account = null; return result("stellar_account_unavailable", true); }
    let claim;
    try {
      claim = await bounded(() => deps.claims.acquire({ userId: input.userId, address: input.wallet.address,
        now: new Date(deps.now()) }), controller.signal);
    } catch { return result("stellar_activation_storage_unavailable", true); }
    lease = claim.lease;
    // A previous request may have succeeded despite a lost Friendbot response.
    // Always reconcile the same address before attempting another request.
    try { account = await read(); }
    catch { account = null; return result("stellar_account_unavailable", true, claim.retryAfterMs); }
    if (account.exists === true) {
      if (lease) {
        try { if (!await write("confirmed", null)) return result("stellar_activation_claim_superseded", true); }
        catch { return result("stellar_activation_storage_unavailable", true); }
      }
      return result(null);
    }
    if (account.exists !== false) { account = null; return result("stellar_account_unavailable", true); }
    if (!lease) return result("stellar_activation_pending", true, claim.retryAfterMs);
    try {
      if (!await write("funding", null)) return result("stellar_activation_claim_superseded", true, STELLAR_ACTIVATION_COOLDOWN_MS);
    } catch { return result("stellar_activation_storage_unavailable", true); }
    let fundingFailed = false;
    try {
      const funded = await bounded(signal => {
        faucetRequested = true;
        return deps.fund(input.wallet.address, signal);
      }, controller.signal, Math.max(1, deps.fundBudgetMs));
      if (typeof funded.transactionHash === "string" && /^[a-f0-9]{64}$/i.test(funded.transactionHash)) transactionHash = funded.transactionHash.toLowerCase();
    } catch { fundingFailed = true; }
    try { account = await read(); }
    catch { account = null; }
    const error = account?.exists === true ? null : account
      ? fundingFailed ? "stellar_activation_faucet_unavailable" : "stellar_activation_unconfirmed"
      : "stellar_account_unavailable";
    try {
      if (!await write(account?.exists === true ? "confirmed" : "uncertain", error)) {
        return result("stellar_activation_claim_superseded", true, STELLAR_ACTIVATION_COOLDOWN_MS);
      }
    } catch { return result("stellar_activation_storage_unavailable", true, STELLAR_ACTIVATION_COOLDOWN_MS); }
    return result(error, Boolean(error), error ? STELLAR_ACTIVATION_COOLDOWN_MS : null);
  } catch {
    account = null;
    return result("stellar_activation_unavailable", true, faucetRequested ? STELLAR_ACTIVATION_COOLDOWN_MS : null);
  } finally { clearTimeout(timer); }
}

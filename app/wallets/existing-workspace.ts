type WalletRow = { id: string; userId: string; address: string; chainType: string; network: string; status: string };

/** A registry read is not wallet creation, activation, a balance or ownership at Privy. */
export async function readExistingWorkspaceWallets(
  userId: string,
  read: (userId: string) => Promise<WalletRow[]>,
) {
  if (!/^did:privy:.+/.test(userId)) throw Error("invalid_privy_user_id");
  const rows = (await read(userId)).filter(row => row.userId === userId);
  function family(chainType: string, network: string) {
    const matches = rows.filter(row => row.chainType === chainType && row.network === network && row.status === "active");
    const unique = [...new Map(matches.map(row => [row.id, row])).values()];
    const row = unique.length === 1 ? unique[0] : null;
    return {
      wallet: row ? { id: row.id, address: row.address, chainType, created: false, owner: "user" as const } : null,
      preparation: { status: unique.length > 1 ? "conflict" as const : row ? "ready" as const : "failed" as const,
        error: unique.length > 1 ? "wallet_identity_conflict" : row ? null : "existing_wallet_not_registered", retryable: false },
    };
  }
  const stellar = family("stellar", "stellar:testnet"), evm = family("ethereum", "avalanche:fuji"), solana = family("solana", "solana:devnet");
  return {
    user: { id: userId, email: null }, readOnly: true as const,
    wallet: stellar.wallet, wallets: { stellar: stellar.wallet, avalanche: evm.wallet, evm: evm.wallet, solana: solana.wallet },
    preparation: { stellar: stellar.preparation, evm: evm.preparation, solana: solana.preparation },
    account: null, activation: "unknown" as const, fundsMoved: false,
    signingRequired: false, createsWallets: false, activatesWallets: false,
    registryStatus: rows.length ? "registered" : "empty",
  };
}

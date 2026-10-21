import { createHash } from "node:crypto";
import { isValidWalletAddress } from "./privy";
import type { WalletFamily } from "./types";

export type InventoryWallet = { id: string; userId: string; address: string; chainType: string };
export type InventoryBinding = { walletId: string; userId: string; network: string };
export type InventoryUser = { id: string; status: string; normalLogin: boolean };
export const BACKFILL_NETWORKS: Record<WalletFamily, string[]> = {
  stellar: ["stellar:testnet"], evm: ["avalanche:fuji", "bnb:testnet", "base:sepolia"], solana: ["solana:devnet"],
};
const chains = { stellar: "stellar", evm: "ethereum", solana: "solana" };
const families = ["stellar", "evm", "solana"] as const;
export function inventoryDigest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function inspectPreparationInventory(users: InventoryUser[], wallets: InventoryWallet[], bindings: InventoryBinding[]) {
  return [...users].sort((a,b)=>a.id.localeCompare(b.id)).map(user => {
    const owned = wallets.filter(w=>w.userId===user.id).sort((a,b)=>a.id.localeCompare(b.id));
    const excludedReason = user.status!=="active" ? "inactive" : !user.id.startsWith("did:privy:") ? "not_privy" : !owned.length&&!user.normalLogin ? "no_onboarding_evidence" : null;
    const states = Object.fromEntries(families.map(family=>{
      const candidates = owned.filter(w=>w.chainType===chains[family]);
      if(candidates.length>1) return [family,"conflict"];
      if(!candidates.length) return [family,"pending"];
      const wallet=candidates[0];
      const normalize=(address:string)=>family==="evm" ? address.toLowerCase() : address;
      if(!isValidWalletAddress(family,wallet.address) || wallets.some(w=>w.id!==wallet.id&&normalize(w.address)===normalize(wallet.address))) return [family,"conflict"];
      const associated=bindings.filter(b=>b.walletId===wallet.id);
      if(associated.some(b=>b.userId!==user.id||!BACKFILL_NETWORKS[family].includes(b.network)) || bindings.some(b=>b.userId===user.id&&BACKFILL_NETWORKS[family].includes(b.network)&&b.walletId!==wallet.id)) return [family,"conflict"];
      return [family,BACKFILL_NETWORKS[family].every(network=>associated.some(b=>b.network===network)) ? "complete" : "pending"];
    })) as Record<WalletFamily,"pending"|"complete"|"conflict">;
    return { userId:user.id, excludedReason, evidence:user.normalLogin ? "normal_login" : owned.length ? "existing_wallet" : "none", states, wallets:owned,
      bindings:bindings.filter(b=>b.userId===user.id).sort((a,b)=>`${a.walletId}:${a.network}`.localeCompare(`${b.walletId}:${b.network}`)) };
  });
}
export function assertIdentitiesPreserved(before: InventoryWallet[], after: InventoryWallet[]) {
  for(const wallet of before) {
    const current=after.find(w=>w.id===wallet.id);
    if(!current||current.userId!==wallet.userId||current.address!==wallet.address||current.chainType!==wallet.chainType) throw new Error("backfill_identity_changed");
  }
}

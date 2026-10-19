import { PrivyClient } from "@privy-io/node";
import { requiredPrivyCredentials } from "@/app/privy-client";
import { existingBazaarConnectionStore } from "./native-connection-store";
import { existingCarmelitaPilotOwner } from "./pilot-signer";

/** Reuse existing owner/session/wallet/link checks, with a dedicated no-retry
 * read client. This bridge exposes no signer, wallet creation or JWT exchange. */
export async function existingHandoffOwner(accessToken:string,walletId:string) {
  const connection=existingBazaarConnectionStore();
  const owner=await existingCarmelitaPilotOwner({accessToken,walletId},{
    async verifyUser(token) { const {verifyPrivyAccessToken}=await import("@/app/privy-stellar");return (await verifyPrivyAccessToken(token)).user_id; },
    async persistedWallets(userId) { const {listPersistedUserWallets}=await import("@/app/multichain-account");return listPersistedUserWallets(userId); },
    async ownedWallets(userId) {
      if (process.env.PRIVY_API_CUSTOM_HEADERS) throw Error("handoff_ambient_headers_denied");
      let used=false;
      const guarded:typeof fetch=async(target,init)=>{
        const url=new URL(String(target));
        if (used || url.origin!=="https://api.privy.io" || url.pathname!=="/v1/wallets" || url.hash || url.username || url.password
          || (init?.method??"GET")!=="GET" || [...url.searchParams.keys()].sort().join(",")!=="chain_type,limit,user_id"
          || url.searchParams.get("user_id")!==userId || url.searchParams.get("chain_type")!=="stellar" || url.searchParams.get("limit")!=="100") throw Error("handoff_wallet_scope_denied");
        used=true; const signal=AbortSignal.any([AbortSignal.timeout(5000),...(init?.signal?[init.signal]:[])]);
        const result=await fetch(target,{...init,signal,redirect:"error",credentials:"omit",cache:"no-store"});
        if (result.redirected || result.status>=300&&result.status<400 || result.headers.has("location") || result.url&&new URL(result.url).origin!==url.origin) throw Error("handoff_wallet_unconfirmed");
        const reader=result.body?.getReader(),parts:Uint8Array[]=[];let bytes=0;
        try { if (reader) for (;;) { const part=await reader.read();signal.throwIfAborted();if (part.done) break;bytes+=part.value.length;if (bytes>65536) throw Error("handoff_wallet_response_too_large");parts.push(part.value); }
          return new Response(Buffer.concat(parts),{status:result.status,headers:result.headers});
        } finally { await reader?.cancel().catch(()=>{});reader?.releaseLock();parts.forEach(p=>p.fill(0)); }
      };
      const client=new PrivyClient({...requiredPrivyCredentials(),maxRetries:0,timeout:5000,logLevel:"off",logger:{debug(){},info(){},warn(){},error(){}},fetch:guarded});
      const page=await client.wallets().list({user_id:userId,chain_type:"stellar",limit:100}),wallets=[];
      for await (const wallet of page) { if (wallets.length>=100) throw Error("handoff_wallet_page_limit");wallets.push({id:wallet.id,address:wallet.address,chainType:wallet.chain_type}); }return wallets;
    },
    bindingForUser:userId=>connection.bindingForUser(userId),
    agentSecretForUser:(userId,reference)=>connection.agentSecretForUser(userId,reference),
  });
  // Deliberately omit signAuthEntry; the handoff consumes only a stored signature.
  return {userId:owner.userId,walletId:owner.walletId,identity:owner.identity,connectionReferenceHash:owner.connectionReferenceHash,agentToken:owner.agentToken,assertCurrent:owner.assertCurrent};
}

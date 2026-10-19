"use client";
import { useEffect, useRef, useState } from "react";

type State={state:string;revision:number;nonce?:string;handoffEnabled?:boolean;recoveryAvailable?:boolean;approvalExpiresAt?:string;observation?:{phase:string;paymentObserved:boolean;receiptObserved:boolean;deliveryObserved:boolean;transactionHash?:string}};
const copy={en:{title:"Submit the stored Testnet authorization",intro:"This separate action uses the existing signature once. It creates no order and cannot sign again. An uncertain response locks submission. Checking recovery may ask Bazaar to resume delivery of this paid service, without paying again.",disabled:"Payment submission is disabled.",check:"Check submission status",approve:"Approve one submission",submit:"Submit once",readApprove:"Approve delivery recovery",recover:"Check order and recover delivery",confirm:"I approve this action for the exact 0.01 USDC Testnet order. Recovery may resume its service or delivery, without a new signature or payment.",error:"The action is unconfirmed. Check status; do not submit again.",state:"Submission state",observed:"Last Bazaar observation",receipt:"Payment receipt observed",delivery:"Delivery observed",none:"No completed observation yet.",uncertain:"A claimed action cannot be repeated. Recovery can resume the same paid service or delivery through Bazaar; it never resends payment.",fee:"Network fees must remain sponsored (maximum 1,000,000 stroops). No XLM spending is authorized."},
es:{title:"Enviar la autorización Testnet guardada",intro:"Esta acción separada usa una vez la firma existente. No crea pedidos ni vuelve a firmar. Una respuesta incierta bloquea el envío. Consultar la recuperación puede pedir a Bazaar que reanude la entrega de este servicio pagado, sin volver a pagar.",disabled:"El envío de pagos está desactivado.",check:"Consultar estado del envío",approve:"Aprobar un envío",submit:"Enviar una vez",readApprove:"Aprobar recuperación de entrega",recover:"Consultar y recuperar entrega",confirm:"Apruebo esta acción para el pedido Testnet exacto de 0,01 USDC. La recuperación puede reanudar su servicio o entrega, sin una firma ni un pago nuevos.",error:"La acción no se confirmó. Consulta el estado; no vuelvas a enviar.",state:"Estado del envío",observed:"Última observación de Bazaar",receipt:"Recibo de pago observado",delivery:"Entrega observada",none:"Aún no hay una observación completa.",uncertain:"Una acción reclamada no se repite. La recuperación puede reanudar el mismo servicio pagado o su entrega mediante Bazaar; nunca reenvía el pago.",fee:"La tarifa de red debe seguir patrocinada (máximo 1.000.000 stroops). No se autoriza gasto de XLM."}};
export function HandoffControls({language,getAccessToken}:{language:"en"|"es";getAccessToken:()=>Promise<string|null>}) {
  const t=copy[language],active=useRef<AbortController|null>(null),flight=useRef(false);
  const [status,setStatus]=useState<State|null>(null),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false),[error,setError]=useState(false);
  useEffect(()=>()=>active.current?.abort(),[]);
  async function action(kind:"status"|"approve"|"submit"|"approve-recovery"|"recover") {
    if (flight.current || window.location.origin!=="https://carmelita.browns.studio" || kind!=="status"&&!confirmed) return;
    const controller=new AbortController();flight.current=true;active.current=controller;setBusy(true);setError(false);setConfirmed(false);
    try { const token=await getAccessToken();if (!token || controller.signal.aborted) throw Error();
      const body=kind==="status"?undefined:{action:kind,revision:status?.revision??-1,...(["submit","recover"].includes(kind)?{nonce:status?.nonce}:{}),
        confirmation:["approve-recovery","recover"].includes(kind)?"CHECK SAME TESTNET ORDER AND ALLOW DELIVERY RECOVERY WITHOUT PAYING AGAIN":"SUBMIT 0.01 USDC ON STELLAR TESTNET ONCE"};
      const res=await fetch("/api/connections/bazaar-native/pilot/handoff",{method:body?"POST":"GET",headers:{Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},
        ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(60000)]),redirect:"error",cache:"no-store"});
      const value=await res.json();if (!res.ok || typeof value.state!=="string" || !Number.isSafeInteger(value.revision)) throw Error();
      if (!controller.signal.aborted) setStatus(previous=>({...value,handoffEnabled:value.handoffEnabled??previous?.handoffEnabled}));
    } catch { if (!controller.signal.aborted) { setError(true);setStatus(previous=>previous?{...previous,nonce:undefined}:null); } }
    finally { flight.current=false;active.current=null;if (!controller.signal.aborted) setBusy(false); }
  }
  const enabled=status?.handoffEnabled===true,recoverable=status?.recoveryAvailable===true,locked=status?.state.includes("claimed");
  return <section aria-label={t.title} aria-busy={busy}><h2>{t.title}</h2><p>{t.intro}</p><p>{t.fee}</p>
    {!enabled?<p role="status">{t.disabled}</p>:null}
    <button type="button" disabled={busy} onClick={()=>void action("status")}>{t.check}</button>
    {status?<p>{t.state}: <strong>{status.state}</strong></p>:null}
    {locked?<p role="status">{t.uncertain}</p>:null}
    <p>{status?.observation?`${t.observed}: ${status.observation.phase}. ${t.receipt}: ${String(status.observation.receiptObserved)}. ${t.delivery}: ${String(status.observation.deliveryObserved)}.`:t.none}</p>
    {status?.observation?.transactionHash?<p><code>{status.observation.transactionHash}</code></p>:null}
    <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)} />{t.confirm}</label>
    <button type="button" disabled={busy||!enabled||!confirmed||status?.state!=="not-prepared"} onClick={()=>void action("approve")}>{t.approve}</button>
    <button type="button" disabled={busy||!enabled||!confirmed||status?.state!=="approved"||!status.nonce} onClick={()=>void action("submit")}>{t.submit}</button>
    <button type="button" disabled={busy||!confirmed||!recoverable} onClick={()=>void action("approve-recovery")}>{t.readApprove}</button>
    <button type="button" disabled={busy||!confirmed||status?.state!=="recovery-approved"||!status.nonce} onClick={()=>void action("recover")}>{t.recover}</button>
    <p role="alert">{error?t.error:""}</p>
  </section>;
}

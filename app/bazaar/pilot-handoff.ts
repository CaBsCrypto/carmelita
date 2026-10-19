import { BASE_FEE, Keypair, Networks, Operation, Transaction, TransactionBuilder, hash, scValToNative, xdr } from "@stellar/stellar-sdk";
import { Api, parseRawSimulation } from "@stellar/stellar-sdk/rpc";
import { decodePaymentResponseHeader, decodePaymentSignatureHeader, encodePaymentSignatureHeader } from "@x402/core/http";
import { assertPilotChallenge, assertPilotPreimage, bindPilotSignature, pilotCanonical, PILOT_RESOURCE, PILOT_SPONSORED_FEE_LIMIT, PILOT_TERMS, type PreparedPilot } from "./pilot-signer";
import { PILOT_ID, PILOT_INTENT_HASH, pilotHash } from "./pilot-signer-store";

export type SignedPilot = PreparedPilot & {signedAuthorizationTransaction:string};
export type PaymentPacket = {x402Version:2;resource:SignedPilot["challenge"]["resource"];accepted:SignedPilot["challenge"]["accepts"][0]&{network:"stellar:testnet"};payload:{transaction:string}};
export type Observation = {operationId:string;intentHash:string;phase:string;paymentObserved:boolean;deliveryObserved:boolean;
  transactionHash?:string;paymentVerifiedAt?:string;deliveryFingerprint?:string;receiptObserved:boolean;observedAt:string};
const phases = ["paid","executing","execution-uncertain","delivered","delivery-failed"];
function object(value:unknown):Record<string,unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("handoff_packet_invalid");return value as Record<string,unknown>; }
export function authorizationDeadline(p:SignedPilot) {
  assertPilotPreimage(p); const max = new Transaction(p.unsignedTransaction,Networks.TESTNET).timeBounds?.maxTime;
  if (!max || !/^[0-9]+$/.test(max) || !Number.isSafeInteger(Number(max)*1000) || Number(max) <= 0) throw Error("handoff_authorization_expired"); return Number(max)*1000;
}
/** Real SDK Ed25519 verification and exact reconstruction using the stored
 * unsigned preimage. This function cannot sign or accept an arbitrary payer. */
export async function validateSignedPilot(value:unknown):Promise<SignedPilot> {
  const p = object(value) as SignedPilot; assertPilotPreimage(p);
  if (typeof p.signedAuthorizationTransaction !== "string" || p.signedAuthorizationTransaction.length > 65536) throw Error("handoff_signed_authorization_required");
  const tx = new Transaction(p.signedAuthorizationTransaction,Networks.TESTNET), op = tx.operations[0];
  if (op?.type !== "invokeHostFunction" || op.auth?.length !== 1) throw Error("handoff_signed_authorization_invalid");
  const credentials = op.auth[0].credentials().address(), signatures = scValToNative(credentials.signature()) as Array<{public_key:Uint8Array;signature:Uint8Array}>;
  if (!Array.isArray(signatures) || signatures.length !== 1 || !signatures[0]?.public_key || !signatures[0]?.signature
    || !Buffer.from(signatures[0].public_key).equals(Keypair.fromPublicKey(PILOT_TERMS.payer).rawPublicKey()) || signatures[0].signature.length !== 64) throw Error("handoff_signature_invalid");
  const signature=Buffer.from(signatures[0].signature);
  if (!Keypair.fromPublicKey(PILOT_TERMS.payer).verify(hash(Buffer.from(p.authEntry,"base64")),signature)
    || await bindPilotSignature(p,signature.toString("base64")) !== p.signedAuthorizationTransaction) throw Error("handoff_signature_invalid");
  authorizationDeadline(p); return p;
}
/** Exactly one signed simulation is required. No getLatestLedger or signature
 * regeneration: the same simulation's latestLedger and the original XDR
 * timebounds prove the finite authorization lifetime. */
export function paymentFromSignedSimulation(p:SignedPilot,raw:unknown,now:number):PaymentPacket {
  const original=new Transaction(p.signedAuthorizationTransaction,Networks.TESTNET), result=object(raw), latest=result.latestLedger;
  if (!Number.isSafeInteger(latest) || Number(latest)<1 || Number(latest)>=p.expirationLedger || now>=authorizationDeadline(p)) throw Error("handoff_authorization_expired");
  const sim=parseRawSimulation(result as unknown as Parameters<typeof parseRawSimulation>[0]);
  if (!Api.isSimulationSuccess(sim) || Api.isSimulationRestore(sim) || !sim.result) throw Error("handoff_signed_simulation_rejected");
  const data=sim.transactionData.build(), declared=BigInt(data.resourceFee().toString()), minimum=BigInt(sim.minResourceFee), fee=declared>minimum?declared:minimum;
  if (fee<BigInt(0) || fee+BigInt(BASE_FEE)>BigInt(PILOT_SPONSORED_FEE_LIMIT)) throw Error("handoff_fee_limit_exceeded");
  data.resourceFee(xdr.Int64.fromString(fee.toString()));
  const op=original.operations[0]; if (op.type!=="invokeHostFunction") throw Error("handoff_signed_authorization_invalid");
  const tx=TransactionBuilder.cloneFrom(original,{fee:BASE_FEE,sorobanData:data}).clearOperations().addOperation(Operation.invokeHostFunction({func:op.func,auth:op.auth})).build();
  const expected=original.toEnvelope(), actual=tx.toEnvelope();
  expected.v1().tx().fee(actual.v1().tx().fee()); expected.v1().tx().ext(actual.v1().tx().ext());
  if (expected.toXDR("base64")!==actual.toXDR("base64") || BigInt(tx.fee)!==fee+BigInt(BASE_FEE)) throw Error("handoff_authorization_changed");
  const challenge=assertPilotChallenge(p.challenge), packet:PaymentPacket={x402Version:2,resource:challenge.resource,accepted:{...challenge.accepts[0],network:"stellar:testnet"},payload:{transaction:tx.toXDR()}};
  // Use the real HTTP encoder/decoder. The native proof parser requires this
  // exact accepted/resource tuple and a payload with only transaction.
  const decoded=decodePaymentSignatureHeader(encodePaymentSignatureHeader(packet));
  if (pilotCanonical(decoded)!==pilotCanonical(packet) || Object.keys(decoded.payload).join(",")!=="transaction") throw Error("handoff_payment_packet_changed"); return packet;
}
export function paymentHeader(packet:PaymentPacket) { const value=encodePaymentSignatureHeader(packet); if (Buffer.byteLength(value)>32768) throw Error("handoff_payment_header_too_large");return value; }
export function observeOrder(body:unknown,buyerOwnerId:string,now:number,receiptHeader?:string):Observation {
  const b=object(body),o=object(b.order);
  if (o.operationId!==PILOT_ID || o.buyerOwnerId!==buyerOwnerId || typeof o.sellerOwnerId!=="string" || o.sellerOwnerId===buyerOwnerId
    || o.serviceId!==PILOT_TERMS.card.id || o.paymentProtocol!=="x402-stellar-exact-v2" || o.cardHash!==PILOT_TERMS.cardHash
    || o.inputHash!==PILOT_TERMS.inputHash || pilotHash(pilotCanonical(o.card))!==PILOT_TERMS.cardHash || pilotCanonical(o.input)!==pilotCanonical(PILOT_TERMS.input)
    || o.payer!==PILOT_TERMS.payer || o.destination!==PILOT_TERMS.card.payment.destination || o.amount!=="0.01"
    || pilotCanonical(o.settlement)!==pilotCanonical(PILOT_TERMS.card.payment.identity) || typeof o.phase!=="string"
    || !["awaiting-payment","payment-submitting","payment-uncertain","payment-rejected",...phases].includes(o.phase)) throw Error("handoff_order_changed");
  const paid=phases.includes(o.phase); let receiptObserved=false;
  if (paid && (typeof o.transactionHash!=="string" || !/^[a-f0-9]{64}$/.test(o.transactionHash) || typeof o.paymentVerifiedAt!=="string" || !Number.isFinite(Date.parse(o.paymentVerifiedAt)))) throw Error("handoff_payment_unconfirmed");
  if (receiptHeader!==undefined) {
    if (!paid || !receiptHeader || receiptHeader.length>32768 || b.statusUrl!==PILOT_TERMS.origin+"/api/market/orders/"+PILOT_ID) throw Error("handoff_payment_receipt_invalid");
    const r=decodePaymentResponseHeader(receiptHeader);
    if (r.success!==true || r.network!=="stellar:testnet" || r.payer!==PILOT_TERMS.payer || r.transaction!==o.transactionHash) throw Error("handoff_payment_receipt_invalid"); receiptObserved=true;
  }
  let deliveryFingerprint:string|undefined;
  if (o.delivery!==undefined) { const d=object(o.delivery); if (typeof d.text!=="string" || d.text.length>2000 || d.sha256!==pilotHash(d.text) || d.reference!=="bazaar-order:"+PILOT_ID) throw Error("handoff_delivery_changed");deliveryFingerprint=d.sha256 as string; }
  if (o.phase==="delivered" && !deliveryFingerprint) throw Error("handoff_delivery_unconfirmed");
  return {operationId:PILOT_ID,intentHash:PILOT_INTENT_HASH,phase:o.phase,paymentObserved:paid,deliveryObserved:o.phase==="delivered" && !!deliveryFingerprint,
    receiptObserved,observedAt:new Date(now).toISOString(),...(paid?{transactionHash:o.transactionHash as string,paymentVerifiedAt:o.paymentVerifiedAt as string}:{}),...(deliveryFingerprint?{deliveryFingerprint}:{} )};
}
export const handoffResource=PILOT_RESOURCE;
/** Strict safe projection for encrypted observations returned by owner status.
 * It is evidence reported by Bazaar, never independent chain certification. */
export function storedObservation(value:unknown):Observation {
  const o=object(value),optional=["transactionHash","paymentVerifiedAt","deliveryFingerprint"];
  const keys=["operationId","intentHash","phase","paymentObserved","deliveryObserved","receiptObserved","observedAt",...optional.filter(k=>Object.hasOwn(o,k))];
  if (Object.keys(o).sort().join(",")!==keys.sort().join(",") || o.operationId!==PILOT_ID || o.intentHash!==PILOT_INTENT_HASH
    || typeof o.phase!=="string" || !["awaiting-payment","payment-submitting","payment-uncertain","payment-rejected",...phases].includes(o.phase)
    || typeof o.paymentObserved!=="boolean" || typeof o.deliveryObserved!=="boolean" || typeof o.receiptObserved!=="boolean"
    || o.paymentObserved!==phases.includes(o.phase) || o.deliveryObserved!==(o.phase==="delivered")
    || o.receiptObserved&&!o.paymentObserved || typeof o.observedAt!=="string" || !Number.isFinite(Date.parse(o.observedAt)) || new Date(o.observedAt).toISOString()!==o.observedAt
    || (o.paymentObserved ? typeof o.transactionHash!=="string" || !/^[a-f0-9]{64}$/.test(o.transactionHash) || typeof o.paymentVerifiedAt!=="string" || !Number.isFinite(Date.parse(o.paymentVerifiedAt)) : Object.hasOwn(o,"transactionHash")||Object.hasOwn(o,"paymentVerifiedAt"))
    || Object.hasOwn(o,"deliveryFingerprint")&&(typeof o.deliveryFingerprint!=="string"||!/^[a-f0-9]{64}$/.test(o.deliveryFingerprint)) || o.deliveryObserved&&!Object.hasOwn(o,"deliveryFingerprint")) throw Error("handoff_observation_invalid");
  return o as unknown as Observation;
}

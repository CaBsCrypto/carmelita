const actionableFields = new Set(["purchaseDescriptor", "checkoutUrl", "paymentUrl", "statusUrl", "approvalUrl", "signingHash", "signingAddress", "transactionXdr", "signedPayload", "paymentRequired"]);
/** Public upstream purchase metadata cannot become a native checkout handoff. */
export function projectNativeBazaarRead(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(projectNativeBazaarRead);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !actionableFields.has(key)).map(([key, item]) => [key, projectNativeBazaarRead(item)]));
  return value;
}

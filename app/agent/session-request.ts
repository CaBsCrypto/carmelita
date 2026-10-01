/** Bound SDK/body promises too: aborting fetch alone does not bound token or refresh waits. */
export function sessionAbortable<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const cancel = () => reject(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
    Promise.resolve().then(() => {
      signal.throwIfAborted();
      return operation();
    }).then(value => {
      signal.throwIfAborted();
      resolve(value);
    }).catch(reject).finally(() => signal.removeEventListener("abort", cancel));
  });
}

# Personal apps and Bazaar: candidate acceptance

This branch adds personal app installation gates, administrative proposal review, the current public Bazaar catalogue contract and a separate Testnet consumption pilot. It has not been deployed or accepted by a human tester in ChatGPT. Local tests use synthetic owners and injected stores/clients; they do not access production, a database, an external provider or Stellar RPC.

The registry now contains 50 read definitions, including six Bazaar metadata reads. Those six require the authenticated owner's active Bazaar installation before contacting the provider. A public provider listing, an accepted proposal or another user's installation never grants access. `agent:read` remains the default personal credential scope. `agent:services:manage` is optional and must be granted explicitly for app changes; neither scope authorizes payment signing or submission from ChatGPT.

## Source fingerprints and historical observations

The runtime snapshot is refreshed from the final local source with `buildAcceptanceRuntimeFingerprints`. The common MCP handler and its new runtime dependencies affect all six conservative groups. Consequently all 50 reads evaluate as pending on this candidate: the 36 historical entries no longer match this source, and the other 14 lack matching operational observations. Pending acceptance is distinct from whether an adapter can execute a controlled local read.

The original historical manifest and evidence are preserved byte for byte:

| Artifact | SHA-256 |
| --- | --- |
| `app/queries/acceptance-manifest.json` | `e5eee534c083e6881b129b7bf58a16616b608ddb646cc18da6cbcd04a70d9af8` |
| `app/queries/acceptance-evidence.json` | `924024612e3318608fa41aecd3449f537b45daa4db85838737894acc3cb2ae25` |

The dated [historical acceptance matrix](channel-parity-acceptance.md) remains a record of its observed commits and deployments. Refreshing `acceptance-runtime.json` changes only the checked source identity. It does not rewrite observations, certify a provider, migrate acceptance to this branch or authorize publication.

Before release, freeze the candidate commit and execute the required local checks. Hosted verification needs a separately approved publication after the build-cost review. Operational acceptance then requires reviewed, authenticated consultations in Carmelita and ChatGPT on that deployed candidate, with ownership, scope, isolation, read-only semantics and provider availability verified. Keep missing prerequisites, service failures and partial results explicit. Do not replace those observations with fixtures, public HTTP probes or source hashes.

The purchase pilot has independent flags, app permissions, exact terms and explicit confirmation. Its local tests cover duplicate submission, uncertainty and recovery, but they do not certify a real payment or delivery. Historical catalogue reads and proposal acceptance do not certify execution or a purchase.

# Project-local Graphify

The global Windows launchers can point to a removed Python installation. These scripts resolve the primary checkout using Git's common directory and use `<primary-checkout>/work/graphify-runtime`. They never modify a global Python or install/update a global skill. Each checkout keeps its own ignored `graphify-out/`.

`graphifyy==0.9.76` was verified against the PyPI package index, independently of the installed skill's `.graphify_version` marker (`0.9.18`). All dependency versions are frozen in `scripts/graphify-requirements.txt`.

First setup, using an existing Python 3.12+ interpreter:

```powershell
$env:GRAPHIFY_BASE_PYTHON = 'C:/Users/MGC/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
npm run graph:setup
```

Setup installs only into the ignored project runtime, from `https://pypi.org/simple`. It requires network access. Subsequent commands use that runtime without activating it:

```powershell
npm run graph:doctor
npm run graph:tooling:test
# A fresh checkout does not need a seed graph; this builds AST deterministically.
node scripts/graphify.mjs update . --no-cluster
# Generates report with deterministic local labels, no paid labeling.
npm run graph:update
node scripts/graphify.mjs query 'memory policy' --budget 1500
node scripts/graphify.mjs path 'policy' 'memory'
node scripts/graphify.mjs explain 'memory'
```

Before a natural-language query, select tokens from the graph's actual vocabulary as directed by the Graphify skill. The wrapper caps query budgets at 1500, enforces `--code-only` for extraction, and disables LLM labels for `cluster-only`. `update` is upstream's local AST rebuild; it does not call an API. The wrapper persists required exclusions in each checkout's ignored graph metadata, so it works even before its `.graphifyignore` change is cherry-picked. It also excludes untracked files: stage new source files before graph updates. These exclusions and `.graphifyignore` keep local work evidence, credentials, docs, audio, durable preparation, migration 0022 and Bazaar out of this sprint's graph. Do not override exclusions or copy private evidence into a checkout.

The doctor verifies the exact package version and dependency integrity. It reports whether this checkout has a graph. Global skill-version mismatch warnings are informational; refreshing global skills is outside this repair. Query output uses the upstream 1500-token cap; path/explain output has a 6000-character cap (approximately 1500 tokens). Builds accept only the current checkout root.

The default package installation has no SQL grammar. SQL files are skipped with an explicit upstream warning; the graph covers application code, not SQL schema, until a separate SQL-extra installation is authorized and pinned. Files with no extracted symbols are also reported explicitly.

Graphify graphs preserve a single edge per pair; diagnostics may report collapsed relationships. Treat graph relationships as navigation evidence and verify material behavior in source and tests.

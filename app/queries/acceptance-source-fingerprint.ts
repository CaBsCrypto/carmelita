// Build/test helper only. The deployed evaluator reads acceptance-runtime.json and never reads source files.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { acceptanceFingerprint } from "./acceptance";

const groupRoots = {
  market: "app/queries/market.ts",
  personal: "app/queries/personal.ts",
  ecosystem: "app/queries/ecosystem.ts",
  discovery: "app/queries/discovery.ts",
  metadata: "app/queries/metadata.ts",
  commerce: "app/queries/commerce.ts",
} as const;
const commonRoots = ["app/queries/types.ts", "app/queries/adapters.ts", "app/queries/chat.ts",
  "app/api/agent/queries/route.ts", "app/api/agent/chat/route.ts", "app/api/mcp/agent/route.ts"];

/** Metadata/proof changes do not change the execution of unrelated business reads. */
function executionSource(sourcePath: string, original: string, metadata: boolean) {
  let source = original.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (sourcePath === "app/queries/registry.ts" && !metadata) {
    source = source.replace(/^import .*from "\.\/(?:market|personal|ecosystem|discovery|metadata|commerce|acceptance)";\n/gm, "")
      .replace(/export const readQueryDefinitions: readonly QueryDefinition\[\] = \[[\s\S]*?\];/, "export const readQueryDefinitions: readonly QueryDefinition[] = [];");
    const discoveryStart = source.indexOf("/** Static coverage");
    if (discoveryStart >= 0) source = source.slice(0, discoveryStart);
  }
  if (sourcePath === "app/agent-chat-store.ts") {
    // Chat GET executes personal.conversation directly. This old compatibility wrapper is not part of POST reads.
    source = source.replace(/^import \{ readAgentConversation \} from [^\n]+;\n/gm, "")
      .replace(/export async function getAgentConversation\(userId: string\) \{\n[\s\S]*?\n\}\n/, "");
  }
  return source;
}

function dependencies(sourcePath: string, compiled: string, root: string) {
  const file = ts.createSourceFile(sourcePath, compiled, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const imports: string[] = [];
  function visit(node: ts.Node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(file);
  return imports.flatMap(specifier => {
    if (!specifier.startsWith("@/") && !specifier.startsWith(".")) return [];
    const base = specifier.startsWith("@/") ? specifier.slice(2) : path.posix.join(path.posix.dirname(sourcePath), specifier);
    const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, `${base}/index.ts`, `${base}/index.tsx`];
    const found = candidates.find(candidate => existsSync(path.join(root, candidate)) && /\.(?:[cm]?js|tsx?|json)$/.test(candidate));
    if (!found) throw new Error(`acceptance_local_dependency_missing:${base}`);
    return [found];
  });
}

export function buildAcceptanceRuntimeFingerprints(root: string, options: {
  readSource?: (sourcePath: string) => string;
  groups?: readonly (keyof typeof groupRoots)[];
} = {}) {
  const readSource = options.readSource ?? (sourcePath => readFileSync(path.join(root, sourcePath), "utf8"));
  const sourceCache = new Map<string, string>();
  const compiledCache = new Map<string, { compiled: string; dependencies: string[] }>();
  const sourceFor = (sourcePath: string) => {
    if (!sourceCache.has(sourcePath)) sourceCache.set(sourcePath, readSource(sourcePath));
    return sourceCache.get(sourcePath)!;
  };
  const groups: Partial<Record<keyof typeof groupRoots, string>> = {};
  const sources: Partial<Record<keyof typeof groupRoots, readonly string[]>> = {};
  for (const name of options.groups ?? Object.keys(groupRoots) as (keyof typeof groupRoots)[]) {
    const metadata = name === "metadata";
    const visited = new Map<string, string>();
    const pending = [...commonRoots, groupRoots[name]];
    while (pending.length) {
      const sourcePath = pending.pop()!;
      if (visited.has(sourcePath)) continue;
      if (sourcePath.startsWith("app/queries/acceptance") && !(metadata && sourcePath === "app/queries/acceptance.ts")) continue;
      if (!metadata && sourcePath === "app/agent-gateway/catalog.ts") continue;
      const source = executionSource(sourcePath, sourceFor(sourcePath), metadata);
      if (sourcePath.endsWith(".json")) {
        visited.set(sourcePath, JSON.stringify(JSON.parse(source)));
        continue;
      }
      const cacheKey = `${metadata && sourcePath === "app/queries/registry.ts" ? "metadata:" : ""}${sourcePath}`;
      if (!compiledCache.has(cacheKey)) {
        const compiled = ts.transpileModule(source, { fileName: sourcePath, compilerOptions: {
          target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX,
          removeComments: true, esModuleInterop: true,
        } }).outputText;
        compiledCache.set(cacheKey, { compiled, dependencies: dependencies(sourcePath, compiled, root) });
      }
      const compiled = compiledCache.get(cacheKey)!;
      visited.set(sourcePath, compiled.compiled);
      pending.push(...compiled.dependencies);
    }
    for (const config of ["package.json", "package-lock.json", "tsconfig.json"]) visited.set(config, JSON.stringify(JSON.parse(sourceFor(config))));
    const entries = [...visited.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    groups[name] = acceptanceFingerprint(entries);
    sources[name] = entries.map(([sourcePath]) => sourcePath);
  }
  return { schemaVersion: 1 as const, groups, sources };
}

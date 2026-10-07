import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const GRAPHIFY_VERSION = "0.9.76";
export const BUILD_EXCLUDES = ["work/", "outputs/", ".codex/", "docs/", ".env*", "**/*connectionfiles*", "**/DBconnectionfiles*", "**/*.pem", "**/*.key", "**/*audio*", "**/*durable*", "**/*0022*", "*.md", "**/*.md", "**/*.pdf", "**/*.mp3", "**/*.wav", "**/*.mp4"];
export function safeArgs(input) {
  const args = [...input];
  const allowed = new Set(["query", "path", "explain", "reflect", "diagnose", "update", "extract", "cluster-only", "--version", "--help"]);
  if (!allowed.has(args[0])) throw new Error("Unsupported Graphify command; use setup, doctor, query, path, explain, update, extract, or cluster-only.");
  if (args.some(a => ["--backend", "--postgres", "--global", "--no-gitignore", "--google-workspace", "--exclude"].some(flag => a === flag || a.startsWith(`${flag}=`)))) throw new Error("External extraction and ignored-file scanning are disabled.");
  if (args[0] === "query") {
    const budgetArgs = args.map((value, index) => ({ value, index })).filter(({ value }) => value === "--budget" || value.startsWith("--budget="));
    if (budgetArgs.length > 1) throw new Error("Specify the query budget only once.");
    if (budgetArgs.length === 1) {
      const { value, index } = budgetArgs[0];
      const budget = Number(value === "--budget" ? args[index + 1] : value.slice("--budget=".length));
      if (!Number.isInteger(budget) || budget < 1 || budget > 1500) throw new Error("Query budget must be between 1 and 1500.");
    } else args.push("--budget", "1500");
  }
  if (args[0] === "extract" && !args.includes("--code-only")) args.push("--code-only");
  if (args[0] === "cluster-only") {
    if (!args.includes("--no-label")) args.push("--no-label");
    if (!args.includes("--no-viz")) args.push("--no-viz");
  }
  return args;
}

export function runtimePython(root, platform = process.platform) {
  return join(root, "work", "graphify-runtime", platform === "win32" ? "Scripts" : "bin", platform === "win32" ? "python.exe" : "python");
}

export function buildConfig(config, untracked) {
  const previousUntracked = new Set(config.carmelita_untracked_excludes ?? []);
  // Bazaar's tracked read adapter is now in scope. Private evidence remains under
  // work/ and every build still excludes ignored and untracked files.
  const retained = (Array.isArray(config.excludes) ? config.excludes : []).filter(pattern => !previousUntracked.has(pattern) && pattern !== "**/*bazaar*");
  return { ...config, excludes: [...new Set([...retained, ...BUILD_EXCLUDES, ...untracked])], gitignore: true, carmelita_untracked_excludes: untracked };
}

export function runtimeEnv(base = process.env) {
  return { ...base, PYTHONUTF8: "1", GRAPHIFY_NO_TIPS: "1", GRAPHIFY_NO_AUTO_REFRESH: "1", GRAPHIFY_MAX_WORKERS: "2", GRAPHIFY_VIZ_NODE_LIMIT: "0" };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw new Error(result.error.message);
  if (result.status !== 0) throw new Error(`Graphify process exited ${result.status}`);
}

function main() {
  // Common git dir points to the primary checkout even when cwd is a worktree.
  const common = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" });
  if (common.status !== 0) throw new Error("Run Graphify from a repository checkout.");
  const root = dirname(common.stdout.trim());
  const python = runtimePython(root);
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const args = process.argv.slice(2);
  if (args[0] === "setup") {
    const base = process.env.GRAPHIFY_BASE_PYTHON;
    if (!base || !existsSync(base)) throw new Error("Set GRAPHIFY_BASE_PYTHON to an existing Python 3.12+ interpreter, then run graph:setup.");
    if (!existsSync(python)) run(base, ["-m", "venv", join(root, "work", "graphify-runtime")]);
    run(python, ["-m", "pip", "install", "--index-url", "https://pypi.org/simple", "--disable-pip-version-check", "-r", join(scriptDir, "graphify-requirements.txt")]);
    args[0] = "doctor";
  }
  if (!existsSync(python)) throw new Error("Project-local Graphify runtime missing. Run graph:setup with GRAPHIFY_BASE_PYTHON.");
  const probe = spawnSync(python, ["-c", "import importlib.metadata; print(importlib.metadata.version('graphifyy'))"], { encoding: "utf8" });
  if (probe.status !== 0 || probe.stdout.trim() !== GRAPHIFY_VERSION) throw new Error(`Project-local Graphify must be ${GRAPHIFY_VERSION}; run graph:setup.`);
  if (args[0] === "doctor") {
    run(python, ["-m", "pip", "check"]);
    console.log(JSON.stringify({ ok: true, python, package: `graphifyy==${GRAPHIFY_VERSION}`, graphPresent: existsSync("graphify-out/graph.json"), extraction: "AST only", queryBudget: 1500 }, null, 2));
    return;
  }
  const finalArgs = safeArgs(args);
  if (["update", "extract", "cluster-only"].includes(finalArgs[0])) {
    const target = finalArgs[1] && !finalArgs[1].startsWith("-") ? finalArgs[1] : ".";
    if (resolve(target) !== process.cwd()) throw new Error("Build commands must target the current checkout root (.).");
  }
  // Every checkout gets its own graph and interpreter marker. No global launcher.
  mkdirSync("graphify-out", { recursive: true });
  writeFileSync("graphify-out/.graphify_python", python, "utf8");
  if (["update", "extract"].includes(finalArgs[0])) {
    // Restrict fresh AST builds to tracked source; never read untracked evidence.
    const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { encoding: "utf8" });
    if (untracked.status !== 0) throw new Error("Cannot determine tracked scan scope.");
    const configPath = "graphify-out/.graphify_build.json";
    let config = {};
    if (existsSync(configPath)) config = JSON.parse(readFileSync(configPath, "utf8"));
    writeFileSync(configPath, JSON.stringify(buildConfig(config, untracked.stdout.split("\0").filter(Boolean))), "utf8");
  }
  const env = runtimeEnv();
  if (["path", "explain"].includes(finalArgs[0])) {
    const result = spawnSync(python, ["-m", "graphify", ...finalArgs], { env, encoding: "utf8" });
    if (result.error) throw new Error(result.error.message);
    if (result.stderr) process.stderr.write(result.stderr);
    process.stdout.write(result.stdout.slice(0, 6000));
    if (result.stdout.length > 6000) console.log("\n[truncated at approximately 1500 tokens; narrow the requested concept]");
    if (result.status !== 0) throw new Error(`Graphify process exited ${result.status}`);
  } else run(python, ["-m", "graphify", ...finalArgs], { env });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

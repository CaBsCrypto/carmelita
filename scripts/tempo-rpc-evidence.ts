import { execFileSync } from "node:child_process";
import { readTempoWallet } from "../app/wallets/tempo";

// Public RPC reads only. An arbitrary address does not demonstrate Privy ownership.
const address = process.argv[2];
if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address) || process.argv.length !== 3) {
  throw new Error("Usage: tsx scripts/tempo-rpc-evidence.ts <public EVM address>");
}
const reading = await readTempoWallet(address);
const evidence = {
  testedSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  environment: "local public RPC; no authenticated ownership or MCP acceptance",
  fundsMoved: false,
  signingRequired: false,
  reading,
};
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
if (reading.status !== "available") process.exitCode = 1;

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAudit } from "./audit.mjs";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readJsonl(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Audit file not found: ${file}`);
  }

  const content = fs
    .readFileSync(file, "utf8")
    .replace(/^\uFEFF/, "")
    .trim();

  if (!content) return [];

  return content.split(/\r?\n/).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error(`Invalid JSONL at ${file}:${index + 1}`);
    }
  });
}

function serialize(events) {
  return (
    events.map((event) => JSON.stringify(event)).join("\n") +
    (events.length ? "\n" : "")
  );
}

function verifyAudit(
  baseNetworkFile,
  proposedNetworkFile,
  baseAuditFile,
  proposedAuditFile,
) {
  const baseNetwork = readJson(baseNetworkFile);
  const proposedNetwork = readJson(proposedNetworkFile);
  const baseAudit = readJsonl(baseAuditFile);

  const expected = serialize(
    buildAudit(baseNetwork, proposedNetwork, baseAudit),
  );

  const actual = fs.readFileSync(proposedAuditFile, "utf8");

  if (actual !== expected) {
    console.error("Audit verification failed!");
    console.error("The audit file does not match the network changes.");
    process.exitCode = 1;
    return;
  }

  console.log("Audit verification passed!");
}

const directExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (directExecution) {
  const args = process.argv.slice(2);

  if (args.length !== 4) {
    console.error(
      "Usage: node scripts/verify-audit.mjs " +
        "<base-network> <proposed-network> " +
        "<base-audit> <proposed-audit>",
    );
    process.exit(1);
  }

  verifyAudit(...args);
}

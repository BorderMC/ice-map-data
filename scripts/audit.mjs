import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COLLECTIONS = {
  companies: "company",
  stations: "station",
  lines: "line",
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readAudit(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing base audit file: ${file}`);
  }

  const content = fs.readFileSync(file, "utf8").trim();

  if (!content) return [];

  return content.split(/\r?\n/).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error(`Invalid audit JSON on line ${index + 1}`);
    }
  });
}

function equal(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function indexById(items, collection) {
  const map = new Map();

  for (const item of items) {
    if (map.has(item.id)) {
      throw new Error(`Duplicate ID ${item.id} in ${collection}`);
    }

    map.set(item.id, item);
  }

  return map;
}

function getChanges(oldItem, newItem) {
  const changes = {};
  const keys = new Set([...Object.keys(oldItem), ...Object.keys(newItem)]);

  for (const key of [...keys].sort()) {
    if (key === "id") continue;

    const before = oldItem[key];
    const after = newItem[key];

    if (!equal(before, after)) {
      changes[key] = {
        old: before ?? null,
        new: after ?? null,
      };
    }
  }

  return changes;
}

export function generateAudit(base, updated) {
  const events = [];

  for (const [collection, entity] of Object.entries(COLLECTIONS)) {
    const oldItems = indexById(base[collection], collection);
    const newItems = indexById(updated[collection], collection);

    const ids = [...new Set([...oldItems.keys(), ...newItems.keys()])].sort(
      (a, b) => a - b,
    );

    for (const id of ids) {
      const before = oldItems.get(id);
      const after = newItems.get(id);

      if (!before) {
        events.push({
          action: `${entity}.created`,
          entityId: id,
          data: after,
        });
      } else if (!after) {
        events.push({
          action: `${entity}.deleted`,
          entityId: id,
          data: before,
        });
      } else {
        const changes = getChanges(before, after);

        if (Object.keys(changes).length > 0) {
          events.push({
            action: `${entity}.updated`,
            entityId: id,
            changes,
          });
        }
      }
    }
  }

  return events;
}

export function buildAudit(base, updated, history) {
  return [...history, ...generateAudit(base, updated)];
}

function main() {
  const [baseFile, updatedFile, historyFile, outputFile] =
    process.argv.slice(2);

  if (!baseFile || !updatedFile || !historyFile || !outputFile) {
    console.error(
      "Usage: node scripts/audit.mjs " +
        "<base-network> <updated-network> " +
        "<base-audit> <output-audit>",
    );
    process.exit(1);
  }

  const base = readJson(baseFile);
  const updated = readJson(updatedFile);
  const history = readAudit(historyFile);

  const audit = buildAudit(base, updated, history);

  const content =
    audit.length > 0
      ? audit.map((event) => JSON.stringify(event)).join("\n") + "\n"
      : "";

  fs.mkdirSync(path.dirname(outputFile), {
    recursive: true,
  });

  const existing = fs.existsSync(outputFile)
    ? fs.readFileSync(outputFile, "utf8")
    : null;

  if (existing === content) {
    console.log("Audit already up to date.");
    return;
  }

  fs.writeFileSync(outputFile, content);

  console.log(
    `Audit generated: ${audit.length - history.length} proposed changes.`,
  );
}

const executedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (executedDirectly) {
  main();
}

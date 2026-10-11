import fs from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const schema = JSON.parse(
  fs.readFileSync("schemas/network.v1.schema.json", "utf8"),
);

const network = JSON.parse(fs.readFileSync("data/network.v1.json", "utf8"));

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);

const validate = ajv.compile(schema);
const errors = [];

if (!validate(network)) {
  for (const error of validate.errors ?? []) {
    errors.push(`${error.instancePath || "/"}: ${error.message}`);
  }
}

// Ensure IDs are unique within each collection
function checkUniqueIds(items, type) {
  const ids = new Set();

  for (const item of items) {
    if (ids.has(item.id)) {
      errors.push(`Duplicate ${type} ID: ${item.id}`);
    }

    ids.add(item.id);
  }
}

checkUniqueIds(network.companies ?? [], "company");
checkUniqueIds(network.stations ?? [], "station");
checkUniqueIds(network.lines ?? [], "line");

// Validate relationships
const companyIds = new Set((network.companies ?? []).map((c) => c.id));

const stationIds = new Set((network.stations ?? []).map((s) => s.id));

for (const line of network.lines ?? []) {
  if (!companyIds.has(line.company)) {
    errors.push(`Line ${line.id}: Company ${line.company} does not exist`);
  }

  for (const stationId of line.stations ?? []) {
    if (!stationIds.has(stationId)) {
      errors.push(`Line ${line.id}: Station ${stationId} does not exist`);
    }
  }
}

if (errors.length > 0) {
  console.error("Network validation failed:");

  for (const error of errors) {
    console.error(` - ${error}`);
  }

  process.exit(1);
}

console.log("Network validation passed!");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTRACT_PATH = path.resolve(__dirname, "../../../contracts/asyncapi/quote-events.v1.yaml");
const CONTRACT_TEXT = readFileSync(CONTRACT_PATH, "utf8");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getChannelBlock(channelName) {
  const pattern = new RegExp(
    `\\n  ${escapeRegex(channelName)}:\\n([\\s\\S]*?)(?=\\n  [a-z0-9_.-]+:\\n|$)`,
    "i"
  );
  const match = CONTRACT_TEXT.match(pattern);
  assert.ok(match, `missing channel block for ${channelName}`);
  return match[1];
}

function extractRequiredFields(channelName) {
  const block = getChannelBlock(channelName);
  const match = block.match(/required:\s*\[([\s\S]*?)\]/m);
  assert.ok(match, `missing required[] in ${channelName}`);

  return match[1]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractEnumValues(channelName, propertyName) {
  const block = getChannelBlock(channelName);
  const pattern = new RegExp(
    `${escapeRegex(propertyName)}:\\s*\\{[^\\n]*enum:\\s*\\[([^\\]]+)\\]`,
    "i"
  );
  const match = block.match(pattern);
  assert.ok(match, `missing enum for ${propertyName} in ${channelName}`);

  return match[1]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

test("all event channels stay on major v1 compatibility line", () => {
  const channelNames = Array.from(CONTRACT_TEXT.matchAll(/\n  ([a-z0-9_.-]+):\n/gi)).map(
    (match) => match[1]
  );
  assert.ok(channelNames.length >= 2);

  for (const channelName of channelNames) {
    assert.match(channelName, /\.v1$/i, `breaking major version in channel ${channelName}`);
  }
});

test("required fields for v1 quote events remain backward compatible", () => {
  const requiredBaseline = {
    "quote.ingested.v1": [
      "submissionId",
      "source",
      "canonicalQuoteId",
      "confidence",
      "latestPrice",
      "currency",
      "receivedAt"
    ],
    "quote.confidence.v1": [
      "canonicalQuoteId",
      "source",
      "submissionId",
      "confidence",
      "confidenceBand",
      "latestPrice",
      "currency"
    ]
  };

  for (const [channelName, fields] of Object.entries(requiredBaseline)) {
    const requiredFields = extractRequiredFields(channelName);
    for (const field of fields) {
      assert.ok(
        requiredFields.includes(field),
        `required field ${field} removed from ${channelName} (breaking change)`
      );
    }
  }
});

test("source enum remains compatible for quote event consumers", () => {
  const expectedSourceValues = ["merchant", "ugc", "call_confirmed"];

  for (const channelName of ["quote.ingested.v1", "quote.confidence.v1"]) {
    const enumValues = extractEnumValues(channelName, "source");
    for (const sourceValue of expectedSourceValues) {
      assert.ok(
        enumValues.includes(sourceValue),
        `source enum value ${sourceValue} missing in ${channelName}`
      );
    }
  }
});

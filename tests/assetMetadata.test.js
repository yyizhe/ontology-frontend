import test from "node:test";
import assert from "node:assert/strict";
import { assetMetadataType } from "../src/services/assetMetadata.js";

test("recorded metadata type takes precedence over extension and source", () => {
  assert.equal(assetMetadataType({ fileName: "data.json", dataShape: "structured" }), "structured");
  assert.equal(assetMetadataType({ fileName: "data.csv", dataShape: "semi_structured" }, "database_mysql"), "semi_structured");
  assert.equal(assetMetadataType({ fileName: "data.json", dataShape: "unstructured" }), "unstructured");
});

test("database output and schema snapshots are structured despite JSON storage", () => {
  assert.equal(assetMetadataType({ fileName: "data.json" }, "database_postgresql"), "structured");
  assert.equal(assetMetadataType({ fileName: "schema.json", content: { schema: [{ name: "id" }] } }), "structured");
});

test("uploads distinguish tabular, document and semistructured formats", () => {
  assert.equal(assetMetadataType({ fileName: "DATA.CSV" }), "structured");
  assert.equal(assetMetadataType({ fileName: "table.parquet" }), "structured");
  assert.equal(assetMetadataType({ fileName: "records.JSONL" }), "semi_structured");
  assert.equal(assetMetadataType({ fileName: "config.xml" }), "semi_structured");
  assert.equal(assetMetadataType({ fileName: "report.pdf" }), "unstructured");
  assert.equal(assetMetadataType({ fileName: "photo.png" }), "unstructured");
});

test("MIME and unknown legacy files have stable classification", () => {
  assert.equal(assetMetadataType({ fileName: "download", mimeType: "application/problem+json; charset=utf-8" }), "semi_structured");
  assert.equal(assetMetadataType({ fileName: "download", mimeType: "text/csv" }), "structured");
  assert.equal(assetMetadataType({ fileName: "csv" }, null), "unstructured");
  assert.equal(assetMetadataType({ dataShape: "invalid" }), "unstructured");
});

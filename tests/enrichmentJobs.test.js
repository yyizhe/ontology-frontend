import test from "node:test";
import assert from "node:assert/strict";
import { assetTaskResults, createDemoJobExecution, executionTasks, jobStatistics, metadataGraph, nativeFields, resolveJobFiles } from "../src/services/enrichmentJobs.js";
import { parseUploadedMetadata } from "../src/services/structuredUpload.js";
import { demoLineageFiles, demoLineageJob, demoLineageRecord, demoTableLineage } from "../src/services/demoLineage.js";

const fields = Array.from({ length: 12 }, (_, index) => ({ name: `field_${index}`, type: "string" }));
const table = { id: "table", fileName: "table.csv", directoryId: "dir", dataShape: "structured", connectionConfigId: "db", content: { dataset: "sales", schema: fields } };
const document = { id: "doc", fileName: "report.pdf", directoryId: "dir", dataShape: "unstructured", content: { lineage: [{ source: { id: "upstream", label: "source.pdf" }, scope: "data_object", relation: "引用自" }] } };
const files = [table, document, { id: "other", directoryId: "elsewhere" }];
const definitions = Array.from({ length: 10 }, (_, index) => ({ id: `def-${index}`, templateId: "tpl", fieldCode: `new_${index}`, name: `新增字段 ${index}` }));
const job = { id: "job", name: "多文件孵化", type: "metadata_enrichment", templateDefinitionId: "tpl", requestJson: { enrichmentType: "file_content", assetDirectoryId: "dir", assetFileIds: [] } };

test("templates filter native fields in all three modes while preserving every incubation field", () => {
  const result = createDemoJobExecution(job, files, definitions).resultJson.tasks[0];
  for (const [nativeFieldPolicy, expected] of [[undefined, 12], [{ mode: "all", fields: [] }, 12], [{ mode: "selected", fields: ["field_0", "field_7", "unknown"] }, 2], [{ mode: "selected", fields: [] }, 0], [{ mode: "none" }, 0]]) {
    const graph = metadataGraph(table, { results: [result], nativeFieldPolicy });
    assert.equal(graph.nodes.filter((node) => node.kind === "native").length, expected);
    assert.equal(graph.nodes.filter((node) => node.kind === "template").length, 10);
    assert.equal(graph.nodes.filter((node) => node.kind === "standard").length, 8);
  }
  assert.equal(nativeFields(table).length, 12);
});

test("Job snapshots template retention rules, so later edits cannot change historical field visibility", () => {
  const template = { id: "tpl", nativeFieldPolicy: { mode: "selected", fields: ["field_1"] } };
  const record = createDemoJobExecution(job, files, definitions, [], [template]);
  template.nativeFieldPolicy.fields.push("field_2");
  template.nativeFieldPolicy.mode = "none";
  const child = record.resultJson.tasks[0];
  assert.deepEqual(child.resultJson.nativeFieldPolicy.fields, ["field_1"]);
  const graph = metadataGraph(table, { results: [child], mode: "file_content" });
  assert.deepEqual(graph.nodes.filter((node) => node.kind === "native").map((node) => node.fieldCode), ["field_1"]);
  assert.equal(graph.nodes.filter((node) => node.kind === "template").length, 10);
});

test("filtered field lineage has no orphan endpoints; object lineage remains visible", () => {
  const file = demoLineageFiles[2];
  const graph = metadataGraph(file, { nativeFieldPolicy: { mode: "selected", fields: ["customer_name"] } });
  assert.equal(graph.edges.filter((edge) => edge.kind === "lineage" && edge.scope === "metadata").length, 1);
  assert.equal(graph.edges.filter((edge) => edge.kind === "lineage" && edge.scope === "data_object").length, 2);
  const ids = new Set(graph.nodes.map((node) => node.id));
  assert.ok(graph.edges.every((edge) => ids.has(edge.from) && ids.has(edge.to)));
  const none = metadataGraph(file, { nativeFieldPolicy: { mode: "none" } });
  assert.equal(none.nodes.filter((node) => node.kind === "source_field").length, 0);
  assert.equal(none.edges.filter((edge) => edge.kind === "lineage").length, 2);
});

test("worksheet-qualified retention codes do not include same-named fields from other sheets", () => {
  const file = { ...table, content: { tables: [{ sheet: "A", schema: [{ name: "id" }] }, { sheet: "B", schema: [{ name: "id" }] }] } };
  const graph = metadataGraph(file, { nativeFieldPolicy: { mode: "selected", fields: ["A.id"] } });
  assert.deepEqual(graph.nodes.filter((node) => node.kind === "native").map((node) => node.fieldCode), ["A.id"]);
});

test("one Job contains one Task per direct-directory file, with file counts, times, independent snapshots", () => {
  const record = createDemoJobExecution(job, files, definitions);
  assert.equal(record.resultJson.tasks.length, 2);
  assert.equal(record.successCount, 2);
  assert.equal(record.fieldCount, 20);
  assert.equal(new Set(record.resultJson.tasks.map((task) => task.id)).size, 2);
  assert.ok(record.resultJson.tasks.every((task) => task.startedTime && task.finishedTime >= task.startedTime));
  assert.notEqual(record.resultJson.tasks[0].fileSnapshot, table);
  assert.equal(executionTasks(record).length, 2);
  assert.equal(jobStatistics(record.resultJson.tasks).fields, 20);
});

test("explicit file selection deduplicates and records missing files as failed child tasks", () => {
  const selected = { ...job, assetFileId: "table", requestJson: { ...job.requestJson, assetFileIds: ["doc", "doc", "deleted"] } };
  assert.deepEqual(resolveJobFiles(selected, files).map((file) => file.id), ["doc", "deleted"]);
  const record = createDemoJobExecution(selected, files, definitions);
  assert.equal(record.successCount, 1);
  assert.equal(record.errorCount, 1);
  assert.equal(record.resultJson.tasks[1].status, "failed");
});

test("legacy single-file executions count one child, not their metadata field count", () => {
  const children = executionTasks({ id: "old", assetFileId: "table", status: "succeeded", successCount: 42, resultJson: { score: 0.9 } }, job, files);
  assert.equal(children.length, 1);
  assert.equal(jobStatistics(children).success, 1);
});

test("structured upload graph displays every original field before incubation", () => {
  const graph = metadataGraph(table);
  assert.equal(graph.nodes.filter((node) => node.kind === "native").length, 12);
  assert.equal(graph.nodes.filter((node) => node.kind === "template" || node.kind === "lineage").length, 0);
});

test("content and text results contain all template fields and exclude even accidental lineage", () => {
  const result = createDemoJobExecution(job, files, definitions).resultJson.tasks[0];
  result.resultJson.lineage = [{ source: { id: "bad" }, targetField: "field_0" }];
  for (const mode of ["file_content", "text"]) {
    const graph = metadataGraph(table, { results: [result], mode });
    assert.equal(graph.nodes.filter((node) => node.kind === "template").length, 10);
    assert.equal(graph.nodes.filter((node) => node.kind === "lineage").length, 0);
  }
});

test("structured metadata lineage targets fields; unstructured object lineage coexists with standard metadata", () => {
  const record = createDemoJobExecution({ ...job, requestJson: { ...job.requestJson, enrichmentType: "lineage" } }, files, definitions);
  const [structuredResult, unstructuredResult] = record.resultJson.tasks;
  const structuredGraph = metadataGraph(table, { results: [structuredResult], mode: "lineage" });
  assert.equal(structuredGraph.edges.filter((edge) => edge.kind === "lineage").length, 12);
  assert.ok(structuredGraph.edges.filter((edge) => edge.kind === "lineage").every((edge) => edge.to.startsWith("native:")));
  const graph = metadataGraph(document, { results: [unstructuredResult], mode: "lineage" });
  assert.ok(graph.nodes.some((node) => node.kind === "standard"));
  assert.equal(graph.nodes.filter((node) => node.kind === "source_object").length, 1);
  assert.equal(graph.edges.find((edge) => edge.kind === "lineage").to, "object");
  assert.equal(graph.edges.find((edge) => edge.kind === "lineage").scope, "data_object");
  assert.ok(!graph.nodes.some((node) => node.kind === "template"));
  assert.equal(record.fieldCount, 0);
});

test("no lineage is fabricated; invalid metadata field references leave no external nodes", () => {
  assert.ok(metadataGraph({ ...document, content: {} }).edges.every((edge) => edge.kind !== "lineage"));
  const graph = metadataGraph(document, { mode: "lineage", results: [{ enrichmentType: "lineage", resultJson: { lineage: [{ source: { id: "field" }, targetField: "field_0", scope: "metadata" }] } }] });
  assert.ok(graph.nodes.every((node) => ["object", "standard"].includes(node.kind)));
  assert.ok(graph.edges.every((edge) => edge.kind !== "lineage"));
});

test("a structured table displays object and cross-table metadata lineage together, with native metadata", () => {
  const graph = metadataGraph(demoLineageFiles[2]);
  assert.equal(graph.nodes.filter((node) => node.kind === "native").length, 4);
  assert.equal(graph.nodes.filter((node) => node.kind === "source_object").length, 2);
  assert.equal(graph.edges.filter((edge) => edge.scope === "data_object").length, 2);
  assert.equal(graph.edges.filter((edge) => edge.scope === "metadata").length, 4);
  const customerName = graph.edges.find((edge) => edge.sourceLabel === "master_data.customer_profile.customer_name");
  assert.equal(customerName.targetLabel, "dwd.order_wide.customer_name");
  assert.equal(customerName.scope, "metadata");
  assert.ok(customerName.expression.includes("o.customer_id = c.customer_id"));
  const amount = graph.edges.find((edge) => edge.sourceLabel === "ods.order_header.order_amount");
  assert.equal(amount.targetLabel, "dwd.order_wide.amount");
  assert.ok(graph.edges.filter((edge) => edge.scope === "data_object").every((edge) => edge.to === "object"));
});

test("persisted lineage and result lineage deduplicate; Job counts the two scopes independently", () => {
  const children = executionTasks(demoLineageRecord, demoLineageJob, demoLineageFiles);
  const graph = metadataGraph(demoLineageFiles[2], { results: children });
  assert.equal(graph.edges.filter((edge) => edge.kind === "lineage").length, 6);
  const stats = jobStatistics(children);
  assert.equal(stats.lineage, 6);
  assert.equal(stats.objectLineage, 2);
  assert.equal(stats.metadataLineage, 4);
  const execution = createDemoJobExecution(demoLineageJob, demoLineageFiles, definitions);
  assert.deepEqual(execution.resultJson.tasks[0].resultJson.lineage, demoTableLineage);
});

test("same-named fields from separate upstream tables remain distinct; downstream lineage is supported", () => {
  const links = [
    { scope: "metadata", source: { id: "a", dataset: "schema.a", field: "id" }, targetField: "field_0" },
    { scope: "metadata", source: { id: "b", dataset: "schema.b", field: "id" }, targetField: "field_0" },
    { scope: "data_object", source: { assetFileId: table.id }, target: { id: "downstream", dataset: "schema.downstream" } },
  ];
  const graph = metadataGraph({ ...table, content: { ...table.content, lineage: links } });
  assert.equal(graph.nodes.filter((node) => node.kind === "source_field").length, 2);
  assert.equal(new Set(graph.nodes.map((node) => node.id)).size, graph.nodes.length);
  const downstream = graph.edges.find((edge) => edge.scope === "data_object");
  assert.equal(downstream.from, "object");
  assert.equal(downstream.targetLabel, "schema.downstream");
});

test("asset graph retains latest results for each mode/template while execution graph uses its explicit result", () => {
  const old = createDemoJobExecution(job, files, definitions);
  old.finishedTime = 100;
  old.resultJson.tasks.forEach((child) => { child.finishedTime = 100; });
  const current = structuredClone(old);
  current.finishedTime = 200;
  current.resultJson.tasks.forEach((child) => { child.finishedTime = 200; child.resultJson.fields[0].value = "latest"; });
  const all = assetTaskResults(table, [old, current], [job]);
  assert.equal(all.length, 1);
  assert.equal(all[0].resultJson.fields[0].value, "latest");
  const historicalGraph = metadataGraph(table, { results: [old.resultJson.tasks[0]], mode: "file_content" });
  assert.notEqual(historicalGraph.nodes.find((node) => node.kind === "template").value, "latest");
});

test("CSV upload parses quoted cells, all columns, types and sample before any job", async () => {
  const text = 'id,title,c3,c4,c5,c6,c7,c8\n1,"hello, world",3,4,5,6,7,8\n2,"line\nbreak",,4,5,6,7,8';
  const content = await parseUploadedMetadata(new File([text], "data.csv"));
  assert.equal(content.parseStatus, "parsed");
  assert.equal(content.schema.length, 8);
  assert.equal(content.rows, 2);
  assert.equal(content.sample[0].title, "hello, world");
  assert.equal(content.sample[1].title, "line\nbreak");
  assert.equal(content.schema[0].type, "integer");
  assert.equal(content.schema[2].nullable, true);
  const numericHeader = await parseUploadedMetadata(new File(['001,002\n1,2'], "numeric-header.csv"));
  assert.equal(numericHeader.schema[0].name, "001");
});

test("upload handles TSV, duplicate headers, JSON key union, invalid and unsupported formats honestly", async () => {
  const tsv = await parseUploadedMetadata(new File(['a\ta\t\n1\t2\t3'], "data.tsv"));
  assert.equal(tsv.schema.length, 3);
  assert.equal(new Set(tsv.schema.map((field) => field.name)).size, 3);
  assert.equal(tsv.schema[2].name, "column_3");
  const json = await parseUploadedMetadata(new File(['[{"one":1},{"two":2}]'], "data.json"));
  assert.equal(nativeFields({ content: json }).length, 2);
  const invalid = await parseUploadedMetadata(new File(['a,b\n"broken'], "broken.csv"));
  assert.equal(invalid.parseStatus, "failed");
  const empty = await parseUploadedMetadata(new File([""], "empty.csv"));
  assert.equal(empty.parseStatus, "failed");
  assert.ok(!empty.schema);
  const unsupported = await parseUploadedMetadata(new File(["binary"], "data.parquet"));
  assert.equal(unsupported.parseStatus, "unsupported");
  assert.ok(!unsupported.schema);
});

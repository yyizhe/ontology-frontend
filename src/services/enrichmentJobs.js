import { assetMetadataType, METADATA_TYPES } from "./assetMetadata.js";
import { ASSET_LEVELS, assetLevelOf } from "./assetScope.js";
import { includesNativeField, normalizeNativeFieldPolicy } from "./templateFields.js";

export const incubationLabel = (type) => ({ file_content: "内容孵化", text: "文本孵化", lineage: "血缘孵化", ontology: "本体孵化" })[type] || "内容孵化";
export const taskStatusLabel = (status) => ({ succeeded: "成功", failed: "失败", running: "执行中", pending: "待执行", cancelled: "已取消" })[status] || status || "待执行";
export const displayValue = (value) => value == null ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value);
export const LINEAGE_TYPES = { data_object: "数据对象血缘", metadata: "元数据血缘" };
export const lineageScope = (link) => link.scope || (link.targetField || link.target?.field || link.source?.field ? "metadata" : "data_object");

export function nativeFields(file = {}) {
  const content = file.content || {};
  const tables = content.tables?.length ? content.tables : [content];
  return tables.flatMap((table) => {
    const schema = table.schema?.length ? table.schema : [...new Set((table.sample || []).flatMap((row) => Object.keys(row || {})))].map((name) => ({ name, type: typeof table.sample?.[0]?.[name] }));
    return schema.map((field, index) => ({ ...field, name: field.name || field.fieldCode || `column_${index + 1}`, code: table.sheet ? `${table.sheet}.${field.name}` : field.name || field.fieldCode || `column_${index + 1}`, table: table.sheet || content.dataset, sample: table.sample?.[0]?.[field.name] }));
  });
}

export function resolveJobFiles(job, files) {
  const request = job.requestJson || {};
  const ids = request.assetFileIds?.length ? request.assetFileIds : job.assetFileId ? [job.assetFileId] : [];
  if (ids.length) return [...new Set(ids)].map((id) => files.find((file) => file.id === id) || { id, fileName: id, unavailable: true });
  const directoryId = request.assetDirectoryId || job.assetDirectoryId || "all";
  return files.filter((file) => (file.directoryId || "all") === directoryId);
}

export function resultFields(result = {}) {
  if (Array.isArray(result.fields)) return result.fields;
  return Object.entries(result).filter(([key]) => !["templateId", "nativeFieldPolicy", "summary", "lineage", "tasks", "stats", "enrichmentType", "demo"].includes(key)).map(([code, value]) => ({ code, name: code, value }));
}

// Legacy executions represented one file, even when their success count counted metadata fields.
export function executionTasks(record = {}, job, files = []) {
  if (Array.isArray(record.resultJson?.tasks)) return record.resultJson.tasks;
  const id = record.assetFileId;
  if (!id) return [];
  const file = files.find((item) => item.id === id);
  const enrichmentType = record.requestJson?.enrichmentType || job?.requestJson?.enrichmentType || "file_content";
  return [{ id: `${record.id}:task:1`, assetFileId: id, fileName: file?.fileName || file?.name || id, fileSnapshot: file, dataShape: assetMetadataType(file), enrichmentType, status: record.status || "succeeded", startedTime: record.startedTime, finishedTime: record.finishedTime, resultJson: record.resultJson || {} }];
}

export function jobStatistics(children) {
  const total = children.length;
  const success = children.filter((child) => child.status === "succeeded").length;
  const failed = children.filter((child) => child.status === "failed").length;
  const running = children.filter((child) => child.status === "running").length;
  const links = children.filter((child) => child.status === "succeeded" && child.enrichmentType === "lineage").flatMap((child) => child.resultJson?.lineage || []);
  return { total, success, failed, running, pending: total - success - failed - running - children.filter((child) => child.status === "cancelled").length, fields: children.filter((child) => child.status === "succeeded" && child.enrichmentType !== "lineage").reduce((total, child) => total + resultFields(child.resultJson).length, 0), lineage: links.length, objectLineage: links.filter((link) => lineageScope(link) === "data_object").length, metadataLineage: links.filter((link) => lineageScope(link) === "metadata").length };
}

function sourceLineage(file, structured) {
  if (Array.isArray(file.content?.lineage)) return file.content.lineage;
  if (!structured || !file.connectionConfigId) return [];
  return nativeFields(file).map((field) => ({ source: { id: `${file.connectionConfigId}:${field.table || file.name}`, dataset: field.table || file.name, field: field.code, type: field.type }, targetField: field.code, relation: "采集自", scope: "metadata" }));
}

export function createDemoJobExecution(job, files, definitions, connections = [], templates = []) {
  const startedTime = Date.now();
  const enrichmentType = job.requestJson?.enrichmentType || "file_content";
  const jobId = `job-run-${globalThis.crypto.randomUUID()}`;
  const nativeFieldPolicy = structuredClone(normalizeNativeFieldPolicy(templates.find((template) => template.id === job.templateDefinitionId)?.nativeFieldPolicy));
  const children = resolveJobFiles(job, files).map((file, index) => {
    const structured = assetMetadataType(file, connections.find((connection) => connection.id === file.connectionConfigId)?.type) === "structured";
    const fields = definitions.filter((field) => field.templateId === job.templateDefinitionId).map((field) => ({ code: field.fieldCode || field.id, name: field.name || field.fieldCode, type: field.fieldType, value: file.content?.metadata?.[field.fieldCode] ?? `演示结果：${file.fileName || file.name} / ${field.name || field.fieldCode}` }));
    const dataShape = structured ? "structured" : assetMetadataType(file);
    return { id: `${jobId}:task:${index + 1}`, assetFileId: file.id, fileName: file.fileName || file.name, fileSnapshot: { ...structuredClone(file), dataShape }, dataShape, enrichmentType, status: file.unavailable ? "failed" : "succeeded", startedTime, finishedTime: Date.now(), errorMessage: file.unavailable ? "文件已删除或不可用" : "", resultJson: file.unavailable ? {} : { demo: true, templateId: job.templateDefinitionId, nativeFieldPolicy, fields: enrichmentType === "lineage" ? [] : fields, lineage: enrichmentType === "lineage" ? sourceLineage(file, structured) : [], summary: enrichmentType === "lineage" ? "血缘孵化完成" : "元数据孵化完成" } };
  });
  const stats = jobStatistics(children);
  return { id: jobId, taskId: job.id, jobName: job.name, name: `${job.name} #执行`, assetFileId: children.length === 1 ? children[0].assetFileId : "", requestJson: { ...job.requestJson, enrichmentType, templateId: job.templateDefinitionId }, status: stats.failed ? "failed" : "succeeded", startedTime, finishedTime: Date.now(), successCount: stats.success, errorCount: stats.failed, fieldCount: stats.fields, resultJson: { demo: true, templateId: job.templateDefinitionId, enrichmentType, tasks: children, stats, summary: `${stats.total} 个子任务，成功 ${stats.success}，失败 ${stats.failed}` } };
}

export function assetTaskResults(file, records, jobs) {
  const results = records.flatMap((record) => {
    const job = jobs.find((item) => item.id === record.taskId);
    if (job?.type !== "metadata_enrichment" && !record.resultJson?.tasks) return [];
    return executionTasks(record, job, [file]).filter((child) => child.assetFileId === file.id && child.status === "succeeded").map((child) => ({ ...child, finishedTime: child.finishedTime || record.finishedTime || record.createdAt }));
  }).sort((a, b) => new Date(b.finishedTime || 0) - new Date(a.finishedTime || 0));
  const seen = new Set();
  return results.filter((child) => { const key = `${child.enrichmentType}:${child.resultJson?.templateId || ""}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

export function metadataGraph(file, { results = [], mode = "all", sourceType = "", nativeFieldPolicy = results.find((child) => child.resultJson?.nativeFieldPolicy)?.resultJson.nativeFieldPolicy } = {}) {
  const structured = assetMetadataType(file, sourceType) === "structured";
  const nodes = [{ id: "object", kind: "object", label: file.content?.dataset || file.fileName || file.name || file.id, value: file.fileName || file.name, type: METADATA_TYPES[assetMetadataType(file, sourceType)], details: { "文件编号": file.id, "资产级别": ASSET_LEVELS[assetLevelOf(file)] } }];
  const edges = [];
  const addMetadata = (node) => { nodes.push(node); edges.push({ from: "object", to: node.id, kind: "metadata" }); };
  {
    const objectKey = String(file.objectKey || file.filePath || file.fileName || file.name || "unknown").replace(/^\/+/, "");
    const standard = { fileName: ["文件名称", file.fileName || file.name], fileType: ["文件类型", (file.fileName || file.name || "").split(".").pop()?.toUpperCase()], dataShape: ["元数据类型", METADATA_TYPES[assetMetadataType(file, sourceType)]], sizeBytes: ["文件大小（字节）", file.sizeBytes], objectKey: ["对象存储键", objectKey], objectUrl: ["对象存储 URL", file.objectUrl || `https://minio.mock.local/ontology-assets/${objectKey.split("/").map(encodeURIComponent).join("/")}`], uploadedAt: ["上传时间", file.createdAt], assetLevel: ["资产级别", ASSET_LEVELS[assetLevelOf(file)]] };
    Object.entries(standard).forEach(([code, [label, value]]) => addMetadata({ id: `standard:${code}`, fieldCode: code, kind: "standard", label, value, type: "标准元数据" }));
    nativeFields(file).forEach((field, index) => {
      if (includesNativeField(nativeFieldPolicy, field.code)) addMetadata({ id: `native:${index}`, fieldCode: field.code, kind: "native", label: field.table && file.content?.tables ? `${field.table}.${field.name}` : field.name, value: field.sample ?? field.type, type: field.type || "未知", details: { "所属数据对象": field.table || file.fileName || file.name, "字段编码": field.code, "数据类型": field.type, "允许为空": field.nullable === false ? "否" : "是", "主键": field.primaryKey ? "是" : "否", "示例值": field.sample } });
    });
    const added = new Set();
    results.filter((child) => child.enrichmentType !== "lineage").forEach((child) => resultFields(child.resultJson).forEach((field, index) => {
      const key = `${child.resultJson?.templateId || ""}:${field.code || index}`;
      if (added.has(key)) return;
      added.add(key);
      addMetadata({ id: `template:${key}`, fieldCode: field.code, kind: "template", label: field.name || field.code, value: field.value, type: field.type || typeof field.value, details: { "模板编号": child.resultJson?.templateId, "子任务编号": child.id, "字段编码": field.code } });
    }));
  }
  if (mode === "all" || mode === "lineage") {
    const seen = new Set();
    const links = [...(mode === "all" ? file.content?.lineage || [] : []), ...results.filter((child) => child.enrichmentType === "lineage").flatMap((child) => child.resultJson?.lineage || [])];
    const objectKey = (endpoint) => endpoint.assetFileId || endpoint.id || endpoint.dataset || endpoint.label;
    const isCurrent = (endpoint) => !objectKey(endpoint) || [file.id, file.content?.dataset].filter(Boolean).includes(objectKey(endpoint));
    const resolveEndpoint = (endpoint, scope, fallbackField) => {
      const fieldCode = fallbackField || endpoint.field;
      if (isCurrent(endpoint)) {
        if (scope === "data_object") return nodes[0];
        return nodes.find((node) => ["native", "template", "standard"].includes(node.kind) && node.fieldCode === fieldCode);
      }
      const key = String(objectKey(endpoint));
      const id = `source-object:${key}`;
      const objectLabel = endpoint.dataset || endpoint.objectLabel || (scope === "data_object" ? endpoint.label : null) || endpoint.assetFileId || endpoint.id;
      let objectNode = nodes.find((node) => node.id === id);
      if (!objectNode) {
        objectNode = { id, kind: "source_object", label: objectLabel, value: endpoint.fileName || endpoint.dataset || endpoint.id, type: "数据对象", details: { "对象编号": endpoint.assetFileId || endpoint.id, "数据集": endpoint.dataset } };
        nodes.push(objectNode);
      }
      if (scope === "data_object") return objectNode;
      if (!fieldCode) return null;
      const fieldId = `source-field:${JSON.stringify([key, fieldCode])}`;
      let fieldNode = nodes.find((node) => node.id === fieldId);
      if (!fieldNode) {
        fieldNode = { id: fieldId, kind: "source_field", parentId: id, fieldCode, label: fieldCode, qualifiedLabel: `${objectLabel}.${fieldCode}`, value: endpoint.type || "字段", type: endpoint.type || "未知", details: { "所属数据对象": objectLabel, "字段编码": fieldCode, "数据类型": endpoint.type } };
        nodes.push(fieldNode);
        edges.push({ from: id, to: fieldId, kind: "metadata" });
      }
      return fieldNode;
    };
    links.forEach((link) => {
      const scope = lineageScope(link);
      if (!Object.hasOwn(LINEAGE_TYPES, scope) || !link.source || !objectKey(link.source)) return;
      // Validate local field references before adding external nodes to the graph.
      const target = link.target || {};
      const targetField = link.targetField || target.field;
      if (scope === "metadata" && (!link.source.field || !targetField)) return;
      if (scope === "metadata" && isCurrent(target) && !nodes.some((node) => ["native", "template", "standard"].includes(node.kind) && node.fieldCode === targetField)) return;
      if (scope === "metadata" && isCurrent(link.source) && !nodes.some((node) => ["native", "template", "standard"].includes(node.kind) && node.fieldCode === link.source.field)) return;
      const source = resolveEndpoint(link.source, scope);
      const destination = resolveEndpoint(target, scope, targetField);
      if (!source || !destination) return;
      const key = JSON.stringify([scope, source.id, destination.id, link.relation, link.expression]);
      if (seen.has(key)) return;
      seen.add(key);
      edges.push({ id: `lineage:${seen.size}`, from: source.id, to: destination.id, kind: "lineage", scope, label: link.relation || "来源", expression: link.expression || "", sourceLabel: source.qualifiedLabel || source.label, targetLabel: destination.kind === "native" ? `${file.content?.dataset || file.fileName || file.name}.${destination.fieldCode}` : destination.qualifiedLabel || destination.label });
    });
  }
  return { nodes, edges, structured };
}

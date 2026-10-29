import * as schema from "./spgSchemaApi";
import { previewExtraction } from "./modelingApi";
import { CORE_KINDS, statusOf, saveElement, removeElement } from "./spgModel";
import { BUILD_STAGES } from "./ontologyDemo";

const KEY = "datapilot.spgWorkflow";
const projectId = () => localStorage.getItem("datapilot.currentProject") || "project-demo-main";
const empty = () => ({ tasks: [], records: [], comparisons: [], objects: {}, modelConfig: null });
export function readWorkflow(owner = projectId()) {
  const all = JSON.parse(localStorage.getItem(KEY) || "{}");
  return { ...empty(), ...all[owner] };
}
function persist(state, owner = projectId()) {
  const all = JSON.parse(localStorage.getItem(KEY) || "{}");
  all[owner] = state;
  localStorage.setItem(KEY, JSON.stringify(all));
  return state;
}
export function saveModelConfig(config) {
  if (!config.model?.trim() || !/^https?:\/\//.test(config.endpoint || "")) throw new Error("请填写模型名称和有效的 HTTP 连接地址");
  return persist({ ...readWorkflow(), modelConfig: { ...config } });
}
export function saveTask(value) {
  if (!value.name?.trim() || !value.namespaceId || !value.assetFileIds?.length) throw new Error("任务名称、命名空间和文件不能为空");
  if (!["structured", "semistructured", "unstructured"].includes(value.sourceType)) throw new Error("请选择抽取类型");
  if (value.modelSource !== "project" && (!value.modelConfig?.model?.trim() || !/^https?:\/\//.test(value.modelConfig?.endpoint || ""))) throw new Error("请完善任务模型连接配置");
  if (value.modelSource === "project" && !readWorkflow().modelConfig) throw new Error("请先配置 Project 级模型");
  const state = readWorkflow();
  const task = { ...value, id: value.id || crypto.randomUUID(), updatedAt: new Date().toISOString() };
  persist({ ...state, tasks: [task, ...state.tasks.filter((item) => item.id !== task.id)] });
  return task;
}
export function deleteTask(id) { const state = readWorkflow(); return persist({ ...state, tasks: state.tasks.filter((item) => item.id !== id) }); }
export async function executeTask(id, assets) {
  const owner = projectId();
  const state = readWorkflow(owner);
  const task = state.tasks.find((item) => item.id === id);
  if (!task) throw new Error("任务不存在");
  const modelConfig = task.modelSource === "project" ? state.modelConfig : task.modelConfig;
  if (!modelConfig) throw new Error("模型配置已失效");
  const files = task.assetFileIds.map((fileId) => assets.find((item) => item.id === fileId));
  if (files.some((item) => !item)) throw new Error("所选资产文件已删除，请重新选择");
  const startedAt = new Date().toISOString();
  const record = { id: crypto.randomUUID(), taskId: id, taskName: task.name, namespaceId: task.namespaceId, sourceType: task.sourceType, createdAt: startedAt, startedAt, durationMs: null, sequence: state.records.filter(item => item.taskId === id).length + 1, actor: "当前用户", files: [], status: "RUNNING", modelConfig: { ...modelConfig }, engine: "demo-parser", assetFileIds: [...task.assetFileIds], assetFileNames: files.map((item) => item.fileName || item.name), stages: BUILD_STAGES.map((name, index) => ({ id: `stage-${index + 1}`, sequence: index + 1, name, status: index === 0 ? "RUNNING" : "PENDING", startedAt: index === 0 ? startedAt : "", durationMs: 0, input: index === 0 ? files.map(file => file.fileName || file.name).join("、") : "候选元素集合", output: "", message: "本地解析演示，未调用模型服务。" })) };
  persist({ ...state, records: [record, ...state.records] }, owner);
  try {
    const candidates = [];
    for (const file of files) {
      if (file.content == null) throw new Error(`文件 ${file.fileName || file.name} 暂无可读取内容`);
      let content = typeof file.content === "string" ? file.content : JSON.stringify(file.content, null, 2);
      if (task.sourceType === "structured" && Array.isArray(file.content?.schema)) {
        content = `CREATE TABLE ${String(file.content.dataset || "dataset").split(".").pop()} (${file.content.schema.map((field) => `${field.name} ${field.type || "VARCHAR"}`).join(",")});`;
      }
      const result = await previewExtraction({ sourceType: task.sourceType, content, filename: file.fileName || file.name });
      if (result.errors?.length) throw new Error(result.errors.join("；"));
      candidates.push(...result.candidates);
    }
    const unique = [...new Map(candidates.map((item) => [item.id, item])).values()];
    record.stages[0] = { ...record.stages[0], status: "SUCCEEDED", durationMs: Date.now() - new Date(startedAt).getTime(), output: `已解析 ${files.length} 个文件` };
    [["entityTypes", "properties", "conceptTypes", "eventTypes", "standardValues"], ["relations"], ["constraints", "rules"]].forEach((kinds, index) => {
      record.stages[index + 1] = { ...record.stages[index + 1], status: "SUCCEEDED", startedAt: new Date().toISOString(), output: `${unique.filter(item => kinds.includes(item.element_type)).length} 个候选元素（本地解析器）` };
    });
    const timestamp = record.createdAt.replace(/[-:.]/g, "");
    const prefix = `spg/${owner}/${task.namespaceId}/${timestamp}-${record.id}`;
    record.files = [{ name: `${timestamp}.json`, key: `${prefix}.json`, format: "json" }, { name: `${timestamp}.dsl`, key: `${prefix}.dsl`, format: "dsl" }];
    record.status = "SUCCEEDED";
    record.candidateCount = unique.length;
    record.endedAt = new Date().toISOString();
    record.durationMs = new Date(record.endedAt).getTime() - new Date(startedAt).getTime();
    record.stages[4] = { ...record.stages[4], status: "SUCCEEDED", startedAt: record.endedAt, output: "完整候选 JSON / DSL 文件，待人工审核" };
    const current = readWorkflow(owner);
    persist({ ...current, records: current.records.map((item) => item.id === record.id ? record : item), objects: { ...current.objects, [record.files[0].key]: JSON.stringify({ namespaceId: task.namespaceId, createdAt: record.createdAt, candidates: unique }, null, 2), [record.files[1].key]: unique.map((item) => `${item.element_type} ${JSON.stringify(item.label)} ${JSON.stringify({ id: item.id, domain: item.domain, source: item.source, target: item.target, description: item.definition })}`).join("\n") } }, owner);
  } catch (error) {
    record.status = "FAILED";
    record.error = error.message;
    record.endedAt = new Date().toISOString();
    record.durationMs = new Date(record.endedAt).getTime() - new Date(startedAt).getTime();
    const failed = record.stages.findIndex(item => item.status !== "SUCCEEDED");
    record.stages[failed] = { ...record.stages[failed], status: "FAILED", startedAt: record.stages[failed].startedAt || record.endedAt, durationMs: failed === 0 ? record.durationMs : 0, message: error.message };
    const current = readWorkflow(owner);
    persist({ ...current, records: current.records.map((item) => item.id === record.id ? record : item) }, owner);
  }
  return record;
}
export function namespaceFingerprint(model, namespaceId) {
  return JSON.stringify(CORE_KINDS.flatMap((kind) => (model[kind] || []).filter((row) => row.id === namespaceId || row.namespaceId === namespaceId).map((row) => ({ kind, ...row }))).sort((a, b) => a.id.localeCompare(b.id)));
}
export async function compareRecord(recordId, namespaceId) {
  const owner = projectId();
  const state = readWorkflow(owner);
  const record = state.records.find((item) => item.id === recordId && item.status === "SUCCEEDED");
  if (!record) throw new Error("没有可比对的成功执行记录");
  const model = await schema.listSpgCoreModel();
  const target = model.namespaces.find((item) => item.id === namespaceId);
  const source = model.namespaces.find((item) => item.id === record.namespaceId);
  if (!target || (target.baseId || target.id) !== (source?.baseId || source?.id)) throw new Error("请选择同一命名空间的本体版本");
  const fingerprint = namespaceFingerprint(model, namespaceId);
  const cached = state.comparisons.find((item) => item.recordId === recordId && item.namespaceId === namespaceId && item.fingerprint === fingerprint && !item.appliedAt);
  if (cached) return { ...cached, reused: true };
  const candidates = JSON.parse(state.objects[record.files.find((file) => file.format === "json").key]).candidates;
  const rows = CORE_KINDS.filter((kind) => kind !== "namespaces").flatMap((kind) => (model[kind] || []).filter((item) => item.namespaceId === namespaceId).map((item) => ({ ...item, kind })));
  const references = new Map();
  const kindMap = new Map();
  const matched = new Set();
  const ordered = [...candidates].sort((a, b) => CORE_KINDS.indexOf(a.element_type) - CORE_KINDS.indexOf(b.element_type));
  const differences = ordered.map((candidate) => {
    const kind = candidate.element_type;
    if (!CORE_KINDS.includes(kind) || kind === "namespaces") throw new Error("抽取结果含不支持的元素类型");
    const parentId = references.get(candidate.domain || candidate.source) || "";
    const old = rows.find((item) => !matched.has(item.id) && item.kind === kind && (item.code === candidate.label || item.name === candidate.label) && (item.parentKind === "namespaces" ? "" : item.parentId || "") === parentId);
    const nextId = old?.id || `spg-${kind}-${crypto.randomUUID()}`;
    references.set(candidate.id, nextId);
    kindMap.set(candidate.id, kind);
    if (old) matched.add(old.id);
    const { kind: ignored, ...previous } = old || {};
    const next = { status: "DRAFT", semanticVersion: "1.0.0", ...previous, id: nextId, projectId: target.projectId, namespaceId, versionId: target.versionId, name: candidate.label, code: old?.code || candidate.label, description: candidate.definition || candidate.evidence || "", origin: "extraction" };
    if (kind === "properties") Object.assign(next, { parentId, parentKind: kindMap.get(candidate.domain), dataType: candidate.range || "String", cardinality: old?.cardinality || "0..1" });
    if (kind === "relations") Object.assign(next, { parentId, parentKind: kindMap.get(candidate.source), targetCandidateId: candidate.target, predicateCode: old?.predicateCode || candidate.label, sourceCardinality: old?.sourceCardinality || "0..N", targetCardinality: old?.targetCardinality || "0..N" });
    if (["conceptTypes", "eventTypes", "standardValues"].includes(kind)) next.hypernymPredicate = "";
    if (kind === "constraints") Object.assign(next, { parentId, parentKind: kindMap.get(candidate.domain), constraintType: old?.constraintType || "NOT_NULL", value: old?.value || "true" });
    if (kind === "rules") Object.assign(next, { parentId, parentKind: kindMap.get(candidate.domain), expression: candidate.expression || old?.expression || "" });
    const fields = ["name", "code", "description", "dataType", "parentId", "parentKind", "expression"];
    const changed = old ? fields.filter((field) => next[field] !== undefined && next[field] !== old[field]) : [];
    return { id: crypto.randomUUID(), kind, oldValue: old ? previous : null, newValue: next, type: old ? changed.length ? "UPDATE" : "SAME" : "ADD", changed, decision: old && !changed.length ? "KEEP" : "PENDING" };
  });
  differences.forEach((item) => {
    if (item.kind !== "relations") return;
    item.newValue.targetTypeId = references.get(item.newValue.targetCandidateId) || "";
    delete item.newValue.targetCandidateId;
    if (item.oldValue && item.newValue.targetTypeId !== item.oldValue.targetTypeId) { item.changed.push("targetTypeId"); item.type = "UPDATE"; item.decision = "PENDING"; }
  });
  rows.filter((item) => !matched.has(item.id)).forEach(({ kind, ...item }) => differences.push({ id: crypto.randomUUID(), kind, oldValue: item, newValue: null, type: "DELETE", changed: [], decision: "PENDING" }));
  const comparison = { id: crypto.randomUUID(), recordId, namespaceId, versionId: target.versionId, fingerprint, differences, createdAt: new Date().toISOString() };
  const current = readWorkflow(owner);
  persist({ ...current, comparisons: [comparison, ...current.comparisons] }, owner);
  return comparison;
}
export function decideDifference(comparisonId, differenceId, decision) {
  if (!["ACCEPT", "KEEP"].includes(decision)) throw new Error("无效判定");
  const state = readWorkflow();
  const comparison = state.comparisons.find((item) => item.id === comparisonId);
  if (!comparison || comparison.appliedAt) throw new Error("比对记录已应用或不存在");
  const next = { ...comparison, differences: comparison.differences.map((item) => item.id === differenceId ? { ...item, decision } : item) };
  persist({ ...state, comparisons: state.comparisons.map((item) => item.id === comparisonId ? next : item) });
  return next;
}
export function applyComparisonToModel(model, comparison, activeProjectId) {
  const namespace = model.namespaces.find((item) => item.id === comparison.namespaceId && item.projectId === activeProjectId);
  if (!namespace || statusOf(model, namespace) !== "DRAFT") throw new Error("目标为 released / archived，请先整库创建新镜像，再比对草稿版本");
  if (namespaceFingerprint(model, namespace.id) !== comparison.fingerprint) throw new Error("本体已变更，请重新比对");
  if (comparison.differences.some((item) => item.decision === "PENDING")) throw new Error("请完成全部差异的人工判定");
  let next = model;
  const accepted = comparison.differences.filter((item) => item.decision === "ACCEPT" && item.type !== "SAME");
  for (const item of accepted) {
    const value = item.newValue || item.oldValue;
    if (!CORE_KINDS.includes(item.kind) || item.kind === "namespaces" || value?.projectId !== activeProjectId || value?.namespaceId !== namespace.id || value?.versionId !== namespace.versionId) throw new Error("差异元素不属于目标命名空间");
    if (item.type === "ADD" && CORE_KINDS.some((kind) => model[kind]?.some((row) => row.id === value.id))) throw new Error("新增元素 ID 已存在，请重新比对");
    if (item.type !== "ADD" && !model[item.kind]?.some((row) => row.id === item.oldValue?.id && row.namespaceId === namespace.id)) throw new Error("原元素不存在，请重新比对");
  }
  for (const item of accepted.filter((item) => item.type !== "DELETE")) {
    const { id, ...value } = item.newValue;
    const payload = item.type === "ADD" ? value : { id, ...Object.fromEntries(item.changed.map((key) => [key, value[key]])), projectId: activeProjectId };
    const result = saveElement(next, item.kind, payload);
    // Keep candidate IDs stable so later properties and relationships bind to their reviewed subject.
    if (item.type === "ADD") {
      result.model[item.kind] = result.model[item.kind].map((row) => row.id === result.row.id ? { ...row, id } : row);
    }
    next = result.model;
  }
  for (const item of accepted.filter((item) => item.type === "DELETE").reverse()) {
    if (!next[item.kind].some((row) => row.id === item.oldValue.id)) continue;
    const deleted = removeElement(next, item.kind, item.oldValue.id, activeProjectId);
    const removedIds = CORE_KINDS.flatMap((kind) => next[kind] || []).filter((row) => !CORE_KINDS.flatMap((kind) => deleted[kind] || []).some((other) => other.id === row.id)).map((row) => row.id);
    if (comparison.differences.some((diff) => diff.oldValue && removedIds.includes(diff.oldValue.id) && diff.decision !== "ACCEPT")) throw new Error("删除主体前，必须接受其所有子元素的删除");
    next = deleted;
  }
  return next;
}
export async function applyComparison(id) {
  const owner = projectId();
  const state = readWorkflow(owner);
  const comparison = state.comparisons.find((item) => item.id === id);
  if (!comparison || comparison.appliedAt) throw new Error("比对记录已应用或不存在");
  const response = await fetch(`/api/spg-comparisons/apply?projectId=${encodeURIComponent(owner)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(comparison) });
  if (!response.ok) throw new Error((await response.json()).message || "应用失败");
  const current = readWorkflow(owner);
  persist({ ...current, comparisons: current.comparisons.map((item) => item.id === id ? { ...item, appliedAt: new Date().toISOString() } : item) }, owner);
}

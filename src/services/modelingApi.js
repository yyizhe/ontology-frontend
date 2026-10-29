/**
 * 建模增强能力：智能抽取 / 本体验证 / 本体模型
 *
 * 这一层不新增后端接口，直接复用 spgSchemaApi 读写「SPG 本体建模」的同一份数据，
 * 因此抽取入库的元素会真实出现在「本体建模」页面，验证也会真实作用在本体元素上。
 * 运行记录（抽取批次、验证批次、问题处置）按项目维度存在 localStorage。
 */
import * as spgSchemaApi from "./spgSchemaApi";
import { dedupeCandidates as dedupe } from "./extractionCandidates";

const RUNS_KEY = "datapilot.modelingRuns";
const CURRENT_PROJECT_KEY = "datapilot.currentProject";
const DEFAULT_PROJECT_ID = "project-demo-main";

const CORE_KINDS = ["namespaces", "entityTypes", "conceptTypes", "eventTypes", "standardValues", "properties", "constraints", "rules", "relations"];
const BASE_DATA_TYPES = new Set([
  "String", "Text", "Integer", "Long", "Float", "Double", "Boolean", "Date", "DateTime", "Time",
  "Decimal", "Int", "Number", "Enum", "Json", "Binary",
]);

function currentProjectId() {
  try {
    return localStorage.getItem(CURRENT_PROJECT_KEY) || DEFAULT_PROJECT_ID;
  } catch {
    return DEFAULT_PROJECT_ID;
  }
}

function readRuns() {
  try {
    return JSON.parse(localStorage.getItem(RUNS_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeRuns(next) {
  try {
    localStorage.setItem(RUNS_KEY, JSON.stringify(next));
  } catch {
    /* 忽略存储失败 */
  }
}

function projectRuns() {
  const all = readRuns();
  const projectId = currentProjectId();
  return all[projectId] || { extractions: [], validations: [], dispositions: {} };
}

function saveProjectRuns(next) {
  const all = readRuns();
  all[currentProjectId()] = { extractions: [], validations: [], dispositions: {}, ...next };
  writeRuns(all);
}

export function loadCoreModel() {
  return spgSchemaApi.listSpgCoreModel();
}

export function latestVersionId(model = {}) {
  const versions = model.versions || [];
  const latest = versions.find((item) => item.isLatest) || [...versions].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
  return latest?.id || "";
}

export function scopeModelByVersion(model = {}, versionId = "") {
  const scoped = {};
  CORE_KINDS.forEach((kind) => { scoped[kind] = (model[kind] || []).filter((row) => !versionId || row.versionId === versionId); });
  return scoped;
}

/* ------------------------------------------------------------------ */
/* 一、智能抽取                                                          */
/* ------------------------------------------------------------------ */

export const EXTRACTION_SOURCE_TYPES = [
  {
    id: "structured",
    label: "结构化抽取",
    icon: "table",
    summary: "从数据库 DDL、表字段清单、CSV/Excel 表头中抽取实体类型与属性。",
    placeholder: "粘贴 CREATE TABLE 语句、字段清单或 CSV 表头，例如：\nCREATE TABLE engine_test (\n  id BIGINT PRIMARY KEY,\n  engine_code VARCHAR(64),\n  thrust_value DECIMAL(10,2)\n);",
    sample: "CREATE TABLE engine_test (\n  id BIGINT PRIMARY KEY,\n  engine_code VARCHAR(64),\n  thrust_value DECIMAL(10,2),\n  test_time DATETIME\n);\n\nCREATE TABLE test_device (\n  id BIGINT PRIMARY KEY,\n  device_code VARCHAR(64),\n  device_status VARCHAR(32)\n);",
    filename: "engine_schema.sql",
  },
  {
    id: "semistructured",
    label: "半结构化抽取",
    icon: "braces",
    summary: "从模型解析 JSON 中抽取实体、属性、概念与包含关系。",
    placeholder: "粘贴模型解析后的 JSON 结构。",
    sample: '{\n  "CADAssembly": {\n    "assemblyCode": "ASM-001",\n    "material": "钛合金",\n    "components": {\n      "TurbineRotor": { "rotorCode": "R-01", "weight": 12.5 },\n      "Combustor": { "chamberCode": "C-01", "pressure": 3.2 }\n    }\n  }\n}',
    filename: "cad_model.json",
  },
  {
    id: "unstructured",
    label: "非结构化抽取",
    icon: "file",
    summary: "从流程文件与技术文档中抽取产品组成、系统从属、规则、活动与事件。",
    placeholder: "粘贴技术文档、试验流程或维护规程片段。",
    sample: "发动机装配完成后必须执行装配检查活动。\n装配检查结果触发故障告警事件。\n燃烧室属于发动机系统，涡轮转子组成核心机。\n试验台架依赖冷却系统，冷却系统包含水泵与管路。\n当推力低于阈值时触发性能异常事件。",
    filename: "试验流程说明.docx",
  },
];

const slugHash = (value = "") => {
  let hash = 0;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  return hash.toString(36);
};

const safeId = (prefix, label = "") => {
  const slug = String(label).replace(/[^A-Za-z0-9]+/g, "").slice(0, 28);
  return `spg-ex-${prefix}-${slug || slugHash(label)}`.toLowerCase();
};

/** 保留中文字符，英文单词转首字母大写，避免中文候选名被清洗成空字符串 */
const toPascal = (value = "") => {
  const cleaned = String(value || "").replace(/[^A-Za-z0-9㐀-鿿]+/g, " ").trim();
  if (!cleaned) return "ExtractedItem";
  return cleaned.split(/\s+/).filter(Boolean).map((word) => (/^[A-Za-z]/.test(word) ? word.charAt(0).toUpperCase() + word.slice(1) : word)).join("");
};
const toCamel = (value = "") => {
  const pascal = toPascal(value);
  return /^[A-Z]/.test(pascal) ? pascal.charAt(0).toLowerCase() + pascal.slice(1) : pascal;
};

function candidate(elementType, label, extra = {}) {
  return {
    element_type: elementType,
    label,
    confidence: 0.7,
    evidence: label,
    definition: "",
    source: "",
    target: "",
    domain: "",
    range: "",
    ...extra,
  };
}

function extractStructured(content, filename) {
  const rows = [];
  const tablePattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"[\]]?([A-Za-z0-9_]+)[`"[\]]?\s*\(([\s\S]*?)\);/gi;
  let matched = false;
  let match = tablePattern.exec(content);
  while (match) {
    matched = true;
    const [, tableName, body] = match;
    const entityId = safeId("entity", tableName);
    const entityName = toPascal(tableName);
    rows.push(candidate("entityTypes", entityName, {
      id: entityId,
      confidence: 0.86,
      evidence: `CREATE TABLE ${tableName}`,
      definition: `由结构化数据源 ${filename} 抽取的数据表实体。`,
    }));
    body
      .split(/,(?![^()]*\))/g)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        if (/^\s*(PRIMARY\s+KEY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN\s+KEY)/i.test(line)) return;
        if (/\bPRIMARY\s+KEY\b/i.test(line)) return;
        const columnMatch = line.match(/^[`"[\]]?([A-Za-z0-9_]+)[`"[\]]?\s+([A-Za-z]+(?:\(\d+(?:,\d+)?\))?)/);
        if (!columnMatch) return;
        const [, columnName, rawType] = columnMatch;
        if (/^(PRIMARY|UNIQUE|KEY|INDEX|CONSTRAINT)$/i.test(columnName)) return;
        rows.push(candidate("properties", toCamel(columnName), {
          id: safeId("prop", `${tableName}-${columnName}`),
          confidence: 0.82,
          evidence: `${tableName}.${columnName} ${rawType}`,
          definition: `${entityName} 的数据表字段。`,
          domain: entityId,
          range: rawType.replace(/\(.*\)/, "") || "String",
        }));
      });
    match = tablePattern.exec(content);
  }
  if (matched) return dedupe(rows);

  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const separator = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(separator).map((item) => item.trim().replace(/^"|"$/g, "")).filter(Boolean);
  if (headers.length < 1) return [];
  const tableLabel = toPascal(String(filename || "数据表").replace(/\.[^.]+$/, ""));
  const entityId = safeId("entity", tableLabel);
  rows.push(candidate("entityTypes", tableLabel, {
    id: entityId,
    confidence: 0.76,
    evidence: "CSV/表格首行字段",
    definition: `由表格文件 ${filename} 抽取的数据集实体。`,
  }));
  headers.forEach((header) => {
    rows.push(candidate("properties", toCamel(header), {
      id: safeId("prop", `${tableLabel}-${header}`),
      confidence: 0.7,
      evidence: header,
      definition: `${tableLabel} 的表格字段。`,
      domain: entityId,
      range: "String",
    }));
  });
  return dedupe(rows);
}

function flattenJson(value, label, parentId, rows, depth = 0) {
  const entityId = safeId(depth === 0 ? "entity" : "entity", label);
  rows.push(candidate("entityTypes", toPascal(label), {
    id: entityId,
    confidence: depth === 0 ? 0.78 : 0.72,
    evidence: `JSON 节点 ${label}`,
    definition: `由半结构化 JSON 节点 ${label} 抽取。`,
    ...(parentId ? { domain: parentId } : {}),
  }));
  if (parentId) {
    rows.push(candidate("relations", `包含${toPascal(label)}`, {
      id: safeId("rel", `contains-${label}`),
      confidence: 0.72,
      evidence: `${label}`,
      definition: "JSON 层级包含关系。",
      source: parentId,
      target: entityId,
      targetLabel: toPascal(label),
    }));
  }
  Object.entries(value || {}).forEach(([key, child]) => {
    if (child && typeof child === "object" && !Array.isArray(child)) {
      flattenJson(child, key, entityId, rows, depth + 1);
      return;
    }
    const typeName = Array.isArray(child) ? "Array" : typeof child === "number" ? "Double" : typeof child === "boolean" ? "Boolean" : "String";
    rows.push(candidate("properties", toCamel(key), {
      id: safeId("prop", `${label}-${key}`),
      confidence: 0.74,
      evidence: `${key}: ${String(child)}`,
      definition: `${toPascal(label)} 的 JSON 属性。`,
      domain: entityId,
      range: typeName,
    }));
  });
}

function extractSemistructured(content) {
  let parsed = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  const rows = [];
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    Object.entries(parsed).forEach(([key, value]) => {
      if (value && typeof value === "object") flattenJson(value, key, "", rows, 0);
      else rows.push(candidate("properties", toCamel(key), { id: safeId("prop", key), confidence: 0.68, evidence: `${key}: ${String(value)}` }));
    });
  }
  return dedupe(rows);
}

function extractUnstructured(content, filename) {
  const rows = [];
  const sentences = content.split(/[。；;\n\r]+/).map((item) => item.trim()).filter(Boolean);
  const keywordTypes = [
    ["eventTypes", "事件", "Event"],
    ["rules", "规则", "Rule"],
    ["constraints", "约束", "Constraint"],
    ["entityTypes", "系统", "Entity"],
    ["entityTypes", "产品", "Entity"],
    ["conceptTypes", "任务", "Concept"],
    ["conceptTypes", "流程", "Concept"],
  ];
  sentences.slice(0, 80).forEach((sentence) => {
    const compact = sentence.replace(/\s+/g, "");
    keywordTypes.forEach(([elementType, keyword]) => {
      if (!compact.includes(keyword)) return;
      const at = compact.indexOf(keyword);
      const end = at + keyword.length;
      let start = 0;
      ["，", "。", "；", "、", ",", ";", "："].forEach((delimiter) => {
        const found = compact.lastIndexOf(delimiter, at - 1);
        if (found >= 0) start = Math.max(start, found + 1);
      });
      if (end - start > 12) start = end - 12;
      const label = compact.slice(Math.max(0, start), end) || compact.slice(0, 12);
      rows.push(candidate(elementType, label, {
        id: safeId(elementType.replace("Types", ""), label),
        confidence: 0.62,
        evidence: sentence,
        definition: sentence,
        expression: elementType === "rules" || elementType === "constraints" ? "text-extracted" : "",
      }));
    });
    const relationMatch = compact.match(/(.{2,12}?)(组成|属于|触发|导致|依赖|包含|驱动)([^，。；、,\s]{2,12})/);
    if (relationMatch) {
      const [, sourceLabel, predicate, targetLabel] = relationMatch;
      const sourceId = safeId("entity", sourceLabel);
      const targetId = safeId("entity", targetLabel);
      rows.push(candidate("entityTypes", toPascal(sourceLabel) || sourceLabel, { id: sourceId, confidence: 0.58, evidence: sentence, definition: `由文本关系主语抽取：${sentence}` }));
      rows.push(candidate("entityTypes", toPascal(targetLabel) || targetLabel, { id: targetId, confidence: 0.58, evidence: sentence, definition: `由文本关系宾语抽取：${sentence}` }));
      rows.push(candidate("relations", predicate, { id: safeId("rel", `${sourceLabel}-${predicate}-${targetLabel}`), confidence: 0.66, evidence: sentence, definition: `由文本谓词"${predicate}"抽取。`, source: sourceId, target: targetId, targetLabel: toPascal(targetLabel) }));
    }
  });
  if (!rows.length && content.trim()) {
    const label = String(filename || "非结构化知识片段").replace(/\.[^.]+$/, "");
    rows.push(candidate("conceptTypes", label, { id: safeId("concept", label), confidence: 0.45, evidence: content.trim().slice(0, 240), definition: content.trim().slice(0, 240) }));
  }
  return dedupe(rows);
}

export const confidenceLevel = (value = 0) => (value >= 0.8 ? "high" : value >= 0.65 ? "medium" : "low");
export const confidenceText = (value = 0) => (value >= 0.8 ? "高置信" : value >= 0.65 ? "中置信" : "低置信");

export const ELEMENT_KIND_LABELS = {
  standardValues: "标准值",
  namespaces: "命名空间",
  entityTypes: "实体定义",
  conceptTypes: "概念定义",
  eventTypes: "事件定义",
  properties: "属性定义",
  constraints: "独立约束",
  rules: "规则",
  relations: "关系定义",
};

export async function previewExtraction({ sourceType, content, filename, domain }) {
  const text = String(content || "");
  let rows = [];
  let errors = [];
  if (!text.trim()) errors = ["请输入或上传待抽取的内容。"];
  else if (sourceType === "structured") rows = extractStructured(text, filename);
  else if (sourceType === "semistructured") {
    rows = extractSemistructured(text);
    if (!rows.length) errors = ["JSON 解析失败，请检查内容是否为合法 JSON。"];
  } else rows = extractUnstructured(text, filename);

  const byType = rows.reduce((acc, row) => ({ ...acc, [row.element_type]: (acc[row.element_type] || 0) + 1 }), {});
  return {
    sourceType,
    filename: filename || "未命名来源",
    domain: domain || "",
    candidates: rows,
    totalCandidates: rows.length,
    readyCandidates: rows.length,
    byType,
    errors,
    createdAt: new Date().toISOString(),
  };
}

const PARENT_KINDS = ["entityTypes", "conceptTypes", "eventTypes"];

export async function commitExtraction({ sourceType, filename, candidates, versionId, namespaceId }) {
  const rows = candidates || [];
  // 先建实体/概念/事件，再建属性与关系，这样可以把属性与关系挂到本批次新建的父元素上
  const ordered = [...rows.filter((item) => PARENT_KINDS.includes(item.element_type)), ...rows.filter((item) => !PARENT_KINDS.includes(item.element_type))];
  const created = [];
  const failures = [];
  const now = new Date().toISOString();
  const idMap = new Map();
  const kindMap = new Map();
  for (const item of ordered) {
    const kind = item.element_type;
    if (!CORE_KINDS.includes(kind)) {
      failures.push({ label: item.label, error: `不支持的元素类型 ${kind}` });
      continue;
    }
    try {
      const payload = {
        name: item.label,
        code: kind === "properties" || kind === "constraints" || kind === "rules" || kind === "relations" ? toCamel(item.label) : toPascal(item.label),
        description: item.definition || item.evidence || `由${sourceType === "structured" ? "结构化" : sourceType === "semistructured" ? "半结构化" : "非结构化"}来源 ${filename} 抽取。`,
        namespaceId,
        versionId,
        parentId: "",
        parentKind: "",
        updatedAt: now,
        origin: "extraction",
        extractionSource: sourceType,
        confidence: item.confidence,
      };
      if (kind === "properties") Object.assign(payload, {
        dataType: item.range || "String",
        valueType: item.range || "String",
        required: false,
        cardinality: "0..1",
        parentId: idMap.get(item.domain) || "",
        parentKind: kindMap.get(item.domain) || "",
      });
      if (kind === "constraints" || kind === "rules") Object.assign(payload, { parentId: idMap.get(item.domain) || "", parentKind: kindMap.get(item.domain) || "" });
      if (kind === "constraints") Object.assign(payload, { constraintType: "NotNull", value: "true" });
      if (kind === "rules") Object.assign(payload, { expression: item.expression || "text-extracted" });
      if (kind === "relations") Object.assign(payload, {
        parentId: idMap.get(item.source) || "",
        parentKind: kindMap.get(item.source) || "",
        targetTypeId: idMap.get(item.target) || "",
        targetType: item.targetLabel || "",
      });
      if (PARENT_KINDS.includes(kind)) Object.assign(payload, { hypernymPredicate: "isA" });
      const saved = await spgSchemaApi.saveSpgCoreElement(kind, payload);
      idMap.set(item.id, saved.id);
      kindMap.set(item.id, kind);
      created.push({ ...saved, kind });
    } catch (error) {
      failures.push({ label: item.label, error: error.message });
    }
  }
  const runs = projectRuns();
  const run = {
    id: `ex-${Date.now()}`,
    sourceType,
    filename: filename || "未命名来源",
    createdCount: created.length,
    failedCount: failures.length,
    createdAt: now,
    versionId,
  };
  saveProjectRuns({ ...runs, extractions: [run, ...runs.extractions].slice(0, 20) });
  return { created, failures, run };
}

/* ------------------------------------------------------------------ */
/* 二、本体验证                                                          */
/* ------------------------------------------------------------------ */

export const VALIDATION_RULES = [
  { ruleId: "W01", ruleName: "父级缺失", issueType: "约束冲突", ruleDescription: "检查元素父级是否存在，避免层级断裂。", severity: "high" },
  { ruleId: "W02", ruleName: "关系端点缺失", issueType: "约束冲突", ruleDescription: "检查关系是否同时具备主体与目标类型。", severity: "high" },
  { ruleId: "W03", ruleName: "source 引用缺失", issueType: "约束冲突", ruleDescription: "检查关系主体是否存在于当前版本本体。", severity: "high" },
  { ruleId: "W04", ruleName: "target 引用缺失", issueType: "约束冲突", ruleDescription: "检查关系目标类型是否存在于当前版本本体。", severity: "high" },
  { ruleId: "W05", ruleName: "domain 引用缺失", issueType: "约束冲突", ruleDescription: "检查属性归属的实体、概念或事件是否存在。", severity: "high" },
  { ruleId: "W06", ruleName: "同名元素", issueType: "冗余冲突", ruleDescription: "检查同名元素，防止语义重复。", severity: "medium" },
  { ruleId: "W07", ruleName: "循环继承", issueType: "逻辑矛盾", ruleDescription: "检查继承链是否形成闭环。", severity: "high" },
  { ruleId: "W08", ruleName: "互斥约束冲突", issueType: "约束冲突", ruleDescription: "检查元素是否同时落入互斥约束与同一父级。", severity: "medium" },
  { ruleId: "W09", ruleName: "ID 规范", issueType: "格式冲突", ruleDescription: "检查编码是否满足字母或下划线开头的命名规范。", severity: "low" },
  { ruleId: "W10", ruleName: "标签完整性", issueType: "完整性缺失", ruleDescription: "检查元素是否具备可展示的名称。", severity: "medium" },
  { ruleId: "W11", ruleName: "定义完整性", issueType: "完整性缺失", ruleDescription: "检查核心建模对象是否具备业务定义。", severity: "medium" },
  { ruleId: "W13", ruleName: "属性定义域", issueType: "约束冲突", ruleDescription: "检查属性是否绑定到实体、概念、事件或关系。", severity: "high" },
  { ruleId: "W14", ruleName: "属性值域", issueType: "约束冲突", ruleDescription: "检查属性是否填写数据类型或引用值域。", severity: "medium" },
  { ruleId: "W15", ruleName: "属性值域引用", issueType: "约束冲突", ruleDescription: "检查属性值域是否为基础类型或已有概念类型。", severity: "high" },
  { ruleId: "W16", ruleName: "关系自环", issueType: "逻辑矛盾", ruleDescription: "检查自环关系是否显式声明为自反关系。", severity: "medium" },
  { ruleId: "W17", ruleName: "约束表达式", issueType: "完整性缺失", ruleDescription: "检查约束是否具备约束类型与取值。", severity: "medium" },
  { ruleId: "W18", ruleName: "规则表达式", issueType: "完整性缺失", ruleDescription: "检查规则是否具备可审查的表达式。", severity: "medium" },
  { ruleId: "W19", ruleName: "事件语义", issueType: "完整性缺失", ruleDescription: "检查事件类型是否说明触发条件。", severity: "medium" },
  { ruleId: "W20", ruleName: "活动语义", issueType: "完整性缺失", ruleDescription: "检查事件/关系是否说明参与对象与输入输出。", severity: "low" },
  { ruleId: "W23", ruleName: "重复 ID", issueType: "冗余冲突", ruleDescription: "检查当前版本是否存在重复 ID。", severity: "high" },
  { ruleId: "W24", ruleName: "约束端点", issueType: "约束冲突", ruleDescription: "检查约束是否绑定到具体属性。", severity: "high" },
  { ruleId: "W25", ruleName: "英文名驼峰", issueType: "格式冲突", ruleDescription: "检查属性、约束、规则、关系编码是否采用首字母小写驼峰。", severity: "low" },
  { ruleId: "W26", ruleName: "同类型重名", issueType: "冗余冲突", ruleDescription: "检查同类型元素名称与编码是否重复。", severity: "high" },
  { ruleId: "W27", ruleName: "概念类型归属", issueType: "语义冲突", ruleDescription: "检查概念类型是否归属命名空间或上位概念。", severity: "medium" },
  { ruleId: "W29", ruleName: "关系端点类型", issueType: "约束冲突", ruleDescription: "检查关系主体与客体类型是否符合业务规则。", severity: "medium" },
  { ruleId: "W30", ruleName: "属性定义域类型", issueType: "约束冲突", ruleDescription: "检查属性定义域是否为实体、概念、事件或关系。", severity: "high" },
  { ruleId: "W31", ruleName: "概念属性值域", issueType: "约束冲突", ruleDescription: "检查属性值域引用概念时，概念必须存在。", severity: "medium" },
  { ruleId: "W32", ruleName: "关系属性类型", issueType: "约束冲突", ruleDescription: "检查关系属性不得引用概念类型。", severity: "medium" },
  { ruleId: "W35", ruleName: "抽象关系分组", issueType: "约束冲突", ruleDescription: "检查无目标类型的顶层关系是否用 ABSTRACT 标注。", severity: "low" },
  { ruleId: "W36", ruleName: "命名空间归属", issueType: "完整性缺失", ruleDescription: "检查元素是否归属到具体命名空间。", severity: "medium" },
];

const RULE_BY_ID = Object.fromEntries(VALIDATION_RULES.map((item) => [item.ruleId, item]));

const REPAIR_SUGGESTIONS = {
  W01: ["补齐父级", "将父级指向当前版本已存在的元素，或清理无效父级引用。"],
  W02: ["补齐关系端点", "为关系同时指定主体元素与目标类型。"],
  W03: ["修正关系主体", "将关系主体指向当前版本已存在的实体或事件。"],
  W04: ["修正关系目标", "将关系目标类型指向当前版本已存在的实体、概念或事件。"],
  W05: ["补齐属性定义域", "将属性绑定到实体、概念、事件或关系。"],
  W06: ["合并或重命名", "合并重复语义的元素，或调整名称以区分业务含义。"],
  W07: ["断开继承环", "调整继承链，打破循环引用。"],
  W08: ["调整互斥约束", "确认互斥语义，或移除重复的互斥声明。"],
  W09: ["规范命名", "将编码调整为字母或下划线开头的驼峰命名。"],
  W10: ["补齐名称", "为元素填写可展示的中英文名称。"],
  W11: ["补齐业务定义", "为元素补充业务定义或说明。"],
  W13: ["绑定定义域", "为属性指定所属的实体、概念、事件或关系。"],
  W14: ["补齐数据类型", "为属性填写数据类型或引用值域。"],
  W15: ["修正值域引用", "将值域调整为基础数据类型或已有概念类型。"],
  W16: ["声明自反关系", "为自环关系补充 REFLEXIVE 声明，或调整端点。"],
  W17: ["补齐约束表达式", "为约束填写约束类型与取值。"],
  W18: ["补齐规则表达式", "为规则填写可审查的 DSL 或业务规则表达式。"],
  W19: ["补齐触发条件", "为事件补充触发条件或事件定义。"],
  W20: ["补齐输入输出", "为事件/关系补充参与对象、输入与输出说明。"],
  W23: ["去重 ID", "合并重复 ID 的元素，保留唯一标识。"],
  W24: ["绑定属性", "将约束绑定到具体属性。"],
  W25: ["规范编码", "将编码调整为首字母小写驼峰。"],
  W26: ["重命名元素", "调整同类型内重复的名称或编码。"],
  W27: ["调整概念归属", "将概念类型挂到命名空间或上位概念下。"],
  W29: ["修正关系端点类型", "按业务规则调整关系主体与客体类型。"],
  W30: ["修正定义域类型", "将属性定义域绑定到实体、概念、事件或关系。"],
  W31: ["修正概念引用", "将值域指向存在的概念类型。"],
  W32: ["替换值域类型", "关系属性不得引用概念类型，请改用基础类型。"],
  W35: ["标注抽象关系", "为无目标类型的顶层关系补充 ABSTRACT 标注。"],
  W36: ["归属命名空间", "为元素指定所属命名空间。"],
};

const CAMEL = /^[a-z][A-Za-z0-9]*$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function pushIssue(list, ruleId, row, kind, reason, severityOverride) {
  const rule = RULE_BY_ID[ruleId];
  if (!rule) return;
  const [method, result] = REPAIR_SUGGESTIONS[ruleId] || ["人工复核", reason];
  list.push({
    issueId: `${ruleId}-${kind}-${row.id}`,
    ruleId,
    ruleName: rule.ruleName,
    ruleDescription: rule.ruleDescription,
    issueType: rule.issueType,
    severity: severityOverride || rule.severity,
    elementId: row.id,
    elementLabel: row.name || row.code || row.id,
    elementType: kind,
    elementTypeLabel: ELEMENT_KIND_LABELS[kind] || kind,
    location: `${ELEMENT_KIND_LABELS[kind] || kind} / ${row.name || row.id}`,
    reason,
    cause: rule.ruleDescription,
    repairSuggestion: { method, result, operatorRole: "本体建模人员" },
    status: "open",
  });
}

export function runValidation(model, versionId) {
  const scoped = scopeModelByVersion(model, versionId);
  const allRows = CORE_KINDS.flatMap((kind) => (scoped[kind] || []).map((row) => ({ ...row, kind })));
  const rowMap = Object.fromEntries(allRows.map((row) => [row.id, row]));
  const conceptNames = new Set((scoped.conceptTypes || []).map((item) => item.name).filter(Boolean));
  const issues = [];

  const idSeen = new Map();
  allRows.forEach((row) => {
    if (idSeen.has(row.id)) pushIssue(issues, "W23", row, row.kind, `元素 ID「${row.id}」在当前版本重复出现。`);
    else idSeen.set(row.id, row);
  });

  const nameKey = new Map();
  allRows.forEach((row) => {
    const key = `${row.kind}:${row.name}`;
    if (!row.name) {
      pushIssue(issues, "W10", row, row.kind, "元素缺少可展示的名称。");
      return;
    }
    if (nameKey.has(key)) {
      pushIssue(issues, "W26", row, row.kind, `同类型下已存在同名元素「${row.name}」。`);
      pushIssue(issues, "W06", row, row.kind, `元素名称「${row.name}」与同类型元素重复。`);
    } else nameKey.set(key, row);
  });

  allRows.forEach((row) => {
    const kind = row.kind;
    if (kind !== "namespaces" && row.code && !IDENTIFIER.test(row.code)) pushIssue(issues, "W09", row, kind, `编码「${row.code}」不满足字母或下划线开头的命名规范。`);
    if (kind !== "namespaces" && !row.namespaceId) pushIssue(issues, "W36", row, kind, "元素未归属到任何命名空间。");
    if (row.parentId && !rowMap[row.parentId]) pushIssue(issues, "W01", row, kind, `父级引用「${row.parentId}」在当前版本不存在。`);

    // 循环继承
    let cursor = rowMap[row.parentId];
    let depth = 0;
    while (cursor && depth < 12) {
      if (cursor.id === row.id) { pushIssue(issues, "W07", row, kind, "继承链存在循环引用。"); break; }
      cursor = rowMap[cursor.parentId];
      depth += 1;
    }

    if (["entityTypes", "conceptTypes", "eventTypes"].includes(kind) && !row.description) pushIssue(issues, "W11", row, kind, "核心建模对象缺少业务定义。");
    if (kind === "conceptTypes" && !row.parentId && !row.namespaceId) pushIssue(issues, "W27", row, kind, "概念类型既未挂载上位概念，也未归属命名空间。");

    if (kind === "properties") {
      const parent = rowMap[row.parentId];
      if (!row.parentId || !parent) pushIssue(issues, "W13", row, kind, "属性未绑定到实体、概念、事件或关系。");
      else if (!["entityTypes", "conceptTypes", "eventTypes", "relations", "properties"].includes(parent.kind)) pushIssue(issues, "W30", row, kind, `属性定义域类型「${ELEMENT_KIND_LABELS[parent.kind] || parent.kind}」不被支持。`);
      if (!row.dataType && !row.valueType) pushIssue(issues, "W14", row, kind, "属性未填写数据类型或引用值域。");
      const dataType = row.dataType || row.valueType;
      if (dataType && !BASE_DATA_TYPES.has(dataType) && !conceptNames.has(dataType)) pushIssue(issues, "W15", row, kind, `属性值域「${dataType}」既不是基础类型，也不是已定义的概念类型。`);
      const parent2 = rowMap[row.parentId];
      if (parent2 && parent2.kind === "relations" && dataType && conceptNames.has(dataType)) pushIssue(issues, "W32", row, kind, "关系属性不得引用概念类型作为值域。");
      if (row.code && !CAMEL.test(row.code)) pushIssue(issues, "W25", row, kind, `属性编码「${row.code}」未采用首字母小写驼峰命名。`);
    }

    if (kind === "constraints") {
      if (!row.constraintType || !row.value) pushIssue(issues, "W17", row, kind, "约束缺少约束类型或取值。");
      if (!row.parentId || !rowMap[row.parentId]) pushIssue(issues, "W24", row, kind, "约束未绑定到具体属性。");
      if (row.code && !CAMEL.test(row.code)) pushIssue(issues, "W25", row, kind, `约束编码「${row.code}」未采用首字母小写驼峰命名。`);
    }

    if (kind === "rules") {
      if (!row.expression) pushIssue(issues, "W18", row, kind, "规则缺少可审查的表达式。");
      if (row.code && !CAMEL.test(row.code)) pushIssue(issues, "W25", row, kind, `规则编码「${row.code}」未采用首字母小写驼峰命名。`);
    }

    if (kind === "relations") {
      const subject = rowMap[row.parentId];
      if (!row.parentId || !subject) pushIssue(issues, "W03", row, kind, "关系缺少主体元素。");
      if (!row.targetTypeId && !row.targetType) {
        pushIssue(issues, "W02", row, kind, "关系缺少目标类型。");
        if (!/ABSTRACT/i.test(row.expression || "")) pushIssue(issues, "W35", row, kind, "无目标类型的顶层关系未用 ABSTRACT 标注。");
      } else if (row.targetTypeId && !rowMap[row.targetTypeId]) {
        pushIssue(issues, "W04", row, kind, `关系目标类型「${row.targetTypeId}」在当前版本不存在。`);
      }
      if (row.targetTypeId && row.targetTypeId === row.parentId && !/REFLEXIVE/i.test(row.expression || "")) pushIssue(issues, "W16", row, kind, "关系存在自环，但未声明为自反关系。");
      if (subject && subject.kind === "conceptTypes" && rowMap[row.targetTypeId]?.kind === "entityTypes") pushIssue(issues, "W29", row, kind, "概念类型不应直接指向实体类型。");
      if (!row.description) pushIssue(issues, "W20", row, kind, "关系缺少输入输出或参与对象说明。");
      if (row.code && !CAMEL.test(row.code)) pushIssue(issues, "W25", row, kind, `关系编码「${row.code}」未采用首字母小写驼峰命名。`);
    }

    if (kind === "eventTypes") {
      if (!row.triggerCondition && !/(触发|条件|condition)/i.test(row.description || "")) pushIssue(issues, "W19", row, kind, "事件类型未说明触发条件。");
      if (!row.subjectType && !row.objectType) pushIssue(issues, "W20", row, kind, "事件类型未说明事件主体与客体。", "low");
    }
  });

  // 互斥约束冲突：同父级下存在两个声明 Disjoint 的元素
  const byParent = {};
  allRows.forEach((row) => {
    if (!row.parentId) return;
    (byParent[row.parentId] = byParent[row.parentId] || []).push(row);
  });
  Object.entries(byParent).forEach(([, siblings]) => {
    const disjoint = siblings.filter((row) => /disjoint/i.test(row.expression || ""));
    if (disjoint.length > 1) disjoint.forEach((row) => pushIssue(issues, "W08", row, row.kind, "同一父级下存在多个互斥声明，可能产生语义冲突。"));
  });

  const severityCounts = issues.reduce((acc, item) => ({ ...acc, [item.severity]: (acc[item.severity] || 0) + 1 }), {});
  return {
    versionId,
    ruleCount: VALIDATION_RULES.length,
    elementCount: allRows.length,
    issues,
    issueCount: issues.length,
    severityCounts,
    createdAt: new Date().toISOString(),
  };
}

export async function runValidationAndRecord(model, versionId, trigger = "manual") {
  const result = runValidation(model, versionId);
  const run = {
    id: `val-${Date.now()}`,
    trigger,
    versionId,
    ruleCount: result.ruleCount,
    elementCount: result.elementCount,
    issueCount: result.issueCount,
    severityCounts: result.severityCounts,
    status: result.issueCount ? "blocked" : "passed",
    createdAt: result.createdAt,
  };
  const runs = projectRuns();
  saveProjectRuns({ ...runs, validations: [run, ...runs.validations].slice(0, 30), lastValidation: result });
  return { ...result, run };
}

export async function listValidationRuns() {
  return projectRuns().validations || [];
}

export async function loadLastValidation() {
  return projectRuns().lastValidation || null;
}

export async function listExtractionRuns() {
  return projectRuns().extractions || [];
}

export async function disposeIssue(issue, { method, result, operator }) {
  const runs = projectRuns();
  const disposition = { method, result, operator, disposedAt: new Date().toISOString() };
  saveProjectRuns({ ...runs, dispositions: { ...runs.dispositions, [issue.issueId]: disposition } });
  return disposition;
}

export function applyDispositions(issues, dispositions = {}) {
  return issues.map((issue) => (dispositions[issue.issueId] ? { ...issue, status: "disposed", disposition: dispositions[issue.issueId] } : { ...issue, status: "open" }));
}

export async function listDispositions() {
  return projectRuns().dispositions || {};
}

/* ------------------------------------------------------------------ */
/* 三、本体模型：图谱 / 导入导出                                          */
/* ------------------------------------------------------------------ */

export const GRAPH_KIND_META = {
  standardValues: { label: "Standard Value", color: "#32917f", ring: 1 },
  namespaces: { label: "命名空间", color: "#256d85", ring: 0 },
  entityTypes: { label: "实体定义", color: "#2962a8", ring: 1 },
  conceptTypes: { label: "概念定义", color: "#21856a", ring: 1 },
  eventTypes: { label: "事件定义", color: "#bf6a2c", ring: 1 },
  properties: { label: "属性定义", color: "#4b667d", ring: 2 },
  relations: { label: "关系定义", color: "#b0445d", ring: 2 },
  constraints: { label: "独立约束", color: "#9a741b", ring: 3 },
  rules: { label: "规则", color: "#76529b", ring: 3 },
};

export function buildGraph(model, versionId) {
  const scoped = scopeModelByVersion(model, versionId);
  const conceptAliases = model.conceptAliases || {};
  const rows = CORE_KINDS.flatMap((kind) => (scoped[kind] || []).map((row) => ({ ...row, kind })));
  // displayName 优先取业务中文名（concepts 词典按 code 匹配），其次 name，最后 id。
  // 双语并存：图谱标签用 displayName，详情面板同时给出中英文。
  rows.forEach((row) => { row.displayName = conceptAliases[row.code] || row.name || row.id; });
  const rowMap = Object.fromEntries(rows.map((row) => [row.id, row]));
  const edges = [];
  const invalidReferences = [];

  rows.forEach((row) => {
    const parent = row.parentId ? rowMap[row.parentId] : null;
    const namespace = row.namespaceId ? rowMap[row.namespaceId] : null;

    if (row.parentId && !parent) invalidReferences.push({ nodeId: row.id, field: "parentId", targetId: row.parentId });
    if (row.namespaceId && row.kind !== "namespaces" && !namespace) invalidReferences.push({ nodeId: row.id, field: "namespaceId", targetId: row.namespaceId });

    // 有显式父级时连接父子；顶层元素则连接所属命名空间，避免根节点视觉悬空。
    if (parent && parent.id !== row.id) {
      edges.push({ id: `${parent.id}->${row.id}`, source: parent.id, target: row.id, kind: "inherit", label: row.kind === "properties" ? "包含属性" : row.kind === "relations" ? "定义关系" : "上下位" });
    } else if (namespace && namespace.id !== row.id) {
      edges.push({ id: `${namespace.id}->${row.id}`, source: namespace.id, target: row.id, kind: "namespace", label: "命名空间" });
    }

    if (row.kind === "relations") {
      const target = rowMap[row.targetTypeId];
      if (row.targetTypeId && !target) invalidReferences.push({ nodeId: row.id, field: "targetTypeId", targetId: row.targetTypeId });
      // 关系作为独立节点参与语义链路：主体 → 关系 → 客体。
      if (target && target.id !== row.id) {
        edges.push({ id: `${row.id}->${target.id}`, source: row.id, target: target.id, kind: "relation", label: row.name || "关联" });
      }
    }
  });

  const uniqueEdges = Array.from(new Map(edges.filter((edge) => edge.source !== edge.target).map((edge) => [`${edge.source}:${edge.target}:${edge.kind}`, edge])).values());
  const connectedIds = new Set(uniqueEdges.flatMap((edge) => [edge.source, edge.target]));
  const isolatedNodes = rows.filter((row) => !connectedIds.has(row.id));
  const stats = CORE_KINDS.reduce((acc, kind) => ({ ...acc, [kind]: (scoped[kind] || []).length }), {});
  return { nodes: rows, edges: uniqueEdges, rowMap, stats, diagnostics: { invalidReferences, isolatedNodes } };
}

const csvCell = (value = "") => `"${String(value).replace(/"/g, '""')}"`;

export function exportModelCsv(model, versionId) {
  const scoped = scopeModelByVersion(model, versionId);
  const header = ["元素类型", "ID", "名称", "编码", "命名空间", "父级", "数据类型", "目标类型", "表达式", "描述"];
  const lines = [header.map(csvCell).join(",")];
  CORE_KINDS.forEach((kind) => {
    (scoped[kind] || []).forEach((row) => {
      lines.push([
        ELEMENT_KIND_LABELS[kind],
        row.id,
        row.name,
        row.code,
        scoped.namespaces?.find((item) => item.id === row.namespaceId)?.name || "",
        row.parentId || "",
        row.dataType || row.valueType || "",
        row.targetType || "",
        row.expression || row.constraintType || "",
        row.description || "",
      ].map(csvCell).join(","));
    });
  });
  return lines.join("\n");
}

const escapeXml = (value = "") => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function exportModelOwl(model, versionId) {
  const scoped = scopeModelByVersion(model, versionId);
  const namespace = scoped.namespaces?.[0]?.uri || "https://data.example.com/spg/ontology#";
  const classes = [...(scoped.entityTypes || []), ...(scoped.conceptTypes || []), ...(scoped.eventTypes || [])];
  const body = [];
  classes.forEach((item) => {
    body.push(`  <owl:Class rdf:about="${namespace}${escapeXml(item.code || item.name)}">`);
    body.push(`    <rdfs:label xml:lang="zh">${escapeXml(item.name)}</rdfs:label>`);
    if (item.description) body.push(`    <rdfs:comment>${escapeXml(item.description)}</rdfs:comment>`);
    const parent = classes.find((parentItem) => parentItem.id === item.parentId);
    if (parent) body.push(`    <rdfs:subClassOf rdf:resource="${namespace}${escapeXml(parent.code || parent.name)}"/>`);
    body.push("  </owl:Class>");
  });
  (scoped.properties || []).forEach((item) => {
    body.push(`  <owl:DatatypeProperty rdf:about="${namespace}${escapeXml(item.code || item.name)}">`);
    const owner = [...(scoped.entityTypes || []), ...(scoped.conceptTypes || []), ...(scoped.eventTypes || [])].find((ownerItem) => ownerItem.id === item.parentId);
    if (owner) body.push(`    <rdfs:domain rdf:resource="${namespace}${escapeXml(owner.code || owner.name)}"/>`);
    body.push(`    <rdfs:range rdf:resource="${escapeXml(`http://www.w3.org/2001/XMLSchema#${item.dataType === "DateTime" ? "dateTime" : "string"}`)}"/>`);
    body.push("  </owl:DatatypeProperty>");
  });
  (scoped.relations || []).forEach((item) => {
    body.push(`  <owl:ObjectProperty rdf:about="${namespace}${escapeXml(item.code || item.name)}">`);
    const subject = [...(scoped.entityTypes || []), ...(scoped.eventTypes || [])].find((subjectItem) => subjectItem.id === item.parentId);
    const target = [...(scoped.entityTypes || []), ...(scoped.conceptTypes || []), ...(scoped.eventTypes || [])].find((targetItem) => targetItem.id === item.targetTypeId);
    if (subject) body.push(`    <rdfs:domain rdf:resource="${namespace}${escapeXml(subject.code || subject.name)}"/>`);
    if (target) body.push(`    <rdfs:range rdf:resource="${namespace}${escapeXml(target.code || target.name)}"/>`);
    body.push("  </owl:ObjectProperty>");
  });
  return [
    '<?xml version="1.0"?>',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"',
    '         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"',
    '         xmlns:owl="http://www.w3.org/2002/07/owl#"',
    `         xml:base="${escapeXml(namespace)}">`,
    `  <owl:Ontology rdf:about="${escapeXml(namespace)}"/>`,
    ...body,
    "</rdf:RDF>",
  ].join("\n");
}

export function exportModelTemplate(model, versionId) {
  const scoped = scopeModelByVersion(model, versionId);
  return JSON.stringify({ versionId, exportedAt: new Date().toISOString(), ...scoped }, null, 2);
}

export function parseModelTemplate(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object") throw new Error("模板内容不是合法 JSON 对象");
  return parsed;
}

export async function importModelTemplate(parsed, versionId) {
  const kinds = CORE_KINDS.filter((kind) => kind !== "namespaces");
  let created = 0;
  for (const kind of kinds) {
    for (const row of parsed[kind] || []) {
      await spgSchemaApi.saveSpgCoreElement(kind, { ...row, id: row.id, versionId: row.versionId || versionId, updatedAt: new Date().toISOString() });
      created += 1;
    }
  }
  return { created };
}

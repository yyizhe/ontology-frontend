import { CORE_KINDS, saveElement, removeElement, cloneNamespace, restoreElementSnapshot } from "./spgModel";
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const USE_API = import.meta.env.VITE_USE_API !== "false";
const KEY = "datapilot.spgSchemaModel";
const CURRENT_PROJECT_KEY = "datapilot.currentProject";
const DEFAULT_PROJECT_ID = "project-demo-main";

function readCurrentProjectId() {
  try {
    const stored = localStorage.getItem(CURRENT_PROJECT_KEY);
    if (stored) return stored;
  } catch {}
  return DEFAULT_PROJECT_ID;
}

export const spgSchemaSeed = {
  versions: [
    { id: "spg-ontology-v21", name: "v2.1.0", status: "DRAFT", isLatest: true, description: "当前语义建模工作区", createdAt: "2026-09-28T12:46:00.000Z", projectId: "project-demo-main" },
    { id: "spg-ontology-v2", name: "v2.0.0", status: "RELEASED", isLatest: false, description: "生产依赖稳定快照", createdAt: "2026-09-03T09:20:00.000Z", projectId: "project-demo-main" },
    { id: "spg-ontology-v1", name: "v1.0.0", status: "ARCHIVED", isLatest: false, description: "历史归档版本", createdAt: "2026-06-18T03:00:00.000Z", projectId: "project-demo-main" },
  ],
  schemas: [
    {
      id: "spg-industrial-data",
      projectId: "project-demo-main",
      name: "工业装备数据 Schema",
      code: "industrial-equipment",
      version: "v1.0",
      namespace: "https://data.example.com/spg/industrial-equipment#",
      description: "描述工业装备、生产活动与质量数据的业务语义结构。",
      updatedAt: "2026-09-03T09:20:00.000Z",
    },
    {
      id: "spg-supply-chain",
      projectId: "project-demo-main",
      name: "供应链主数据 Schema",
      code: "supply-chain-master",
      version: "v1.1",
      namespace: "https://data.example.com/spg/supply-chain#",
      description: "面向供应商、物料和采购协同的主数据定义。",
      updatedAt: "2026-09-02T14:10:00.000Z",
    },
  ],
  concepts: [
    { id: "spg-concept-equipment", projectId: "project-demo-main", schemaId: "spg-industrial-data", name: "设备", code: "Equipment", description: "可被维护、监测和追溯的生产设备。" },
    { id: "spg-concept-work-order", projectId: "project-demo-main", schemaId: "spg-industrial-data", name: "工单", code: "WorkOrder", description: "针对设备执行的运维工作单元。" },
    { id: "spg-concept-inspection", projectId: "project-demo-main", schemaId: "spg-industrial-data", name: "质检记录", code: "InspectionRecord", description: "生产过程中的质量检测结果。" },
    { id: "spg-concept-supplier", projectId: "project-demo-main", schemaId: "spg-supply-chain", name: "供应商", code: "Supplier", description: "提供物料或服务的合作方。" },
  ],
  properties: [
    { id: "spg-property-equipment-code", projectId: "project-demo-main", namespaceId: "spg-industrial-data", schemaId: "spg-industrial-data", parentId: "spg-entity-equipment", parentKind: "entityTypes", name: "equipmentCode", code: "equipmentCode", dataType: "String", valueType: "String", cardinality: "1", required: true, description: "设备的唯一业务编码。" },
    { id: "spg-property-equipment-status", projectId: "project-demo-main", namespaceId: "spg-industrial-data", schemaId: "spg-industrial-data", parentId: "spg-entity-equipment", parentKind: "entityTypes", name: "runningStatus", code: "runningStatus", dataType: "EquipmentStatus", valueType: "String", cardinality: "1", required: true, description: "设备当前的运行状态。" },
    { id: "spg-property-work-order-time", projectId: "project-demo-main", namespaceId: "spg-industrial-data", schemaId: "spg-industrial-data", parentId: "spg-event-maintenance", parentKind: "eventTypes", name: "plannedCompletionAt", code: "plannedCompletionAt", dataType: "DateTime", valueType: "DateTime", cardinality: "0..1", required: false, description: "维护事件计划完成时间。" },
    { id: "spg-property-supplier-credit", projectId: "project-demo-main", namespaceId: "spg-supply-chain", schemaId: "spg-supply-chain", parentId: "spg-entity-supplier", parentKind: "entityTypes", name: "creditLevel", code: "creditLevel", dataType: "SupplierLevel", valueType: "String", cardinality: "0..1", required: false, description: "供应商信用评价等级。" },
    { id: "spg-v1-property-equipment-code", projectId: "project-demo-main", versionId: "spg-ontology-v1", namespaceId: "spg-v1-industrial-data", parentId: "spg-v1-entity-equipment", parentKind: "entityTypes", name: "equipmentCode", code: "equipmentCode", dataType: "String", description: "设备的基础业务编码。" },
  ],
  relations: [
    { id: "spg-relation-work-order-equipment", projectId: "project-demo-main", namespaceId: "spg-industrial-data", schemaId: "spg-industrial-data", parentId: "spg-event-maintenance", parentKind: "eventTypes", name: "维护对象", code: "maintenance_target", predicateCode: "targets", predicateSemantic: "USE", sourceCardinality: "1", targetCardinality: "0..N", featureGroup: "OBJECT", targetTypeId: "spg-entity-equipment", targetType: "Equipment", description: "MaintenanceEvent 指向需要维护的设备。" },
    { id: "spg-relation-inspection-equipment", projectId: "project-demo-main", namespaceId: "spg-industrial-data", schemaId: "spg-industrial-data", parentId: "spg-event-inspection", parentKind: "eventTypes", name: "质检对象", code: "inspection_target", predicateCode: "inspects", predicateSemantic: "USE", sourceCardinality: "1", targetCardinality: "0..N", featureGroup: "OBJECT", targetTypeId: "spg-entity-equipment", targetType: "Equipment", description: "InspectionEvent 指向被检测设备。" },
  ],
  namespaces: [
    { id: "spg-industrial-data", projectId: "project-demo-main", name: "IndustrialEquipment", code: "synx.industrial.equipment", uri: "https://data.example.com/spg/industrial-equipment#", scope: "PROJECT", status: "DRAFT", semanticVersion: "2.1.0", description: "工业装备、生产活动与质量数据领域。", updatedAt: "2026-09-03T09:20:00.000Z" },
    { id: "spg-supply-chain", projectId: "project-demo-main", name: "SupplyChain", code: "synx.supply_chain.master", uri: "https://data.example.com/spg/supply-chain#", scope: "PROJECT", status: "DRAFT", semanticVersion: "2.1.0", description: "供应商、物料与采购协同领域。", updatedAt: "2026-09-02T14:10:00.000Z" },
    { id: "spg-v1-industrial-data", projectId: "project-demo-main", versionId: "spg-ontology-v1", name: "IndustrialEquipment", code: "industrial-equipment", uri: "https://data.example.com/spg/v1/industrial-equipment#", description: "工业装备领域的第一版定义。", updatedAt: "2026-06-18T03:00:00.000Z" },
  ],
  entityTypes: [
    { id: "spg-entity-equipment", projectId: "project-demo-main", namespaceId: "spg-industrial-data", name: "Equipment", code: "Equipment", description: "可被维护、监测和追溯的生产设备。", hypernymPredicate: "isA" },
    { id: "spg-entity-work-order", projectId: "project-demo-main", namespaceId: "spg-industrial-data", name: "WorkOrder", code: "WorkOrder", description: "针对设备执行的运维工作单元。", hypernymPredicate: "isA" },
    { id: "spg-entity-supplier", projectId: "project-demo-main", namespaceId: "spg-supply-chain", name: "Supplier", code: "Supplier", description: "提供物料或服务的合作方。", hypernymPredicate: "isA" },
    { id: "spg-v1-entity-equipment", projectId: "project-demo-main", versionId: "spg-ontology-v1", namespaceId: "spg-v1-industrial-data", name: "Equipment", code: "Equipment", description: "第一版设备实体定义。", hypernymPredicate: "isA" },
  ],
  conceptTypes: [
    { id: "spg-concept-equipment-status", projectId: "project-demo-main", namespaceId: "spg-industrial-data", name: "EquipmentStatus", code: "EquipmentStatus", description: "设备运行状态概念分类。", hypernymPredicate: "isA" },
    { id: "spg-concept-supplier-level", projectId: "project-demo-main", namespaceId: "spg-supply-chain", name: "SupplierLevel", code: "SupplierLevel", description: "供应商等级概念分类。", hypernymPredicate: "isA" },
  ],
  eventTypes: [
    { id: "spg-event-maintenance", projectId: "project-demo-main", namespaceId: "spg-industrial-data", name: "MaintenanceEvent", code: "MaintenanceEvent", description: "设备维护活动。", hypernymPredicate: "isA" },
    { id: "spg-event-inspection", projectId: "project-demo-main", namespaceId: "spg-industrial-data", name: "InspectionEvent", code: "InspectionEvent", description: "设备质量检测活动。", hypernymPredicate: "isA" },
  ],
  standardValues: [],
  constraints: [
    { id: "spg-constraint-equipment-code", projectId: "project-demo-main", namespaceId: "spg-industrial-data", parentId: "spg-property-equipment-code", parentKind: "properties", name: "设备编码非空", code: "not_null_equipment_code", constraintType: "NOT_NULL", constraintGroup: "VALUE", value: "true", description: "设备编码不能为空。" },
    { id: "spg-constraint-status-enum", projectId: "project-demo-main", namespaceId: "spg-industrial-data", parentId: "spg-property-equipment-status", parentKind: "properties", name: "设备状态枚举", code: "enum_equipment_status", constraintType: "ENUM", constraintGroup: "VALUE", value: "RUNNING,STOPPED,MAINTENANCE", description: "限定设备状态取值。" },
    { id: "spg-v1-constraint-equipment-code", projectId: "project-demo-main", versionId: "spg-ontology-v1", namespaceId: "spg-v1-industrial-data", parentId: "spg-v1-property-equipment-code", parentKind: "properties", name: "EquipmentCodeNotNull", code: "equipmentCodeNotNull", constraintType: "NotNull", value: "true", description: "设备编码不能为空。" },
  ],
  rules: [
    { id: "spg-rule-equipment-code", projectId: "project-demo-main", namespaceId: "spg-industrial-data", parentId: "spg-property-equipment-code", parentKind: "properties", name: "设备编码归一化", code: "normalize_equipment_code", trigger: "equipment.created", condition: "value != null", action: "更新属性", expression: "upper(trim(value))", description: "统一设备编码格式。" },
    { id: "spg-rule-maintenance-target", projectId: "project-demo-main", namespaceId: "spg-industrial-data", parentId: "spg-relation-work-order-equipment", parentKind: "relations", name: "维护对象有效性", code: "validate_maintenance_target", trigger: "maintenance.created", condition: "target.status != 'RETIRED'", action: "拦截并生成问题", expression: "target.status != 'RETIRED'", description: "退役设备不能创建维护事件。" },
  ],
};

export function normalizeSpgModel(value = {}) {
  const schemas = Array.isArray(value.schemas) ? value.schemas : [];
  const namespaces = Array.isArray(value.namespaces)
    ? value.namespaces
    : schemas.map((item) => ({ ...item, uri: item.uri || item.namespace || "" }));
  const conceptTypes = Array.isArray(value.conceptTypes)
    ? value.conceptTypes
    : (value.concepts || []).map((item) => ({ ...item, namespaceId: item.namespaceId || item.schemaId }));
  const versions = Array.isArray(value.versions) ? value.versions : spgSchemaSeed.versions;
  const latestVersion = versions.find((item) => item.isLatest) || [...versions].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
  // concepts 是「业务中文名」词典（按 code 对应实体/概念/事件），
  // 早先的实现会在 conceptTypes 非空时把整个 concepts 丢掉，导致界面上只剩英文名、中文检索零命中。
  // 这里改为建立 code -> 中文名 的别名表，供图谱节点做双语展示。
  const conceptAliases = {};
  [...(spgSchemaSeed.concepts || []), ...(Array.isArray(value.concepts) ? value.concepts : [])].forEach((item) => {
    if (item?.code && item.name && !conceptAliases[item.code]) conceptAliases[item.code] = item.name;
  });
  const normalized = { ...spgSchemaSeed, ...value, versions, namespaces, conceptTypes, conceptAliases };
  CORE_KINDS.forEach((kind) => {
    const current = Array.isArray(normalized[kind]) ? normalized[kind] : [];
    const seeded = Array.isArray(spgSchemaSeed[kind]) ? spgSchemaSeed[kind] : [];
    normalized[kind] = [
      ...current.map((item) => ({ ...(seeded.find((seed) => seed.id === item.id) || {}), ...item })),
    ].map((item) => {
      const versionId = item.versionId || latestVersion?.id || "";
      const status = item.status || versions.find((version) => version.id === versionId)?.status || "DRAFT";
      return { ...item, versionId, scope: item.scope || (kind === "namespaces" ? "PROJECT" : "NAMESPACE"), isNative: Boolean(item.isNative), status, semanticVersion: item.semanticVersion || latestVersion?.name?.replace(/^v/, "") || "1.0.0", baseId: item.baseId || item.id, ...(["conceptTypes", "eventTypes", "standardValues"].includes(kind) ? { hypernymPredicate: "", parentId: item.parentKind === kind ? "" : item.parentId, parentKind: item.parentKind === kind ? "" : item.parentKind } : {}) };
    });
  });
  normalized.properties = normalized.properties.map((item) => ({
    ...item,
    namespaceId: item.namespaceId || item.schemaId,
    parentId: item.parentId || spgSchemaSeed.properties.find((seed) => seed.id === item.id)?.parentId || "",
    parentKind: item.parentKind || spgSchemaSeed.properties.find((seed) => seed.id === item.id)?.parentKind || "",
    dataType: item.dataType || item.valueType || "String",
    cardinality: item.cardinality || (item.required ? "1" : "0..1"),
    multiValue: item.multiValue ?? String(item.cardinality || "").includes("N"),
  }));
  normalized.relations = normalized.relations.map((item) => ({
    ...item,
    namespaceId: item.namespaceId || item.schemaId,
    parentId: spgSchemaSeed.relations.find((seed) => seed.id === item.id)?.parentId || item.parentId || "",
    parentKind: spgSchemaSeed.relations.find((seed) => seed.id === item.id)?.parentKind || item.parentKind || "",
    predicateCode: item.predicateCode || item.code || "",
    predicateSemantic: item.predicateSemantic || "USE",
    sourceCardinality: item.sourceCardinality || "0..N",
    targetCardinality: item.targetCardinality || "0..N",
  }));
  return normalized;
}

function read() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY));
    if (stored && typeof stored === "object") {
      // 迁移:为存量数据补 projectId
      const projectId = readCurrentProjectId();
      let migrated = false;
      ["versions", "schemas", ...CORE_KINDS].forEach((kind) => {
        if (!Array.isArray(stored[kind])) return;
        stored[kind] = stored[kind].map((row) => {
          if (!row.projectId) { migrated = true; return { ...row, projectId }; }
          return row;
        });
      });
      if (migrated) localStorage.setItem(KEY, JSON.stringify(stored));
      return normalizeSpgModel(stored);
    }
  } catch {}
  return normalizeSpgModel(spgSchemaSeed);
}
function write(value) { localStorage.setItem(KEY, JSON.stringify(value)); return value; }
function wait(value) { return new Promise((resolve) => setTimeout(() => resolve(value), 80)); }
async function request(path, options = {}) {
  const projectId = readCurrentProjectId();
  const separator = path.includes("?") ? "&" : "?";
  const url = `${API_BASE}${path}${separator}projectId=${encodeURIComponent(projectId)}`;
  const response = await fetch(url, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.message || `API ${response.status}`); }
  return response.status === 204 ? null : response.json();
}

function scopeByProject(model, projectId) {
  if (!projectId) return model;
  const scoped = { ...model };
  const listKinds = ["schemas", ...CORE_KINDS];
  listKinds.forEach((kind) => {
    scoped[kind] = (model[kind] || []).filter((row) => row.projectId === projectId);
  });
  scoped.versions = (model.versions || []).filter((row) => !row.projectId || row.projectId === projectId);
  return scoped;
}

export async function listSpgSchemas() {
  const projectId = readCurrentProjectId();
  if (USE_API) return request("/api/spg-schemas");
  return wait(scopeByProject(read(), projectId).schemas);
}
export async function saveSpgSchema(value) {
  const projectId = readCurrentProjectId();
  if (USE_API) return value.id ? request(`/api/spg-schemas/${value.id}`, { method: "PUT", body: JSON.stringify({ ...value, projectId }) }) : request("/api/spg-schemas", { method: "POST", body: JSON.stringify({ ...value, projectId }) });
  const model = read();
  const row = { ...value, projectId, id: value.id || `spg-schema-${Date.now()}`, updatedAt: new Date().toISOString() };
  write({ ...model, schemas: value.id ? model.schemas.map((item) => item.id === value.id ? row : item) : [row, ...model.schemas] });
  return wait(row);
}
export async function deleteSpgSchema(id) {
  if (USE_API) return request(`/api/spg-schemas/${id}`, { method: "DELETE" });
  const model = read();
  write({ ...model, schemas: model.schemas.filter((item) => item.id !== id), concepts: model.concepts.filter((item) => item.schemaId !== id), properties: model.properties.filter((item) => item.schemaId !== id), relations: model.relations.filter((item) => item.schemaId !== id) });
  return wait(true);
}
export async function listSpgElements(schemaId, kind) {
  const projectId = readCurrentProjectId();
  if (USE_API) return request(`/api/spg-schemas/${schemaId}/${kind}`);
  return wait(scopeByProject(read(), projectId)[kind].filter((item) => item.schemaId === schemaId));
}
export async function saveSpgElement(schemaId, kind, value) {
  const projectId = readCurrentProjectId();
  const path = `/api/spg-schemas/${schemaId}/${kind}`;
  if (USE_API) return value.id ? request(`${path}/${value.id}`, { method: "PUT", body: JSON.stringify({ ...value, projectId }) }) : request(path, { method: "POST", body: JSON.stringify({ ...value, projectId }) });
  const model = read();
  const row = { ...value, projectId, id: value.id || `spg-${kind.slice(0, -1)}-${Date.now()}`, schemaId, updatedAt: new Date().toISOString() };
  write({ ...model, [kind]: value.id ? model[kind].map((item) => item.id === value.id ? row : item) : [row, ...model[kind]] });
  return wait(row);
}
export async function deleteSpgElement(schemaId, kind, id) {
  if (USE_API) return request(`/api/spg-schemas/${schemaId}/${kind}/${id}`, { method: "DELETE" });
  const model = read();
  write({ ...model, [kind]: model[kind].filter((item) => item.id !== id) });
  return wait(true);
}

export async function listSpgCoreModel() {
  const projectId = readCurrentProjectId();
  if (USE_API) return request("/api/spg-core-model");
  const model = read();
  if (!model.versions.some((item) => item.projectId === projectId)) {
    model.versions = [...model.versions, { id: `spg-version-${projectId}`, projectId, name: "v1.0.0", status: "DRAFT", isLatest: true, createdAt: new Date().toISOString() }];
    write(model);
  }
  return wait(scopeByProject(model, projectId));
}
export async function saveSpgCoreElement(kind, value) {
  const projectId = readCurrentProjectId();
  if (USE_API) return value.id
    ? request(`/api/spg-core-model/${kind}/${value.id}`, { method: "PUT", body: JSON.stringify({ ...value, projectId }) })
    : request(`/api/spg-core-model/${kind}`, { method: "POST", body: JSON.stringify({ ...value, projectId }) });
  const model = read();
  const { model: next, row } = saveElement(model, kind, { ...value, projectId });
  write(next);
  return wait(row);
}
export async function deleteSpgCoreElement(kind, id) {
  if (USE_API) return request(`/api/spg-core-model/${kind}/${id}`, { method: "DELETE" });
  write(removeElement(read(), kind, id, readCurrentProjectId()));
  return wait(true);
}
export async function restoreSpgCoreElement(kind, snapshot) {
  const projectId = readCurrentProjectId();
  if (USE_API) return request(`/api/spg-core-model/${kind}/${snapshot.id}/restore`, { method: "PUT", body: JSON.stringify({ ...snapshot, projectId }) });
  write(restoreElementSnapshot(read(), kind, snapshot, projectId));
  return wait(snapshot);
}
export async function createNamespaceDraft(namespaceId) {
  if (USE_API) return request(`/api/spg-namespace-drafts/${namespaceId}`, { method: "POST" });
  const result = cloneNamespace(read(), namespaceId, readCurrentProjectId());
  write(result.model);
  return result;
}

import { normalizeSpgModel, spgSchemaSeed } from "../services/spgSchemaApi";

const KEYS = {
  directories: "datapilot.directories",
  sources: "datapilot.sources",
  tasks: "datapilot.jobs",
  records: "datapilot.records",
  assets: "datapilot.dataAssets",
  templates: "datapilot.templates",
  definitions: "datapilot.metadataDefinitions",
  thirdPartyApps: "datapilot.thirdPartyApps",
  thirdPartyCalls: "datapilot.thirdPartyCalls",
  spgSchema: "datapilot.spgSchemaModel",
  projects: "datapilot.projects",
  currentProject: "datapilot.currentProject",
};

const PROJECTS_SEED = [
  { id: "project-demo-main", name: "主数据治理", description: "面向客户、产品、组织等主数据治理的演示项目", createdAt: "2026-09-01T08:00:00.000Z" },
  { id: "project-demo-supply", name: "供应链本体", description: "面向供应商、采购、库存等供应链领域本体的演示项目", createdAt: "2026-09-01T08:30:00.000Z" },
];
const DEFAULT_PROJECT_ID = PROJECTS_SEED[0].id;

// 资产、采集、元数据与第三方接入属于平台全局资源，不随项目删除。
const PROJECT_SCOPED_RESOURCE_KEYS = [];
const SPG_SCHEMA_KEY = KEYS.spgSchema;

const fallback = {
  directories: [
    { id: "dir-demo-master", name: "主数据", parentId: "" },
    { id: "dir-demo-customer", name: "客户主数据", parentId: "dir-demo-master" },
    { id: "dir-demo-customer-profile", name: "客户画像", parentId: "dir-demo-customer" },
    { id: "dir-demo-customer-archive", name: "历史归档", parentId: "dir-demo-customer-profile" },
    { id: "dir-demo-business", name: "业务数据", parentId: "" },
    { id: "dir-demo-sales", name: "销售域", parentId: "dir-demo-business" },
    { id: "dir-demo-orders", name: "订单数据", parentId: "dir-demo-sales" },
    { id: "dir-demo-reference", name: "参考数据", parentId: "" },
  ],
  sources: [
    {
      id: "connection-demo",
      name: "主数据 MySQL",
      type: "database_mysql",
      host: "127.0.0.1",
      port: "3306",
      username: "demo",
      secret: "",
      sslEnabled: false,
      status: "enabled",
      connectionStatus: "connected",
      createdAt: "2026-09-01T08:00:00.000Z",
      lastTestedAt: "2026-09-03T10:30:00.000Z",
    },
  ],
  tasks: [
    {
      id: "task-demo-customer",
      name: "客户主数据全量提取",
      type: "data_collection",
      status: "succeeded",
      priority: 5,
      connectionConfigId: "connection-demo",
      requestJson: { schemaName: "master_data", tableName: "customer_profile", extractionMode: "full" },
      createdAt: "2026-09-01T08:00:00.000Z",
      updatedAt: "2026-09-01T08:06:00.000Z",
    },
    {
      id: "task-demo-enrich-customer",
      name: "客户数据元数据富化",
      type: "metadata_enrichment",
      status: "succeeded",
      priority: 4,
      assetFileId: "file-demo-customer-03",
      templateDefinitionId: "template-demo-quality",
      requestJson: {
        enrichmentType: "file_content",
        assetDirectoryId: "dir-demo-master",
        assetFileIds: ["file-demo-customer-03"],
        fileParser: "auto",
        sampleSize: "100",
        inferSchema: true,
        extractBusinessTerms: true,
      },
      createdAt: "2026-09-01T09:05:00.000Z",
      updatedAt: "2026-09-01T09:07:00.000Z",
    },
  ],
  assets: [],
  records: [],
  templates: [
    {
      id: "template-demo-quality",
      name: "数据文件基础属性模板",
      description: "预置资产目录中文件的基础属性，可按需增删",
      status: "enabled",
      creatorId: "local-user",
      createdAt: "2026-09-01T08:00:00.000Z",
      updatedAt: "2026-09-01T08:00:00.000Z",
    },
  ],
  definitions: [
    {
      id: "metadata-demo-file-name",
      templateId: "template-demo-quality",
      name: "文件名称",
      fieldCode: "fileName",
      fieldType: "string",
      description: "资产目录中展示的文件名称",
      status: "enabled",
    },
    {
      id: "metadata-demo-file-type",
      templateId: "template-demo-quality",
      name: "文件类型",
      fieldCode: "fileType",
      fieldType: "string",
      description: "文件扩展名或 MIME 类型",
      status: "enabled",
    },
    { id: "metadata-demo-file-size", templateId: "template-demo-quality", name: "文件大小", fieldCode: "sizeBytes", fieldType: "integer", description: "文件大小，单位为字节", status: "enabled" },
    { id: "metadata-demo-object-url", templateId: "template-demo-quality", name: "对象存储 URL", fieldCode: "objectUrl", fieldType: "string", description: "文件的对象存储访问地址", status: "enabled" },
    { id: "metadata-demo-uploaded-at", templateId: "template-demo-quality", name: "上传时间", fieldCode: "uploadedAt", fieldType: "datetime", description: "文件上传至资产目录的时间", status: "enabled" },
  ],
  thirdPartyApps: [],
  thirdPartyCalls: [],
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function read(key, initial) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : clone(initial);
  } catch {
    return clone(initial);
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  return clone(value);
}

function id(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function timestamp() {
  return new Date().toISOString();
}

// ===== 项目(Project)存储 =====
function readProjects() {
  if (!localStorage.getItem(KEYS.projects)) write(KEYS.projects, PROJECTS_SEED);
  return read(KEYS.projects, PROJECTS_SEED);
}
export function getCurrentProjectId() {
  const projects = readProjects();
  const stored = localStorage.getItem(KEYS.currentProject);
  if (stored && projects.some((project) => project.id === stored)) return stored;
  const fallbackId = projects[0]?.id || DEFAULT_PROJECT_ID;
  localStorage.setItem(KEYS.currentProject, fallbackId);
  return fallbackId;
}
export function setCurrentProjectId(id) {
  localStorage.setItem(KEYS.currentProject, id);
  return id;
}
export function getProjects() {
  return readProjects().slice().sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
}
export function createProject({ name, description }) {
  const projects = readProjects();
  const project = {
    id: `project-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: String(name || "").trim(),
    description: String(description || "").trim(),
    createdAt: timestamp(),
  };
  write(KEYS.projects, [...projects, project]);
  setCurrentProjectId(project.id);
  return project;
}
export function updateProject(id, { name, description }) {
  const projects = readProjects();
  const next = projects.map((project) => project.id === id ? {
    ...project,
    name: String(name || "").trim() || project.name,
    description: String(description || "").trim(),
  } : project);
  write(KEYS.projects, next);
  return next.find((project) => project.id === id);
}
export function deleteProjectCascade(id) {
  const projects = readProjects();
  if (projects.length <= 1) throw new Error("请至少保留一个项目");
  const next = projects.filter((project) => project.id !== id);
  write(KEYS.projects, next);
  PROJECT_SCOPED_RESOURCE_KEYS.forEach((key) => {
    const rows = read(key, []);
    const remaining = rows.filter((row) => row.projectId !== id);
    if (remaining.length !== rows.length) write(key, remaining);
  });
  // SPG 模型也需要按项目清理
  [SPG_SCHEMA_KEY].forEach((key) => {
    const model = read(key, {});
    if (!model || typeof model !== "object") return;
    const scoped = Object.fromEntries(Object.entries(model).map(([kind, rows]) => {
      if (!Array.isArray(rows)) return [kind, rows];
      return [kind, rows.filter((row) => !row.projectId || row.projectId !== id)];
    }));
    write(key, scoped);
  });
  const workflowState = read("datapilot.spgWorkflow", {});
  delete workflowState[id];
  write("datapilot.spgWorkflow", workflowState);
  if (getCurrentProjectId() === id) setCurrentProjectId(next[0].id);
  return true;
}

// 把存量没有 projectId 的数据迁移到当前项目(默认项目)
function migrateProjectScope() {
  const projectId = getCurrentProjectId();
  PROJECT_SCOPED_RESOURCE_KEYS.forEach((key) => {
    const rows = read(key, []);
    if (!rows.length) return;
    let changed = false;
    const next = rows.map((row) => {
      if (!row.projectId) { changed = true; return { ...row, projectId }; }
      return row;
    });
    if (changed) write(key, next);
  });
  // SPG 模型
  [SPG_SCHEMA_KEY].forEach((key) => {
    const model = read(key, null);
    if (!model || typeof model !== "object") return;
    let changed = false;
    const next = Object.fromEntries(Object.entries(model).map(([kind, rows]) => {
      if (!Array.isArray(rows)) return [kind, rows];
      const mapped = rows.map((row) => {
        if (!row.projectId) { changed = true; return { ...row, projectId }; }
        return row;
      });
      return [kind, mapped];
    }));
    if (changed) write(key, next);
  });
}

const initialSpgSchemaModel = normalizeSpgModel(read(KEYS.spgSchema, spgSchemaSeed));
write(KEYS.spgSchema, initialSpgSchemaModel);
Object.entries(fallback).forEach(([name, value]) => {
  if (!localStorage.getItem(KEYS[name])) write(KEYS[name], value);
});
const storedDirectories = read(KEYS.directories, []);
const storedDirectoryIds = new Set(storedDirectories.map((item) => item.id));
const missingDirectories = fallback.directories.filter((item) => !storedDirectoryIds.has(item.id));
if (missingDirectories.length) write(KEYS.directories, [...storedDirectories, ...missingDirectories]);
const sources = read(KEYS.sources, fallback.sources);
const normalizedSources = sources.map((item) => {
  const { directoryId, directory, config, ...rest } = item;
  return {
    ...rest,
    host: rest.host || config?.host || "",
    port: rest.port || config?.port || "",
    username: rest.username || config?.username || "",
    secret: rest.secret || config?.secret || "",
    connectionStatus:
      rest.connectionStatus ||
      (rest.status === "enabled" ? "connected" : "untested"),
    createdAt: rest.createdAt || "2026-09-01T08:00:00.000Z",
    lastTestedAt:
      rest.lastTestedAt ||
      (rest.status === "enabled"
        ? rest.updatedAt || "2026-09-03T10:30:00.000Z"
        : ""),
  };
});
if (JSON.stringify(sources) !== JSON.stringify(normalizedSources)) write(KEYS.sources, normalizedSources);
const assets = read(KEYS.assets, []);
const normalizedAssets = assets.map((item) => ({
  ...item,
  directoryId: item.directoryId || (String(item.name || "").includes("订单") ? "dir-demo-business" : "dir-demo-master"),
  directory: item.directory || (String(item.name || "").includes("订单") ? "业务数据" : "主数据"),
  storageType: "object_storage",
  storageService: item.storageService || "MinIO（Mock）",
  objectKey: item.objectKey || item.filePath || `mock/${item.fileName || item.name}`,
}));
if (JSON.stringify(assets) !== JSON.stringify(normalizedAssets)) write(KEYS.assets, normalizedAssets);

// 在初始化末尾执行迁移
migrateProjectScope();


export const mockStore = {
  list(name, { projectId } = {}) {
    const rows = read(KEYS[name], fallback[name] || []);
    if (!projectId) return rows;
    return rows.filter((row) => row.projectId === projectId);
  },
  listAll(name) {
    return read(KEYS[name], fallback[name] || []);
  },
  find(name, itemId, { projectId } = {}) {
    return this.list(name, { projectId }).find((item) => item.id === itemId);
  },
  create(name, value, prefix = name) {
    const rows = this.listAll(name);
    const now = timestamp();
    const row = { ...value, id: value.id || id(prefix), createdAt: value.createdAt || now, updatedAt: now };
    write(KEYS[name], [row, ...rows]);
    return row;
  },
  update(name, itemId, value, { projectId } = {}) {
    const rows = this.listAll(name);
    const current = rows.find((item) => item.id === itemId && (!projectId || item.projectId === projectId));
    if (!current) return null;
    const row = { ...current, ...value, id: itemId, updatedAt: timestamp() };
    write(KEYS[name], rows.map((item) => (item.id === itemId ? row : item)));
    return row;
  },
  remove(name, itemId, { projectId } = {}) {
    const rows = this.listAll(name);
    const filtered = rows.filter((item) => item.id !== itemId && (!projectId || item.projectId === projectId));
    write(KEYS[name], filtered);
  },
  spgSchema({ projectId } = {}) {
    const model = normalizeSpgModel(read(KEYS.spgSchema, spgSchemaSeed));
    if (!projectId) return model;
    if (!model.versions.some((item) => item.projectId === projectId)) {
      model.versions = [...model.versions, { id: `spg-version-${projectId}`, projectId, name: "v1.0.0", status: "DRAFT", isLatest: true, createdAt: timestamp() }];
      write(KEYS.spgSchema, model);
    }
    const scoped = { ...model };
    const listKinds = ["schemas", "namespaces", "entityTypes", "conceptTypes", "eventTypes", "standardValues", "properties", "constraints", "rules", "relations"];
    listKinds.forEach((kind) => {
      scoped[kind] = (model[kind] || []).filter((row) => row.projectId === projectId);
    });
    // versions 是项目内的版本概念,按当前项目过滤
    scoped.versions = (model.versions || []).filter((row) => !row.projectId || row.projectId === projectId);
    const normalized = normalizeSpgModel(scoped);
    Object.keys(normalized).forEach((key) => { if (Array.isArray(normalized[key])) normalized[key] = normalized[key].filter((item) => item.projectId === projectId); });
    return normalized;
  },
  saveSpgSchemaEntity(kind, row) {
    const model = read(KEYS.spgSchema, spgSchemaSeed);
    const next = { ...model, [kind]: [row, ...(model[kind] || [])] };
    write(KEYS.spgSchema, next);
    return row;
  },
  updateSpgSchemaEntity(kind, id, value) {
    const model = read(KEYS.spgSchema, spgSchemaSeed);
    const list = model[kind] || [];
    const current = list.find((item) => item.id === id);
    if (!current) return null;
    const row = { ...current, ...value, id, updatedAt: timestamp() };
    write(KEYS.spgSchema, { ...model, [kind]: list.map((item) => (item.id === id ? row : item)) });
    return row;
  },
  deleteSpgSchemaEntity(kind, id) {
    const model = read(KEYS.spgSchema, spgSchemaSeed);
    const list = model[kind] || [];
    write(KEYS.spgSchema, { ...model, [kind]: list.filter((item) => item.id !== id) });
    return true;
  },
  saveSpgSchemaModel(model) {
    write(KEYS.spgSchema, model);
    return model;
  },
};

export const ROOT_DIRECTORY = { id: "all", name: "全部资产", parentId: "", system: true };

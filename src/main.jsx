import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import JSZip from "jszip";
import {
  Box,
  Database,
  FileJson,
  FolderOpen,
  ListTree,
  Workflow,
  History,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  CheckCircle2,
  HardDrive,
  Globe2,
  Server,
  Play,
  Eye,
  FileText,
  FileDown,
  Network,
  Boxes,
  SlidersHorizontal,
  Link2,
  Search,
  Pencil,
  Trash2,
  Upload,
  KeyRound,
  Copy,
  ShieldCheck,
  Activity,
  Layers,
  Check,
  Sparkles,
  Braces,
  Table2,
  ShieldAlert,
  ClipboardCheck,
  Share2,
  Wand2,
  Download,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  AlertTriangle,
  Focus,
  ChevronsDownUp,
  Building2,
} from "lucide-react";
import "./styles.css";
import * as api from "./services/localApi";
import * as spgSchemaApi from "./services/spgSchemaApi";
import * as modelingApi from "./services/modelingApi";
import SpgNamespaceWorkspace from "./SpgNamespaceWorkspace";
import OntologyModelHub from "./OntologyModelHub";
import { installOntologyDemo } from "./services/ontologyDemo";
import { OntologyOverview, OntologyArchivePage } from "./OntologyDemoPages";
import LlmConnectionPage from "./LlmConnectionPage";
import { bindOntologyModels, scopeOntology } from "./services/ontologyWorkspace";
import { CHILD_KINDS, statusOf } from "./services/spgModel";
import { ancestorPath, TreeBreadcrumb } from "./TreeNavigation";
import DirectoryTreeSelect from "./DirectoryTreeSelect";
import "./enrichment-directory-tree.css";
import ConnectionSearchSelect from "./ConnectionSearchSelect";
import MetadataGraphModal from "./MetadataGraphModal";
import NativeFieldPolicyEditor from "./NativeFieldPolicyEditor";
import { nativeFieldPolicyLabel, normalizeNativeFieldPolicy } from "./services/templateFields.js";
import EnrichmentJobModal from "./EnrichmentJobModal";
import { createDemoJobExecution, executionTasks, jobStatistics, nativeFields, resolveJobFiles } from "./services/enrichmentJobs";
import { parseUploadedMetadata } from "./services/structuredUpload";
import { collectionFiles } from "./services/collectionFiles";
import { assetMetadataType, METADATA_TYPES } from "./services/assetMetadata";
import { ASSET_LEVELS, assetLevelOf } from "./services/assetScope";
import { readAccountContext, readWorkspace, saveWorkspace, projectOrganizationId } from "./services/workspaceContext";
import "./asset-scope.css";
import "./collection-files.css";
import "./management-pages.css";
const TYPE = {
  database_mysql: {
    label: "MySQL",
    group: "数据库",
    tone: "blue",
    icon: Database,
  },
  database_postgresql: {
    label: "PostgreSQL",
    group: "数据库",
    tone: "blue",
    icon: Database,
  },
  database_dm8: { label: "DM8", group: "数据库", tone: "blue", icon: Database },
  database_greenplum: {
    label: "Greenplum",
    group: "数据库",
    tone: "blue",
    icon: Database,
  },
  object_storage_minio: {
    label: "MinIO",
    group: "对象存储",
    tone: "purple",
    icon: HardDrive,
  },
  object_storage_s3: {
    label: "S3",
    group: "对象存储",
    tone: "purple",
    icon: HardDrive,
  },
  api: {
    label: "第三方 API",
    group: "第三方 API",
    tone: "orange",
    icon: Globe2,
  },
  docs: {
    label: "在线文档",
    group: "在线文档",
    tone: "orange",
    icon: FileText,
  },
};
const flat = (nodes) => nodes.flatMap((n) => [n, ...flat(n.children || [])]);
const isDatabaseType = (value) => {
  const type = String(value || "");
  return type === "database" || type.startsWith("database_");
};
const isObjectStorageType = (value) => {
  const type = String(value || "");
  return type === "object_storage" || type.startsWith("object_storage_");
};
const pairsFromObject = (value) =>
  Object.entries(value && typeof value === "object" ? value : {}).map(([key, item]) => ({ key, value: String(item ?? "") }));
const objectFromPairs = (pairs) =>
  pairs.reduce((result, item) => {
    if (item.key.trim()) result[item.key.trim()] = item.value;
    return result;
  }, {});
const DEFAULT_FILE_METADATA_FIELDS = [
  { name: "文件名称", fieldCode: "fileName", fieldType: "string", description: "资产目录中展示的文件名称", validationJson: "" },
  { name: "文件类型", fieldCode: "fileType", fieldType: "string", description: "文件扩展名或 MIME 类型", validationJson: "" },
  { name: "文件大小", fieldCode: "sizeBytes", fieldType: "integer", description: "文件大小，单位为字节", validationJson: "" },
  { name: "对象存储 URL", fieldCode: "objectUrl", fieldType: "string", description: "文件的对象存储访问地址", validationJson: "" },
  { name: "上传时间", fieldCode: "uploadedAt", fieldType: "datetime", description: "文件上传至资产目录的时间", validationJson: "" },
];
const typeOf = (x) => {
  const value = String(x?.type || "").toLowerCase();
  if (TYPE[x?.type]) return TYPE[x.type];
  if (value.startsWith("docs") || value.startsWith("document")) return TYPE.docs;
  if (value.includes("api")) return TYPE.api;
  return isObjectStorageType(x?.type) ? TYPE.object_storage_s3 : TYPE.database_mysql;
};
const connectionMainType = (connection = {}) => {
  const type = String(connection.type || connection.category || "").toLowerCase();
  if (type.startsWith("database") || type === "db") return "DB";
  if (type.startsWith("object_storage") || type === "oss" || type === "storage") return "OSS";
  if (type.startsWith("docs") || type.startsWith("document")) return "DOCS";
  if (type.startsWith("llm") || type.includes("model")) return "LLM";
  if (type === "api" || type.includes("api")) return "API";
  return type ? type.toUpperCase() : "—";
};
const connectionSubclass = (connection = {}) => {
  const subclassLabel = (value) => ({
    mysql: "MySQL",
    postgresql: "PostgreSQL",
    minio: "MinIO",
    rustfs: "RustFS",
    s3: "S3",
    dm8: "DM8",
    greenplum: "Greenplum",
  }[String(value || "").toLowerCase()] || String(value || "").toUpperCase());
  if (connection.subType || connection.subtype) return subclassLabel(connection.subType || connection.subtype);
  const type = String(connection.type || "").toLowerCase();
  const suffix = type
    .replace(/^object_storage_/, "")
    .replace(/^database_/, "")
    .replace(/^docs?_/, "")
    .replace(/^api_/, "")
    .replace(/^llm_/, "");
  if (suffix) return subclassLabel(suffix);
  if (connectionMainType(connection) === "API") return String(connection.method || "HTTP").toUpperCase();
  return "—";
};
const connectionTypeLabel = (connection = {}) =>
  ({
    DB: "数据库",
    OSS: "对象存储",
    DOCS: "在线文档",
    API: "三方API",
    LLM: "三方API",
  }[connectionMainType(connection)] || "—");
const assetMimeType = (file = {}) => {
  if (file.mimeType) return file.mimeType;
  const extension = String(file.fileName || file.name || "").split(".").pop()?.toLowerCase();
  return ({
    json: "application/json",
    xml: "application/xml",
    csv: "text/csv",
    txt: "text/plain",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    pdf: "application/pdf",
  })[extension] || "application/octet-stream";
};
const assetCollectionType = (file = {}) => {
  if (file.collectionType) return file.collectionType;
  const objectType = file.content?.objectType || file.content?.collectionType;
  if (objectType) return objectType;
  if (file.content?.isView || file.isView) return "视图";
  if (file.connectionConfigId && (file.dataShape === "structured" || file.content?.dataset)) return "数据表";
  return "文件";
};
const assetCollectionMethod = (file = {}) => file.collectionMethod || file.ingestionMethod || (file.connectionConfigId ? "智能提取" : "手动上传");
const assetVersion = (file = {}) => file.version || file.assetVersion || file.metadataVersion || "v1.0";
const assetStatusLabel = (status) => ({ draft: "草稿", ready: "发布", published: "发布", released: "发布", succeeded: "发布", failed: "失败", running: "执行中", pending: "草稿", archived: "归档" }[status] || status || "发布");
const connectionStatusMeta = (value) =>
  ({
    connected: { label: "连接正常", tone: "connected" },
    success: { label: "成功", tone: "connected" },
    succeeded: { label: "成功", tone: "connected" },
    failed: { label: "连接失败", tone: "failed" },
    failure: { label: "失败", tone: "failed" },
    error: { label: "失败", tone: "failed" },
    testing: { label: "测试中", tone: "testing" },
    untested: { label: "待测试", tone: "untested" },
  }[value] || { label: "待测试", tone: "untested" });
const formatTime = (t) =>
  t
    ? new Date(t).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const formatExecutionTime = (t) =>
  t
    ? new Date(t).toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";
const timestampValue = (value) => typeof value === "number" ? value : Date.parse(value || "");
const formatDuration = (startedTime, finishedTime) => {
  const elapsed = timestampValue(finishedTime) - timestampValue(startedTime);
  if (!Number.isFinite(elapsed) || elapsed < 0) return "—";
  const totalSeconds = Math.floor(elapsed / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};
const formatDurationMillis = (startedTime, finishedTime) => {
  const elapsed = timestampValue(finishedTime) - timestampValue(startedTime);
  return Number.isFinite(elapsed) && elapsed >= 0 ? `${elapsed} ms` : "—";
};
const executionStatusLabel = (status) => ({
  running: "执行中",
  succeeded: "成功",
  success: "成功",
  failed: "失败",
  partial: "部分成功",
  partial_success: "部分成功",
  cancelled: "取消",
  canceled: "取消",
}[status] || status || "—");
const executionRecordName = (record = {}, task) => {
  const base = task?.name || record.name || "采集任务";
  return record.executionNo ? `${base} #${record.executionNo}` : record.name || `${base} #1`;
};
const formatBytes = (value) => {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
const formatFileType = (file) => {
  const name = file?.fileName || file?.name || "";
  const extension = name.includes(".") ? name.split(".").pop() : "FILE";
  return extension.toUpperCase();
};
const assetOrigin = (file = {}) => {
  if (file.content?.dataset) return String(file.content.dataset);
  if (file.content?.tableName) {
    return `${file.content.databaseName ? `${file.content.databaseName}.` : ""}${file.content.schemaName ? `${file.content.schemaName}.` : ""}${file.content.tableName}`;
  }
  return file.fileName || file.name || "—";
};
const objectStorageUrl = (file) => {
  if (file?.objectUrl) return file.objectUrl;
  const key = String(file?.objectKey || file?.filePath || file?.fileName || file?.name || "unknown").replace(/^\/+/, "");
  return `https://minio.mock.local/ontology-assets/${key.split("/").map(encodeURIComponent).join("/")}`;
};
const assetDownloadName = (file) => {
  const name = file?.fileName || file?.name || "asset";
  return /\.json$/i.test(name) ? name : `${name}.mock.json`;
};
const assetDownloadPayload = (file) => file?.content || {
  message: "这是前端 Mock 对象存储中的文件描述。",
  metadata: {
    id: file?.id,
    fileName: file?.fileName || file?.name,
    objectUrl: objectStorageUrl(file),
    sizeBytes: file?.sizeBytes || 0,
    uploadedAt: file?.createdAt,
  },
};
const downloadBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
const downloadAsset = (file) => {
  const payload = assetDownloadPayload(file);
  const contents = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  downloadBlob(new Blob([contents], { type: "application/json;charset=utf-8" }), assetDownloadName(file));
};
const fingerprintFile = async (file) => {
  if (!globalThis.crypto?.subtle || !file?.arrayBuffer) return `${file?.name || "file"}-${file?.size || 0}-${file?.lastModified || 0}`;
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
};
function App() {
  const [accountContext] = useState(readAccountContext);
  const initialWorkspace = useRef(readWorkspace(accountContext));
  const [page, setPage] = useState("ontologyModels"),
    [tabs, setTabs] = useState(["ontologyModels"]),
    [dirs, setDirs] = useState(() => api.defaultDirectoryTree()),
    [connections, setConnections] = useState([]),
    [files, setFiles] = useState([]),
    [tasks, setTasks] = useState([]),
    [records, setRecords] = useState([]),
    [templates, setTemplates] = useState([]),
    [metadataDefinitions, setMetadataDefinitions] = useState([]),
    [thirdPartyApps, setThirdPartyApps] = useState([]),
    [thirdPartyCalls, setThirdPartyCalls] = useState([]),
    [projects, setProjects] = useState([]),
    [currentProjectId, setCurrentProjectIdState] = useState(() => api.getCurrentProjectId()),
    [currentOrganizationId, setCurrentOrganizationId] = useState(initialWorkspace.current.organizationId),
    [ontologyModels, setOntologyModels] = useState([]),
    [activeOntologyModelId, setActiveOntologyModelIdState] = useState(() => api.getActiveOntologyModelId(api.getCurrentProjectId())),
    [spgVersionId, setSpgVersionId] = useState(""),
    [query, setQuery] = useState(""),
    [connectionModal, setConnectionModal] = useState(null),
    [taskModal, setTaskModal] = useState(null),
    [executionTaskId, setExecutionTaskId] = useState(""),
    [enrichmentExecutionTaskId, setEnrichmentExecutionTaskId] = useState(""),
    [templateModal, setTemplateModal] = useState(null),
    [thirdPartyAppModal, setThirdPartyAppModal] = useState(null),
    [dirModal, setDirModal] = useState(null),
    [ontologyModelModal, setOntologyModelModal] = useState(null),
    [ontologyMergeModal, setOntologyMergeModal] = useState(false),
    [uploadConflictModal, setUploadConflictModal] = useState(null),
    [detail, setDetail] = useState(null),
    [graphAsset, setGraphAsset] = useState(null),
    [catalogueLocation, setCatalogueLocation] = useState(null),
    [toast, setToast] = useState("");
  const note = (t) => {
    setToast(t);
    setTimeout(() => setToast(""), 2200);
  };
  const refreshSequence = useRef(0);
  const refresh = async (projectId = currentProjectId) => {
    const sequence = ++refreshSequence.current;
    const [d, s, f, t, r, tm, md, apps, calls, projectRows, modelRows] = await Promise.all([
      api.listDirectories(),
      api.listSources(),
      api.listDataAssets(),
      api.listJobs(),
      api.listRecords(),
      api.listTemplates(),
      api.listMetadataDefinitions(),
      api.listThirdPartyApps(),
      api.listThirdPartyCalls(),
      api.listProjects(),
      projectId ? api.listOntologyModels(projectId) : Promise.resolve([]),
    ]);
    if (sequence !== refreshSequence.current) return;
    setDirs(d);
    setConnections(s);
    setFiles(f);
    setTasks(t);
    setRecords(r);
    setTemplates(tm);
    setMetadataDefinitions(md);
    setThirdPartyApps(apps);
    setThirdPartyCalls(calls);
    setProjects(projectRows);
    const boundModels = await bindOntologyModels(modelRows, () => sequence === refreshSequence.current);
    if (sequence === refreshSequence.current) setOntologyModels(boundModels);
  };
  useEffect(() => {
    api.listProjects().then((rows) => {
      const organizationId = initialWorkspace.current.organizationId;
      const candidates = rows.filter((project) => projectOrganizationId(project, accountContext) === organizationId);
      const remembered = initialWorkspace.current.projects[organizationId];
      const projectId = candidates.find((project) => project.id === remembered)?.id || candidates.find((project) => project.id === api.getCurrentProjectId())?.id || candidates[0]?.id || "";
      setCurrentProjectIdState(projectId);
      setActiveOntologyModelIdState(projectId ? api.getActiveOntologyModelId(projectId) : "");
      if (projectId) api.setCurrentProjectId(projectId);
      saveWorkspace(accountContext, organizationId, projectId);
      refresh(projectId);
    });
  }, []);
  // 切换项目后,刷新全部数据并清理与项目绑定的瞬态状态
  const switchProject = async (id, organizationId = currentOrganizationId) => {
    const project = projects.find((item) => item.id === id);
    if (id && (!project || projectOrganizationId(project, accountContext) !== organizationId)) return;
    if (id === currentProjectId && organizationId === currentOrganizationId) return;
    if (id) api.setCurrentProjectId(id);
    setCurrentOrganizationId(organizationId);
    saveWorkspace(accountContext, organizationId, id);
    setCurrentProjectIdState(id);
    setOntologyModels([]);
    const nextModelId = id ? api.getActiveOntologyModelId(id) : "";
    setActiveOntologyModelIdState(nextModelId);
    localStorage.removeItem("datapilot.activeSpgSchemaId");
    setSpgVersionId("");
    setExecutionTaskId("");
    setEnrichmentExecutionTaskId("");
    setDetail(null);
    setGraphAsset(null);
    setTaskModal(null);
    setDirModal(null);
    setUploadConflictModal(null);
    setOntologyModelModal(null);
    setOntologyMergeModal(false);
    setCatalogueLocation(null);
    if (page !== "catalogue") {
      setPage("ontologyModels");
      setTabs(["ontologyModels"]);
    }
    await refresh(id);
    const next = projects.find((p) => p.id === id);
    note(next ? `已切换到项目「${next.name}」` : "当前单位暂无项目");
  };
  const switchOrganization = (organizationId) => {
    if (!accountContext.organizations.some((item) => item.id === organizationId) || organizationId === currentOrganizationId) return;
    const candidates = projects.filter((project) => projectOrganizationId(project, accountContext) === organizationId);
    const remembered = readWorkspace(accountContext).projects[organizationId];
    return switchProject(candidates.find((project) => project.id === remembered)?.id || candidates[0]?.id || "", organizationId);
  };
  const createProjectHandler = async ({ name, description }) => {
    if (!currentOrganizationId) { note("当前账号未关联单位"); return null; }
    try {
      const project = await api.createProject({ name, description, organizationId: currentOrganizationId });
      saveWorkspace(accountContext, currentOrganizationId, project.id);
      setCurrentProjectIdState(project.id);
      setActiveOntologyModelIdState("");
      setSpgVersionId("");
      setPage("ontologyModels");
      setTabs(["ontologyModels"]);
      await refresh(project.id);
      note(`项目「${project.name}」已创建`);
      return project;
    } catch (error) {
      note(error.message || "创建失败");
      return null;
    }
  };
  const renameProjectHandler = async (id, payload) => {
    try {
      await api.renameProject(id, payload);
      await refresh();
      note("项目已重命名");
    } catch (error) {
      note(error.message || "重命名失败");
    }
  };
  const deleteProjectHandler = async (id) => {
    const project = projects.find((p) => p.id === id);
    if (!project) return;
    if (!confirm(`确定删除项目「${project.name}」吗？项目内本体模型会被清除，统一资产目录不会受影响。`)) return;
    try {
      await api.deleteProject(id);
      // 切换到删除后剩下的第一个项目
      const remaining = projects.filter((p) => p.id !== id);
      const nextCurrent = remaining.find((item) => item.id === currentProjectId)?.id || remaining.find((item) => projectOrganizationId(item, accountContext) === currentOrganizationId)?.id || "";
      if (nextCurrent) api.setCurrentProjectId(nextCurrent);
      saveWorkspace(accountContext, currentOrganizationId, nextCurrent);
      setCurrentProjectIdState(nextCurrent);
      setActiveOntologyModelIdState(nextCurrent ? api.getActiveOntologyModelId(nextCurrent) : "");
      setSpgVersionId("");
      setExecutionTaskId("");
      setEnrichmentExecutionTaskId("");
      setDetail(null);
      setGraphAsset(null);
      setPage("ontologyModels");
      setTabs(["ontologyModels"]);
      await refresh(nextCurrent);
      note(`项目「${project.name}」已删除`);
      void remaining;
    } catch (error) {
      note(error.message || "删除失败");
    }
  };
  const selectOntologyModel = (model) => {
    api.setActiveOntologyModelId(currentProjectId, model.id);
    setActiveOntologyModelIdState(model.id);
    setSpgVersionId(model.schemaVersionId || "");
    setTabs((previous) => (previous.includes("spgNamespaces") ? previous : [...previous, "spgNamespaces"]));
    setPage("spgNamespaces");
    note(`已进入「${model.name}」工作区`);
  };
  const saveOntologyModel = async (value) => {
    try {
      const model = await api.saveOntologyModel({ ...value, projectId: currentProjectId });
      setOntologyModelModal(null);
      await refresh();
      note(`本体模型「${model.name}」已创建`);
    } catch (error) {
      note(error.message || "本体模型创建失败");
    }
  };
  const mergeOntologyModels = async (value) => {
    try {
      const model = await api.mergeOntologyModels(value);
      setOntologyMergeModal(false);
      await refresh();
      note(`融合模型「${model.name}」已生成，请继续执行验证`);
    } catch (error) {
      note(error.message || "模型融合失败");
    }
  };
  const saveConnection = async (v) => {
    const { directoryId, directory, ...connection } = v;
    if (await api.hasDuplicateSource(connection, connection.id || "")) {
      note("已存在同名采集任务连接配置");
      return;
    }
    if (connection.id) await api.updateSource(connection.id, connection);
    else await api.createSource(connection);
    setConnectionModal(null);
    await refresh();
    note(connection.id ? "采集任务连接配置已更新" : "采集任务连接配置已创建");
  };
  const removeConnection = async (x) => {
    if (!confirm("确定删除该采集任务连接配置吗？")) return;
    await api.deleteSource(x.id);
    await refresh();
    note("采集任务连接配置已删除");
  };
  const saveDirectory = async (value) => {
    const name = value.name.trim();
    if (!name) return;
    if (value.mode === "edit") await api.updateDirectory(value.id, { name });
    else await api.createDirectory({ name, parentId: value.parentId || "" });
    setDirModal(null);
    await refresh();
    note(value.id ? "目录已更新" : "子目录已创建");
  };
  const removeDirectory = async (node) => {
    if (node.system) return;
    const current = flat(dirs).find((item) => item.id === node.id);
    const descendantIds = new Set(flat([current]).map((item) => item.id));
    if (files.some((item) => descendantIds.has(item.directoryId))) {
      note("目录或子目录中仍有文件，暂不能删除");
      return;
    }
    if (!confirm(`确定删除目录“${node.name}”吗？`)) return;
    await api.deleteDirectory(node.id);
    await refresh();
    note("目录已删除");
  };
  const moveDirectory = async (id, target) => {
    try {
      await api.moveDirectory(id, target.id);
      await refresh();
      note("目录已移动");
    } catch (error) { note(error.message || "目录移动失败"); }
  };
  const moveAssets = async (assetIds, target) => {
    const directoryId = target.system ? "all" : target.id;
    const directory = target.system ? "全部资产" : target.name;
    await Promise.all(assetIds.map((assetId) => api.updateAssetFile(assetId, { directoryId, directory })));
    await refresh();
    note(`${assetIds.length} 个文件已移动`);
  };
  const persistUploads = async (fileList, directory, conflictPolicy = "replace") => {
    const target = directory.system ? { id: "all", name: "全部资产" } : directory;
    let uploaded = 0;
    let skipped = 0;
    for (const file of Array.from(fileList)) {
      const fingerprint = await fingerprintFile(file);
      const existing = files.find((item) => item.directoryId === target.id && (item.fileName || item.name) === file.name);
      if (existing?.contentHash === fingerprint) { skipped += 1; continue; }
      const incomingIsNewer = Number(file.lastModified || Date.now()) >= new Date(existing?.updatedAt || existing?.createdAt || 0).getTime();
      const shouldReplace = existing && (conflictPolicy === "replace" || (conflictPolicy === "latest" && incomingIsNewer));
      if (existing && !shouldReplace) { skipped += 1; continue; }
      const value = {
        name: file.name.replace(/\.[^/.]+$/, "") || file.name,
        fileName: file.name,
        filePath: `/mock-object-storage/${target.id}/${file.name}`,
        objectKey: `${target.id}/${Date.now()}-${file.name}`,
        directoryId: target.id,
        directory: target.name,
        storageType: "object_storage",
        storageService: "本地 MinIO",
        mimeType: file.type || "application/octet-stream",
        dataShape: assetMetadataType({ fileName: file.name, mimeType: file.type }),
        sizeBytes: file.size,
        contentHash: fingerprint,
        checksumType: "SHA-256",
        sourceUpdatedAt: file.lastModified ? new Date(file.lastModified).toISOString() : new Date().toISOString(),
        status: "ready",
        content: await parseUploadedMetadata(file),
      };
      if (shouldReplace) await api.updateAssetFile(existing.id, value);
      else await api.createAssetFile(value);
      uploaded += 1;
    }
    await refresh();
    note(`${uploaded} 个文件已写入对象存储${skipped ? `，${skipped} 个已保留` : ""}`);
  };
  const uploadAssets = async (fileList, directory) => {
    const target = directory.system ? { id: "all", name: "全部资产" } : directory;
    const incoming = Array.from(fileList);
    const conflicts = incoming.filter((file) => files.some((item) => item.directoryId === target.id && (item.fileName || item.name) === file.name));
    if (conflicts.length) {
      setUploadConflictModal({ files: incoming, directory: target, conflicts });
      return;
    }
    await persistUploads(incoming, target, "replace");
  };
  const downloadAssets = async (assetIds) => {
    const assets = files.filter((file) => assetIds.includes(file.id));
    if (!assets.length) return;
    const zip = new JSZip();
    assets.forEach((file, index) => {
      const payload = assetDownloadPayload(file);
      zip.file(`files/${String(index + 1).padStart(2, "0")}-${assetDownloadName(file)}`, typeof payload === "string" ? payload : JSON.stringify(payload, null, 2));
    });
    zip.file("manifest.json", JSON.stringify(assets.map((file) => ({
      id: file.id,
      fileName: file.fileName || file.name,
      objectUrl: objectStorageUrl(file),
      sizeBytes: file.sizeBytes || 0,
      uploadedAt: file.createdAt,
    })), null, 2));
    const archive = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    downloadBlob(archive, `asset-files-${new Date().toISOString().slice(0, 10)}.zip`);
    note(`已下载 ${assets.length} 个文件`);
  };
  const saveTask = async (v, execute = false) => {
    const { executePreview: _executePreview, ...taskInput } = v;
    let value = { ...taskInput };
    if (value.type === "data_collection" && !value.assetDirectoryId) {
      const now = new Date();
      const stamp = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0"), String(now.getHours()).padStart(2, "0"), String(now.getMinutes()).padStart(2, "0"), String(now.getSeconds()).padStart(2, "0")].join("");
      const directory = await api.createDirectory({
        name: `${value.name.trim()}-${stamp}`,
        parentId: "",
      });
      value = {
        ...value,
        assetDirectoryId: directory.id,
        assetDirectoryName: directory.name,
        autoCreatedDirectory: true,
      };
    }
    const task = value.id
      ? await api.updateTask(value.id, value)
      : await api.createTask(value);
    setTaskModal(null);
    await refresh();
    if (execute) {
      await runTask(task);
      setExecutionTaskId(task.id);
      navigate("data");
      return task;
    }
    note(value.id ? "任务已更新" : "任务已创建");
    return task;
  };
  const removeTask = async (task) => {
    if (!confirm(`确定删除任务“${task.name}”吗？`)) return;
    await api.deleteTask(task.id, task.type);
    await refresh();
    note("任务已删除");
  };
  const requestCollectionExecution = (task) => setTaskModal({ ...task, executePreview: true });
  const saveTemplate = async (value) => {
    await api.saveTemplateWithDefinitions(value);
    await refresh();
    setTemplateModal(null);
    note(value.id ? "元数据模版定义已更新" : "元数据模版定义已创建");
  };
  const removeTemplate = async (template) => {
    if (!confirm(`确定删除元数据模版定义“${template.name}”及其元数据定义吗？`)) return;
    await api.deleteTemplate(template.id);
    await refresh();
    note("元数据模版定义已删除");
  };
  const saveThirdPartyApp = async (value) => {
    const app = await api.createThirdPartyApp(value);
    setThirdPartyAppModal(null);
    await refresh();
    setDetail({ kind: "thirdPartyApp", data: app });
    note("第三方应用已创建，凭证已生成");
  };
  const removeThirdPartyApp = async (app) => {
    if (!confirm(`确定删除第三方应用“${app.name}”吗？`)) return;
    await api.deleteThirdPartyApp(app.id);
    await refresh();
    note("第三方应用已删除");
  };
  const runTask = async (task) => {
    if (task.type === "metadata_enrichment") {
      if (!resolveJobFiles(task, files).length) { note("当前目录暂无文件，未创建作业"); return; }
      await api.createExecutionRecord(createDemoJobExecution(task, files, metadataDefinitions, connections, templates));
      await refresh();
      note("作业已执行，已生成逐文件子任务记录");
      return;
    }
    let fileId = task.assetFileId || "";
    let outputFile = null;
    let outputAction = "created";
    let collectionMessage = "数据采集完成";
    if (task.type === "data_collection") {
      const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
      const outputFileName = `${task.name}-${stamp}.json`;
      const outputDataShape = assetMetadataType({ fileName: outputFileName }, connections.find((item) => item.id === task.connectionConfigId)?.type);
      const outputDirectoryId = task.assetDirectoryId || "all";
      const outputDirectoryName = task.assetDirectoryName || "全部资产";
      const file = await api.createAssetFile({
        name: `${task.name}-输出文件`,
        fileName: outputFileName,
        dataShape: outputDataShape,
        connectionConfigId: task.connectionConfigId,
        directoryId: outputDirectoryId,
        directory: outputDirectoryName,
        filePath: `/extracted/${task.id}-${stamp}.json`,
        objectKey: `${outputDirectoryId}/${outputFileName}`,
        sizeBytes: 0,
        content: { message: "本地演示模式：数据对象采集记录已生成", taskId: task.id },
      });
      fileId = file[0]?.id || "";
      outputFile = file[0] || null;
    }
    await api.createExecutionRecord({
      taskId: task.id,
      name: `${task.name} #执行`,
      assetFileId: fileId,
      requestJson: task.requestJson || {},
      resultJson: { assetFileId: fileId, files: outputFile ? [{ assetFileId: outputFile.id, fileName: outputFile.fileName || outputFile.name, directoryId: outputFile.directoryId || "all", directory: outputFile.directory || "全部资产", sizeBytes: outputFile.sizeBytes || 0, objectUrl: objectStorageUrl(outputFile), action: outputAction }] : [], message: collectionMessage },
      fieldCount: 0,
      successCount: 1,
      errorCount: 0,
    });
    await refresh();
    note("任务已执行，已生成执行记录");
  };
  const labels = {
    ...modellingLabels("spg"),
    ...modellingLabels("owl"),
    catalogue: "数据对象存储目录",
    connections: "采集任务连接配置",
    collectionTasks: "数据对象采集任务",
    data: "数据对象采集记录",
    templates: "元数据模版定义",
    enrichmentTasks: "元数据富化任务",
    enrichmentRecords: "元数据富化记录",
    thirdPartyApps: "第三方应用",
    thirdPartyCalls: "第三方调用记录",
    ontologyModels: "SPGO（Namespace Model）",
    llmConnections: "大模型连接配置",
  };
  // 建模页面统一由清单驱动：OWL 与 SPG 两个分组渲染同样的组件、读写同一份数据
  const modelling = MODELLING_PAGE_INDEX[page] || null;
  const activeOntologyModel = ontologyModels.find((item) => item.id === activeOntologyModelId) || null;
  const modellingKey = `${currentProjectId}-${activeOntologyModelId}-${page}`;
  const navigate = (id) => {
    if (!currentProjectId && /^(spg|owl)/.test(id)) { note("请先选择或创建当前单位下的项目"); return; }
    if (MODELLING_PAGE_INDEX[id] && MODELLING_PAGE_INDEX[id].type !== "extraction" && !activeOntologyModelId) {
      setTabs((previous) => (previous.includes("ontologyModels") ? previous : [...previous, "ontologyModels"]));
      setPage("ontologyModels");
      note("请先选择一个本体模型进入工作区");
      return;
    }
    setTabs((previous) => (previous.includes(id) ? previous : [...previous, id]));
    setPage(id);
  };
  const showTaskRecords = (taskId) => {
    setExecutionTaskId(taskId);
    navigate("data");
  };
  const exportCollectionRecord = (record, task) => {
    const outputs = collectionFiles(record, files);
    const payload = {
      record,
      task: task || tasks.find((item) => item.id === record.taskId) || null,
      requestJson: { ...(task?.requestJson || {}), ...(record?.requestJson || {}) },
      resultJson: record?.resultJson || {},
      files: outputs.map((item) => ({
        id: item.id,
        fileName: item.fileName,
        directory: item.directory || item.asset?.directory || "全部资产",
        sizeBytes: item.sizeBytes,
        mimeType: assetMimeType(item.asset || item),
        objectUrl: objectStorageUrl(item.asset || item),
      })),
    };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" }), `${executionRecordName(record, task)}.json`);
    note("执行结果已导出");
  };
  const locateCollectedFile = (file) => {
    const current = files.find((item) => item.id === file.id);
    if (!current) { note("文件已删除或不可用"); return; }
    const directory = current.directoryId
      ? flat(dirs).find((item) => item.id === current.directoryId)
      : flat(dirs).find((item) => !item.system && item.name === current.directory);
    if (current.directoryId && current.directoryId !== "all" && !directory) { note("文件所在目录已不可用"); return; }
    setCatalogueLocation({ fileId: current.id, directoryId: directory?.id || "all" });
    setDetail(null);
    navigate("catalogue");
  };
  const showEnrichmentTaskRecords = (taskId) => {
    setEnrichmentExecutionTaskId(taskId);
    navigate("enrichmentRecords");
  };
  const closeTab = (id) => {
    if (id === "ontologyModels") return;
    setTabs((previous) => {
      const remaining = previous.filter((item) => item !== id);
      if (page === id) setPage(remaining[remaining.length - 1] || "ontologyModels");
      return remaining;
    });
  };
  const q = (val) =>
    String(val || "")
      .toLowerCase()
      .includes(query.toLowerCase());
  const workspaceProps = {
    accountContext,
    currentOrganizationId,
    onSwitchOrganization: switchOrganization,
    projects: projects.filter((project) => projectOrganizationId(project, accountContext) === currentOrganizationId),
    currentProjectId,
    onSwitchProject: switchProject,
    onCreateProject: createProjectHandler,
    onRenameProject: renameProjectHandler,
    onDeleteProject: deleteProjectHandler,
  };
  return (
    <div className="shell">
      <TopBanner {...workspaceProps} />
      <div className="shell-body">
        <Sidebar
          {...workspaceProps}
          page={page}
          setPage={navigate}
          activeOntologyModel={activeOntologyModel}
          ontologyModelCount={ontologyModels.length}
        />
        <main>
          <div className="mobile-workspace-context"><WorkspaceContext {...workspaceProps} /></div>
          <TabBar tabs={tabs} page={page} labels={labels} select={navigate} close={closeTab} />
          <div className={`content${page === "ontologyModels" || page === "llmConnections" || modelling ? " management-pages" : ""}`}>
          {page === "ontologyModels" && <OntologyModelHub models={ontologyModels} project={projects.find((item) => item.id === currentProjectId)} activeModelId={activeOntologyModelId} openModel={selectOntologyModel} navigate={navigate} createModel={() => { if (!currentProjectId) { note("请先选择或创建当前单位下的项目"); return; } setOntologyModelModal({}); }} refresh={refresh} note={note} />}
          {["namespace", "core"].includes(modelling?.type) && <OntologyWorkspace key={`${currentProjectId}-${activeOntologyModelId}`} ontology={activeOntologyModel} activeKind={modelling.activeKind} note={note} selectedVersionId={spgVersionId} onVersionChange={setSpgVersionId} back={() => navigate("ontologyModels")} />}
          {modelling?.type === "extraction" && <SpgNamespaceWorkspace key={modellingKey} ontology={activeOntologyModel} note={note} selectedVersionId={spgVersionId} onVersionChange={setSpgVersionId} ElementForm={SpgCoreElementForm} initialSection={modelling.section || "tasks"} />}
          {modelling?.type === "validation" && <SpgValidationPage key={modellingKey} mode={modelling.mode} note={note} selectedVersionId={spgVersionId} onVersionChange={setSpgVersionId} />}
          {modelling?.type === "model" && <SpgModelPage key={modellingKey} ontology={activeOntologyModel} mode={modelling.mode} note={note} selectedVersionId={spgVersionId} onVersionChange={setSpgVersionId} />}
          {page === "llmConnections" && <LlmConnectionPage note={note} />}
          {page === "catalogue" && (
            <Catalogue
              dirs={dirs}
              location={catalogueLocation}
              files={files}
              createDirectory={(parent) => setDirModal({ mode: "create", parentId: parent.system ? "" : parent.id, parentName: parent.name })}
              editDirectory={(node) => setDirModal({ ...node, mode: "edit" })}
              removeDirectory={removeDirectory}
              moveDirectory={moveDirectory}
              moveAssets={moveAssets}
              uploadAssets={uploadAssets}
              downloadAssets={downloadAssets}
              showFileDetail={(file) => setDetail({ kind: "asset", data: file, connection: connections.find((item) => item.id === file.connectionConfigId) })}
              showMetadataGraph={(file) => setGraphAsset(file)}
              connections={connections}
              tasks={tasks}
              records={records}
              metadataDefinitions={metadataDefinitions}
            />
          )}{" "}
          {page === "connections" && (
            <ConnectionList
              rows={connections.filter(
                (x) => q(x.name) || q(x.type) || q(x.host) || q(x.endpointUrl),
              )}
              open={() => setConnectionModal({})}
              view={(connection) => setDetail({ kind: "connection", data: connection })}
              edit={setConnectionModal}
              remove={removeConnection}
            />
          )}{" "}
          {page === "collectionTasks" && (
            <TaskList
              type="data_collection"
              title="数据对象采集任务"
              rows={tasks.filter(
                (x) =>
                  x.type === "data_collection" && (q(x.name) || q(x.status)),
              )}
              connections={connections}
              records={records}
              files={files}
              templates={templates}
              open={() => setTaskModal({ type: "data_collection" })}
              edit={setTaskModal}
              openConnection={(connection) => connection && setDetail({ kind: "connection", data: connection })}
              run={requestCollectionExecution}
              viewRecords={showTaskRecords}
              remove={removeTask}
            />
          )}{" "}
          {page === "data" && (
            <ExecutionList
              kind="data_collection"
              title="数据对象采集记录"
              locateFile={locateCollectedFile}
              rows={records}
              tasks={tasks}
              files={files}
              taskId={executionTaskId}
              clearTaskFilter={() => setExecutionTaskId("")}
              exportRecord={exportCollectionRecord}
              showDetail={(x) =>
                setDetail({
                  kind: "collectionExecution",
                  data: x,
                  task: tasks.find((task) => task.id === x.taskId),
                  connection: connections.find((item) => item.id === tasks.find((task) => task.id === x.taskId)?.connectionConfigId),
                  file: files.find((item) => item.id === x.assetFileId),
                  assetFiles: files,
                })
              }
            />
          )}{" "}
          {page === "templates" && (
            <TemplateDefinitionList
              rows={templates}
              definitions={metadataDefinitions}
              open={() => setTemplateModal({})}
              view={(template) => setDetail({ kind: "templateDefinition", data: template, definitions: metadataDefinitions.filter((item) => item.templateId === template.id) })}
              edit={(template) => setTemplateModal(template)}
              remove={removeTemplate}
            />
          )}{" "}
          {page === "enrichmentTasks" && (
            <TaskList
              type="metadata_enrichment"
              title="元数据富化任务"
              rows={tasks.filter(
                (x) =>
                  x.type === "metadata_enrichment" &&
                  (q(x.name) || q(x.status)),
              )}
              connections={connections}
              records={records}
              files={files}
              templates={templates}
              open={() => setTaskModal({ type: "metadata_enrichment" })}
              edit={setTaskModal}
              openConnection={(connection) => connection && setDetail({ kind: "connection", data: connection })}
              run={runTask}
              viewRecords={showEnrichmentTaskRecords}
              remove={removeTask}
            />
          )}{" "}
          {page === "enrichmentRecords" && (
            <ExecutionList
              kind="metadata_enrichment"
              title="元数据富化记录"
              rows={records}
              tasks={tasks}
              files={files}
              taskId={enrichmentExecutionTaskId}
              clearTaskFilter={() => setEnrichmentExecutionTaskId("")}
              showDetail={(x) => {
                const task = tasks.find((item) => item.id === x.taskId);
                setDetail({
                  kind: "enrichmentExecution",
                  data: x,
                  task,
                  template: templates.find((item) => item.id === task?.templateDefinitionId || item.id === x.resultJson?.templateId || item.id === x.requestJson?.templateId),
                  file: files.find((item) => item.id === x.assetFileId),
                  assetFiles: files,
                });
              }}
            />
          )}
          {page === "thirdPartyApps" && <ThirdPartyAppList rows={thirdPartyApps} open={() => setThirdPartyAppModal({})} view={(app) => setDetail({ kind: "thirdPartyApp", data: app })} remove={removeThirdPartyApp} />}
          {page === "thirdPartyCalls" && <ThirdPartyCallList rows={thirdPartyCalls} apps={thirdPartyApps} view={(call) => setDetail({ kind: "thirdPartyCall", data: call, app: thirdPartyApps.find((item) => item.id === call.appId), template: templates.find((item) => item.id === call.templateId) })} />}
          </div>
        </main>
      </div>
      {connectionModal && (
        <ConnectionModal
          initial={connectionModal}
          nested={connectionModal.fromCollectionTask}
          close={() => setConnectionModal(null)}
          save={saveConnection}
        />
      )}{" "}
      {dirModal && <DirectoryModal initial={dirModal} close={() => setDirModal(null)} save={saveDirectory} />}{" "}
      {ontologyModelModal && <OntologyModelForm files={files} close={() => setOntologyModelModal(null)} save={saveOntologyModel} />}
      {ontologyMergeModal && <OntologyMergeModal models={ontologyModels} close={() => setOntologyMergeModal(false)} merge={mergeOntologyModels} />}
      {uploadConflictModal && <UploadConflictModal value={uploadConflictModal} close={() => setUploadConflictModal(null)} submit={async (policy) => { const pending = uploadConflictModal; setUploadConflictModal(null); await persistUploads(pending.files, pending.directory, policy); }} />}
      {taskModal && (
        <TaskModal
          initial={taskModal}
          connections={connections}
          directories={dirs}
          files={files}
          templates={templates}
          close={() => setTaskModal(null)}
          save={saveTask}
          openConnection={() => setConnectionModal({ fromCollectionTask: true })}
        />
      )}{" "}
      {templateModal && <TemplateWizard initial={templateModal} definitions={metadataDefinitions} files={files} connections={connections} close={() => setTemplateModal(null)} save={saveTemplate} />}{" "}
      {detail && (detail.kind === "enrichmentExecution" ? <EnrichmentJobModal {...detail} close={() => setDetail(null)} showResult={(child) => setGraphAsset({ file: child.fileSnapshot || files.find((item) => item.id === child.assetFileId), taskResult: child })} /> : <DetailModal {...detail} locateFile={locateCollectedFile} close={() => setDetail(null)} />)}{" "}
      {thirdPartyAppModal && <ThirdPartyAppModal templates={templates} close={() => setThirdPartyAppModal(null)} save={saveThirdPartyApp} />}
      {graphAsset && <MetadataGraphModal file={graphAsset.file || graphAsset} taskResult={graphAsset.taskResult} connections={connections} tasks={tasks} records={records} templates={templates} close={() => setGraphAsset(null)} />}
      {toast && (
        <div className="toast">
          <CheckCircle2 size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
function TabBar({ tabs, page, labels, select, close }) {
  return (
    <div className="tabbar" aria-label="已打开页面">
      <div className="tabbar-scroll">
        {tabs.map((id) => (
          <button
            key={id}
            className={page === id ? "workspace-tab active" : "workspace-tab"}
            onClick={() => select(id)}
          >
            <span>{labels[id]}</span>
            {id !== "catalogue" && (
              <i
                role="button"
                tabIndex={0}
                aria-label={`关闭 ${labels[id]}`}
                onClick={(event) => {
                  event.stopPropagation();
                  close(id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.stopPropagation();
                    close(id);
                  }
                }}
              >
                ×
              </i>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 建模页面清单                                                        */
/*                                                                    */
/* 「OWL本体建模」与「SPG Schema建模」两个分组共用同一套页面（组件与数据完全相同）。 */
/* 页面在此集中登记一次，再由 modellingSections(prefix) 为两个分组生成各自的 page id。 */
/* 刻意使用独立 id 而非复用同一个 id：这样侧边栏不会同时高亮两个入口，          */
/* 标签页也能各开各的、互不顶替。                                              */
/* ------------------------------------------------------------------ */
const MODELLING_SECTIONS = [
  {
    id: "ontology",
    label: "Schema 核心定义",
    icon: Network,
    items: [
      ["Namespaces", "Namespace", Globe2],
      ["EntityTypes", "General Entity", Boxes],
      ["ConceptTypes", "Concept", Network],
      ["EventTypes", "Event", Activity],
      ["StandardValues", "Standard Value", ListTree],
      ["Properties", "Property Definition", SlidersHorizontal],
      ["Relations", "Relation Definition", Link2],
      ["Constraints", "Constraint", ShieldCheck],
      ["Rules", "Rule", Workflow],
    ],
  },
  {
    id: "extraction",
    label: "智能抽取",
    icon: Sparkles,
    items: [
      ["ExtractionStructured", "结构化抽取", Table2],
      ["ExtractionSemi", "半结构化抽取", Braces],
      ["ExtractionUnstructured", "非结构化抽取", FileText],
    ],
  },
  {
    id: "validation",
    label: "本体验证",
    icon: ShieldAlert,
    items: [
      ["ValidationAuto", "自动验证", ShieldAlert],
      ["ValidationIssues", "问题处置", ClipboardCheck],
    ],
  },
  {
    id: "model",
    label: "本体模型",
    icon: Share2,
    items: [
      ["ModelVisual", "模型可视化", Share2],
      ["ModelImportExport", "导入导出", FileDown],
    ],
  },
];

// 前缀 + 后缀 = page id：spg + Namespaces → spgNamespaces，owl + Namespaces → owlNamespaces
const modellingPageId = (prefix, suffix) => `${prefix}${suffix}`;
const modellingSections = (prefix) => MODELLING_SECTIONS.map((section) => ({
  id: `${prefix}-${section.id}`,
  label: section.label,
  icon: section.icon,
  items: section.items.map(([suffix, label, icon]) => [modellingPageId(prefix, suffix), label, icon]),
}));

// 标签页标题：侧边栏用元素英文名，标签页用中文名
const MODELLING_PAGE_LABELS = {
  Namespaces: "本体工作区",
  EntityTypes: "实体定义",
  ConceptTypes: "概念定义",
  EventTypes: "事件定义",
  StandardValues: "标准值",
  Properties: "属性定义",
  Constraints: "独立约束",
  Rules: "规则",
  Relations: "关系定义",
  ExtractionStructured: "结构化抽取",
  ExtractionSemi: "半结构化抽取",
  ExtractionUnstructured: "非结构化抽取",
  ExtractionTasks: "SPGO本体构建任务",
  ExtractionRecords: "SPGO本体构建记录",
  ValidationAuto: "自动验证",
  ValidationIssues: "问题处置",
  ModelVisual: "模型可视化",
  ModelImportExport: "导入导出",
};
const modellingLabels = (prefix) => Object.fromEntries(
  Object.entries(MODELLING_PAGE_LABELS).map(([suffix, label]) => [modellingPageId(prefix, suffix), label]),
);

// page id → 渲染参数；两个前缀各生成一份，组件与数据完全共享
const MODELLING_PAGE_RENDER = {
  Namespaces: { type: "namespace" },
  EntityTypes: { type: "core", activeKind: "entityTypes" },
  ConceptTypes: { type: "core", activeKind: "conceptTypes" },
  EventTypes: { type: "core", activeKind: "eventTypes" },
  StandardValues: { type: "core", activeKind: "standardValues" },
  Properties: { type: "core", activeKind: "properties" },
  Constraints: { type: "core", activeKind: "constraints" },
  Rules: { type: "core", activeKind: "rules" },
  Relations: { type: "core", activeKind: "relations" },
  ExtractionStructured: { type: "extraction", sourceType: "structured" },
  ExtractionSemi: { type: "extraction", sourceType: "semistructured" },
  ExtractionUnstructured: { type: "extraction", sourceType: "unstructured" },
  ExtractionTasks: { type: "extraction", section: "tasks" },
  ExtractionRecords: { type: "extraction", section: "records" },
  ValidationAuto: { type: "validation", mode: "auto" },
  ValidationIssues: { type: "validation", mode: "issues" },
  ModelVisual: { type: "model", mode: "visual" },
  ModelImportExport: { type: "model", mode: "importExport" },
};
const MODELLING_PAGE_INDEX = Object.fromEntries(
  ["spg", "owl"].flatMap((prefix) => Object.entries(MODELLING_PAGE_RENDER).map(([suffix, config]) => [modellingPageId(prefix, suffix), config])),
);

function TopBanner({ accountContext, currentOrganizationId, onSwitchOrganization, projects, currentProjectId, onSwitchProject, onCreateProject, onRenameProject, onDeleteProject }) {
  const currentProject = projects.find((project) => project.id === currentProjectId);
  const initials = String(accountContext?.name || "用户").trim().slice(0, 1) || "用";
  const organizations = accountContext?.organizations || [];
  const currentOrganization = organizations.find((organization) => organization.id === currentOrganizationId);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountMenuRef = useRef(null);
  useEffect(() => {
    if (!accountOpen) return undefined;
    const close = (event) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target)) setAccountOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [accountOpen]);
  return <header className="top-banner" aria-label="本体管理系统顶部导航">
    <div className="top-banner-left">
      <div className="top-brand">
        <span className="top-brand-mark"><Box size={19} /></span>
        <div><b>本体管理系统</b><small>{accountContext.platformName || "数据治理平台"}</small></div>
      </div>
      <div className="top-project-context">
        <span className="top-context-label"><Layers size={15} />当前项目</span>
        <ProjectSwitcher key={`${accountContext.id}-${currentOrganizationId}`} projects={projects} currentProject={currentProject} onSwitch={onSwitchProject} onCreate={onCreateProject} onRename={onRenameProject} onDelete={onDeleteProject} />
      </div>
    </div>
    <div className="top-banner-right">
      <div className="top-account" ref={accountMenuRef}>
        <button type="button" className={`top-user${accountOpen ? " open" : ""}`} title={`${accountContext.name || "用户"}，切换单位`} aria-haspopup="menu" aria-expanded={accountOpen} onClick={() => setAccountOpen((value) => !value)}>
          <span className="top-avatar">{initials}</span>
          <span className="top-user-copy"><b>{accountContext.name || "用户"}</b><small>{currentOrganization?.name || "未关联单位"}</small></span>
          <ChevronDown size={15} />
        </button>
        {accountOpen && <div className="account-popover" role="menu" aria-label="账号与单位切换">
          <div className="account-popover-head">
            <div><b>{accountContext.name || "用户"}</b><small>{accountContext.platformName || "数据治理平台"}</small></div>
            <span className="account-popover-avatar">{initials}</span>
          </div>
          <div className="account-popover-section">
            <div className="account-popover-label"><Building2 size={14} /><span>切换单位</span><small>{organizations.length ? `${organizations.length} 个可用单位` : "暂无关联单位"}</small></div>
            <div className="account-organization-list" role="group" aria-label="单位列表">
              {organizations.length ? organizations.map((organization) => <button type="button" role="menuitemradio" aria-checked={organization.id === currentOrganizationId} className={`account-organization-option${organization.id === currentOrganizationId ? " active" : ""}`} key={organization.id} onClick={() => { onSwitchOrganization(organization.id); setAccountOpen(false); }}><span>{organization.name}</span>{organization.id === currentOrganizationId && <Check size={14} />}</button>) : <div className="account-empty">当前账号未关联单位</div>}
            </div>
          </div>
        </div>}
      </div>
    </div>
  </header>;
}

function Sidebar({ page, setPage, activeOntologyModel, ontologyModelCount, ...workspaceProps }) {
  const [expanded, setExpanded] = useState(() => ({
    project: true,
    assets: true,
    metadata: false,
    owl: false,
    spg: true,
    thirdParty: false,
    ...Object.fromEntries([...modellingSections("owl"), ...modellingSections("spg")].map((section) => [section.id, false])),
  }));
  const groups = [
    {
      id: "assets",
      label: "数据对象管理",
      items: [
        ["catalogue", "数据对象存储目录", ListTree],
        ["collectionTasks", "数据对象采集任务", Workflow],
        ["data", "数据对象采集记录", FileText],
        ["connections", "采集任务连接配置", Server],
      ],
    },
    {
      id: "metadata",
      label: "元数据治理",
      items: [
        ["templates", "元数据模版定义", FileJson],
        ["enrichmentTasks", "元数据富化任务", Workflow],
        ["enrichmentRecords", "元数据富化记录", History],
      ],
    },
    // 两个分组内容完全相同，只是入口不同；页面组件与数据都来自同一套 SPG Schema
    // 暂时隐藏 OWL 本体建模入口，需要恢复时取消注释即可。
    // { id: "owl", label: "OWL本体建模", children: modellingSections("owl") },
    {
      id: "spg",
      label: "SPGO本体建模",
      items: [
        ["ontologyModels", "SPGO（Namespace Model）", Network],
        ["spgExtractionTasks", "SPGO本体构建任务", Workflow],
        ["spgExtractionRecords", "SPGO本体构建记录", History],
        ["spgModelVisual", "模型可视化", Share2],
      ],
    },
    {
      id: "thirdParty",
      label: "额外配置信息",
      items: [
        ["llmConnections", "大模型连接配置", Server],
        ["thirdPartyApps", "第三方应用", KeyRound],
        ["thirdPartyCalls", "调用记录", Activity],
      ],
    },
  ];
  return (
    <aside className="sidebar">
      <button type="button" className={`active-model-context${activeOntologyModel ? " selected" : ""}`} onClick={() => setPage("ontologyModels")}>
        <span><Network size={14} /></span>
        <span><small>当前本体模型</small><b>{activeOntologyModel?.name || "尚未选择"}</b></span>
        <ChevronRight size={14} />
      </button>
      <nav>
        {groups.map((group) => <div className="sidebar-group" key={group.id} data-navigation={group.id}>
          <button className="nav-group-toggle" onClick={() => setExpanded((current) => ({ ...current, [group.id]: !current[group.id] }))} aria-expanded={expanded[group.id]}>
            <span>{group.label}</span>{expanded[group.id] ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
          {expanded[group.id] && <>
            {group.items && <div className="sidebar-group-items">{group.items.map(([id, label, Icon]) => <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}><Icon size={17} /><span>{label}</span></button>)}</div>}
            {group.children && <div className="sidebar-subgroups">{group.children.map((subgroup) => {
              const SubgroupIcon = subgroup.icon;
              const hasActivePage = subgroup.pageId === page || subgroup.items.some(([id]) => id === page);
              return <div className={`sidebar-subgroup${hasActivePage ? " active" : ""}`} key={subgroup.id} data-subgroup={subgroup.id}>
                {subgroup.pageId ? <div className="nav-subgroup-parent">
                  <button className={`nav-subgroup-page${page === subgroup.pageId ? " active" : ""}`} aria-current={page === subgroup.pageId ? "page" : undefined} onClick={() => { setPage(subgroup.pageId); setExpanded((current) => ({ ...current, [subgroup.id]: true })); }}><SubgroupIcon size={16} /><span>{subgroup.label}</span></button>
                  <button className="nav-subgroup-chevron" aria-label={`${expanded[subgroup.id] ? "折叠" : "展开"}${subgroup.label}`} aria-expanded={expanded[subgroup.id]} onClick={() => setExpanded((current) => ({ ...current, [subgroup.id]: !current[subgroup.id] }))}>{expanded[subgroup.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                </div> : <button className="nav-subgroup-toggle" onClick={() => setExpanded((current) => ({ ...current, [subgroup.id]: !current[subgroup.id] }))} aria-expanded={expanded[subgroup.id]}><SubgroupIcon size={16} /><span>{subgroup.label}</span>{expanded[subgroup.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>}
                {expanded[subgroup.id] && <div className="sidebar-group-items nested">{subgroup.items.map(([id, label, Icon]) => <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}><Icon size={16} /><span>{label}</span></button>)}</div>}
              </div>;
            })}</div>}
          </>}
        </div>)}
      </nav>
    </aside>
  );
}

function WorkspaceContext({ accountContext, currentOrganizationId, onSwitchOrganization, projects, currentProjectId, onSwitchProject, onCreateProject, onRenameProject, onDeleteProject }) {
  const currentProject = projects.find((project) => project.id === currentProjectId);
  return <div className="workspace-context" aria-label="单位与项目">
    <label className="organization-switcher"><Building2 size={14} /><span>单位</span><select aria-label="切换单位" value={currentOrganizationId} disabled={!accountContext.organizations.length} onChange={(event) => onSwitchOrganization(event.target.value)}>{!accountContext.organizations.length && <option value="">未关联单位</option>}{accountContext.organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>
    <div className="workspace-project"><Layers size={14} /><span>项目</span><ProjectSwitcher key={`${accountContext.id}-${currentOrganizationId}`} projects={projects} currentProject={currentProject} onSwitch={onSwitchProject} onCreate={onCreateProject} onRename={onRenameProject} onDelete={onDeleteProject} /></div>
  </div>;
}

function ProjectSwitcher({ projects, currentProject, onSwitch, onCreate, onRename, onDelete }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("list"); // list | create | rename
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
        setMode("list");
        setName("");
        setDescription("");
        setEditingId("");
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const resetForm = () => {
    setName("");
    setDescription("");
    setEditingId("");
  };

  const submitCreate = async (event) => {
    event.preventDefault();
    const project = await onCreate?.({ name, description });
    if (project) {
      resetForm();
      setMode("list");
      setOpen(false);
    }
  };

  const submitRename = async (event) => {
    event.preventDefault();
    if (!editingId) return;
    await onRename?.(editingId, { name, description });
    resetForm();
    setMode("list");
  };

  const startRename = (project) => {
    setEditingId(project.id);
    setName(project.name);
    setDescription(project.description || "");
    setMode("rename");
  };

  return (
    <div className="project-switcher" ref={containerRef}>
      <button
        type="button"
        className={`project-switcher-trigger${open ? " open" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={currentProject?.name || "选择项目"}
      >
        <Layers size={12} />
        <span className="project-switcher-name">{currentProject?.name || "选择项目"}</span>
        <ChevronDown size={12} className={`project-switcher-chevron${open ? " flipped" : ""}`} />
      </button>
      {open && (
        <div className="project-popover" role="dialog" aria-label="项目切换">
          {mode === "list" && (
            <>
              <header className="project-popover-head">
                <b>切换项目</b>
                <small>共 {projects.length} 个项目</small>
              </header>
              <ul className="project-list" role="listbox">
                {!projects.length && <li className="project-list-empty">当前单位暂无项目</li>}
                {projects.map((project) => (
                  <li
                    key={project.id}
                    className={`project-item${project.id === currentProject?.id ? " active" : ""}`}
                    role="option"
                    aria-selected={project.id === currentProject?.id}
                  >
                    <button
                      type="button"
                      className="project-item-main"
                      onClick={() => {
                        onSwitch?.(project.id);
                        setOpen(false);
                      }}
                    >
                      <span className="project-item-name">{project.name}</span>
                      {project.description && <span className="project-item-desc">{project.description}</span>}
                    </button>
                    <span className="project-item-actions">
                      {project.id === currentProject?.id && <Check size={13} className="project-item-check" />}
                      <button
                        type="button"
                        className="project-item-icon"
                        title="重命名"
                        onClick={(event) => {
                          event.stopPropagation();
                          startRename(project);
                        }}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        className="project-item-icon danger"
                        title="删除项目"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete?.(project.id);
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              <footer className="project-popover-foot">
                <button
                  type="button"
                  className="project-add"
                  onClick={() => {
                    resetForm();
                    setMode("create");
                  }}
                >
                  <Plus size={13} /> 新建项目
                </button>
              </footer>
            </>
          )}
          {(mode === "create" || mode === "rename") && (
            <form className="project-form" onSubmit={mode === "create" ? submitCreate : submitRename}>
              <header className="project-popover-head">
                <b>{mode === "create" ? "新建项目" : "重命名项目"}</b>
                <button
                  type="button"
                  className="project-form-back"
                  onClick={() => {
                    resetForm();
                    setMode("list");
                  }}
                  aria-label="返回"
                >
                  <ChevronRight size={13} />
                </button>
              </header>
              <label>
                <span>项目名称</span>
                <input
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="例如：主数据治理"
                  maxLength={32}
                  required
                />
              </label>
              <label>
                <span>项目描述（可选）</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="一句话描述该项目的目标"
                  rows={3}
                  maxLength={120}
                />
              </label>
              <footer className="project-form-foot">
                <button
                  type="button"
                  className="project-form-cancel"
                  onClick={() => {
                    resetForm();
                    setMode("list");
                  }}
                >
                  取消
                </button>
                <button type="submit" className="project-form-submit" disabled={!name.trim()}>
                  {mode === "create" ? "创建并切换" : "保存"}
                </button>
              </footer>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
function OntologyModelList({ models, project, files, activeModelId, openModel, createModel, openMerge }) {
  const linkedAssetIds = new Set(models.flatMap((item) => item.linkedAssetIds || []));
  const namespaceCount = models.reduce((sum, item) => sum + Number(item.namespaceCount || 0), 0);
  const pendingCount = models.filter((item) => item.validationStatus !== "passed").length;
  return <div className="ontology-model-workspace">
    <header className="ontology-model-hero">
      <div><span className="eyebrow">PROJECT WORKSPACE</span><div className="ontology-model-title"><h1>本体模型</h1><span>{project?.name || "当前项目"}</span></div><p>每个项目可维护多个相互隔离的本体模型。选择模型后，Schema 定义、抽取、验证和导入导出均在该模型工作区内进行。</p></div>
      <div className="ontology-model-actions"><button type="button" onClick={openMerge} disabled={models.length < 2}><Workflow size={15} />融合模型<span>管理员</span></button><button type="button" className="primary" onClick={createModel}><Plus size={15} />新建本体模型</button></div>
    </header>
    <section className="ontology-model-metrics" aria-label="本体模型概览">
      <div><span>模型总数</span><strong>{models.length}</strong><small>当前项目内独立模型</small></div>
      <div><span>Namespace</span><strong>{namespaceCount}</strong><small>Namespace 之间不分层级</small></div>
      <div><span>关联数据对象</span><strong>{linkedAssetIds.size}</strong><small>来自统一资产目录</small></div>
      <div><span>待验证</span><strong>{pendingCount}</strong><small>融合或草稿模型</small></div>
    </section>
    <section className="ontology-model-panel">
      <div className="ontology-model-panel-head"><div><b>模型清单</b><span>共 {models.length} 个本体模型</span></div><small><ShieldCheck size={14} />权限体系将在功能定型后统一接入</small></div>
      {models.length ? <div className="ontology-model-list">{models.map((model) => {
        const linkedFiles = (model.linkedAssetIds || []).map((id) => files.find((file) => file.id === id)).filter(Boolean);
        const isActive = model.id === activeModelId;
        return <article className={`ontology-model-row${isActive ? " active" : ""}`} key={model.id}>
          <div className="ontology-model-symbol"><Network size={19} /></div>
          <div className="ontology-model-main"><div><h3>{model.name}</h3><span className={`model-state ${String(model.status || "DRAFT").toLowerCase()}`}>{model.status === "ACTIVE" ? "使用中" : model.status === "MERGED" ? "已融合" : "草稿"}</span>{model.validationStatus === "passed" ? <span className="model-validation passed"><CheckCircle2 size={12} />已验证</span> : <span className="model-validation pending"><AlertTriangle size={12} />待验证</span>}</div><code>{model.code}</code><p>{model.description || "暂无模型描述"}</p><div className="ontology-model-assets">{linkedFiles.length ? linkedFiles.slice(0, 3).map((file) => <span key={file.id}><HardDrive size={12} />{file.fileName || file.name}</span>) : <span className="empty"><HardDrive size={12} />尚未关联数据对象</span>}</div></div>
          <div className="ontology-model-stats"><span><b>{model.namespaceCount || 0}</b><small>Namespace</small></span><span><b>{model.elementCount || 0}</b><small>Schema 元素</small></span><span><b>{(model.linkedAssetIds || []).length}</b><small>数据对象</small></span></div>
          <div className="ontology-model-meta"><span>{model.domain || "通用领域"}</span><small>更新于 {formatTime(model.updatedAt)}</small>{model.sourceModelIds?.length ? <em>{model.sourceModelIds.length} 个模型融合</em> : null}</div>
          <button type="button" className={isActive ? "model-open active" : "model-open"} onClick={() => openModel(model)}>{isActive ? "继续建模" : "进入工作区"}<ChevronRight size={15} /></button>
        </article>;
      })}</div> : <div className="empty-state ontology-model-empty"><div><Network size={24} /></div><b>当前项目还没有本体模型</b><span>先创建一个模型，再进入 Schema 定义与数据抽取。</span><button type="button" className="primary" onClick={createModel}><Plus size={14} />新建本体模型</button></div>}
    </section>
  </div>;
}

function OntologyModelForm({ files, close, save }) {
  const [form, setForm] = useState({ name: "", code: "", domain: "", description: "", linkedAssetIds: [] });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const toggleAsset = (id) => set("linkedAssetIds", form.linkedAssetIds.includes(id) ? form.linkedAssetIds.filter((item) => item !== id) : [...form.linkedAssetIds, id]);
  return <div className="mask"><form className="modal ontology-model-modal workspace-form-modal" onSubmit={(event) => { event.preventDefault(); save(form); }}>
    <div className="modal-title"><div><small>ONTOLOGY MODEL</small><h2>新建本体模型</h2></div><button type="button" onClick={close} aria-label="关闭"><X size={18} /></button></div>
    <div className="workspace-modal-body"><div className="ontology-model-form-grid"><label><span>模型名称<b>*</b></span><input autoFocus required value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="例如：设备运维本体模型" /></label><label><span>模型编码</span><input value={form.code} onChange={(event) => set("code", event.target.value)} placeholder="equipment-maintenance" /></label><label><span>业务领域</span><input value={form.domain} onChange={(event) => set("domain", event.target.value)} placeholder="工业制造" /></label><label className="wide"><span>模型说明</span><textarea rows={3} value={form.description} onChange={(event) => set("description", event.target.value)} placeholder="描述模型覆盖的业务边界与目标" /></label></div>
    <section className="model-asset-picker"><div><b>关联数据对象</b><span>领域专家可使用选中的数据对象进行建模</span></div><div className="model-asset-list">{files.length ? files.map((file) => <label key={file.id}><input type="checkbox" checked={form.linkedAssetIds.includes(file.id)} onChange={() => toggleAsset(file.id)} /><span><b>{file.fileName || file.name}</b><small>{ASSET_LEVELS[assetLevelOf(file)]} · {file.directory || "全部资产"} · {formatBytes(file.sizeBytes)}</small></span></label>) : <p>统一资产目录暂无可用数据对象</p>}</div></section></div>
    <div className="modal-foot"><button type="button" onClick={close}>取消</button><button type="submit" className="primary" disabled={!form.name.trim()}><Plus size={14} />创建模型</button></div>
  </form></div>;
}

function OntologyMergeModal({ models, close, merge }) {
  const [selected, setSelected] = useState([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const toggle = (id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const selectedModels = models.filter((item) => selected.includes(item.id));
  return <div className="mask"><form className="modal ontology-merge-modal workspace-form-modal" onSubmit={(event) => { event.preventDefault(); merge({ sourceIds: selected, name, description }); }}>
    <div className="modal-title"><div><small>ADMIN · MODEL COMPOSITION</small><h2>融合本体模型</h2></div><button type="button" onClick={close} aria-label="关闭"><X size={18} /></button></div>
    <div className="workspace-modal-body">
    <div className="merge-warning"><ShieldAlert size={18} /><span><b>管理员操作</b>融合不会覆盖源模型，而是生成一个新的草稿模型；完成后必须执行本体验证。</span></div>
    <div className="merge-model-list">{models.map((model) => <label className={selected.includes(model.id) ? "selected" : ""} key={model.id}><input type="checkbox" checked={selected.includes(model.id)} onChange={() => toggle(model.id)} /><span><b>{model.name}</b><small>{model.namespaceCount || 0} Namespace · {model.elementCount || 0} 元素</small></span><em>{model.validationStatus === "passed" ? "已验证" : "待验证"}</em></label>)}</div>
    <div className="merge-target"><label><span>融合模型名称<b>*</b></span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：企业全域本体模型" /></label><label><span>融合说明</span><textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="说明本次融合范围和目标" /></label><div><span>融合结果预估</span><b>{selectedModels.reduce((sum, item) => sum + Number(item.namespaceCount || 0), 0)} Namespace</b><b>{selectedModels.reduce((sum, item) => sum + Number(item.elementCount || 0), 0)} Schema 元素</b></div></div>
    </div>
    <div className="modal-foot"><button type="button" onClick={close}>取消</button><button type="submit" className="primary" disabled={selected.length < 2 || !name.trim()}><Workflow size={14} />生成融合模型</button></div>
  </form></div>;
}

function UploadConflictModal({ value, close, submit }) {
  const [policy, setPolicy] = useState("latest");
  return <div className="mask"><div className="modal upload-conflict-modal">
    <div className="modal-title"><div><small>FILE CONFLICT</small><h2>发现同名文件</h2></div><button type="button" onClick={close} aria-label="关闭"><X size={18} /></button></div>
    <div className="conflict-summary"><AlertTriangle size={18} /><span>目标目录“{value.directory.name}”中有 {value.conflicts.length} 个同名文件。系统将计算 SHA-256 指纹，相同内容不会重复写入。</span></div>
    <div className="conflict-files">{value.conflicts.map((file) => <div key={`${file.name}-${file.lastModified}`}><FileText size={16} /><span><b>{file.name}</b><small>{formatBytes(file.size)} · 本地修改于 {file.lastModified ? formatTime(file.lastModified) : "未知"}</small></span></div>)}</div>
    <fieldset className="conflict-policies"><legend>处理方式</legend><label><input type="radio" name="uploadPolicy" checked={policy === "latest"} onChange={() => setPolicy("latest")} /><span><b>按时间保留最新版本</b><small>自动比较修改时间，以最新文件为准。</small></span></label><label><input type="radio" name="uploadPolicy" checked={policy === "replace"} onChange={() => setPolicy("replace")} /><span><b>使用新文件替换</b><small>保留对象标识，更新内容与文件指纹。</small></span></label><label><input type="radio" name="uploadPolicy" checked={policy === "keep"} onChange={() => setPolicy("keep")} /><span><b>保留已有文件</b><small>跳过本次冲突文件，不改变资产目录。</small></span></label></fieldset>
    <div className="modal-foot"><button type="button" onClick={close}>取消上传</button><button type="button" className="primary" onClick={() => submit(policy)}><Check size={14} />确认处理</button></div>
  </div></div>;
}

function Catalogue({
  dirs,
  location,
  files,
  connections,
  createDirectory,
  editDirectory,
  removeDirectory,
  moveDirectory,
  moveAssets,
  uploadAssets,
  downloadAssets,
  showFileDetail,
  showMetadataGraph,
}) {
  const rootId = dirs[0]?.id || "all";
  const rootName = dirs[0]?.name || "全部资产";
  const [selected, setSelected] = useState(rootId);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [context, setContext] = useState(null);
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [focusId, setFocusId] = useState("");
  const [expandedDirs, setExpandedDirs] = useState(() => new Set(dirs.flatMap((item) => [item, ...(item.children || [])]).filter((item) => item.open !== false).map((item) => item.id)));
  const initializedTree = useRef(false);
  useEffect(() => {
    if (initializedTree.current || !dirs[0]?.children?.length) return;
    initializedTree.current = true;
    setExpandedDirs((current) => new Set([...current, ...dirs.flatMap((item) => [item, ...(item.children || [])]).filter((item) => item.open !== false).map((item) => item.id)]));
  }, [dirs]);
  const [searchCollapsed, setSearchCollapsed] = useState(() => new Set());
  const located = useRef(null);
  const tree = useRef(null);
  const [locatedFileId, setLocatedFileId] = useState("");
  useEffect(() => setSearchCollapsed(new Set()), [directoryQuery]);
  const directoryIndex = useMemo(() => {
    const index = {};
    const visit = (nodes, parentId = "") => nodes.forEach((item) => { index[item.id] = { ...item, parentId }; visit(item.children || [], item.id); });
    visit(dirs);
    return index;
  }, [dirs]);
  useEffect(() => {
    if (!location || located.current === location || !directoryIndex[location.directoryId]) return;
    located.current = location;
    setSelected(location.directoryId);
    setFocusId("");
    setDirectoryQuery("");
    setLocatedFileId(location.fileId);
    setExpandedDirs((current) => new Set([...current, ...ancestorPath(directoryIndex[location.directoryId], directoryIndex).map((item) => item.id)]));
    const frame = requestAnimationFrame(() => tree.current?.querySelector('.directory-select[aria-current="location"]')?.scrollIntoView({ block: "nearest" }));
    return () => cancelAnimationFrame(frame);
  }, [location, directoryIndex]);
  const directoryPath = ancestorPath(directoryIndex[selected], directoryIndex);
  useEffect(() => { if (!directoryIndex[selected]) setSelected(rootId); }, [directoryIndex, selected, rootId]);
  const focusDirectory = directoryIndex[focusId];
  const searchQuery = directoryQuery.trim().toLowerCase();
  const matchingDirs = new Set();
  const searchExpanded = new Set();
  if (searchQuery) Object.values(directoryIndex).forEach((item) => {
    const path = ancestorPath(item, directoryIndex);
    if (path.map((node) => node.name).join(" / ").toLowerCase().includes(searchQuery)) path.forEach((node, index) => { matchingDirs.add(node.id); if (index < path.length - 1) searchExpanded.add(node.id); });
  });
  const navigateDirectory = (item) => {
    setSelected(item?.id || rootId);
    setFocusId(item?.system ? "" : item?.id || "");
    setDirectoryQuery("");
    setExpandedDirs((current) => new Set([...current, ...ancestorPath(item, directoryIndex).map((node) => node.id)]));
  };
  const toggleDirectory = (id) => {
    if (searchQuery) setSearchCollapsed((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
    else setExpandedDirs((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };
  useEffect(() => {
    const close = () => setContext(null);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);
  const root = flat(dirs).find((x) => x.id === selected);
  const rows = useMemo(() =>
      root?.system
        ? files
        : files.filter(
            (x) => x.directoryId === selected || (!x.directoryId && x.directory === root?.name),
          ), [files, selected, root?.name]);
  useEffect(() => {
    setSelectedFiles((current) => current.filter((id) => files.some((file) => file.id === id)));
  }, [files]);
  useEffect(() => setSelectedFiles([]), [selected]);
  const toggleFile = (id) => {
    setSelectedFiles((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  const selectAll = () => {
    const visibleIds = rows.map((file) => file.id);
    setSelectedFiles((current) => visibleIds.every((id) => current.includes(id)) ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])]);
  };
  const handleUpload = (event) => {
    if (event.target.files?.length) uploadAssets(event.target.files, root || dirs[0]);
    event.target.value = "";
  };
  return (
    <div className="catalogue">
      <section className="global-scope-strip"><div><ListTree size={18} /><span><b>统一数据对象存储目录</b></span></div><div><span>统一对象存储</span><b>本地 MinIO</b></div></section>
      <section className="card directory">
        <div className="card-head">
          <div>
            <h2>数据对象存储目录</h2>
            <small>{focusDirectory ? focusDirectory.name : "统一目录"}</small>
          </div>
          <div className="tree-tools"><button type="button" title="聚焦当前目录" aria-label="聚焦当前目录" disabled={selected === "all" || !directoryIndex[selected]} onClick={() => navigateDirectory(directoryIndex[selected])}><Focus size={16} /></button><button type="button" title="收起全部目录" aria-label="收起全部目录" onClick={() => { setDirectoryQuery(""); setExpandedDirs(new Set()); }}><ChevronsDownUp size={16} /></button></div>
        </div>
        <label className="directory-search"><Search size={14} /><input aria-label="搜索目录" placeholder="搜索目录名称或路径" value={directoryQuery} onChange={(event) => setDirectoryQuery(event.target.value)} />{directoryQuery && <button type="button" aria-label="清空目录搜索" title="清空目录搜索" onClick={() => setDirectoryQuery("")}><X size={14} /></button>}</label>
        {focusDirectory && <TreeBreadcrumb rootLabel="全部目录" path={ancestorPath(focusDirectory, directoryIndex).filter((item) => !item.system)} onNavigate={navigateDirectory} />}
        <div className="tree deep-directory-tree" ref={tree}>
          {(searchQuery ? dirs : focusDirectory ? [focusDirectory] : dirs).filter((item) => !searchQuery || matchingDirs.has(item.id)).map((n) => (
            <DirNode
              key={n.id}
              node={n}
              selected={selected}
              setSelected={setSelected}
              files={files}
              openContext={setContext}
              moveDirectory={moveDirectory}
              moveAssets={moveAssets}
              depth={0}
              directoryIndex={directoryIndex}
              expanded={searchQuery ? new Set([...searchExpanded].filter((id) => !searchCollapsed.has(id))) : expandedDirs}
              toggle={toggleDirectory}
              matching={searchQuery ? matchingDirs : null}
            />
          ))}
          {searchQuery && !matchingDirs.size && <div className="tree-no-results">未找到匹配目录</div>}
        </div>
      </section>
      <section className="card asset-directory-content">
        <div className="card-head asset-directory-head">
          <div>
            <TreeBreadcrumb rootLabel={rootName} path={directoryPath.filter((item) => !item.system)} onNavigate={navigateDirectory} />
            <h2>{root?.name || rootName}</h2>
            <small>{rows.length} 个文件 · 本地持久化对象存储</small>
          </div>
          <label className="primary mini asset-upload">
            <Upload size={14} />
            上传文件
            <input type="file" multiple onChange={handleUpload} />
          </label>
        </div>
        {selectedFiles.length > 0 && (
          <div className="asset-selection-bar">
            <b>已选择 {selectedFiles.length} 个文件</b>
            <span>拖动选中文件到左侧目标目录</span>
            <button className="asset-batch-download" onClick={() => downloadAssets(selectedFiles)}>
              <FileDown size={14} />
              批量下载
            </button>
            <button onClick={() => setSelectedFiles([])}>取消选择</button>
          </div>
        )}
        <AssetFileTable
          rows={rows}
          connections={connections}
          locatedFileId={locatedFileId}
          selected={selectedFiles}
          toggle={toggleFile}
          selectAll={selectAll}
          open={showFileDetail}
          showMetadataGraph={showMetadataGraph}
        />
      </section>
      {context && (
        <div
          className="context-menu"
          style={{ left: context.x, top: context.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {context.kind === "directory" ? (
            <>
              <button onClick={() => { navigateDirectory(directoryIndex[context.item.id] || context.item); setContext(null); }}><Focus size={14} />聚焦当前目录</button>
              <button onClick={() => { createDirectory(context.item); setContext(null); }}>新建子目录</button>
              <button onClick={() => { editDirectory(context.item); setContext(null); }} disabled={context.item.system}>修改目录</button>
              <button onClick={() => { removeDirectory(context.item); setContext(null); }} disabled={context.item.system}>删除目录</button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
function DirNode({ node, selected, setSelected, files, openContext, moveDirectory, moveAssets, depth, directoryIndex, expanded, toggle, matching }) {
  const open = expanded.has(node.id);
  const path = ancestorPath(directoryIndex[node.id], directoryIndex).filter((item) => !item.system);
  const children = (node.children || []).filter((item) => !matching || matching.has(item.id));
  const [dragOver, setDragOver] = useState(false);
  const entries = node.system
    ? files
    : files.filter((x) => x.directoryId === node.id || (!x.directoryId && x.directory === node.name));
  const context = (event, kind, item) => {
    event.preventDefault();
    openContext({ x: event.clientX, y: event.clientY, kind, item });
  };
  const drop = async (event) => {
    event.preventDefault();
    const payload = event.dataTransfer.getData("application/x-datapilot-tree");
    if (!payload) return;
    const moving = JSON.parse(payload);
    if (moving.kind === "directory") await moveDirectory(moving.id, node);
    if (moving.kind === "assets") await moveAssets(moving.ids, node);
  };
  return (
    <div className="dir-node">
      <div
        className={"folder " + (selected === node.id ? "active" : "") + (dragOver ? " drag-over" : "")}
        style={{ "--directory-indent": `${Math.min(depth, 4) * 14}px` }}
        data-depth={path.length}
        draggable={!node.system}
        onDragStart={(event) => event.dataTransfer.setData("application/x-datapilot-tree", JSON.stringify({ kind: "directory", id: node.id }))}
        onDragEnter={(event) => { event.preventDefault(); setDragOver(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragOver(false)}
        onDrop={async (event) => { setDragOver(false); await drop(event); }}
        onContextMenu={(event) => context(event, "directory", node)}
      >
        <button type="button" className="directory-toggle" disabled={!children.length} aria-label={`${open ? "折叠" : "展开"}${node.name}`} aria-expanded={children.length ? open : undefined} onClick={() => toggle(node.id)}>{children.length ? open ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : <span />}</button>
        <button type="button" className="directory-select" title={path.map((item) => item.name).join(" / ")} aria-current={selected === node.id ? "location" : undefined} onClick={() => setSelected(node.id)}><FolderOpen size={16} /><b>{node.name}</b></button>
        {path.length > 4 && <small className="tree-depth-badge" title={`第 ${path.length} 层`}>L{path.length}</small>}
        <em>{entries.length}</em>
      </div>
      {open && (
        <div className="tree-children">
           {children.map((n) => (
             <DirNode
               key={n.id}
               node={n}
               selected={selected}
               setSelected={setSelected}
               files={files}
               openContext={openContext}
               moveDirectory={moveDirectory}
               moveAssets={moveAssets}
               depth={depth + 1}
               directoryIndex={directoryIndex}
               expanded={expanded}
               toggle={toggle}
               matching={matching}
             />
           ))}
         </div>
       )}
     </div>
   );
}
function AssetFileTable({ rows, selected, toggle, selectAll, open, showMetadataGraph, locatedFileId, connections }) {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, totalPages);
  const visible = rows.slice((current - 1) * pageSize, current * pageSize);
  useEffect(() => {
    const index = rows.findIndex((file) => file.id === locatedFileId);
    setPage(index < 0 ? 1 : Math.floor(index / pageSize) + 1);
  }, [rows, locatedFileId]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => document.querySelector('.asset-file-row.located')?.scrollIntoView({ block: "nearest" }));
    return () => cancelAnimationFrame(frame);
  }, [locatedFileId, current]);
  const allSelected = rows.length > 0 && rows.every((file) => selected.includes(file.id));
  if (!rows.length) {
    return (
      <div className="empty-state asset-empty-state">
        <div><HardDrive size={22} /></div>
        <b>当前目录暂无文件</b>
        <span>上传文件后会以对象存储文件展示</span>
      </div>
    );
  }
  return (
    <>
    <div className="asset-file-table">
      <div className="asset-file-head">
        <span><input type="checkbox" checked={allSelected} onChange={selectAll} aria-label="全选文件" /></span>
      <span>名称</span>
      <span>类型</span>
      <span>大小</span>
      <span>采集方式</span>
      <span>采集时间</span>
      <span>版本</span>
      <span>状态</span>
      <span>MIME</span>
        <span>操作</span>
      </div>
      {visible.map((file) => {
        const isSelected = selected.includes(file.id);
        const movingIds = isSelected ? selected : [file.id];
        return (
          <div
            className={"asset-file-row" + (isSelected ? " selected" : "") + (locatedFileId === file.id ? " located" : "")}
            key={file.id}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("application/x-datapilot-tree", JSON.stringify({ kind: "assets", ids: movingIds }));
            }}
            onClick={() => open(file)}
            title="点击查看详情；拖动到左侧目录"
          >
            <span><input type="checkbox" checked={isSelected} onChange={() => toggle(file.id)} onClick={(event) => event.stopPropagation()} aria-label={`选择 ${file.name}`} /></span>
            <span className="asset-file-name"><i className="icon purple"><HardDrive size={16} /></i><span><b title={file.name || file.fileName}>{file.name || file.fileName}</b><small className="asset-origin" title={assetOrigin(file)}><a href={objectStorageUrl(file)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{assetOrigin(file)}</a></small></span></span>
            <span>{formatFileType(file)}</span>
            <span>{formatBytes(file.sizeBytes)}</span>
            <span>{assetCollectionMethod(file)}</span>
            <span>{formatTime(file.collectedAt || file.ingestedAt || file.ingestionTime || file.createdAt)}</span>
            <span className="mono">{assetVersion(file)}</span>
            <span><span className={`asset-status-badge ${file.status || "ready"}`}>{assetStatusLabel(file.status)}</span></span>
            <span className="asset-mime" title={assetMimeType(file)}>{assetMimeType(file)}</span>
            <span className="asset-file-actions"><button type="button" title="查看元数据图谱" onClick={(event) => { event.stopPropagation(); showMetadataGraph(file); }}><Network size={15} />图谱</button><button type="button" title="复制链接" aria-label="复制链接" onClick={(event) => { event.stopPropagation(); navigator.clipboard?.writeText(objectStorageUrl(file)); }}><Link2 size={15} />复制链接</button></span>
          </div>
        );
      })}
    </div>
    <Pagination page={current} total={rows.length} totalPages={totalPages} pageSize={pageSize} setPage={setPage} />
    </>
  );
}
function ConnectionList({ rows, open, view, edit, remove }) {
  const [group, setGroup] = useState("全部类型");
  const groups = ["全部类型", "数据库", "对象存储", "在线文档", "第三方 API"],
    filtered =
      group === "全部类型"
        ? rows
        : rows.filter((x) => typeOf(x).group === group);
  return (
    <section className="card source-page-list">
      <div className="filter">
        <span>
          <b>采集任务连接配置列表</b>
          <small>{filtered.length} 个连接</small>
        </span>
        <label className="source-filter">
          类型
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            {groups.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <i />
        <button className="primary mini" onClick={open}>
          <Plus size={14} />
          新建采集任务连接配置
        </button>
      </div>
      <ConnectionTable rows={filtered} onOpen={view} edit={edit} remove={remove} />
    </section>
  );
}
function ConnectionTable({ rows, compact = false, onOpen, edit, remove }) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [rows]);
  const pageSize = 10,
    totalPages = Math.max(1, Math.ceil(rows.length / pageSize)),
    current = Math.min(page, totalPages),
    visible = rows.slice((current - 1) * pageSize, current * pageSize),
    showActions = !compact && Boolean(edit || remove);
  if (!rows.length)
    return (
      <div className="empty-state">
        <b>暂无采集任务连接配置</b>
        <span>请先新建采集任务连接配置</span>
      </div>
    );
  return (
    <>
      <div className={"source-table " + (showActions ? "has-actions" : "")}>
        <div className="source-table-head">
          <span>名称</span>
          <span>类型</span>
          <span>子类</span>
          <span>主机</span>
          <span>端口</span>
          <span>上次测试时间</span>
          <span>上次测试状态</span>
          {showActions && <span>操作</span>}
        </div>
        {visible.map((x) => {
          const cfg = typeOf(x),
            I = cfg.icon,
            status = connectionStatusMeta(x.lastTestStatus || x.connectionStatus);
          return (
            <div
              className="source-table-row"
              key={x.id}
              onDoubleClick={() => edit?.(x)}
              onClick={() => onOpen?.(x)}
            >
              <span className="source-name-cell">
                <i className={"icon " + cfg.tone}>
                  <I size={16} />
                </i>
                <b>{x.name}</b>
              </span>
              <span><b className="connection-main-type">{connectionTypeLabel(x)}</b><small className="connection-type-label">{cfg.label}</small></span>
              <span className="mono">{connectionSubclass(x)}</span>
              <span className="connection-host" title={x.host || x.endpointUrl || "—"}>{x.host || x.endpointUrl || "—"}</span>
              <span className="mono">{x.port || "—"}</span>
              <span>{formatTime(x.lastTestedAt || x.latestTestedAt || x.lastTestTime)}</span>
              <span className="connection-status-cell">
                <i className={`connection-status ${status.tone}`} />
                {status.label}
              </span>
              {showActions && (
                <span className="row-actions">
                  <button type="button" onClick={(event) => { event.stopPropagation(); edit?.(x); }}>修改</button>
                  <button type="button" className="danger" onClick={(event) => { event.stopPropagation(); remove?.(x); }}>删除</button>
                </span>
              )}
            </div>
          );
        })}
      </div>
      {!compact && (
        <Pagination
          page={current}
          total={rows.length}
          totalPages={totalPages}
          pageSize={pageSize}
          setPage={setPage}
        />
      )}
    </>
  );
}
function TemplateDefinitionList({ rows, definitions, open, view, edit, remove }) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [rows]);
  const pageSize = 10,
    totalPages = Math.max(1, Math.ceil(rows.length / pageSize)),
    current = Math.min(page, totalPages),
    visible = rows.slice((current - 1) * pageSize, current * pageSize);
  return (
    <section className="card template-page-list">
      <div className="filter">
        <span>
          <b>元数据模版定义列表</b>
          <small>{rows.length} 个元数据模版定义</small>
        </span>
        <i />
        <button className="primary mini" onClick={open}>
          <Plus size={14} /> 新建元数据模版定义
        </button>
      </div>
      <div className="template-table">
        <div className="template-table-head">
          <span>名称</span>
          <span>描述</span>
          <span>创建时间</span>
          <span>修订时间</span>
          <span>元数据定义数</span>
          <span>操作</span>
        </div>
        {visible.length ? visible.map((item) => (
          <div className="template-table-row" key={item.id}>
            <b>{item.name}</b>
            <span className="template-description">{item.description || "—"}</span>
            <span>{formatTime(item.createdAt)}</span>
            <span>{formatTime(item.updatedAt)}</span>
            <span>{definitions.filter((definition) => definition.templateId === item.id).length}</span>
            <span className="row-actions">
              <button onClick={() => view(item)}>查看</button>
              <button onClick={() => edit(item)}>修改</button>
              <button className="danger" onClick={() => remove(item)}>删除</button>
            </span>
          </div>
        )) : <div className="table-empty">暂无元数据模版定义</div>}
      </div>
      <Pagination page={current} total={rows.length} totalPages={totalPages} pageSize={pageSize} setPage={setPage} />
    </section>
  );
}
function TemplateWizard({ initial, definitions, files, connections, close, save }) {
  const [step, setStep] = useState(1);
  const [template, setTemplate] = useState({ name: initial.name || "", description: initial.description || "" });
  const [nativeFieldPolicy, setNativeFieldPolicy] = useState(() => {
    const rule = normalizeNativeFieldPolicy(initial.nativeFieldPolicy);
    if (rule.sourceFileId) return rule;
    const source = files.find((file) => assetMetadataType(file, connections.find((item) => item.id === file.connectionConfigId)?.type) === "structured");
    return source ? { ...rule, sourceFileId: source.id, sourceFields: nativeFields(source).map(({ name, code, type, table }) => ({ name, code, type, table })) } : rule;
  });
  const [fields, setFields] = useState(
    initial.id
      ? definitions.filter((item) => item.templateId === initial.id).map((item) => ({ ...item, validationJson: item.validationJson ? JSON.stringify(item.validationJson) : "" }))
      : DEFAULT_FILE_METADATA_FIELDS.map((item) => ({ ...item })),
  );
  const [error, setError] = useState("");
  const addField = () => setFields((items) => [...items, { name: "", fieldCode: "", fieldType: "string", description: "", validationJson: "" }]);
  const updateField = (index, key, value) => setFields((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  const next = () => {
    if (!template.name.trim()) { setError("请输入模板名称"); return; }
    setError("");
    setStep(2);
  };
  const submit = () => {
    const activeFields = fields.filter((item) => item.name.trim() || item.fieldCode.trim());
    if (activeFields.some((item) => !item.name.trim() || !item.fieldCode.trim())) {
      setError("请完整填写元数据定义的名称和字段编码");
      return;
    }
    if (new Set(activeFields.map((item) => item.fieldCode.trim())).size !== activeFields.length) {
      setError("字段编码不能重复");
      return;
    }
    try {
      const normalized = activeFields.map((item) => ({
        ...item,
        name: item.name.trim(),
        fieldCode: item.fieldCode.trim(),
        description: item.description.trim(),
        validationJson: item.validationJson.trim() ? JSON.parse(item.validationJson) : null,
      }));
      save({ ...initial, ...template, nativeFieldPolicy: normalizeNativeFieldPolicy(nativeFieldPolicy), name: template.name.trim(), description: template.description.trim(), definitions: normalized });
    } catch {
      setError("字段校验规则必须是合法的 JSON 格式");
    }
  };
  return (
    <div className="mask">
      <div className="modal template-wizard workspace-form-modal">
        <div className="modal-title">
          <div>
            <small>{initial.id ? "EDIT TEMPLATE" : "NEW TEMPLATE"}</small>
            <h2>{initial.id ? "修改元数据模版定义" : "新建元数据模版定义"}</h2>
          </div>
          <button onClick={close} aria-label="关闭"><X size={18} /></button>
        </div>
        <div className="template-steps">
          <span className={step === 1 ? "active" : ""}>1. 元数据模版定义</span>
          <i />
          <span className={step === 2 ? "active" : ""}>2. 元数据定义</span>
        </div>
        {step === 1 ? (
          <div className="template-step-body">
            <label>
              模板名称
              <input autoFocus value={template.name} onChange={(event) => setTemplate((item) => ({ ...item, name: event.target.value }))} placeholder="例如：客户数据质量模板" />
            </label>
            <label>
              模板描述
              <input value={template.description} onChange={(event) => setTemplate((item) => ({ ...item, description: event.target.value }))} placeholder="可选，用于说明模板的适用范围" />
            </label>
          </div>
        ) : (
          <div className="template-step-body metadata-step">
            <NativeFieldPolicyEditor value={nativeFieldPolicy} files={files} connections={connections} onChange={setNativeFieldPolicy} />
            <div className="metadata-step-head">
              <div><b>模板新增字段</b><small>{fields.length} 项定义</small></div>
              <button type="button" onClick={addField}><Plus size={14} /> 添加定义</button>
            </div>
            <div className="template-added-fields"><div className="metadata-definition-grid metadata-definition-head">
              <span>字段名称</span><span>字段编码</span><span>字段类型</span><span>字段描述</span><span>校验规则 JSON</span><span />
            </div>
            {fields.map((field, index) => (
              <div className="metadata-definition-grid" key={field.id || index}>
                <input value={field.name} onChange={(event) => updateField(index, "name", event.target.value)} placeholder="例如：数据等级" />
                <input value={field.fieldCode} onChange={(event) => updateField(index, "fieldCode", event.target.value)} placeholder="data_level" />
                <select value={field.fieldType} onChange={(event) => updateField(index, "fieldType", event.target.value)}>{["string", "integer", "decimal", "boolean", "date", "datetime", "json"].map((value) => <option key={value}>{value}</option>)}</select>
                <input value={field.description} onChange={(event) => updateField(index, "description", event.target.value)} placeholder="可选" />
                <input value={field.validationJson} onChange={(event) => updateField(index, "validationJson", event.target.value)} placeholder={'{"required":true}'} />
                <button type="button" title="删除定义" aria-label="删除定义" onClick={() => setFields((items) => items.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button>
              </div>
            ))}</div>
          </div>
        )}
        {error && <div className="wizard-error">{error}</div>}
        <div className="modal-foot">
          {step === 2 && <button onClick={() => { setError(""); setStep(1); }}>上一步</button>}
          <button onClick={close}>取消</button>
          {step === 1 ? <button className="primary" onClick={next}>下一步</button> : <button className="primary" onClick={submit}>保存模板</button>}
        </div>
      </div>
    </div>
  );
}
function TaskList({
  type,
  title,
  rows,
  connections,
  records = [],
  files,
  templates,
  open,
  edit,
  openConnection,
  run,
  viewRecords,
  remove,
}) {
  return (
    <section className="card">
      <div className="filter">
        <span>
          <b>{title}</b>
          <small>{rows.length} 项任务</small>
        </span>
        <i />
        <button className="primary mini" onClick={open}>
          <Plus size={14} />
          新建任务
        </button>
      </div>
      <TaskTable
        rows={rows}
        type={type}
        connections={connections}
        records={records}
        files={files}
        templates={templates}
        edit={edit}
        openConnection={openConnection}
        run={run}
        viewRecords={viewRecords}
        remove={remove}
      />
    </section>
  );
}
function collectionRequest(task, record) {
  return { ...(task?.requestJson || {}), ...(record?.requestJson || {}) };
}
function collectionModeLabel(request) {
  return request.extractionMode === "incremental" ? "增量采集" : "全量采集";
}
function collectionScopeCounts(request, connection) {
  const tableNames = request.tableNames?.length ? request.tableNames : request.tableName ? [request.tableName] : [];
  const databases = request.databaseNames?.length || (request.databaseName ? 1 : 0);
  const objects = request.objectKeys?.length || 0;
  if (isDatabaseType(connection?.type) || tableNames.length || request.databaseName) return { kind: "database", databases, tables: tableNames.length };
  if (isObjectStorageType(connection?.type) || request.bucket || request.prefix) return { kind: "object", buckets: request.bucket ? 1 : 0, objects, allObjects: !objects };
  return { kind: "api" };
}
function CollectionScope({ task, record, connection, onClick }) {
  const request = collectionRequest(task, record);
  const counts = collectionScopeCounts(request, connection);
  const tableNames = request.tableNames?.length ? request.tableNames : request.tableName ? [request.tableName] : [];
  const configuredAt = record?.configuredAt || request.configuredAt || task?.updatedAt || task?.createdAt;
  if (counts.kind === "database") {
    const database = request.databaseName || "默认数据库";
    const schema = request.schemaName || "public";
    return <button type="button" className="collection-scope collection-scope-button collection-scope-database" title="查看上一次采集范围" onClick={onClick}><span><Database size={14} />{counts.databases || 1} 个 Container<i>·</i>{schema}</span><b>{counts.tables} 个 Object</b><small>{database} · 配置于 {formatExecutionTime(configuredAt)} · 点击查看详情</small></button>;
  }
  if (counts.kind === "object") {
    const prefix = request.prefix || "全部对象";
    return <button type="button" className="collection-scope collection-scope-button collection-scope-object" title="查看上一次采集范围" onClick={onClick}><span><HardDrive size={14} />{counts.buckets || 1} 个 Container<i>·</i>{prefix}</span><b>{counts.allObjects ? "全部 Object" : `${counts.objects} 个 Object`}</b><small>配置于 {formatExecutionTime(configuredAt)} · 点击查看详情</small></button>;
  }
  return <button type="button" className="collection-scope collection-scope-button collection-scope-empty" title="查看上一次采集范围" onClick={onClick}>未配置采集范围</button>;
}
function CollectionModeCell({ request, onClick }) {
  const incremental = request.extractionMode === "incremental";
  return <button type="button" className={`collection-mode-cell${incremental ? " incremental" : ""}`} onClick={incremental ? onClick : undefined} title={incremental ? "查看增量采集策略" : "全量采集"}><span>{incremental ? "增量采集" : "全量采集"}</span>{incremental && <small>{request.incrementalField || "未指定增量字段"} · 查看策略</small>}</button>;
}
function CollectionScopeModal({ task, record, connection, close }) {
  const request = collectionRequest(task, record);
  const counts = collectionScopeCounts(request, connection);
  const tableNames = request.tableNames?.length ? request.tableNames : request.tableName ? [request.tableName] : [];
  const mode = collectionModeLabel(request);
  const configuredAt = record?.configuredAt || request.configuredAt || task?.updatedAt || task?.createdAt;
  return <div className="mask"><div className="modal collection-scope-modal workspace-form-modal"><div className="modal-title"><div><small>COLLECTION SCOPE</small><h2>上一次采集范围</h2><p>{record ? `来自执行记录：${record.name || record.id}` : "任务尚未执行，以下为当前任务配置"}</p></div><button type="button" onClick={close} aria-label="关闭"><X size={18} /></button></div><div className="workspace-modal-body collection-scope-modal-body"><section className="execution-detail-section"><div className="execution-detail-heading"><b>采集概览</b><span className={request.extractionMode === "incremental" ? "collection-mode-pill incremental" : "collection-mode-pill"}>{mode}</span></div><div className="execution-detail-grid"><div><span>采集任务连接配置</span><b>{connection?.name || task?.connectionConfigId || "—"}</b></div><div><span>数据对象存储目录</span><b>{task?.assetDirectoryName || "全部文件"}</b></div><div><span>配置时间</span><b>{formatExecutionTime(configuredAt)}</b></div>{counts.kind === "database" ? <><div><span>Container 数量</span><b>{counts.databases || 1} 个</b></div><div><span>Object 数量</span><b>{counts.tables} 个</b></div><div className="wide"><span>数据库 / Schema</span><b>{request.databaseName || "默认数据库"} / {request.schemaName || "public"}</b></div><div className="wide"><span>数据表清单</span><b>{tableNames.join("、") || "—"}</b></div></> : counts.kind === "object" ? <><div><span>Container 数量</span><b>{counts.buckets || 1} 个</b></div><div><span>Object 数量</span><b>{counts.allObjects ? "前缀下全部对象" : `${counts.objects} 个`}</b></div><div className="wide"><span>对象路径</span><b>{request.bucket || "默认 Bucket"} / {request.prefix || "全部对象"}</b></div><div className="wide"><span>指定对象</span><b>{request.objectKeys?.length ? request.objectKeys.join("、") : "未指定，采集当前前缀全部对象"}</b></div></> : <div className="wide"><span>请求范围</span><b>{request.method || "GET"} API 请求</b></div>}</div></section>{request.extractionMode === "incremental" && <section className="collection-strategy-panel"><div className="execution-detail-heading"><b>增量采集策略</b><span>从上一次成功采集位置继续</span></div><div className="collection-strategy-content"><div><span>增量字段 / 游标</span><b>{request.incrementalField || "未指定字段"}</b></div><div><span>执行策略</span><b>读取上一次成功水位之后新增或变更的数据</b></div><p>本次执行会沿用上一次成功执行记录的范围和水位；首次执行时将从数据源当前可用范围开始。</p></div></section>}</div><div className="modal-foot"><button type="button" onClick={close}>关闭</button></div></div></div>;
}
function enrichmentTypeLabel(type) {
  return { file_content: "内容富化", lineage: "血缘富化", ontology: "本体富化" }[type] || "内容富化";
}
function EnrichmentScope({ task, files, showTooltip, moveTooltip, hideTooltip }) {
  const request = task.requestJson || {};
  const selectedFiles = request.assetFileIds || (task.assetFileId ? [task.assetFileId] : []);
  const directoryId = request.assetDirectoryId || task.assetDirectoryId || files.find((file) => file.id === task.assetFileId)?.directoryId || "all";
  const directory = files.find((file) => (file.directoryId || "all") === directoryId);
  const directoryName = directory?.directory || "全部资产";
  const selectedRows = selectedFiles.map((id) => files.find((file) => file.id === id)).filter(Boolean);
  const fileNames = selectedRows.map((file) => file.fileName || file.name);
  const tooltip = { names: fileNames, allFiles: !fileNames.length };
  return <span className="enrichment-scope" onPointerEnter={(event) => showTooltip(event, tooltip)} onPointerMove={(event) => moveTooltip(event, tooltip)} onPointerLeave={hideTooltip}><span className="enrichment-directory-trigger" tabIndex={0}><FolderOpen size={14} />{directoryName}</span></span>;
}
function TaskTable({ rows, type, connections, records, files, templates, edit, openConnection, run, viewRecords, remove }) {
  const [page, setPage] = useState(1);
  const [fileTooltip, setFileTooltip] = useState(null);
  const [scopeDetail, setScopeDetail] = useState(null);
  useEffect(() => setPage(1), [rows]);
  const pageSize = 10,
    totalPages = Math.max(1, Math.ceil(rows.length / pageSize)),
    current = Math.min(page, totalPages),
    visible = rows.slice((current - 1) * pageSize, current * pageSize);
  const latestExecutionTime = (taskId) => {
    const latest = records
      .filter((record) => record.taskId === taskId)
      .sort((left, right) => new Date(right.finishedTime || right.startedTime || right.createdAt || 0) - new Date(left.finishedTime || left.startedTime || left.createdAt || 0))[0];
    return latest ? formatTime(latest.finishedTime || latest.startedTime || latest.createdAt) : "未执行";
  };
  const latestRecord = (taskId) => records
    .filter((record) => record.taskId === taskId)
    .sort((left, right) => new Date(right.finishedTime || right.startedTime || right.createdAt || 0) - new Date(left.finishedTime || left.startedTime || left.createdAt || 0))[0];
  const isEnrichment = type === "metadata_enrichment";
  const setTooltipPosition = (event, content) => {
    const width = 320, height = 290;
    setFileTooltip({ ...content, x: Math.max(8, Math.min(event.clientX + 12, window.innerWidth - width)), y: Math.max(8, Math.min(event.clientY + 12, window.innerHeight - height)) });
  };
  return rows.length ? (
    <>
      <div className="task-table">
        <div className={type === "data_collection" ? "task-head collection-task-head" : "task-head enrichment-task-head"}>
          {isEnrichment ? <><span>任务名称</span><span>富化类型</span><span>元数据模版</span><span>数据文件</span><span>最近执行时间</span><span>操作</span></> : <><span>任务名称</span><span>连接配置</span><span>上一次采集范围</span><span>数据对象存储目录</span><span>增量/全量</span><span>最近执行时间</span><span>最近执行结果</span><span>操作</span></>}
        </div>
        {visible.map((x) => (
          <div className={type === "data_collection" ? "task-row collection-task-row" : "task-row enrichment-task-row"} key={x.id}>
            {isEnrichment ? <><b>{x.name}</b><span className="enrichment-type-cell">{enrichmentTypeLabel(x.requestJson?.enrichmentType)}</span><span>{templates.find((t) => t.id === x.templateDefinitionId)?.name || "—"}</span><EnrichmentScope task={x} files={files} showTooltip={setTooltipPosition} moveTooltip={setTooltipPosition} hideTooltip={() => setFileTooltip(null)} /><span>{latestExecutionTime(x.id)}</span></> : <><b>{x.name}</b><button type="button" className="collection-connection-link" onClick={(event) => { event.stopPropagation(); openConnection?.(connections.find((c) => c.id === x.connectionConfigId)); }}>{connections.find((c) => c.id === x.connectionConfigId)?.name || "—"}</button><CollectionScope task={x} record={latestRecord(x.id)} connection={connections.find((c) => c.id === x.connectionConfigId)} onClick={() => setScopeDetail({ task: x, record: latestRecord(x.id) })} /><span className="collection-directory-name" title={x.assetDirectoryName || "全部文件"}>{x.assetDirectoryName || "全部文件"}</span><CollectionModeCell request={collectionRequest(x, latestRecord(x.id))} onClick={() => setScopeDetail({ task: x, record: latestRecord(x.id) })} /><span>{latestExecutionTime(x.id)}</span><span className={`execution-status-text ${latestRecord(x.id)?.status || "empty"}`}>{latestRecord(x.id) ? executionStatusLabel(latestRecord(x.id).status) : "未执行"}</span></>}
            <span className="task-actions">
              <button onClick={(event) => { event.stopPropagation(); run(x); }}>
                <Play size={13} />
                执行
              </button>
              <button onClick={(event) => { event.stopPropagation(); viewRecords?.(x.id); }}>记录</button>
              <button onClick={(event) => { event.stopPropagation(); edit(x); }}>修改</button>
              <button className="danger" onClick={(event) => { event.stopPropagation(); remove(x); }}>删除</button>
            </span>
          </div>
        ))}
      </div>
      {fileTooltip && <div className="enrichment-file-tooltip floating" role="tooltip" style={{ left: fileTooltip.x, top: fileTooltip.y }}>{fileTooltip.allFiles ? <b>已选择目录内全部文件</b> : <><b>已选择 {fileTooltip.names.length} 个文件</b><ul>{fileTooltip.names.map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}</ul></>}</div>}
      {scopeDetail && <CollectionScopeModal task={scopeDetail.task} record={scopeDetail.record} connection={connections.find((item) => item.id === scopeDetail.task.connectionConfigId)} close={() => setScopeDetail(null)} />}
      <Pagination
        page={current}
        total={rows.length}
        totalPages={totalPages}
        pageSize={pageSize}
        setPage={setPage}
      />
    </>
  ) : (
    <div className="empty-state">
      <b>暂无{type === "data_collection" ? "数据采集" : "元数据富化"}任务</b>
      <span>点击右上角新建任务</span>
    </div>
  );
}
function CollectionFileLinks({ record, files, locateFile, showDetail }) {
  const outputs = collectionFiles(record, files);
  return <div className="execution-file-links">
    {outputs.slice(0, 3).map((output) => <button type="button" key={output.id} disabled={!output.asset} title={output.asset ? `定位到目录：${output.directory || "全部资产"}` : "文件已删除或不可用"} onClick={(event) => { event.stopPropagation(); locateFile(output.asset); }}><FileText size={13} /><span>{output.fileName}{!output.asset ? "（已不可用）" : ""}</span></button>)}
    {outputs.length > 3 && <button type="button" className="execution-files-more" onClick={(event) => { event.stopPropagation(); showDetail(record); }}>查看全部 {outputs.length} 个文件</button>}
    {!outputs.length && <span>暂无采集文件</span>}
  </div>;
}
function CollectionFileList({ record, files, locateFile }) {
  const outputs = collectionFiles(record, files);
  return <section className="execution-detail-section">
    <div className="execution-detail-heading"><b>采集文件清单</b><span>{outputs.length} 个文件</span></div>
    {outputs.length ? <table className="collection-file-list"><thead><tr><th>文件名称</th><th>所在目录</th><th>大小</th><th>处理结果</th></tr></thead><tbody>
      {outputs.map((output) => <tr key={output.id}>
        <td><button type="button" className="collection-file-link" disabled={!output.asset} title={output.asset ? "定位到文件所在目录" : "文件已删除或不可用"} onClick={() => locateFile(output.asset)}><FileText size={14} /><span>{output.fileName}</span></button>{!output.asset && <small>文件已删除或不可用</small>}</td>
        <td>{output.directory || "全部资产"}</td><td>{output.sizeBytes == null ? "—" : formatBytes(output.sizeBytes)}</td>
        <td>{({ created: "已采集", overwritten: "已覆盖", retained: "保留已有文件" })[output.action] || "已关联"}</td>
      </tr>)}
    </tbody></table> : <div className="collection-files-empty">本次执行暂无采集文件</div>}
  </section>;
}
function collectionSubtasks(record, task, files, connection) {
  const request = collectionRequest(task, record);
  return collectionFiles(record, files).map((output, index) => {
    const asset = output.asset || output;
    const dataset = asset?.content?.dataset || "";
    const parts = String(dataset).split(".").filter(Boolean);
    const databaseName = request.databaseName || parts[0] || "—";
    const tableName = request.tableNames?.[index] || request.tableName || parts[parts.length - 1] || output.fileName || "—";
    const objectKey = asset?.objectKey || asset?.filePath || output.fileName || "—";
    const databaseSource = isDatabaseType(connection?.type) || Boolean(dataset || request.databaseName || request.tableName);
    return {
      id: `${record?.id || "execution"}:task:${index + 1}`,
      name: `${task?.name || record?.name || "采集任务"} #${record?.executionNo || 1} #${index + 1}`,
      startedTime: record?.startedTime,
      finishedTime: record?.finishedTime,
      status: asset ? "succeeded" : "failed",
      sourceContainer: databaseSource ? databaseName : request.bucket || "—",
      sourceObject: databaseSource ? tableName : `${asset?.fileName || output.fileName || "—"} · ${objectKey}`,
      output,
      mimeType: assetMimeType(asset),
    };
  });
}
function CollectionSubtaskList({ rows, selectedId, onSelect }) {
  return <section className="execution-detail-section">
    <div className="execution-detail-heading"><b>采集子任务清单</b><span>{rows.length} 个文件 / 子任务</span></div>
    {rows.length ? <div className="collection-subtask-table"><div className="collection-subtask-head"><span>任务名称</span><span>开始时间</span><span>持续时间</span><span>执行状态</span><span>输出文件</span><span>操作</span></div>{rows.map((row) => <div className={`collection-subtask-row${row.id === selectedId ? " selected" : ""}`} key={row.id} onClick={() => onSelect(row.id)}><b title={row.name}>{row.name}</b><span>{formatExecutionTime(row.startedTime)}</span><span className="mono">{formatDurationMillis(row.startedTime, row.finishedTime)}</span><span className={`execution-status-badge ${row.status}`}>{executionStatusLabel(row.status)}</span><span className="collection-subtask-file" title={row.output?.fileName}>{row.output?.fileName || "—"}</span><span><button type="button" className="execution-detail-button" onClick={(event) => { event.stopPropagation(); onSelect(row.id); }}><Eye size={14} />详情</button></span></div>)}</div> : <div className="collection-files-empty">本次执行暂无采集子任务</div>}
  </section>;
}
function CollectionSubtaskDetail({ subtask, locateFile }) {
  if (!subtask) return null;
  const output = subtask.output || {};
  const asset = output.asset || output;
  return <section className="execution-detail-section collection-subtask-detail">
    <div className="execution-detail-heading"><b>采集子任务详情</b><span>{subtask.name}</span></div>
    <div className="execution-detail-grid"><div><span>任务名称</span><b>{subtask.name}</b></div><div><span>开始时间</span><b>{formatExecutionTime(subtask.startedTime)}</b></div><div><span>持续时间</span><b className="mono">{formatDurationMillis(subtask.startedTime, subtask.finishedTime)}</b></div><div><span>执行状态</span><b>{executionStatusLabel(subtask.status)}</b></div></div>
    <div className="collection-output-table"><div className="collection-output-head"><span>源头容器</span><span>源头对象</span><span>产出文件</span><span>大小</span><span>MIME</span></div><div className="collection-output-row"><span>{subtask.sourceContainer}</span><span title={subtask.sourceObject}>{subtask.sourceObject}</span><span><button type="button" className="collection-file-link" disabled={!output.asset} onClick={() => output.asset && locateFile(output.asset)}><FileText size={14} /><span>{output.fileName || "—"}</span></button>{output.asset && <a href={objectStorageUrl(asset)} target="_blank" rel="noreferrer" className="collection-output-url" onClick={(event) => event.stopPropagation()}>URL</a>}</span><span>{output.sizeBytes == null ? "—" : formatBytes(output.sizeBytes)}</span><span className="asset-mime">{subtask.mimeType}</span></div></div>
  </section>;
}
function ExecutionList({ kind, title, rows, tasks, files, taskId, clearTaskFilter, showDetail, locateFile, exportRecord }) {
  const related = rows.filter((r) => {
    const matchesKind = tasks.find((t) => t.id === r.taskId)?.type === kind;
    return matchesKind && (!taskId || r.taskId === taskId);
  });
  const selectedTask = taskId ? tasks.find((task) => task.id === taskId) : null;
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [rows, tasks, taskId, kind]);
  const pageSize = 10,
    totalPages = Math.max(1, Math.ceil(related.length / pageSize)),
    current = Math.min(page, totalPages),
    visible = related.slice((current - 1) * pageSize, current * pageSize);
  const isEnrichment = kind === "metadata_enrichment";
  return (
    <section className="card">
      <div className="filter">
        <span>
          <b>{title}</b>
          <small>{selectedTask ? `${selectedTask.name} · ${related.length} 条执行记录` : `${related.length} 条执行记录`}</small>
        </span>
        {selectedTask && <button type="button" className="secondary mini" onClick={clearTaskFilter}>查看全部记录</button>}
      </div>
      {related.length ? (
        <>
          <div className="execution-table">
            <div className={isEnrichment ? "execution-head enrichment-execution-head" : "execution-head collection-execution-head"}>
              {isEnrichment ? <><span>作业执行记录</span><span>所属任务</span><span>文件 / 子任务</span><span>孵化类型</span><span>完成时间</span><span>子任务结果</span><span>操作</span></> : <><span>记录名称</span><span>执行状态</span><span>成功率</span><span>开始时间</span><span>结束时间</span><span>持续时间</span><span>执行主体</span><span>操作</span></>}
            </div>
            {visible.map((r) => {
              const task = tasks.find((t) => t.id === r.taskId);
              const childTasks = isEnrichment ? executionTasks(r, task, files) : [];
              const childStats = jobStatistics(childTasks);
              const Row = isEnrichment ? "button" : "div";
              return (
                <Row
                  className={isEnrichment ? "execution-row enrichment-execution-row" : "execution-row collection-execution-row"}
                  key={r.id}
                  onClick={() => showDetail(r)}
                >
                  {isEnrichment ? <><b>{r.name || task?.name || "—"}</b><span>{r.jobName || task?.name || "—"}</span><span>{childTasks.length} 个文件 / 子任务</span><span className="enrichment-type-cell">{enrichmentTypeLabel(r.requestJson?.enrichmentType || task?.requestJson?.enrichmentType)}</span><span>{formatTime(r.finishedTime || r.createdAt)}</span><span className="enrichment-result-summary">成功 {childStats.success} / 失败 {childStats.failed}</span></> : <><b>{executionRecordName(r, task)}</b><span className={`execution-status-badge ${r.status || ""}`}>{executionStatusLabel(r.status)}</span><span>{r.successCount || 0} / {collectionFiles(r, files).length}</span><span>{formatExecutionTime(r.startedTime)}</span><span>{formatExecutionTime(r.finishedTime)}</span><span className="mono">{formatDurationMillis(r.startedTime, r.finishedTime)}</span><span>{r.workerId || r.executor || r.createdBy || "—"}</span></>}
                  <span className="execution-row-actions">
                    {isEnrichment ? <Eye size={15} /> : <><button type="button" className="execution-detail-button" title="查看执行详情" aria-label={`查看执行详情：${executionRecordName(r, task)}`} onClick={(event) => { event.stopPropagation(); showDetail(r); }}><Eye size={15} />详情</button><button type="button" className="execution-export-button" title="导出执行结果" onClick={(event) => { event.stopPropagation(); exportRecord?.(r, task); }}><Download size={14} />导出</button></>}
                  </span>
                </Row>
              );
            })}
          </div>
          <Pagination
            page={current}
            total={related.length}
            totalPages={totalPages}
            pageSize={pageSize}
            setPage={setPage}
          />
        </>
      ) : (
        <div className="empty-state">
          <b>暂无执行记录</b>
          <span>任务执行后将在此展示</span>
        </div>
      )}
    </section>
  );
}
function Pagination({ page, total, totalPages, pageSize, setPage }) {
  return (
    <div className="pagination">
      <span>
        显示 {total ? (page - 1) * pageSize + 1 : 0}-
        {Math.min(page * pageSize, total)} 条，共 {total} 条
      </span>
      <div>
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          上一页
        </button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => (
          <button
            className={page === i + 1 ? "active" : ""}
            key={i}
            onClick={() => setPage(i + 1)}
          >
            {i + 1}
          </button>
        ))}
        <button
          disabled={page === totalPages}
          onClick={() => setPage(page + 1)}
        >
          下一页
        </button>
        <label className="page-jump">
          跳至
          <input
            type="number"
            min="1"
            max={totalPages}
            value={page}
            onChange={(e) =>
              setPage(
                Math.min(totalPages, Math.max(1, Number(e.target.value) || 1)),
              )
            }
          />
          页
        </label>
      </div>
    </div>
  );
}
function DirectoryModal({ initial, close, save }) {
  const [name, setName] = useState(initial.name || "");
  const isEdit = initial.mode === "edit";
  return (
    <div className="mask">
      <div className="modal directory-modal">
        <div className="modal-title">
          <div>
            <small>{isEdit ? "ASSET DIRECTORY" : "NEW SUBDIRECTORY"}</small>
            <h2>{isEdit ? "修改目录" : "新建子目录"}</h2>
          </div>
          <button onClick={close} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <label>
          {isEdit ? "目录名称" : `父级目录：${initial.parentName || "全部资产"}`}
          <input value={name} autoFocus onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && name.trim() && save({ ...initial, name })} placeholder="请输入目录名称" />
        </label>
        <div className="modal-foot">
          <button onClick={close}>取消</button>
          <button className="primary" disabled={!name.trim()} onClick={() => save({ ...initial, name })}>保存</button>
        </div>
      </div>
    </div>
  );
}

function KeyValueEditor({ label, value, onChange, addLabel = "添加参数" }) {
  const rows = value.length ? value : [{ key: "", value: "" }];
  const update = (index, key, nextValue) => {
    onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: nextValue } : row));
  };
  return (
    <div className="key-value-editor">
      <div className="parameter-title">
        <span>{label}</span>
        <button type="button" onClick={() => onChange([...rows, { key: "", value: "" }])}><Plus size={13} /> {addLabel}</button>
      </div>
      {rows.map((row, index) => (
        <div className="parameter-row" key={`${label}-${index}`}>
          <input value={row.key} onChange={(event) => update(index, "key", event.target.value)} placeholder="名称" />
          <input value={row.value} onChange={(event) => update(index, "value", event.target.value)} placeholder="值" />
          <button type="button" title="删除参数" aria-label="删除参数" onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

function ConnectionModal({ initial, nested, close, save }) {
  const oldConfig = initial.config || {};
  const initialCategory = isObjectStorageType(initial.type)
    ? "object"
    : initial.type === "api"
      ? "api"
      : "database";
  const [step, setStep] = useState(1);
  const [category, setCategory] = useState(initialCategory);
  const [databaseTab, setDatabaseTab] = useState("general");
  const [testState, setTestState] = useState("");
  const [form, setForm] = useState({
    name: initial.name || "",
    type: initial.type || "database_mysql",
    connectionStatus:
      initial.connectionStatus ||
      oldConfig.connectionStatus ||
      (initial.status === "enabled" ? "connected" : "untested"),
    lastTestedAt: initial.lastTestedAt || oldConfig.lastTestedAt || "",
    host: initial.host || oldConfig.host || "",
    port: initial.port || oldConfig.port || "",
    username: initial.username || oldConfig.username || "",
    secret: initial.secret || oldConfig.secret || "",
    charset: initial.charset || oldConfig.charset || "",
    sslEnabled: initial.sslEnabled ?? oldConfig.sslEnabled ?? false,
    sslVerifyServer: initial.sslVerifyServer ?? oldConfig.sslVerifyServer ?? true,
    sslClientKey: initial.sslClientKey || oldConfig.sslClientKey || "",
    sslClientCert: initial.sslClientCert || oldConfig.sslClientCert || "",
    sslCaCert: initial.sslCaCert || oldConfig.sslCaCert || "",
    sslKeyPassword: initial.sslKeyPassword || oldConfig.sslKeyPassword || "",
    sshEnabled: initial.sshEnabled ?? oldConfig.sshEnabled ?? false,
    sshHost: initial.sshHost || oldConfig.sshHost || "",
    sshPort: initial.sshPort || oldConfig.sshPort || "22",
    sshUsername: initial.sshUsername || oldConfig.sshUsername || "",
    sshAuthMethod: initial.sshAuthMethod || oldConfig.sshAuthMethod || "password",
    sshPassword: initial.sshPassword || oldConfig.sshPassword || "",
    sshPrivateKey: initial.sshPrivateKey || oldConfig.sshPrivateKey || "",
    sshPassphrase: initial.sshPassphrase || oldConfig.sshPassphrase || "",
    httpTunnelEnabled: initial.httpTunnelEnabled ?? oldConfig.httpTunnelEnabled ?? false,
    httpTunnelUrl: initial.httpTunnelUrl || oldConfig.httpTunnelUrl || "",
    httpEncodeQuery: initial.httpEncodeQuery ?? oldConfig.httpEncodeQuery ?? false,
    httpAuthMode: initial.httpAuthMode || oldConfig.httpAuthMode || "none",
    httpUsername: initial.httpUsername || oldConfig.httpUsername || "",
    httpPassword: initial.httpPassword || oldConfig.httpPassword || "",
    httpClientKey: initial.httpClientKey || oldConfig.httpClientKey || "",
    httpClientCert: initial.httpClientCert || oldConfig.httpClientCert || "",
    httpCaCert: initial.httpCaCert || oldConfig.httpCaCert || "",
    socketTimeoutSeconds: initial.socketTimeoutSeconds || oldConfig.socketTimeoutSeconds || 30,
    keepAliveSeconds: initial.keepAliveSeconds || oldConfig.keepAliveSeconds || "",
    timeoutSeconds: initial.timeoutSeconds || oldConfig.timeoutSeconds || 30,
    endpointUrl: initial.endpointUrl || oldConfig.endpointUrl || "",
    storageProvider: initial.storageProvider || oldConfig.storageProvider || "aliyun_oss",
    accessKey: initial.accessKey || oldConfig.accessKey || "",
    secretKey: initial.secretKey || oldConfig.secretKey || "",
    storageCredentialMode: initial.storageCredentialMode || oldConfig.storageCredentialMode || "accessKey",
    securityToken: initial.securityToken || oldConfig.securityToken || "",
    roleArn: initial.roleArn || oldConfig.roleArn || "",
    roleSessionName: initial.roleSessionName || oldConfig.roleSessionName || "",
    region: initial.region || oldConfig.region || "",
    pathStyle: initial.pathStyle ?? oldConfig.pathStyle ?? true,
    endpointMode: initial.endpointMode || oldConfig.endpointMode || "public",
    useCname: initial.useCname ?? oldConfig.useCname ?? false,
    useDualstack: initial.useDualstack ?? oldConfig.useDualstack ?? false,
    sslVerifyServer: initial.sslVerifyServer ?? oldConfig.sslVerifyServer ?? true,
    proxyUrl: initial.proxyUrl || oldConfig.proxyUrl || "",
    signatureVersion: initial.signatureVersion || oldConfig.signatureVersion || "v4",
    retryMaxAttempts: initial.retryMaxAttempts || oldConfig.retryMaxAttempts || 3,
    readTimeoutSeconds: initial.readTimeoutSeconds || oldConfig.readTimeoutSeconds || 30,
    followRedirects: initial.followRedirects ?? oldConfig.followRedirects ?? true,
    apiTimeoutSeconds: initial.apiTimeoutSeconds || oldConfig.apiTimeoutSeconds || 30,
    apiHeaders: Array.isArray(initial.apiHeaders || oldConfig.apiHeaders || oldConfig.headers)
      ? (initial.apiHeaders || oldConfig.apiHeaders || oldConfig.headers)
      : pairsFromObject(initial.apiHeaders || oldConfig.apiHeaders || oldConfig.headers),
    authMode: initial.authMode || oldConfig.authMode || "none",
    authLocation: initial.authLocation || oldConfig.authLocation || "header",
    authName: initial.authName || oldConfig.authName || "X-API-Key",
    authValue: initial.authValue || oldConfig.authValue || "",
    bearerPrefix: initial.bearerPrefix || oldConfig.bearerPrefix || "Bearer",
    tokenUrl: initial.tokenUrl || oldConfig.tokenUrl || "",
    tokenMethod: initial.tokenMethod || oldConfig.tokenMethod || "POST",
    tokenHeaders: Array.isArray(initial.tokenHeaders || oldConfig.tokenHeaders)
      ? (initial.tokenHeaders || oldConfig.tokenHeaders)
      : pairsFromObject(initial.tokenHeaders || oldConfig.tokenHeaders),
    tokenQuery: Array.isArray(initial.tokenQuery || oldConfig.tokenQuery)
      ? (initial.tokenQuery || oldConfig.tokenQuery)
      : pairsFromObject(initial.tokenQuery || oldConfig.tokenQuery),
    tokenBody: initial.tokenBody || oldConfig.tokenBody || "",
    tokenPath: initial.tokenPath || oldConfig.tokenPath || "data.access_token",
    tokenInjectLocation: initial.tokenInjectLocation || oldConfig.tokenInjectLocation || "header",
    tokenInjectName: initial.tokenInjectName || oldConfig.tokenInjectName || "Authorization",
    tokenPrefix: initial.tokenPrefix || oldConfig.tokenPrefix || "Bearer",
    tokenTtlSeconds: initial.tokenTtlSeconds || oldConfig.tokenTtlSeconds || 3600,
  });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const choose = (nextCategory) => {
    setCategory(nextCategory);
    set("type", nextCategory === "database" ? (form.type.startsWith("database_") ? form.type : "database_mysql") : nextCategory === "object" ? (form.type.startsWith("object_storage_") ? form.type : "object_storage_s3") : "api");
  };
  const next = () => {
    if (form.name.trim()) setStep(2);
  };
  const testConnection = () => {
    const lastTestedAt = new Date().toISOString();
    setForm((current) => ({
      ...current,
      connectionStatus: "connected",
      lastTestedAt,
    }));
    setTestState("Mock 测试通过，保存后会更新列表状态");
  };
  const saveForm = () => {
    const payload = {
      ...initial,
      ...form,
      config: category === "database"
        ? { driver: form.type, host: form.host, port: form.port, username: form.username, charset: form.charset, timeoutSeconds: form.timeoutSeconds, socketTimeoutSeconds: form.socketTimeoutSeconds, keepAliveSeconds: form.keepAliveSeconds, ssl: { enabled: form.sslEnabled, verifyServer: form.sslVerifyServer, clientKey: form.sslClientKey, clientCert: form.sslClientCert, caCert: form.sslCaCert, keyPassword: form.sslKeyPassword }, sshTunnel: { enabled: form.sshEnabled, host: form.sshHost, port: form.sshPort, username: form.sshUsername, authMethod: form.sshAuthMethod, privateKey: form.sshPrivateKey }, httpTunnel: { enabled: form.httpTunnelEnabled, url: form.httpTunnelUrl, encodeQuery: form.httpEncodeQuery, authMode: form.httpAuthMode, username: form.httpUsername, clientCert: form.httpClientCert, caCert: form.httpCaCert } }
        : category === "object"
          ? { provider: form.storageProvider, serviceType: form.type, endpointUrl: form.endpointUrl, region: form.region, credentialMode: form.storageCredentialMode, endpointMode: form.endpointMode, pathStyle: form.pathStyle, useCname: form.useCname, useDualstack: form.useDualstack, useHttps: form.sslEnabled, verifyServer: form.sslVerifyServer, proxyUrl: form.proxyUrl, signatureVersion: form.signatureVersion, retryMaxAttempts: form.retryMaxAttempts, connectTimeoutSeconds: form.timeoutSeconds, readTimeoutSeconds: form.readTimeoutSeconds, followRedirects: form.followRedirects }
          : { baseUrl: form.endpointUrl, timeoutSeconds: form.apiTimeoutSeconds, headers: objectFromPairs(form.apiHeaders), authMode: form.authMode },
    };
    save(payload);
  };
  const typeCards = [
    ["database", "数据库", "连接数据库服务", Database],
    ["object", "对象存储", "连接对象存储服务", HardDrive],
    ["api", "第三方 API", "连接第三方 HTTP API", Globe2],
  ];
  return (
    <div className={nested ? "mask nested-modal-mask" : "mask"}>
      <div className="modal wizard connection-wizard workspace-form-modal">
        <div className="modal-title">
          <div><small>CONNECTION CONFIG</small><h2>{initial.id ? "修改采集任务连接配置" : "新建采集任务连接配置"}</h2></div>
          <button type="button" onClick={close} aria-label="关闭"><X size={18} /></button>
        </div>
        <div className="connection-steps">
          <span className={step === 1 ? "active" : "complete"}><b>01</b><span>基本信息</span></span>
          <i />
          <span className={step === 2 ? "active" : ""}><b>02</b><span>连接参数</span></span>
        </div>
        {step === 1 ? (
          <div className="wizard-body connection-step">
            <p className="section-note">选择数据源类型，并为这条采集任务连接配置设置一个易于识别的名称。</p>
            <div className="kind-grid connection-kind-grid">
              {typeCards.map(([key, label, description, Icon]) => (
                <button type="button" key={key} className={category === key ? "kind chosen" : "kind"} onClick={() => choose(key)}>
                  <i><Icon size={19} /></i><b>{label}</b><small>{description}</small>
                </button>
              ))}
            </div>
            <label className="form-field connection-name-field"><span>采集任务连接配置名称<b>*</b></span><input autoFocus value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="例如：生产客户库" /></label>
          </div>
        ) : (
          <div className="wizard-body connection-step">
            <div className="connection-summary"><span className={`icon ${typeOf({ type: form.type }).tone}`}><>{typeCards.find(([key]) => key === category)?.[3] && React.createElement(typeCards.find(([key]) => key === category)[3], { size: 17 })}</></span><div><b>{form.name}</b><small>{typeCards.find(([key]) => key === category)?.[1]} · 连接参数</small></div><button type="button" onClick={() => setStep(1)}>修改基本信息</button></div>
            {category === "database" && (
              <div className="connection-detail">
                <div className="detail-section-heading"><b>数据库连接</b></div>
                <div className="database-tabs" role="tablist" aria-label="数据库连接参数">
                  {[["general", "常规"], ["ssl", "SSL"], ["ssh", "SSH 隧道"], ["http", "HTTP 隧道"]].map(([value, label]) => <button type="button" role="tab" aria-selected={databaseTab === value} className={databaseTab === value ? "active" : ""} key={value} onClick={() => setDatabaseTab(value)}>{label}{value === "ssl" && form.sslEnabled ? <i /> : null}{value === "ssh" && form.sshEnabled ? <i /> : null}{value === "http" && form.httpTunnelEnabled ? <i /> : null}</button>)}
                </div>
                {databaseTab === "general" && <div className="form-grid database-tab-panel">
                  <label className="form-field"><span>数据库类型<b>*</b></span><select value={form.type} onChange={(event) => set("type", event.target.value)}>{[["database_mysql", "MySQL"], ["database_postgresql", "PostgreSQL"], ["database_dm8", "DM8"], ["database_greenplum", "Greenplum"]].map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                  <label className="form-field"><span>主机 / IP<b>*</b></span><input value={form.host} onChange={(event) => set("host", event.target.value)} placeholder="127.0.0.1" /></label>
                  <label className="form-field"><span>端口<b>*</b></span><input value={form.port} onChange={(event) => set("port", event.target.value)} placeholder="3306" /></label>
                  <label className="form-field"><span>用户名</span><input value={form.username} onChange={(event) => set("username", event.target.value)} /></label>
                  <label className="form-field"><span>密码</span><input type="password" value={form.secret} onChange={(event) => set("secret", event.target.value)} /></label>
                  <label className="form-field"><span>字符集 / 编码</span><input value={form.charset} onChange={(event) => set("charset", event.target.value)} placeholder="UTF-8" /></label>
                  <label className="form-field"><span>连接超时（秒）</span><input type="number" min="1" value={form.timeoutSeconds} onChange={(event) => set("timeoutSeconds", event.target.value)} /></label>
                  <label className="form-field"><span>Socket 超时（秒）</span><input type="number" min="1" value={form.socketTimeoutSeconds} onChange={(event) => set("socketTimeoutSeconds", event.target.value)} /></label>
                  <label className="form-field"><span>保活间隔（秒）</span><input type="number" min="1" value={form.keepAliveSeconds} onChange={(event) => set("keepAliveSeconds", event.target.value)} placeholder="未设置" /></label>
                </div>}
                {databaseTab === "ssl" && <div className="database-tab-panel transport-panel">
                  <label className="transport-switch"><input type="checkbox" checked={form.sslEnabled} onChange={(event) => set("sslEnabled", event.target.checked)} /><span><b>使用 SSL 加密</b><small>使用 TLS 加密应用与数据库之间的网络传输。</small></span></label>
                  {form.sslEnabled && <div className="form-grid transport-fields">
                    <label className="form-field"><span>客户端私钥引用</span><input type="password" value={form.sslClientKey} onChange={(event) => set("sslClientKey", event.target.value)} placeholder="PEM 内容或密钥引用" /></label>
                    <label className="form-field"><span>客户端证书引用</span><input value={form.sslClientCert} onChange={(event) => set("sslClientCert", event.target.value)} placeholder="证书内容或存储引用" /></label>
                    <label className="form-field"><span>CA 证书引用</span><input value={form.sslCaCert} onChange={(event) => set("sslCaCert", event.target.value)} placeholder="CA 证书内容或存储引用" /></label>
                    <label className="form-field"><span>私钥密码</span><input type="password" value={form.sslKeyPassword} onChange={(event) => set("sslKeyPassword", event.target.value)} /></label>
                    <label className="check wide-field"><input type="checkbox" checked={form.sslVerifyServer} onChange={(event) => set("sslVerifyServer", event.target.checked)} />验证服务器证书及其 CA 签名</label>
                  </div>}
                </div>}
                {databaseTab === "ssh" && <div className="database-tab-panel transport-panel">
                  <label className="transport-switch"><input type="checkbox" checked={form.sshEnabled} onChange={(event) => set("sshEnabled", event.target.checked)} /><span><b>使用 SSH 隧道</b><small>通过跳板机建立加密通道后，再访问数据库主机。</small></span></label>
                  {form.sshEnabled && <div className="form-grid transport-fields">
                    <label className="form-field wide-field"><span>跳板机主机 / IP<b>*</b></span><input value={form.sshHost} onChange={(event) => set("sshHost", event.target.value)} placeholder="bastion.example.com" /></label>
                    <label className="form-field"><span>端口</span><input value={form.sshPort} onChange={(event) => set("sshPort", event.target.value)} placeholder="22" /></label>
                    <label className="form-field"><span>用户名</span><input value={form.sshUsername} onChange={(event) => set("sshUsername", event.target.value)} /></label>
                    <label className="form-field"><span>认证方式</span><select value={form.sshAuthMethod} onChange={(event) => set("sshAuthMethod", event.target.value)}><option value="password">密码</option><option value="privateKey">私钥</option></select></label>
                    {form.sshAuthMethod === "password" ? <label className="form-field"><span>密码</span><input type="password" value={form.sshPassword} onChange={(event) => set("sshPassword", event.target.value)} /></label> : <><label className="form-field"><span>私钥引用</span><input type="password" value={form.sshPrivateKey} onChange={(event) => set("sshPrivateKey", event.target.value)} placeholder="PEM 内容或密钥引用" /></label><label className="form-field"><span>私钥口令</span><input type="password" value={form.sshPassphrase} onChange={(event) => set("sshPassphrase", event.target.value)} /></label></>}
                  </div>}
                </div>}
                {databaseTab === "http" && <div className="database-tab-panel transport-panel">
                  <label className="transport-switch"><input type="checkbox" checked={form.httpTunnelEnabled} onChange={(event) => set("httpTunnelEnabled", event.target.checked)} /><span><b>使用 HTTP 隧道</b><small>通过 HTTP/HTTPS 代理转发数据库连接，适用于受限网络环境。</small></span></label>
                  {form.httpTunnelEnabled && <div className="transport-fields">
                    <div className="form-grid"><label className="form-field wide-field"><span>隧道地址<b>*</b></span><input value={form.httpTunnelUrl} onChange={(event) => set("httpTunnelUrl", event.target.value)} placeholder="https://proxy.example.com/database-tunnel" /></label><label className="check wide-field"><input type="checkbox" checked={form.httpEncodeQuery} onChange={(event) => set("httpEncodeQuery", event.target.checked)} />使用 Base64 编码传出查询</label></div>
                    <div className="http-auth-mode"><span>隧道认证</span>{[["none", "无认证"], ["basic", "用户名密码"], ["certificate", "客户端证书"]].map(([value, label]) => <button type="button" className={form.httpAuthMode === value ? "active" : ""} key={value} onClick={() => set("httpAuthMode", value)}>{label}</button>)}</div>
                    {form.httpAuthMode === "basic" && <div className="form-grid transport-auth-fields"><label className="form-field"><span>用户名</span><input value={form.httpUsername} onChange={(event) => set("httpUsername", event.target.value)} /></label><label className="form-field"><span>密码</span><input type="password" value={form.httpPassword} onChange={(event) => set("httpPassword", event.target.value)} /></label></div>}
                    {form.httpAuthMode === "certificate" && <div className="form-grid transport-auth-fields"><label className="form-field"><span>客户端私钥引用</span><input type="password" value={form.httpClientKey} onChange={(event) => set("httpClientKey", event.target.value)} /></label><label className="form-field"><span>客户端证书引用</span><input value={form.httpClientCert} onChange={(event) => set("httpClientCert", event.target.value)} /></label><label className="form-field wide-field"><span>CA 证书引用</span><input value={form.httpCaCert} onChange={(event) => set("httpCaCert", event.target.value)} /></label></div>}
                  </div>}
                </div>}
              </div>
            )}
            {category === "object" && (
              <div className="connection-detail">
                <div className="detail-section-heading"><b>对象存储连接</b></div>
                <div className="storage-config-section">
                  <div className="storage-section-head"><b>服务与凭证</b></div>
                  <div className="form-grid">
                    <label className="form-field"><span>服务商<b>*</b></span><select value={form.storageProvider} onChange={(event) => set("storageProvider", event.target.value)}><option value="aliyun_oss">阿里云 OSS</option><option value="aws_s3">Amazon S3</option><option value="tencent_cos">腾讯云 COS</option><option value="huawei_obs">华为云 OBS</option><option value="minio">MinIO</option><option value="s3_compatible">S3 兼容服务</option></select></label>
                    <label className="form-field"><span>服务协议</span><select value={form.type} onChange={(event) => set("type", event.target.value)}><option value="object_storage_s3">S3 API</option><option value="object_storage_minio">MinIO API</option></select></label>
                    <label className="form-field wide-field"><span>Endpoint<b>*</b></span><input value={form.endpointUrl} onChange={(event) => set("endpointUrl", event.target.value)} placeholder="https://oss-cn-hangzhou.aliyuncs.com" /></label>
                    <label className="form-field"><span>Region<b>*</b></span><input value={form.region} onChange={(event) => set("region", event.target.value)} placeholder="例如：cn-hangzhou / us-east-1" /></label>
                    <label className="form-field"><span>凭证方式</span><select value={form.storageCredentialMode} onChange={(event) => set("storageCredentialMode", event.target.value)}><option value="accessKey">AccessKey</option><option value="sts">STS 临时凭证</option><option value="role">角色授权</option></select></label>
                    {form.storageCredentialMode !== "role" && <><label className="form-field"><span>Access Key ID<b>*</b></span><input value={form.accessKey} onChange={(event) => set("accessKey", event.target.value)} /></label><label className="form-field"><span>Access Key Secret<b>*</b></span><input type="password" value={form.secretKey} onChange={(event) => set("secretKey", event.target.value)} /></label></>}
                    {form.storageCredentialMode === "sts" && <label className="form-field wide-field"><span>Security Token<b>*</b></span><input type="password" value={form.securityToken} onChange={(event) => set("securityToken", event.target.value)} placeholder="临时访问凭证 Token" /></label>}
                    {form.storageCredentialMode === "role" && <><label className="form-field wide-field"><span>角色 ARN / 资源标识<b>*</b></span><input value={form.roleArn} onChange={(event) => set("roleArn", event.target.value)} placeholder="例如：acs:ram::123456789012:role/oss-reader" /></label><label className="form-field"><span>角色会话名称</span><input value={form.roleSessionName} onChange={(event) => set("roleSessionName", event.target.value)} placeholder="ontology-collector" /></label></>}
                  </div>
                </div>
                <div className="storage-config-section storage-network-section">
                  <div className="storage-section-head"><b>网络与协议</b><small>配置 Endpoint 寻址、传输安全与请求可靠性</small></div>
                  <div className="form-grid">
                    <label className="form-field"><span>Endpoint 类型</span><select value={form.endpointMode} onChange={(event) => set("endpointMode", event.target.value)}><option value="public">公网 Endpoint</option><option value="internal">内网 Endpoint</option><option value="accelerate">传输加速 Endpoint</option><option value="custom">自定义域名 / CNAME</option></select></label>
                    <label className="form-field"><span>请求签名版本</span><select value={form.signatureVersion} onChange={(event) => set("signatureVersion", event.target.value)}><option value="v4">Signature V4</option><option value="v2">Signature V2</option><option value="auto">自动协商</option></select></label>
                    <label className="check"><input type="checkbox" checked={form.sslEnabled} onChange={(event) => set("sslEnabled", event.target.checked)} />使用 HTTPS</label>
                    <label className="check"><input type="checkbox" checked={form.sslVerifyServer} disabled={!form.sslEnabled} onChange={(event) => set("sslVerifyServer", event.target.checked)} />验证服务端证书</label>
                    <label className="check"><input type="checkbox" checked={form.pathStyle} onChange={(event) => set("pathStyle", event.target.checked)} />使用 Path Style 寻址</label>
                    <label className="check"><input type="checkbox" checked={form.useCname} onChange={(event) => set("useCname", event.target.checked)} />使用 CNAME 自定义域名</label>
                    <label className="check"><input type="checkbox" checked={form.useDualstack} onChange={(event) => set("useDualstack", event.target.checked)} />使用双栈 Endpoint</label>
                    <label className="check"><input type="checkbox" checked={form.followRedirects} onChange={(event) => set("followRedirects", event.target.checked)} />允许 HTTP 重定向</label>
                    <label className="form-field wide-field"><span>HTTP 代理（可选）</span><input value={form.proxyUrl} onChange={(event) => set("proxyUrl", event.target.value)} placeholder="http://proxy.example.com:8080" /></label>
                    <label className="form-field"><span>连接超时（秒）</span><input type="number" min="1" value={form.timeoutSeconds} onChange={(event) => set("timeoutSeconds", event.target.value)} /></label>
                    <label className="form-field"><span>读写超时（秒）</span><input type="number" min="1" value={form.readTimeoutSeconds} onChange={(event) => set("readTimeoutSeconds", event.target.value)} /></label>
                    <label className="form-field"><span>最大重试次数</span><input type="number" min="0" value={form.retryMaxAttempts} onChange={(event) => set("retryMaxAttempts", event.target.value)} /></label>
                  </div>
                </div>
              </div>
            )}
            {category === "api" && (
              <div className="connection-detail api-connection-detail">
                <div className="detail-section-heading"><b>HTTP API 连接</b><small>业务接口地址、分页和请求体等采集参数在创建采集任务时配置</small></div>
                <div className="form-grid">
                  <label className="form-field wide-field"><span>API Base URL<b>*</b></span><input value={form.endpointUrl} onChange={(event) => set("endpointUrl", event.target.value)} placeholder="https://api.example.com" /></label>
                  <label className="form-field"><span>默认超时（秒）</span><input type="number" min="1" value={form.apiTimeoutSeconds} onChange={(event) => set("apiTimeoutSeconds", event.target.value)} /></label>
                </div>
                <KeyValueEditor label="默认请求头" value={form.apiHeaders} onChange={(value) => set("apiHeaders", value)} />
                <div className="connection-auth-mode"><span>认证方式</span>{[["none", "无认证"], ["apiKey", "API Key"], ["bearer", "Bearer Token"], ["temporaryToken", "临时 Token"]].map(([value, label]) => <button type="button" key={value} className={form.authMode === value ? "active" : ""} onClick={() => set("authMode", value)}>{label}</button>)}</div>
                {form.authMode === "apiKey" && <div className="auth-config form-grid"><label className="form-field"><span>注入位置</span><select value={form.authLocation} onChange={(event) => set("authLocation", event.target.value)}><option value="header">请求 Header</option><option value="query">Query 参数</option></select></label><label className="form-field"><span>参数名称</span><input value={form.authName} onChange={(event) => set("authName", event.target.value)} /></label><label className="form-field wide-field"><span>API Key</span><input type="password" value={form.authValue} onChange={(event) => set("authValue", event.target.value)} /></label></div>}
                {form.authMode === "bearer" && <div className="auth-config form-grid"><label className="form-field"><span>Token</span><input type="password" value={form.authValue} onChange={(event) => set("authValue", event.target.value)} /></label><label className="form-field"><span>Token 前缀</span><input value={form.bearerPrefix} onChange={(event) => set("bearerPrefix", event.target.value)} placeholder="Bearer" /></label></div>}
                {form.authMode === "temporaryToken" && <div className="token-config"><div className="token-note"><CheckCircle2 size={15} /><span>执行采集任务时，系统先调用认证接口获取 Token，再将 Token 注入目标请求。</span></div><div className="form-grid"><label className="form-field wide-field"><span>Token 获取地址<b>*</b></span><input value={form.tokenUrl} onChange={(event) => set("tokenUrl", event.target.value)} placeholder="https://auth.example.com/oauth/token" /></label><label className="form-field"><span>请求方法</span><select value={form.tokenMethod} onChange={(event) => set("tokenMethod", event.target.value)}><option>POST</option><option>GET</option></select></label><label className="form-field"><span>响应 Token 字段路径<b>*</b></span><input value={form.tokenPath} onChange={(event) => set("tokenPath", event.target.value)} placeholder="data.access_token" /></label></div><KeyValueEditor label="认证请求 Header" value={form.tokenHeaders} onChange={(value) => set("tokenHeaders", value)} /><KeyValueEditor label="认证请求 Query 参数" value={form.tokenQuery} onChange={(value) => set("tokenQuery", value)} /><label className="form-field token-body-field"><span>认证请求体（JSON）</span><textarea value={form.tokenBody} onChange={(event) => set("tokenBody", event.target.value)} placeholder={'{"client_id":"demo","client_secret":"***"}'} /></label><div className="token-inject"><b>Token 注入目标请求</b><div className="form-grid"><label className="form-field"><span>注入位置</span><select value={form.tokenInjectLocation} onChange={(event) => set("tokenInjectLocation", event.target.value)}><option value="header">请求 Header</option><option value="query">Query 参数</option></select></label><label className="form-field"><span>字段名称</span><input value={form.tokenInjectName} onChange={(event) => set("tokenInjectName", event.target.value)} placeholder="Authorization" /></label><label className="form-field"><span>Token 前缀</span><input value={form.tokenPrefix} onChange={(event) => set("tokenPrefix", event.target.value)} placeholder="Bearer" /></label><label className="form-field"><span>有效期（秒）</span><input type="number" min="1" value={form.tokenTtlSeconds} onChange={(event) => set("tokenTtlSeconds", event.target.value)} /></label></div></div></div>}
              </div>
            )}
          </div>
        )}
        {testState && <div className="connection-test-result"><CheckCircle2 size={15} />{testState}</div>}
        <div className="modal-foot">
          {step === 1 ? <><button type="button" onClick={close}>取消</button><button type="button" className="primary" disabled={!form.name.trim()} onClick={next}>下一步 <ChevronRight size={15} /></button></> : <><button type="button" onClick={() => setStep(1)}>上一步</button><button type="button" onClick={testConnection}>测试连接</button><button type="button" className="primary" disabled={!form.name.trim()} onClick={saveForm}>保存采集任务连接配置</button></>}
        </div>
      </div>
    </div>
  );
}
function TaskModal(props) {
  return props.initial.type === "data_collection"
    ? <DataCollectionTaskModal {...props} />
    : <MetadataTaskModal {...props} />;
}

function DataCollectionTaskModal({ initial, connections, directories, close, save, openConnection }) {
  const existingRequest = initial.requestJson || {};
  const executionPreview = Boolean(initial.executePreview);
  const [step, setStep] = useState(executionPreview ? 3 : 1);
  const [busy, setBusy] = useState(false);
  const [bodyError, setBodyError] = useState("");
  const [scope, setScope] = useState(null);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [form, setForm] = useState({
    name: initial.name || "",
    connectionConfigId: initial.connectionConfigId || "",
    assetDirectoryId: initial.assetDirectoryId || "",
    assetDirectoryName: initial.assetDirectoryName || "",
    duplicateFilePolicy: initial.duplicateFilePolicy || "latest",
  });
  const [databaseTable, setDatabaseTable] = useState({
    databaseName: existingRequest.databaseName || (["master_data", "sales"].includes(existingRequest.schemaName) ? existingRequest.schemaName : ""),
    schemaName: existingRequest.databaseName ? (existingRequest.schemaName || "public") : "public",
    tableName: existingRequest.tableName || "",
    tableNames: existingRequest.tableNames || (existingRequest.tableName ? [existingRequest.tableName] : []),
    extractionMode: existingRequest.extractionMode || "full",
    incrementalField: existingRequest.incrementalField || "",
  });
  const [request, setRequest] = useState({
    method: existingRequest.method || "GET",
    query: pairsFromObject(existingRequest.query || existingRequest.params),
    headers: pairsFromObject(existingRequest.headers),
    body: typeof existingRequest.body === "string" ? existingRequest.body : existingRequest.body ? JSON.stringify(existingRequest.body, null, 2) : "",
  });
  const [objectRange, setObjectRange] = useState({
    bucket: existingRequest.bucket || "",
    prefix: existingRequest.prefix || "",
    objectKeys: existingRequest.objectKeys || [],
  });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const connection = connections.find((item) => item.id === form.connectionConfigId);
  const isApiConnection = connection?.type === "api" || String(connection?.type || "").startsWith("third_party_api");
  const isDatabaseConnection = isDatabaseType(connection?.type);
  const isObjectConnection = isObjectStorageType(connection?.type);
  useEffect(() => {
    let cancelled = false;
    if (!connection) {
      setScope(null);
      return undefined;
    }
    setScopeLoading(true);
    api.listConnectionDataScope(connection.id)
      .then((value) => { if (!cancelled) setScope(value); })
      .catch(() => { if (!cancelled) setScope(null); })
      .finally(() => { if (!cancelled) setScopeLoading(false); });
    return () => { cancelled = true; };
  }, [connection?.id]);
  const selectedDatabase = scope?.databases?.find((item) => item.name === databaseTable.databaseName);
  const schemas = selectedDatabase?.schemas || [];
  const selectedSchema = schemas.find((item) => item.name === databaseTable.schemaName);
  const tables = selectedSchema?.tables || [];
  const selectedBucket = scope?.buckets?.find((item) => item.name === objectRange.bucket);
  const prefixes = selectedBucket?.prefixes || [];
  const selectedPrefix = prefixes.find((item) => item.value === objectRange.prefix);
  const objects = selectedPrefix?.objects || [];
  const canAdvance = step === 1
    ? Boolean(form.name.trim() && form.connectionConfigId)
    : step === 2
      ? (!isDatabaseConnection || Boolean(databaseTable.databaseName && databaseTable.schemaName && databaseTable.tableNames.length)) && (!isObjectConnection || Boolean(objectRange.bucket))
      : true;
  const buildRequestJson = () => {
    if (isDatabaseConnection) {
      return {
        databaseName: databaseTable.databaseName,
        schemaName: databaseTable.schemaName.trim() || "public",
        tableName: databaseTable.tableNames[0] || "",
        tableNames: databaseTable.tableNames,
        extractionMode: databaseTable.extractionMode,
        ...(databaseTable.extractionMode === "incremental" && databaseTable.incrementalField.trim() ? { incrementalField: databaseTable.incrementalField.trim() } : {}),
      };
    }
    if (isApiConnection) {
      let body;
      if (request.body.trim()) {
        try {
          body = JSON.parse(request.body);
        } catch {
          setBodyError("请求体必须是合法的 JSON 格式");
          return null;
        }
      }
      return {
        method: request.method,
        query: objectFromPairs(request.query),
        headers: objectFromPairs(request.headers),
        ...(body === undefined ? {} : { body }),
      };
    }
    if (isObjectConnection) {
      return {
        bucket: objectRange.bucket.trim(),
        prefix: objectRange.prefix.trim(),
        objectKeys: objectRange.objectKeys,
      };
    }
    return {};
  };
  const submit = async (execute) => {
    const requestJson = buildRequestJson();
    if (!requestJson) return;
    setBusy(true);
    try {
      await save({ ...initial, ...form, type: "data_collection", requestJson, status: initial.status || "ready" }, execute);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mask">
      <div className="modal wizard task-modal collection-task-modal workspace-form-modal">
        <div className="modal-title">
          <div><small>DATA COLLECTION TASK</small><h2>{initial.id ? "修改数据对象采集任务" : "新建数据对象采集任务"}</h2></div>
          <button type="button" onClick={close} aria-label="关闭"><X size={18} /></button>
        </div>
        <div className="wizard-steps collection-steps">
          {[[1, "任务与目录"], [2, "采集参数"], [3, "确认并执行"]].map(([value, label], index) => <React.Fragment key={value}><span className={step === value ? "on" : step > value ? "complete" : ""}><b>0{value}</b><span>{label}</span></span>{index < 2 && <i />}</React.Fragment>)}
        </div>
        {step === 1 && <div className="wizard-body collection-step">
          <div className="form-grid">
            <label className="form-field wide-field"><span>任务名称<b>*</b></span><input autoFocus value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="例如：客户主数据每日采集" /></label>
            <div className="form-field wide-field"><span>数据对象存储目录</span><DirectoryTreeSelect directories={directories} value={form.assetDirectoryId} fallbackName={form.assetDirectoryName} onChange={(directory) => setForm((current) => ({ ...current, assetDirectoryId: directory?.id || "", assetDirectoryName: directory?.name || "" }))} /><small className="field-note">未指定时将创建“任务名称-年月日时分秒”目录。</small></div>
          </div>
          <div className="connection-picker">
            <div><b>采集任务连接配置<b>*</b></b></div>
            <button type="button" onClick={openConnection}><Plus size={14} /> 新建采集任务连接配置</button>
          </div>
          <ConnectionSearchSelect options={connections.map((item) => { const cfg = typeOf(item); return { ...item, typeLabel: cfg.label, group: cfg.group, Icon: cfg.icon, tone: cfg.tone, statusLabel: connectionStatusMeta(item.connectionStatus).label }; })} value={form.connectionConfigId} onChange={(value) => set("connectionConfigId", value)} />
        </div>}
        {step === 2 && <div className="wizard-body collection-step">
          <div className="collection-connection-summary"><span>当前连接</span><b>{connection?.name || "未选择"}</b><small>{connection ? typeOf(connection).group : ""}</small></div>
          {isDatabaseConnection && <section className="database-table-config collection-parameter-panel"><div className="api-request-title"><div><b>数据库采集范围</b><small>从当前连接可访问的数据库中选择 Schema 与数据表，可同时选择多张表。</small></div></div>{scopeLoading ? <div className="scope-loading">正在读取数据库目录...</div> : <><div className="database-table-grid"><label>数据库<b>*</b><select value={databaseTable.databaseName} onChange={(event) => setDatabaseTable((value) => ({ ...value, databaseName: event.target.value, schemaName: "", tableName: "", tableNames: [] }))}><option value="">请选择数据库</option>{(scope?.databases || []).map((item) => <option value={item.name} key={item.name}>{item.name}</option>)}</select></label><label>Schema<b>*</b><select disabled={!selectedDatabase} value={databaseTable.schemaName} onChange={(event) => setDatabaseTable((value) => ({ ...value, schemaName: event.target.value, tableName: "", tableNames: [] }))}><option value="">请选择 Schema</option>{schemas.map((item) => <option value={item.name} key={item.name}>{item.name}</option>)}</select></label><label>提取方式<select value={databaseTable.extractionMode} onChange={(event) => setDatabaseTable((value) => ({ ...value, extractionMode: event.target.value }))}><option value="full">全量提取</option><option value="incremental">增量提取</option></select></label>{databaseTable.extractionMode === "incremental" && <label>增量字段<input value={databaseTable.incrementalField} onChange={(event) => setDatabaseTable((value) => ({ ...value, incrementalField: event.target.value }))} placeholder="updated_at" /></label>}</div><div className="scope-selector"><div className="scope-selector-head"><b>数据表<b>*</b></b><span>{databaseTable.tableNames.length ? `已选择 ${databaseTable.tableNames.length} 张表` : "请选择至少一张表"}</span><button type="button" disabled={!tables.length} onClick={() => setDatabaseTable((value) => ({ ...value, tableNames: value.tableNames.length === tables.length ? [] : tables, tableName: value.tableNames.length === tables.length ? "" : tables[0] || "" }))}>{databaseTable.tableNames.length === tables.length ? "取消全选" : "全选当前 Schema"}</button></div><div className="scope-check-list">{tables.length ? tables.map((table) => <label key={table}><input type="checkbox" checked={databaseTable.tableNames.includes(table)} onChange={() => setDatabaseTable((value) => { const tableNames = value.tableNames.includes(table) ? value.tableNames.filter((item) => item !== table) : [...value.tableNames, table]; return { ...value, tableNames, tableName: tableNames[0] || "" }; })} /><span>{table}</span></label>) : <p>请先选择数据库和 Schema</p>}</div></div></>}</section>}
          {isApiConnection && <section className="api-request-config collection-parameter-panel"><div className="api-request-title"><div><b>API 请求参数</b><small>认证方式沿用采集任务连接配置；以下参数仅作用于本次采集。</small></div><label className="method-select">请求方法<select value={request.method} onChange={(event) => setRequest((value) => ({ ...value, method: event.target.value }))}>{["GET", "POST", "PUT", "PATCH", "DELETE"].map((method) => <option key={method}>{method}</option>)}</select></label></div><ParameterRows title="查询参数" rows={request.query} setRows={(query) => setRequest((value) => ({ ...value, query }))} /><ParameterRows title="请求头" rows={request.headers} setRows={(headers) => setRequest((value) => ({ ...value, headers }))} /><label className="request-body-field">JSON 请求体<textarea value={request.body} onChange={(event) => { setBodyError(""); setRequest((value) => ({ ...value, body: event.target.value })); }} placeholder={'{\n  "page": 1,\n  "pageSize": 100\n}'} spellCheck="false" />{bodyError && <small className="form-error">{bodyError}</small>}</label></section>}
          {isObjectConnection && <section className="object-range-config collection-parameter-panel"><div className="object-range-heading"><div><b>对象存储采集范围</b><small>从存储服务中选择需要采集的路径与对象。</small></div></div>{scopeLoading ? <div className="scope-loading">正在读取 Bucket 与对象目录...</div> : <><div className="object-range-path"><label className="object-range-field"><span>Bucket <em>*</em></span><select value={objectRange.bucket} onChange={(event) => setObjectRange({ bucket: event.target.value, prefix: "", objectKeys: [] })}><option value="">请选择 Bucket</option>{(scope?.buckets || []).map((item) => <option value={item.name} key={item.name}>{item.name}</option>)}</select></label><label className="object-range-field"><span>对象前缀</span><select disabled={!selectedBucket} value={objectRange.prefix} onChange={(event) => setObjectRange((value) => ({ ...value, prefix: event.target.value, objectKeys: [] }))}><option value="">{selectedBucket ? "请选择对象前缀" : "请先选择 Bucket"}</option>{prefixes.map((item) => <option value={item.value} key={item.value}>{item.value}</option>)}</select></label></div><div className="object-selection"><div className="object-selection-head"><div><b>指定对象</b><span>{objectRange.objectKeys.length ? `已选择 ${objectRange.objectKeys.length} 个对象` : "不选择时采集整个对象前缀"}</span></div><button type="button" disabled={!objects.length} onClick={() => setObjectRange((value) => ({ ...value, objectKeys: value.objectKeys.length === objects.length ? [] : objects }))}>{objects.length && objectRange.objectKeys.length === objects.length ? "取消全选" : "全选当前前缀"}</button></div><div className="object-check-list">{objects.length ? objects.map((objectKey) => <label key={objectKey}><input type="checkbox" checked={objectRange.objectKeys.includes(objectKey)} onChange={() => setObjectRange((value) => ({ ...value, objectKeys: value.objectKeys.includes(objectKey) ? value.objectKeys.filter((item) => item !== objectKey) : [...value.objectKeys, objectKey] }))} /><span>{objectKey}</span></label>) : <p>{selectedBucket ? "请选择对象前缀后查看对象列表" : "请选择 Bucket 后继续"}</p>}</div></div></>}</section>}
          {!connection && <div className="form-error collection-error">请返回上一步选择采集任务连接配置。</div>}
        </div>}
        {step === 3 && <div className="wizard-body collection-step">
          <section className="collection-confirmation"><div className="detail-section-heading"><b>{executionPreview ? "执行前配置清单" : "任务配置"}</b><small>{executionPreview ? "确认前仍可返回修改采集参数" : "保存后可在任务列表中执行"}</small></div><div className="summary"><div className="summary-row"><span>数据对象存储目录</span><b>{form.assetDirectoryName || "自动创建临时目录"}</b></div><div className="summary-row"><span>采集任务连接配置</span><b>{connection?.name || "—"}</b></div><div className="summary-row"><span>采集方式</span><b>{databaseTable.extractionMode === "incremental" ? `增量采集 · ${databaseTable.incrementalField || "未指定字段"}` : "全量采集"}</b></div><div className="summary-row"><span>采集范围</span><b>{isDatabaseConnection ? `${databaseTable.databaseName}.${databaseTable.schemaName} · ${databaseTable.tableNames.length} 张表` : isObjectConnection ? `${objectRange.bucket}/${objectRange.prefix || "全部对象"}${objectRange.objectKeys.length ? ` · ${objectRange.objectKeys.length} 个指定对象` : " · 前缀下全部对象"}` : isApiConnection ? `${request.method} API 请求` : "—"}</b></div></div></section>
        </div>}
        <div className="modal-foot collection-task-foot">
          {step === 1 && <><button type="button" onClick={close}>取消</button><button type="button" className="primary" disabled={!canAdvance} onClick={() => setStep(2)}>下一步 <ChevronRight size={15} /></button></>}
          {step === 2 && <><button type="button" onClick={() => setStep(1)}>上一步</button><button type="button" className="primary" disabled={!canAdvance} onClick={() => setStep(3)}>确认配置 <ChevronRight size={15} /></button></>}
          {step === 3 && (executionPreview ? <><button type="button" onClick={close}>取消</button><button type="button" onClick={() => setStep(2)}>返回修改</button><button type="button" className="primary" disabled={busy} onClick={() => submit(true)}><Play size={15} /> 确认执行</button></> : <><button type="button" onClick={() => setStep(2)}>上一步</button><button type="button" disabled={busy} onClick={() => submit(false)}>保存任务</button><button type="button" className="primary" disabled={busy} onClick={() => submit(true)}><Play size={15} /> 保存并执行</button></>)}
        </div>
      </div>
    </div>
  );
}

function MetadataTaskModal({ initial, files, directories = [], templates, close, save }) {
  const existingRequest = initial.requestJson || {};
  const [form, setForm] = useState({
    name: initial.name || "",
    enrichmentType: existingRequest.enrichmentType || "file_content",
    assetDirectoryId: existingRequest.assetDirectoryId || initial.assetDirectoryId || files.find((file) => file.id === initial.assetFileId)?.directoryId || "",
    assetFileIds: existingRequest.assetFileIds || (initial.assetFileId ? [initial.assetFileId] : []),
    templateDefinitionId: initial.templateDefinitionId || "",
  });
  const directoryIndex = useMemo(() => {
    const index = {};
    const visit = (nodes, ancestors = [], names = []) => nodes.forEach((node) => {
      const path = [...names, node.name];
      index[node.id] = { ...node, ancestors, depth: ancestors.length, path: path.join(" / ") };
      visit(node.children || [], [...ancestors, node.id], path);
    });
    visit(directories);
    return index;
  }, [directories]);
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [expandedDirectories, setExpandedDirectories] = useState(() => new Set([
    ...Object.values(directoryIndex).filter((node) => node.depth < 2).map((node) => node.id),
    ...(directoryIndex[form.assetDirectoryId]?.ancestors || []),
  ]));
  useEffect(() => {
    setExpandedDirectories((current) => new Set([
      ...current,
      ...Object.values(directoryIndex).filter((node) => node.depth < 2).map((node) => node.id),
      ...(directoryIndex[form.assetDirectoryId]?.ancestors || []),
    ]));
  }, [directoryIndex, form.assetDirectoryId]);
  const directoryCounts = {};
  files.forEach((file) => { const id = file.directoryId || "all"; directoryCounts[id] = (directoryCounts[id] || 0) + 1; });
  const normalizedDirectoryQuery = directoryQuery.trim().toLowerCase();
  const matchingDirectories = new Set();
  if (normalizedDirectoryQuery) Object.values(directoryIndex).forEach((node) => {
    if (node.path.toLowerCase().includes(normalizedDirectoryQuery)) {
      matchingDirectories.add(node.id);
      node.ancestors.forEach((id) => matchingDirectories.add(id));
    }
  });
  const renderDirectory = (node) => {
    if (normalizedDirectoryQuery && !matchingDirectories.has(node.id)) return null;
    const item = directoryIndex[node.id];
    const children = node.children || [];
    const expansionKey = normalizedDirectoryQuery ? `search:${node.id}` : node.id;
    const expanded = normalizedDirectoryQuery ? !expandedDirectories.has(expansionKey) : expandedDirectories.has(expansionKey);
    return <li key={node.id}>
      <div className={`enrichment-tree-row${form.assetDirectoryId === node.id ? " selected" : ""}`} style={{ paddingLeft: `${Math.min(item.depth, 4) * 14}px` }}>
        <button type="button" className="enrichment-tree-toggle" disabled={!children.length} aria-label={`${expanded ? "收起" : "展开"}${node.name}`} aria-expanded={children.length ? expanded : undefined} onClick={() => setExpandedDirectories((current) => {
          const next = new Set(current);
          next.has(expansionKey) ? next.delete(expansionKey) : next.add(expansionKey);
          return next;
        })}>{children.length ? (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}</button>
        <label title={item.path}><input type="radio" name="enrichment-directory" aria-label={node.name} checked={form.assetDirectoryId === node.id} onChange={() => setDirectory(node.id)} /><FolderOpen size={14} /><span>{node.name}</span>{item.depth > 4 && <small className="tree-depth-badge">L{item.depth + 1}</small>}<em>{directoryCounts[node.id] || 0}</em></label>
      </div>
      {children.length > 0 && expanded && <ul>{children.map(renderDirectory)}</ul>}
    </li>;
  };
  const scopedFiles = form.assetDirectoryId ? files.filter((file) => (file.directoryId || "all") === form.assetDirectoryId) : [];
  const selectedAll = scopedFiles.length > 0 && scopedFiles.every((file) => form.assetFileIds.includes(file.id));
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const setDirectory = (directoryId) => setForm((current) => ({ ...current, assetDirectoryId: directoryId, assetFileIds: current.assetFileIds.filter((fileId) => files.some((file) => file.id === fileId && (file.directoryId || "all") === directoryId)) }));
  const toggleFile = (fileId) => setForm((current) => ({ ...current, assetFileIds: current.assetFileIds.includes(fileId) ? current.assetFileIds.filter((id) => id !== fileId) : [...current.assetFileIds, fileId] }));
  const selectAllFiles = () => setForm((current) => ({ ...current, assetFileIds: selectedAll ? current.assetFileIds.filter((id) => !scopedFiles.some((file) => file.id === id)) : [...new Set([...current.assetFileIds, ...scopedFiles.map((file) => file.id)])] }));
  const typeCards = [
    ["file_content", "内容富化", FileJson, "提取结构与业务术语"],
    ["lineage", "血缘富化", Network, "识别上下游资产关系"],
    ["ontology", "本体富化", Boxes, "映射本体实体与属性"],
  ];
  const canSave = Boolean(form.name.trim() && form.enrichmentType && directoryIndex[form.assetDirectoryId] && form.templateDefinitionId);
  const saveTask = () => {
    const requestJson = { ...existingRequest, enrichmentType: form.enrichmentType, assetDirectoryId: form.assetDirectoryId, assetFileIds: form.assetFileIds };
    save({ ...initial, ...form, assetFileId: form.assetFileIds[0] || "", type: "metadata_enrichment", requestJson });
  };
  return <div className="mask"><div className="modal wizard enrichment-task-modal workspace-form-modal">
    <div className="modal-title"><div><small>METADATA ENRICHMENT TASK</small><h2>{initial.id ? "修改元数据富化任务" : "新建元数据富化任务"}</h2></div><button onClick={close} aria-label="关闭"><X size={20} /></button></div>
    <div className="wizard-body enrichment-step">
      <div className="enrichment-basics"><label className="form-field"><span>任务名称 <b>*</b></span><input autoFocus value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="例如：客户数据内容富化" /></label><label className="form-field"><span>元数据模版 <b>*</b></span><select value={form.templateDefinitionId} onChange={(event) => set("templateDefinitionId", event.target.value)}><option value="">请选择元数据模版</option>{templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}</select></label></div>
      <section className="enrichment-section"><div className="enrichment-section-head"><b>富化方式 <em>*</em></b><small>选择本次任务的处理策略</small></div><div className="enrichment-type-grid">{typeCards.map(([value, label, Icon, description]) => <button type="button" key={value} className={form.enrichmentType === value ? "enrichment-type-card active" : "enrichment-type-card"} onClick={() => set("enrichmentType", value)}><i><Icon size={18} /></i><span><b>{label}</b><small>{description}</small></span></button>)}</div></section>
      <section className="enrichment-section enrichment-scope-section">
        <div className="enrichment-section-head"><div><b>数据源范围 <em>*</em></b><small>先选择目录；如需缩小处理范围，再勾选具体文件。</small></div><span className="enrichment-scope-status">{form.assetDirectoryId ? (form.assetFileIds.length ? `${form.assetFileIds.length} 个指定文件` : "处理整个目录") : "待选择"}</span></div>
        <div className="enrichment-source-grid">
          <div className="enrichment-source-box">
            <div className="enrichment-source-head"><b><strong>1</strong><FolderOpen size={15} /> 资产目录</b><span>{form.assetDirectoryId ? "已选择" : "必选"}</span></div>
            <div className="enrichment-tree-search"><Search size={14} /><input aria-label="搜索富化资产目录" placeholder="搜索目录名称或路径" value={directoryQuery} onChange={(event) => setDirectoryQuery(event.target.value)} />{directoryQuery && <button type="button" title="清空目录搜索" aria-label="清空目录搜索" onClick={() => setDirectoryQuery("")}><X size={14} /></button>}</div>
            <div className="enrichment-tree-list" role="group" aria-label="富化资产目录（单选）"><ul>{directories.map(renderDirectory)}</ul>{!directories.length && <p>暂无可选资产目录</p>}{normalizedDirectoryQuery && !matchingDirectories.size && <p>未找到匹配目录</p>}</div>
            <div className="enrichment-tree-path">{directoryIndex[form.assetDirectoryId]?.path || (form.assetDirectoryId ? "目录已不可用，请重新选择" : "尚未选择目录")}</div>
          </div>
          <div className="enrichment-source-box"><div className="enrichment-source-head"><b><strong>2</strong><FileText size={15} /> 指定文件</b><span>{form.assetFileIds.length ? `已选 ${form.assetFileIds.length} 个` : "可选"}</span><button type="button" disabled={!scopedFiles.length} onClick={selectAllFiles}>{selectedAll ? "取消全选" : "全选"}</button></div><div className="enrichment-file-list">{form.assetDirectoryId ? scopedFiles.length ? scopedFiles.map((file) => <label key={file.id}><input type="checkbox" checked={form.assetFileIds.includes(file.id)} onChange={() => toggleFile(file.id)} /><span><b>{file.name || file.fileName}</b><small>{file.fileName || "—"} · {formatBytes(file.sizeBytes)}</small></span></label>) : <p>当前目录暂无文件</p> : <div className="enrichment-file-empty"><FileText size={22} /><b>选择左侧资产目录</b><small>目录中的文件将在此显示</small></div>}</div></div>
        </div>
      </section>
    </div>
    <div className="modal-foot enrichment-task-foot"><button type="button" onClick={close}>取消</button><button type="button" className="primary" disabled={!canSave} onClick={saveTask}>保存任务</button></div>
  </div></div>;
}
function ParameterRows({ title, rows, setRows }) {
  const update = (index, key, value) =>
    setRows(rows.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)));
  return (
    <div className="parameter-editor">
      <div className="parameter-title">
        <b>{title}</b>
        <button type="button" onClick={() => setRows([...rows, { key: "", value: "" }])}>
          <Plus size={13} /> 添加
        </button>
      </div>
      {rows.map((item, index) => (
        <div className="parameter-row" key={`${title}-${index}`}>
          <input value={item.key} onChange={(event) => update(index, "key", event.target.value)} placeholder="参数名" />
          <input value={item.value} onChange={(event) => update(index, "value", event.target.value)} placeholder="参数值" />
          <button type="button" title={`删除${title}`} aria-label={`删除${title}`} onClick={() => setRows(rows.filter((_, itemIndex) => itemIndex !== index))}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
function ThirdPartyAppList({ rows, open, view, remove }) {
  const [page, setPage] = useState(1);
  const pageSize = 10, totalPages = Math.max(1, Math.ceil(rows.length / pageSize)), current = Math.min(page, totalPages), visible = rows.slice((current - 1) * pageSize, current * pageSize);
  useEffect(() => setPage(1), [rows]);
  return <section className="card third-party-page"><div className="filter"><span><b>第三方应用</b><small>{rows.length} 个已注册应用</small></span><button className="primary mini" onClick={open}><Plus size={14} />创建应用</button></div><div className="third-party-table"><div className="third-party-row third-party-head"><span>应用名称</span><span>App ID</span><span>创建时间</span><span>最近调用</span><span>操作</span></div>{visible.map((app) => <div className="third-party-row" key={app.id}><span><b>{app.name}</b><small>{app.description || "未填写描述"}</small></span><span className="mono">{app.appId}</span><span>{formatTime(app.createdAt)}</span><span>{formatTime(app.lastAccessedAt)}</span><span className="third-party-actions"><button title="查看应用凭证" onClick={() => view(app)}><Eye size={14} />凭证</button><button className="danger" title="删除应用" onClick={() => remove(app)}><Trash2 size={14} /></button></span></div>)}</div><Pagination page={current} total={rows.length} totalPages={totalPages} pageSize={pageSize} setPage={setPage} /></section>;
}
function ThirdPartyCallList({ rows, apps, view }) {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const visible = rows.filter((item) => filter === "all" || item.appId === filter);
  const pageSize = 10, totalPages = Math.max(1, Math.ceil(visible.length / pageSize)), current = Math.min(page, totalPages), pageRows = visible.slice((current - 1) * pageSize, current * pageSize);
  useEffect(() => setPage(1), [filter, rows]);
  const status = (value) => <span className={`api-call-status ${value === "succeeded" ? "success" : "failed"}`}>{value === "succeeded" ? "通过" : "失败"}</span>;
  return <section className="card third-party-page"><div className="filter"><span><b>第三方调用记录</b><small>{visible.length} 条认证及单文件富化调用</small></span><label className="third-party-filter">调用方<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">全部应用</option>{apps.map((app) => <option key={app.id} value={app.id}>{app.name}</option>)}</select></label></div><div className="third-party-table third-party-call-table"><div className="third-party-row third-party-head"><span>第三方应用</span><span>认证接口</span><span>富化接口</span><span>接收文件</span><span>元数据模版</span><span>操作</span></div>{pageRows.map((call) => <button className="third-party-row third-party-call-row" key={call.id} onClick={() => view(call)}><span><b>{apps.find((app) => app.id === call.appId)?.name || "已删除应用"}</b><small className="mono">{call.appId}</small></span><span><b>{formatTime(call.authAt)}</b>{status(call.authStatus)}</span><span><b>{formatTime(call.enrichAt)}</b>{status(call.enrichStatus)}</span><span><b>{call.fileName}</b><small>{formatBytes(call.standardMetadata?.sizeBytes)}</small></span><span>{call.templateName || "—"}</span><span><Eye size={15} /></span></button>)}</div><Pagination page={current} total={visible.length} totalPages={totalPages} pageSize={pageSize} setPage={setPage} /></section>;
}
function ThirdPartyAppModal({ templates, close, save }) {
  const [name, setName] = useState(""), [description, setDescription] = useState(""), [templateId, setTemplateId] = useState(templates[0]?.id || "");
  return <div className="mask"><div className="modal third-party-app-modal workspace-form-modal"><div className="modal-title"><div><small>THIRD-PARTY ACCESS</small><h2>创建第三方应用</h2></div><button onClick={close} aria-label="关闭"><X size={18} /></button></div><div className="third-party-form"><label>应用名称 <b>*</b><input autoFocus value={name} maxLength={40} onChange={(event) => setName(event.target.value)} placeholder="请输入对接方应用名称" /></label><label>约定元数据模版 <b>*</b><select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>{templates.length ? templates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.id}</option>) : <option value="">暂无可用模版</option>}</select></label><label>应用说明<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="填写应用用途或对接说明" /></label><div className="app-credential-hint"><ShieldCheck size={18} /><span><b>创建后自动生成访问凭证</b><small>调用方需携带 App ID、Token 和事先约定的元数据模版 ID。</small></span></div></div><div className="modal-foot"><button onClick={close}>取消</button><button className="primary" disabled={!name.trim() || !templateId} onClick={() => save({ name: name.trim(), description: description.trim(), templateId })}>创建并生成凭证</button></div></div></div>;
}
function DetailModal({ kind, data, record, task, connection, file, template, app, assetFiles = [], definitions = [], close, locateFile }) {
  const isAsset = kind === "asset";
  const isFile = kind === "file" || isAsset;
  const isConnection = kind === "connection";
  const isCollectionExecution = kind === "collectionExecution";
  const isTemplateDefinition = kind === "templateDefinition";
  const isThirdPartyApp = kind === "thirdPartyApp";
  const isThirdPartyCall = kind === "thirdPartyCall";
  const title = isAsset ? "文件详情" : kind === "file" ? "数据对象采集记录信息" : isConnection ? "采集任务连接配置详情" : isCollectionExecution ? "数据采集执行详情" : isTemplateDefinition ? "元数据模版定义详情" : isThirdPartyApp ? "第三方应用凭证" : isThirdPartyCall ? "第三方富化调用详情" : "元数据富化结果";
  const fileContent = data?.content || { message: "当前执行记录未关联数据对象采集记录" };
  const request = { ...(task?.requestJson || {}), ...(isCollectionExecution ? (data?.requestJson || {}) : {}) };
  const collectionRange = request.tableNames?.length
    ? `${request.databaseName ? `${request.databaseName}.` : ""}${request.schemaName || "public"}.${request.tableNames.join(", ")}`
    : request.tableName
      ? `${request.databaseName ? `${request.databaseName}.` : ""}${request.schemaName || "public"}.${request.tableName}`
      : request.bucket
        ? `${request.bucket}/${request.prefix || ""}${request.objectKeys?.length ? ` (${request.objectKeys.length} 个指定对象)` : ""}`
        : request.method
          ? `${request.method} API 请求`
          : "—";
  const collectionSubtaskRows = isCollectionExecution ? collectionSubtasks(data, task, assetFiles, connection) : [];
  const [selectedCollectionSubtaskId, setSelectedCollectionSubtaskId] = useState("");
  useEffect(() => {
    setSelectedCollectionSubtaskId(collectionSubtaskRows[0]?.id || "");
  }, [data?.id]);
  const selectedCollectionSubtask = collectionSubtaskRows.find((row) => row.id === selectedCollectionSubtaskId) || collectionSubtaskRows[0];
  return (
    <div className="mask">
      <div className="modal detail-modal workspace-form-modal">
        <div className="modal-title">
          <h2>{title}</h2>
          <button onClick={close}>
            <X size={18} />
          </button>
        </div>
        <div className="workspace-modal-body">
        {isConnection ? (
          <div className="execution-detail connection-detail"><section className="execution-detail-section"><div className="execution-detail-heading"><b>连接配置</b><span>{connectionTypeLabel(data)}</span></div><div className="execution-detail-grid"><div><span>名称</span><b>{data?.name || "—"}</b></div><div><span>类型</span><b>{connectionTypeLabel(data)}</b></div><div><span>子类</span><b>{connectionSubclass(data)}</b></div><div><span>主机 / 地址</span><b className="mono">{data?.host || data?.endpointUrl || "—"}</b></div><div><span>端口</span><b className="mono">{data?.port || "—"}</b></div><div><span>上次测试时间</span><b>{formatExecutionTime(data?.lastTestedAt || data?.latestTestedAt || data?.lastTestTime)}</b></div><div><span>上次测试状态</span><b>{connectionStatusMeta(data?.lastTestStatus || data?.connectionStatus).label}</b></div><div className="wide"><span>说明</span><b>{data?.description || "—"}</b></div></div></section><section className="execution-detail-section"><div className="execution-detail-heading"><b>类型配置</b><span>敏感凭证已隐藏</span></div><pre className="execution-config-json">{JSON.stringify(Object.fromEntries(Object.entries(data || {}).filter(([key]) => !/password|secret|token|credential/i.test(key) && !["id", "projectId"].includes(key))), null, 2)}</pre></section></div>
        ) : isThirdPartyApp ? (
          <div className="third-party-detail"><section className="third-party-credential"><div className="credential-mark"><KeyRound size={22} /></div><div><b>{data?.name || "—"}</b><span>{data?.description || "元数据富化服务调用方"}</span></div></section><section className="execution-detail-section"><div className="execution-detail-heading"><b>应用访问凭证</b><span>请妥善保管 Token</span></div><div className="credential-list"><div><span>APP ID</span><b className="mono">{data?.appId || "—"}</b><button title="复制 App ID" onClick={() => navigator.clipboard?.writeText(data?.appId || "")}><Copy size={14} /></button></div><div><span>APP TOKEN</span><b className="mono">{data?.appToken || "—"}</b><button title="复制 Token" onClick={() => navigator.clipboard?.writeText(data?.appToken || "")}><Copy size={14} /></button></div><div><span>约定模版 ID</span><b className="mono">{data?.templateId || "—"}</b></div></div></section><section className="execution-detail-section"><div className="execution-detail-grid"><div><span>创建时间</span><b>{formatTime(data?.createdAt)}</b></div><div><span>最近调用</span><b>{formatTime(data?.lastAccessedAt)}</b></div></div></section></div>
        ) : isThirdPartyCall ? (
          <div className="execution-detail third-party-call-detail"><section className="execution-detail-section"><div className="execution-detail-heading"><b>调用链路</b><span>{app?.name || "已删除应用"}</span></div><div className="call-timeline"><div><i className={data?.authStatus === "succeeded" ? "ok" : "error"} /><span>认证接口</span><b>{formatTime(data?.authAt)}</b><em>{data?.authStatus === "succeeded" ? "认证通过" : "认证失败"}</em></div><div><i className={data?.enrichStatus === "succeeded" ? "ok" : "error"} /><span>富化接口</span><b>{formatTime(data?.enrichAt)}</b><em>{data?.enrichStatus === "succeeded" ? "处理完成" : data?.errorMessage || "处理失败"}</em></div></div></section><section className="execution-detail-section"><div className="execution-detail-heading"><b>接收文件标准元数据</b><span>{data?.fileName || "—"}</span></div><div className="execution-detail-grid">{Object.entries(data?.standardMetadata || {}).map(([key, value]) => <div className={key === "objectUrl" ? "wide" : ""} key={key}><span>{({ fileName: "文件名称", fileType: "文件类型", sizeBytes: "文件大小", objectUrl: "本地 OSS 存储链接", uploadedAt: "接收时间" })[key] || key}</span><b className={key === "objectUrl" ? "mono" : ""}>{key === "sizeBytes" ? formatBytes(value) : String(value)}</b></div>)}</div></section><section className="execution-detail-section"><div className="execution-detail-heading"><b>模版元数据</b><span>{template?.name || data?.templateName || data?.templateId || "—"}</span></div><div className="metadata-compare"><div className="metadata-block initial"><div><span>初始元数据</span><em>请求传入</em></div>{Object.entries(data?.initialMetadata || {}).map(([key, value]) => <p key={key}><span>{key}</span><b>{String(value)}</b></p>)}</div><div className="metadata-block enriched"><div><span>富化元数据</span><em>服务输出</em></div>{Object.entries(data?.enrichedMetadata || {}).map(([key, value]) => <p key={key}><span>{key}</span><b>{String(value)}</b></p>)}</div></div></section></div>
        ) : isCollectionExecution ? (
          <div className="execution-detail">
            <section className="execution-detail-section">
              <div className="execution-detail-heading"><b>{executionRecordName(data, task)}</b><span>{executionStatusLabel(data?.status)}</span></div>
              <div className="execution-detail-grid">
                <div><span>记录编号</span><b className="mono">{data?.id || "—"}</b></div>
                <div><span>成功率</span><b>{data?.successCount || 0} / {collectionSubtaskRows.length}</b></div>
                <div><span>开始时间</span><b>{formatExecutionTime(data?.startedTime)}</b></div>
                <div><span>结束时间</span><b>{formatExecutionTime(data?.finishedTime)}</b></div>
                <div><span>持续时间</span><b className="mono">{formatDurationMillis(data?.startedTime, data?.finishedTime)}</b></div>
                <div><span>执行主体</span><b>{data?.workerId || data?.executor || data?.createdBy || "—"}</b></div>
              </div>
            </section>
            <CollectionSubtaskList rows={collectionSubtaskRows} selectedId={selectedCollectionSubtask?.id} onSelect={setSelectedCollectionSubtaskId} />
            <CollectionSubtaskDetail subtask={selectedCollectionSubtask} locateFile={locateFile} />
            <section className="execution-detail-section">
              <div className="execution-detail-heading"><b>采集任务信息</b><span className="mono">{task?.id || data?.taskId || "—"}</span></div>
              <div className="execution-detail-grid">
                <div><span>任务名称</span><b>{task?.name || "—"}</b></div>
                <div><span>连接配置</span><b>{connection?.name || task?.connectionConfigId || "—"}</b></div>
                <div><span>连接类型</span><b>{connection ? `${connectionTypeLabel(connection)} · ${connectionSubclass(connection)}` : "—"}</b></div>
                <div><span>主机 / 地址</span><b className="mono">{connection?.host || connection?.endpointUrl || "—"}</b></div>
                <div><span>端口</span><b className="mono">{connection?.port || "—"}</b></div>
                <div><span>数据对象存储目录</span><b>{task?.assetDirectoryName || "全部资产"}</b></div>
                <div className="wide"><span>采集范围</span><b>{collectionRange}</b></div>
                <div><span>增量 / 全量</span><b>{request.extractionMode === "incremental" ? `增量采集 · ${request.incrementalField || "未指定字段"}` : request.extractionMode ? "全量采集" : "—"}</b></div>
                <div><span>最近执行结果</span><b>{executionStatusLabel(data?.status)}</b></div>
              </div>
              {connection && <pre className="execution-config-json connection-config-preview">{JSON.stringify(Object.fromEntries(Object.entries(connection).filter(([key]) => !/password|secret|token|credential/i.test(key) && !["id", "projectId"].includes(key))), null, 2)}</pre>}
              <pre className="execution-config-json">{JSON.stringify({ task: task ? { ...task, requestJson: undefined } : null, collectionScope: request }, null, 2)}</pre>
            </section>
            <section className="execution-detail-section">
              <div className="execution-detail-heading"><b>执行结果</b><span>{data?.resultJson?.message || ""}</span></div>
              <pre className="execution-config-json">{JSON.stringify({ request: data?.requestJson || {}, result: data?.resultJson || {}, outputFile: file ? { id: file.id, name: file.fileName || file.name, objectUrl: objectStorageUrl(file) } : null }, null, 2)}</pre>
            </section>
          </div>
        ) : isTemplateDefinition ? (
          <div className="execution-detail template-definition-detail">
            <section className="execution-detail-section">
              <div className="execution-detail-heading"><b>模板信息</b><span>{definitions.length} 项元数据定义</span></div>
              <div className="execution-detail-grid">
                <div><span>模板名称</span><b>{data?.name || "—"}</b></div>
                <div><span>状态</span><b>{data?.status || "—"}</b></div>
                <div className="wide"><span>原生字段</span><b>{nativeFieldPolicyLabel(data?.nativeFieldPolicy)}{data?.nativeFieldPolicy?.mode === "selected" ? ` · ${data.nativeFieldPolicy.fields.join("、") || "未纳入字段"}` : ""}</b></div>
                <div className="wide"><span>模板描述</span><b>{data?.description || "未填写"}</b></div>
                <div><span>创建人员编号</span><b className="mono">{data?.creatorId || "—"}</b></div>
                <div><span>创建时间</span><b>{formatTime(data?.createdAt)}</b></div>
                <div><span>修订时间</span><b>{formatTime(data?.updatedAt)}</b></div>
              </div>
            </section>
            <section className="execution-detail-section">
              <div className="execution-detail-heading"><b>元数据定义</b><span>当前模板包含的字段</span></div>
              <div className="template-definition-field-list">
                <div className="template-definition-field-head"><span>字段名称</span><span>字段编码</span><span>字段类型</span><span>字段描述</span><span>校验规则</span></div>
                {definitions.length ? definitions.map((field) => <div className="template-definition-field-row" key={field.id}><b>{field.name || "—"}</b><span className="mono">{field.fieldCode || "—"}</span><span>{field.fieldType || "—"}</span><span>{field.description || "—"}</span><span className="mono">{field.validationJson ? JSON.stringify(field.validationJson) : "—"}</span></div>) : <div className="template-definition-empty">当前模板尚未定义元数据字段</div>}
              </div>
            </section>
          </div>
        ) : isFile ? (
          <>
            <div className="file-metadata">
              <div><span>文件编号</span><b className="mono">{data?.id || record?.assetFileId || "—"}</b></div>
              <div><span>文件名称</span><b>{data?.fileName || data?.name || "—"}</b></div>
              <div><span>文件类型</span><b>{formatFileType(data)}</b></div>
              <div><span>元数据类型</span><b>{METADATA_TYPES[assetMetadataType(data, connection?.type)]}</b></div>
              <div><span>资产级别</span><b>{ASSET_LEVELS[assetLevelOf(data)]}</b></div>
              <div><span>文件大小</span><b>{formatBytes(data?.sizeBytes)}</b></div>
              <div className="file-metadata-wide"><span>对象存储 URL</span><b className="mono" title={objectStorageUrl(data)}>{objectStorageUrl(data)}</b></div>
              <div><span>对象存储服务</span><b>{data?.storageService || "MinIO（Mock）"}</b></div>
              <div><span>对象键</span><b className="mono">{data?.objectKey || data?.filePath || "—"}</b></div>
              <div><span>所属目录</span><b>{data?.directory || "全部资产"}</b></div>
              <div><span>上传时间</span><b>{formatTime(data?.createdAt || record?.finishedTime)}</b></div>
              {!isAsset && <div><span>采集任务连接配置编号</span><b className="mono">{data?.connectionConfigId || "—"}</b></div>}
            </div>
            <pre className="result-json">{JSON.stringify(fileContent, null, 2)}</pre>
          </>
        ) : (
          <pre className="result-json">{JSON.stringify(data?.resultJson || {}, null, 2)}</pre>
        )}
        </div>
        <div className="modal-foot">
          {isFile && (
            <button className="primary download-file" onClick={() => downloadAsset(data)}>
              <FileDown size={15} /> 下载文件
            </button>
          )}
          <button className="primary" onClick={close}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

const SPG_CORE_ELEMENTS = [
  { id: "namespaces", label: "命名空间", description: "本体的顶层语义容器。建议采用“组织.领域.子域”的小写点分编码，并管理一组稳定发布的元素快照。" },
  { id: "entityTypes", label: "General Entity", description: "定义可独立识别的业务对象，以及实体的结构继承、属性槽和关系槽。" },
  { id: "conceptTypes", label: "Concept", description: "维护标准化语义，用于分类与对齐。" },
  { id: "eventTypes", label: "Event", description: "以事件为独立节点建模论元槽、时间地点及事件间因果、顺承和包含关系。" },
  { id: "standardValues", label: "Standard Value", description: "维护标准化取值。" },
  { id: "properties", label: "Property", description: "描述节点自身的静态字面量特征；可复用业务对象或需要图遍历的取值应升级为关系定义。" },
  { id: "relations", label: "Relation", description: "把谓词语义绑定到具体 Domain / Range，配置方向、基数、语义分类和关系属性。" },
  { id: "constraints", label: "Constraint", description: "只负责合法性校验，不产生新事实。可配置属性取值、跨属性、基数和关系性质约束。" },
  { id: "rules", label: "Rule", description: "描述触发事件、判定条件与执行动作，可生成属性、关系、分类或新的事件事实。" },
];

const SPG_STATUS_META = {
  DRAFT: { label: "草稿", tone: "draft" },
  RELEASED: { label: "已发布", tone: "released" },
  ARCHIVED: { label: "已归档", tone: "archived" },
};
const normalizeSpgStatus = (status) => ({ published: "RELEASED", archived: "ARCHIVED", draft: "DRAFT" }[String(status || "").toLowerCase()] || String(status || "DRAFT").toUpperCase());
const SPG_SCOPE_OPTIONS = ["GLOBAL", "PROJECT", "NAMESPACE", "LOCAL"];
const SPG_SCOPE_LABELS = { GLOBAL: "全局", PROJECT: "项目级", NAMESPACE: "本体级", LOCAL: "本地" };
const SPG_CONSTRAINT_TYPES = ["NOT_NULL", "UNIQUE", "IMMUTABLE", "DATA_TYPE", "MULTI_VALUE", "REGEXP", "ENUM", "RANGE", "DATETIME", "STR_LENGTH", "STD_VALUE", "CARDINALITY", "INVERSE_OF", "SUB_PROPERTY_OF", "EQUIVALENT_TO", "DISJOINT_WITH", "MUTEX_OF", "PATH_CONSISTENCY"];
const SPG_PREDICATE_SEMANTICS = ["USE", "HYP", "CAU", "SEQ", "INC"];

const SPG_CHILD_KINDS = CHILD_KINDS;

function OntologyWorkspace({ ontology, activeKind, note, selectedVersionId, onVersionChange, back }) {
  const [workspaceTab, setWorkspaceTab] = useState("elements");
  const [kind, setKind] = useState(activeKind || "entityTypes");
  const [tree, setTree] = useState({});
  const [expanded, setExpanded] = useState(() => new Set());
  const [focus, setFocus] = useState("");
  const [keyword, setKeyword] = useState("");
  const [context, setContext] = useState(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => { let live = true; spgSchemaApi.listSpgCoreModel().then((model) => { if (live) setTree(scopeOntology(model, ontology)); }).catch((error) => note(error.message)); return () => { live = false; }; }, [ontology?.namespaceId, revision]);
  const versionId = tree.versions?.some((row) => row.id === selectedVersionId) ? selectedVersionId : tree.versions?.find((row) => row.isLatest)?.id || tree.versions?.[0]?.id;
  const elements = SPG_CORE_ELEMENTS.filter((item) => item.id !== "namespaces");
  const rows = elements.flatMap((item) => (tree[item.id] || []).filter((row) => row.versionId === versionId).map((row) => ({ ...row, kind: item.id })));
  const rowMap = Object.fromEntries(rows.map((row) => [row.id, row]));
  const search = keyword.trim().toLowerCase();
  const retained = new Set();
  const searchExpanded = new Set();
  if (search) rows.filter((row) => `${row.name} ${row.code}`.toLowerCase().includes(search)).forEach((row) => {
    let current = row; const visited = new Set();
    while (current && !visited.has(current.id)) { visited.add(current.id); retained.add(current.id); if (current.id !== row.id) searchExpanded.add(current.id); current = rowMap[current.parentId]; }
  });
  const toggle = (id) => setExpanded((old) => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const select = (row) => { setKind(row.kind); setFocus(row.id); setContext(null); };
  const renderNode = (row, path = new Set()) => {
    if (path.has(row.id) || (search && !retained.has(row.id))) return null;
    const nextPath = new Set([...path, row.id]);
    const children = rows.filter((item) => item.parentId === row.id);
    const isOpen = expanded.has(row.id) || searchExpanded.has(row.id);
    return <div className="ontology-directory-node" key={row.id}><div className={`ontology-directory-item${focus === row.id ? " selected" : ""}`} onContextMenu={(event) => { event.preventDefault(); setContext(row); }}><button className="ontology-tree-chevron" aria-label={`${isOpen ? "折叠" : "展开"}${row.name}`} disabled={!children.length} onClick={() => toggle(row.id)}>{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button><button title={`${row.name} · ${row.code}`} onClick={() => select(row)}>{row.name}</button></div>{isOpen && <div className="ontology-directory-children">{children.map((child) => renderNode(child, nextPath))}</div>}</div>;
  };
  const focused = rowMap[focus];
  const focusTree = context?.id || "";
  const [treeFocus, setTreeFocus] = useState("");
  const treeRoot = rowMap[treeFocus];
  return <div className="ontology-editor"><header className="ontology-summary"><div><button className="ontology-back" onClick={back}>本体清单 /</button><h1>{ontology?.name || "本体工作区"}</h1><p>{ontology?.description || "维护本体元素与层级关系"}</p></div><dl><div><dt>编码</dt><dd>{ontology?.code || "—"}</dd></div><div><dt>领域</dt><dd>{ontology?.domain || "通用"}</dd></div><div><dt>元素</dt><dd>{rows.length}</dd></div><div><dt>关联数据对象</dt><dd>{ontology?.linkedAssetIds?.length || 0}</dd></div></dl></header>
    <nav className="demo-nav" aria-label="本体工作区分页">{[["elements", "元素定义与层级"], ["overview", "本体概览"], ["versions", "本体版本档案"]].map(([id, label]) => <button key={id} className={workspaceTab === id ? "active" : ""} onClick={() => setWorkspaceTab(id)}>{label}</button>)}</nav>
    {workspaceTab === "overview" && <OntologyOverview ontology={ontology} model={tree} versionId={versionId} selectKind={value => { setKind(value); setFocus(""); setWorkspaceTab("elements"); }} selectElement={row => { select(row); setWorkspaceTab("elements"); }} />}
    {workspaceTab === "versions" && <OntologyArchivePage models={ontology ? [ontology] : []} model={tree.versions ? tree : null} openModel={row => { onVersionChange(row.schemaVersionId); setWorkspaceTab("elements"); }} />}
    {workspaceTab === "elements" && <div className="ontology-editor-layout"><aside className="ontology-element-directory"><div className="ontology-directory-heading"><b>本体元素</b><button aria-label="恢复目录" title="恢复目录" onClick={() => { setTreeFocus(""); setFocus(""); setKeyword(""); setContext(null); }}><RefreshCw size={14} /></button></div><label className="ontology-directory-search"><Search size={14} /><input aria-label="搜索本体元素" placeholder="搜索名称或编码" value={keyword} onChange={(event) => setKeyword(event.target.value)} /></label>
      {context && <div className="ontology-tree-context" role="menu"><b>{context.name}</b><button role="menuitem" onClick={() => { setTreeFocus(focusTree); select(context); }}>聚焦当前目录</button><button role="menuitem" onClick={() => { setTreeFocus(""); setContext(null); }}>恢复完整目录</button></div>}
      <div className="ontology-directory-scroll" onContextMenu={(event) => { if (event.target === event.currentTarget) { event.preventDefault(); setTreeFocus(""); } }}>{treeRoot ? <><button className="ontology-tree-restore" onClick={() => setTreeFocus("")}>恢复完整目录</button>{renderNode(treeRoot)}</> : elements.map((item) => { const roots = rows.filter((row) => row.kind === item.id && !rowMap[row.parentId]); const isOpen = expanded.has(item.id) || search; return <section key={item.id}><div className={`ontology-directory-category${kind === item.id && !focus ? " active" : ""}`}><button aria-label={`${isOpen ? "折叠" : "展开"}${item.label}`} onClick={() => toggle(item.id)}>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button><button onClick={() => { setKind(item.id); setFocus(""); }}>{item.label}<small>{rows.filter((row) => row.kind === item.id).length}</small></button></div>{isOpen && roots.map((row) => renderNode(row))}</section>; })}</div></aside>
      <div className="ontology-element-content"><SpgCoreModelPage key={`${kind}-${focus}`} ontology={ontology} focusElementId={focused?.id} note={note} activeKind={kind} selectedVersionId={selectedVersionId} onVersionChange={(value) => { setTreeFocus(""); setFocus(""); onVersionChange(value); }} onChanged={() => setRevision((value) => value + 1)} /></div>
    </div>}</div>;
}

function SpgCoreModelPage({ note, activeKind, selectedVersionId, onVersionChange, ontology, focusElementId, onChanged }) {
  const [model, setModel] = useState(() => ({ versions: [], ...Object.fromEntries(SPG_CORE_ELEMENTS.map((item) => [item.id, []])) }));
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(() => new Set());
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [focusId, setFocusId] = useState(focusElementId || "");
  const [searchCollapsed, setSearchCollapsed] = useState(() => new Set());
  const pageSize = 8;
  const active = SPG_CORE_ELEMENTS.some((item) => item.id === activeKind) ? activeKind : "namespaces";
  const labels = Object.fromEntries(SPG_CORE_ELEMENTS.map((item) => [item.id, item.label]));
  const versions = [...(model.versions || [])].sort((left, right) => {
    if (left.isLatest !== right.isLatest) return left.isLatest ? -1 : 1;
    return new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
  });
  const latestVersion = versions.find((item) => item.isLatest) || versions[0];
  const versionId = versions.some((item) => item.id === selectedVersionId) ? selectedVersionId : latestVersion?.id || "";
  const currentVersion = versions.find((item) => item.id === versionId);
  const versionModel = useMemo(() => Object.fromEntries(SPG_CORE_ELEMENTS.map((item) => [
    item.id,
    (model[item.id] || []).filter((row) => row.versionId === versionId),
  ])), [model, versionId]);
  const allRows = SPG_CORE_ELEMENTS.flatMap((item) => (versionModel[item.id] || []).map((row) => ({ ...row, kind: item.id })));
  const rowMap = useMemo(() => Object.fromEntries(allRows.map((row) => [row.id, row])), [versionModel]);
  const load = async () => {
    setLoading(true);
    try { setModel(scopeOntology(await spgSchemaApi.listSpgCoreModel(), ontology)); }
    catch (error) { note(`SPG 模型加载失败：${error.message}`); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (versionId && versionId !== selectedVersionId) onVersionChange(versionId);
  }, [versionId, selectedVersionId, onVersionChange]);
  useEffect(() => { setPage(1); setExpanded(new Set()); setModal(null); }, [active, keyword, versionId]);
  useEffect(() => { setFocusId(focusElementId || ""); }, [active, versionId, focusElementId]);
  useEffect(() => { setSearchCollapsed(new Set()); }, [keyword]);
  const namespaceName = (id) => versionModel.namespaces?.find((item) => item.id === id)?.name || "—";
  const pathFor = (row) => ancestorPath(row, rowMap, (item) => item.parentId || (item.kind !== "namespaces" ? item.namespaceId : ""));
  const focusNode = rowMap[focusId];
  const searchQuery = keyword.trim().toLowerCase();
  const retained = new Set();
  const searchExpanded = new Set();
  if (searchQuery) allRows.forEach((row) => {
    const parent = rowMap[row.parentId];
    if ([row.name, row.code, row.uri, row.description, row.dataType, row.constraintType, row.expression, row.targetType, parent?.name, namespaceName(row.namespaceId)].join(" ").toLowerCase().includes(searchQuery)) pathFor(row).forEach((item, index, path) => { retained.add(item.id); if (index < path.length - 1) searchExpanded.add(item.id); });
  });
  const childrenFor = (row, kind) => (SPG_CHILD_KINDS[kind] || []).flatMap((childKind) => (versionModel[childKind] || [])
    .filter((child) => kind === "namespaces"
      ? child.namespaceId === row.id && (!child.parentId || child.parentId === row.id || child.parentKind === "namespaces")
      : child.parentId === row.id)
    .map((child) => ({ ...child, kind: childKind }))).filter((child) => !searchQuery || retained.has(child.id));
  const rows = (focusNode ? childrenFor(focusNode, focusNode.kind) : (versionModel[active] || []).filter((row) => active === "namespaces" || row.parentKind !== active)).filter((row) => !searchQuery || retained.has(row.id));
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const toggle = (id) => {
    if (searchQuery) setSearchCollapsed((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
    else setExpanded((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };
  const focusBranch = (row) => { setFocusId(row?.id || ""); setKeyword(""); setPage(1); setExpanded(new Set()); };
  const save = async (kind, value) => {
    try {
      const parent = rowMap[value.parentId];
      const payload = { ...value, versionId };
      if (!value.id && kind !== "namespaces") payload.namespaceId = value.namespaceId || parent?.namespaceId || (parent?.kind === "namespaces" ? parent.id : "");
      await spgSchemaApi.saveSpgCoreElement(kind, payload);
      setModal(null);
      await load();
      onChanged?.();
      note(`${labels[kind]} 已${value.id ? "更新" : "创建"}`);
    } catch (error) { note(`保存失败：${error.message}`); }
  };
  const remove = async (kind, row) => {
    if (!confirm(`确定删除 ${labels[kind]} “${row.name}”吗？其下级元素也会一并删除。`)) return;
    try { await spgSchemaApi.deleteSpgCoreElement(kind, row.id); await load(); onChanged?.(); note(`${labels[kind]} 已删除`); }
    catch (error) { note(`删除失败：${error.message}`); }
  };
  const openChild = (parent, parentKind, childKind) => setModal({
    kind: childKind,
    value: { namespaceId: parentKind === "namespaces" ? parent.id : parent.namespaceId, parentId: parent.id, parentKind },
  });
  const config = SPG_CORE_ELEMENTS.find((item) => item.id === active);
  const editable = (row) => statusOf(model, row) === "DRAFT";
  const draftNamespaces = (versionModel.namespaces || []).filter(editable);
  const anchorOptions = allRows.filter((row) => CHILD_KINDS[row.kind]?.includes(active) && editable(row));
  const openCreate = () => ["properties", "relations"].includes(active)
    ? setModal({ kind: active, anchor: true })
    : setModal({ kind: active, value: { versionId, namespaceId: active === "namespaces" ? "" : draftNamespaces[0]?.id || "" } });
  const cloneNamespace = async (row) => {
    try {
      const next = await spgSchemaApi.createNamespaceDraft(row.id);
      await load();
      onVersionChange(next.versionId);
      onChanged?.();
      note("已整库创建新镜像，可在草稿中修改");
    } catch (error) { note(`创建镜像失败：${error.message}`); }
  };
  const versionStatus = normalizeSpgStatus(currentVersion?.status);
  const currentNamespace = versionModel.namespaces?.find((row) => row.versionId === versionId);
  const statusMeta = SPG_STATUS_META[versionStatus] || SPG_STATUS_META.DRAFT;
  const totalElements = allRows.filter((row) => row.kind !== "namespaces").length;
  const semanticElements = (versionModel.entityTypes?.length || 0) + (versionModel.conceptTypes?.length || 0) + (versionModel.eventTypes?.length || 0);
  const governedElements = allRows.filter((row) => row.isNative || row.scope === "GLOBAL" || row.scope === "PROJECT").length;
  return <div className="spg-core-workspace">
    <section className="card spg-core-panel">
    <div className="spg-core-heading">
      <div><span className="eyebrow">SPG SCHEMA · SEMANTIC CONTROL PLANE</span><h1>{config.label}</h1><p>{config.description}</p><div className="spg-principles"><span>Ontology = 语义模型</span><span>Property = 字面量特征</span><span>Relation = 可遍历对象</span><span>Rule = 条件 + 动作</span></div></div>
      <div className="spg-core-heading-actions">
        <label className="spg-version-switcher">
          <span>本体版本{currentVersion?.isLatest && <em>最新</em>}</span>
          <select aria-label="切换本体版本" value={versionId} onChange={(event) => onVersionChange(event.target.value)} disabled={!versions.length}>
            {!versions.length && <option value="">正在读取版本</option>}
            {versions.map((version) => <option value={version.id} key={version.id}>{version.name}{version.isLatest ? "（最新）" : ""}</option>)}
          </select>
        </label>
        {!editable({ versionId }) && currentNamespace && <button type="button" onClick={() => cloneNamespace(currentNamespace)}><Copy size={15} />创建草稿镜像</button>}
        <button className="primary" disabled={!versionId || !editable({ versionId }) || (active !== "namespaces" && !draftNamespaces.length) || (["properties", "relations"].includes(active) && !anchorOptions.length)} onClick={openCreate}><Plus size={15} />新建{config.label}</button>
      </div>
    </div>
    <section className="spg-schema-overview" aria-label="SPG Schema 版本概览">
      <div className="spg-version-card"><span>当前版本</span><strong>{currentVersion?.name || "—"}</strong><em className={"spg-status-badge " + statusMeta.tone}>{statusMeta.label}</em><small>{currentVersion?.description || "语义模型工作区"}</small></div>
      <div><span>语义类型</span><strong>{semanticElements}</strong><small>实体 / 概念 / 事件定义</small></div>
      <div><span>Schema 元素</span><strong>{totalElements}</strong><small>当前版本元素总数</small></div>
      <div><span>治理元素</span><strong>{governedElements}</strong><small>GLOBAL / PROJECT / 内置</small></div>
      <div><span>关系与逻辑</span><strong>{(versionModel.relations?.length || 0) + (versionModel.constraints?.length || 0) + (versionModel.rules?.length || 0)}</strong><small>关系 · 约束 · 规则</small></div>
    </section>
      {focusNode && <div className="tree-location-bar"><TreeBreadcrumb rootLabel={`${config.label}列表`} path={focusNode ? pathFor(focusNode) : []} onNavigate={focusBranch} /><button type="button" className="tree-collapse-button" title="收起全部分支" aria-label="收起全部分支" onClick={() => { setKeyword(""); setExpanded(new Set()); }}><ChevronsDownUp size={16} /></button></div>}
      <div className="spg-core-toolbar">
        <div><b>{focusNode ? focusNode.name : `${config.label}列表`}</b><span>共 {rows.length} 条{focusNode ? "直接下级" : ""}</span></div>
        <label className="ontology-search"><Search size={15} /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={`搜索${config.label}名称、编码或定义`} /></label><button type="button" className="tree-collapse-button" title="收起全部分支" aria-label="收起全部分支" onClick={() => { setKeyword(""); setExpanded(new Set()); }}><ChevronsDownUp size={16} /></button>
      </div>
      {loading ? <div className="ontology-loading">正在读取核心元素...</div> : <SpgCoreTreeTable active={active} rows={visible} labels={labels} expanded={searchQuery ? new Set([...searchExpanded].filter((id) => !searchCollapsed.has(id))) : expanded} toggle={toggle} childrenFor={childrenFor} edit={(kind, row) => setModal({ kind, value: row })} addChild={openChild} remove={remove} editable={editable} cloneNamespace={cloneNamespace} pathFor={pathFor} focusBranch={focusBranch} />}
      <Pagination page={currentPage} total={rows.length} totalPages={totalPages} pageSize={pageSize} setPage={setPage} />
    </section>
    {modal?.anchor && <div className="mask"><div className="modal ns-modal" role="dialog" aria-modal="true" aria-label={`选择${labels[active]}主体`}><div className="modal-title"><h2>选择{labels[active]}主体</h2><button aria-label="关闭" onClick={() => setModal(null)}><X size={18} /></button></div><div className="ns-anchor-options">{anchorOptions.map((row) => <button key={row.id} onClick={() => openChild(row, row.kind, active)}><span><b>{row.name}</b><small>{labels[row.kind]} · {namespaceName(row.namespaceId)} · {row.code}</small></span><ChevronRight size={16} /></button>)}</div></div></div>}
    {modal && !modal.anchor && <SpgCoreElementForm kind={modal.kind} initial={modal.value} model={{ ...versionModel, namespaces: draftNamespaces }} rowMap={rowMap} labels={labels} close={() => setModal(null)} save={(value) => save(modal.kind, value)} />}
  </div>;
}

function SpgCoreTreeTable({ active, rows, labels, expanded, toggle, childrenFor, edit, addChild, remove, editable, cloneNamespace, pathFor, focusBranch }) {
  const summary = (kind, row) => kind === "namespaces" ? row.uri || "—" : kind === "properties" ? (row.dataType || row.valueType || "STRING") + " · " + (row.cardinality || (row.required ? "1" : "0..1")) : kind === "constraints" ? (row.constraintType || "—") + (row.value ? " · " + row.value : "") : kind === "rules" ? row.action || row.expression || "—" : kind === "relations" ? (row.predicateCode || row.code || "predicate") + " · " + (row.sourceCardinality || "0..N") + " → " + (row.targetCardinality || "0..N") : row.hypernymPredicate ? "上位谓词：" + row.hypernymPredicate : row.description || "—";
  if (!rows.length) return <div className="ontology-empty large">未找到符合条件的{labels[active]}</div>;
  return <div className="spg-core-table">
    <div className="spg-core-row spg-core-head spg-recursive-row"><span>元素</span><span>元素类型</span><span>描述</span><span>定义信息</span><span>子元素</span><span>更新时间</span><span>操作</span></div>
    {rows.map((row) => <SpgCoreTreeNode key={row.id} row={{ ...row, kind: row.kind || active }} depth={0} labels={labels} expanded={expanded} toggle={toggle} childrenFor={childrenFor} summary={summary} edit={edit} addChild={addChild} remove={remove} editable={editable} cloneNamespace={cloneNamespace} pathFor={pathFor} focusBranch={focusBranch} />)}
  </div>;
}

function SpgCoreTreeNode({ row, depth, labels, expanded, toggle, childrenFor, summary, edit, addChild, remove, editable, cloneNamespace, pathFor, focusBranch }) {
  const kind = row.kind;
  const children = childrenFor(row, kind);
  const childKinds = SPG_CHILD_KINDS[kind] || [];
  const canExpand = children.length > 0 || childKinds.length > 0;
  const isOpen = expanded.has(row.id);
  const canEdit = editable(row);
  const path = pathFor(row);
  const pathLabel = path.map((item) => item.name).join(" / ");
  return <div className="spg-recursive-node">
    <div className={`spg-core-row spg-recursive-row${depth ? " is-child" : ""}`} style={{ "--tree-indent": `${Math.min(depth, 3) * 18}px` }} data-depth={path.length}>
      <span className="spg-core-name"><button className="tree-toggle" disabled={!canExpand} onClick={() => toggle(row.id)} aria-label={isOpen ? "折叠" + row.name : "展开" + row.name} aria-expanded={canExpand ? isOpen : undefined}>{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button><span title={pathLabel}><b>{row.name}</b><small className="mono">{row.code || row.id}</small><small className="spg-row-governance">{path.length > 4 && <i className="tree-depth-badge">L{path.length}</i>}<i className={"scope " + String(row.scope || "NAMESPACE").toLowerCase()}>{(row.scope || "NAMESPACE") === "NAMESPACE" ? "本体级" : row.scope}</i>{row.isNative && <i className="native">SYSTEM</i>}<i className={"state " + normalizeSpgStatus(row.status).toLowerCase()}>{SPG_STATUS_META[normalizeSpgStatus(row.status)]?.label || "草稿"}</i></small></span>{children.length > 0 && <button className="tree-focus-button" type="button" title={`聚焦${row.name}分支`} aria-label={`聚焦${row.name}分支`} onClick={() => focusBranch(row)}><Focus size={14} /></button>}</span>
      <span><em className={`spg-element-kind ${kind}`}>{labels[kind]}</em></span>
      <span className="spg-tree-description" title={row.description || "暂无描述"}>{row.description || "暂无描述"}</span>
      <span className="spg-core-definition" title={summary(kind, row)}>{summary(kind, row)}</span>
      <span><em className="child-count">{children.length}</em></span>
      <span>{formatTime(row.updatedAt)}</span>
      <span className="row-actions">{kind === "namespaces" && <button title="创建新镜像" aria-label={`创建${row.name}新镜像`} onClick={() => cloneNamespace(row)}><Copy size={14} /></button>}{canEdit && <><button title={`编辑${labels[kind]}`} onClick={() => edit(kind, row)}><Pencil size={14} /></button><button className="danger" title={`删除${labels[kind]}`} onClick={() => remove(kind, row)}><Trash2 size={14} /></button></>}{!canEdit && <span title="已发布或归档，请在命名空间列表创建新镜像后修改">只读</span>}</span>
    </div>
    {isOpen && <div className="spg-recursive-children">
      {canEdit && childKinds.length > 0 && <div className="spg-tree-create-row" style={{ "--tree-indent": `${Math.min(depth + 1, 3) * 18}px` }}><span title={row.name}>在“{row.name}”下新建</span>{childKinds.map((childKind) => <button type="button" key={childKind} onClick={() => addChild(row, kind, childKind)}><Plus size={13} />{labels[childKind]}</button>)}</div>}
      {children.length ? children.map((child) => <SpgCoreTreeNode key={child.id} row={child} depth={depth + 1} labels={labels} expanded={expanded} toggle={toggle} childrenFor={childrenFor} summary={summary} edit={edit} addChild={addChild} remove={remove} editable={editable} cloneNamespace={cloneNamespace} pathFor={pathFor} focusBranch={focusBranch} />) : <div className="spg-tree-empty" style={{ "--tree-indent": `${Math.min(depth + 1, 3) * 18}px` }}>暂无子元素</div>}
    </div>}
  </div>;
}

function SpgCoreElementForm({ kind, initial, model, rowMap, labels, close, save, busy = false }) {
  const defaults = { name: "", code: "", description: "", namespaceId: "", parentId: "", parentKind: "", uri: "", dataType: "STRING", constraintType: "NOT_NULL", value: "", expression: "", targetTypeId: "", targetType: "", hypernymPredicate: "isA", scope: "NAMESPACE", isNative: false, status: "DRAFT", semanticVersion: "1.0.0", baseId: "", cardinality: "0..1", required: false, multiValue: false, predicateCode: "", predicateSemantic: "USE", sourceCardinality: "0..N", targetCardinality: "0..N", featureGroup: "", trigger: "", condition: "", action: "", constraintGroup: "" };
  const singleNamespace = model.namespaces?.length === 1;
  const initialValue = { ...defaults, ...initial, namespaceId: initial?.namespaceId || (singleNamespace ? model.namespaces[0].id : ""), hypernymPredicate: kind === "entityTypes" ? initial.hypernymPredicate || "isA" : "" };
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState("");
  const set = (key, next) => setValue((current) => ({ ...current, [key]: next }));
  const typeKinds = ["entityTypes", "conceptTypes", "eventTypes", "standardValues"];
  const allowedParentKinds = Object.entries(CHILD_KINDS).filter(([parentKind, kinds]) => kinds.includes(kind) && !(singleNamespace && parentKind === "namespaces")).map(([parentKind]) => parentKind);
  const parentOptions = allowedParentKinds.flatMap((parentKind) => (model[parentKind] || []).filter((item) => !value.namespaceId || (parentKind === "namespaces" ? item.id === value.namespaceId : item.namespaceId === value.namespaceId)).map((item) => ({ ...item, kind: parentKind })));
  const targetOptions = typeKinds.flatMap((targetKind) => (model[targetKind] || []).filter((item) => !value.namespaceId || item.namespaceId === value.namespaceId).map((item) => ({ ...item, kind: targetKind })));
  const parentLocked = Boolean(initial.parentId);
  const submit = () => {
    if (!value.name.trim() || !value.code.trim() || (kind !== "namespaces" && !value.namespaceId)) return setError("名称、编码和所属本体为必填项");
    if (["properties", "relations"].includes(kind) && !value.parentId) return setError("请选择父元素");
    if (kind === "relations" && !value.targetTypeId) return setError("请选择目标类型");
    const parent = rowMap[value.parentId];
    const target = rowMap[value.targetTypeId];
    const payload = { ...value, predicateCode: value.predicateCode || (kind === "relations" ? value.code : value.predicateCode), parentKind: value.parentKind || parent?.kind || "", targetType: target?.name || value.targetType };
    if (initial.id) save({ id: initial.id, ...Object.fromEntries(Object.entries(payload).filter(([key, next]) => next !== initialValue[key])) });
    else save(payload);
  };
  return <div className="mask"><div className="modal ontology-modal element-modal spg-core-modal workspace-form-modal"><div className="modal-title"><div><small>SPG SCHEMA 核心元素</small><h2>{initial.id ? "编辑" : "新建"}{labels[kind]}</h2></div><button onClick={close} aria-label="关闭"><X size={18} /></button></div><div className="ontology-form element-form"><div className="form-grid">
    {kind !== "namespaces" && !singleNamespace && <label className="wide-field"><span>所属本体 <b>*</b></span><select value={value.namespaceId} disabled={parentLocked} onChange={(event) => setValue((current) => ({ ...current, namespaceId: event.target.value, parentId: "", targetTypeId: "" }))}><option value="">请选择本体</option>{(model.namespaces || []).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
    <label><span>名称 <b>*</b></span><input autoFocus value={value.name} onChange={(event) => set("name", event.target.value)} placeholder={"请输入" + labels[kind] + "名称"} /></label><label><span>编码 <b>*</b></span><input value={value.code} onChange={(event) => set("code", event.target.value)} placeholder="请输入稳定业务编码" /></label>
    {kind === "namespaces" && <label className="wide-field"><span>命名空间 URI</span><input value={value.uri} onChange={(event) => set("uri", event.target.value)} placeholder="https://example.com/domain#" /></label>}
    <div className="spg-governance-fields wide-field"><label><span>应用范围</span><select value={value.scope} onChange={(event) => set("scope", event.target.value)}>{SPG_SCOPE_OPTIONS.map((item) => <option value={item} key={item}>{SPG_SCOPE_LABELS[item]}</option>)}</select></label><label><span>生命周期状态</span><select value={normalizeSpgStatus(value.status)} onChange={(event) => set("status", event.target.value)}>{Object.entries(SPG_STATUS_META).map(([key, item]) => <option value={key} key={key}>{item.label}</option>)}</select></label><label><span>语义版本</span><input value={value.semanticVersion} onChange={(event) => set("semanticVersion", event.target.value)} placeholder="1.0.0" /></label><label className="spg-check-field"><input type="checkbox" checked={Boolean(value.isNative)} onChange={(event) => set("isNative", event.target.checked)} /><span>系统内置元素</span></label></div>
    {allowedParentKinds.length > 0 && (!typeKinds.includes(kind) || kind === "entityTypes") && <label className="wide-field"><span>{["properties", "relations"].includes(kind) ? "已锚定主体" : "父元素"} {["properties", "relations"].includes(kind) && <b>*</b>}</span><select disabled={parentLocked || Boolean(initial.id)} value={value.parentId} onChange={(event) => { const parent = parentOptions.find((item) => item.id === event.target.value); setValue((current) => ({ ...current, parentId: event.target.value, parentKind: parent?.kind || "" })); }}><option value="">{typeKinds.includes(kind) ? "不设置结构继承" : kind === "constraints" || kind === "rules" ? "独立定义（不挂载）" : "请选择主体"}</option>{allowedParentKinds.map((parentKind) => <optgroup label={labels[parentKind]} key={parentKind}>{parentOptions.filter((item) => item.kind === parentKind).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>)}</select></label>}
    {kind === "entityTypes" && <label><span>上位谓词</span><input value={value.hypernymPredicate} onChange={(event) => set("hypernymPredicate", event.target.value)} placeholder="例如：isA" /></label>}
    {kind === "standardValues" && <label className="wide-field"><span>标准值</span><input value={value.value} onChange={(event) => set("value", event.target.value)} /></label>}
    {kind === "properties" && <><label><span>数据类型</span><input list="spg-data-types" value={value.dataType} onChange={(event) => set("dataType", event.target.value)} /><datalist id="spg-data-types">{["STRING", "TEXT", "INTEGER", "DECIMAL", "BOOLEAN", "DATETIME", "DATE", "TIME", ...targetOptions.map((item) => item.name)].map((item) => <option key={item} value={item} />)}</datalist></label><label><span>取值基数</span><select value={value.cardinality} onChange={(event) => set("cardinality", event.target.value)}>{["0..1", "1", "0..N", "1..N"].map((item) => <option key={item}>{item}</option>)}</select></label><div className="spg-inline-checks wide-field"><label><input type="checkbox" checked={Boolean(value.required)} onChange={(event) => set("required", event.target.checked)} />必填（NOT_NULL）</label><label><input type="checkbox" checked={Boolean(value.multiValue)} onChange={(event) => set("multiValue", event.target.checked)} />允许多值（MULTI_VALUE）</label></div></>}
    {kind === "constraints" && <><label><span>约束类型</span><select value={value.constraintType} onChange={(event) => set("constraintType", event.target.value)}>{SPG_CONSTRAINT_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>约束分组</span><input value={value.constraintGroup} onChange={(event) => set("constraintGroup", event.target.value)} placeholder="VALUE / CARDINALITY / RELATION" /></label><label className="wide-field"><span>约束值 / 参数</span><input value={value.value} onChange={(event) => set("value", event.target.value)} placeholder="枚举、范围、正则、关系路径或 DSL 参数" /></label></>}
    {kind === "rules" && <><label><span>触发事件</span><input value={value.trigger} onChange={(event) => set("trigger", event.target.value)} placeholder="如 entity.created" /></label><label><span>执行动作</span><input value={value.action} onChange={(event) => set("action", event.target.value)} placeholder="生成关系 / 更新属性 / 触发事件" /></label><label className="wide-field"><span>判定条件 / KGDSL</span><textarea value={value.condition || value.expression} onChange={(event) => { const next = event.target.value; setValue((current) => ({ ...current, condition: next, expression: next })); }} placeholder="满足什么结构与条件时执行动作" /></label></>}
    {kind === "relations" && <><label className="wide-field"><span>目标类型 <b>*</b></span><select value={value.targetTypeId} onChange={(event) => set("targetTypeId", event.target.value)}><option value="">请选择目标类型</option>{typeKinds.map((targetKind) => <optgroup label={labels[targetKind]} key={targetKind}>{targetOptions.filter((item) => item.kind === targetKind).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>)}</select></label><label><span>关系谓词</span><input value={value.predicateCode} onChange={(event) => set("predicateCode", event.target.value)} placeholder="如 hasSubject / leadTo" /></label><label><span>谓词语义</span><select value={value.predicateSemantic} onChange={(event) => set("predicateSemantic", event.target.value)}>{SPG_PREDICATE_SEMANTICS.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Domain 出边基数</span><select value={value.sourceCardinality} onChange={(event) => set("sourceCardinality", event.target.value)}>{["0..1", "1", "0..N", "1..N"].map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Range 入边基数</span><select value={value.targetCardinality} onChange={(event) => set("targetCardinality", event.target.value)}>{["0..1", "1", "0..N", "1..N"].map((item) => <option key={item}>{item}</option>)}</select></label><label className="wide-field"><span>关系槽分组</span><input value={value.featureGroup} onChange={(event) => set("featureGroup", event.target.value)} placeholder="SUBJECT / OBJECT / TIME / LOCATION" /></label></>}
    <label className="wide-field"><span>业务描述</span><textarea value={value.description} onChange={(event) => set("description", event.target.value)} placeholder={`请输入${labels[kind]}的业务描述`} /></label>
  </div>{error && <div className="element-form-error">{error}</div>}</div><div className="modal-foot"><button disabled={busy} onClick={close}>取消</button><button className="primary" disabled={busy} onClick={submit}>{busy ? "保存中..." : `保存${labels[kind]}`}</button></div></div></div>;
}


/* ------------------------------------------------------------------ */
/* SPG Schema · 智能抽取 / 本体验证 / 本体模型                            */
/* ------------------------------------------------------------------ */

const SEVERITY_META = {
  high: { label: "高", tone: "danger" },
  medium: { label: "中", tone: "warn" },
  low: { label: "低", tone: "info" },
};

function useSpgCoreModel(note, selectedVersionId, onVersionChange, ontology) {
  const empty = { versions: [], namespaces: [], entityTypes: [], conceptTypes: [], eventTypes: [], properties: [], constraints: [], rules: [], relations: [] };
  const [model, setModel] = useState(empty);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      const next = scopeOntology(await modelingApi.loadCoreModel(), ontology);
      setModel(next);
      const resolved = (next.versions || []).some((item) => item.id === selectedVersionId) ? selectedVersionId : modelingApi.latestVersionId(next);
      if (resolved && resolved !== selectedVersionId) onVersionChange?.(resolved);
    } catch (error) {
      note?.(`本体模型加载失败：${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const versionId = (model.versions || []).some((item) => item.id === selectedVersionId) ? selectedVersionId : modelingApi.latestVersionId(model);
  return { model, versionId, loading, reload: load };
}

function SpgVersionSwitcher({ model, versionId, onChange, disabled }) {
  const versions = [...(model.versions || [])].sort((left, right) => {
    if (left.isLatest !== right.isLatest) return left.isLatest ? -1 : 1;
    return new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
  });
  const current = versions.find((item) => item.id === versionId);
  return (
    <label className="spg-version-switcher">
      <span>本体版本{current?.isLatest && <em>最新</em>}</span>
      <select aria-label="切换本体版本" value={versionId} onChange={(event) => onChange(event.target.value)} disabled={disabled || !versions.length}>
        {!versions.length && <option value="">正在读取版本</option>}
        {versions.map((version) => <option value={version.id} key={version.id}>{version.name}{version.isLatest ? "（最新）" : ""}</option>)}
      </select>
    </label>
  );
}

function SpgExtractionPage({ sourceType, note, selectedVersionId, onVersionChange }) {
  const config = modelingApi.EXTRACTION_SOURCE_TYPES.find((item) => item.id === sourceType) || modelingApi.EXTRACTION_SOURCE_TYPES[0];
  const { model, versionId, loading, reload } = useSpgCoreModel(note, selectedVersionId, onVersionChange);
  const [filename, setFilename] = useState(config.filename);
  const [domain, setDomain] = useState("");
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState("");
  const [runs, setRuns] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [namespaceId, setNamespaceId] = useState("");
  const fileRef = useRef(null);
  const namespaces = (model.namespaces || []).filter((row) => !versionId || row.versionId === versionId);
  const activeNamespace = namespaces.some((item) => item.id === namespaceId) ? namespaceId : namespaces[0]?.id || "";

  const loadRuns = async () => {
    try { setRuns(await modelingApi.listExtractionRuns()); } catch { /* 忽略 */ }
  };
  useEffect(() => { loadRuns(); }, []);

  const runPreview = async () => {
    setBusy("preview");
    try {
      const next = await modelingApi.previewExtraction({ sourceType, content, filename, domain });
      setPreview(next);
      setSelected(new Set(next.candidates.map((_, index) => index)));
      if (next.errors?.length) note(next.errors[0]);
      else note(`抽取完成，识别到 ${next.totalCandidates} 个候选元素`);
    } catch (error) {
      note(`抽取失败：${error.message}`);
    } finally {
      setBusy("");
    }
  };
  const commit = async () => {
    if (!preview) return;
    const candidates = preview.candidates.filter((_, index) => selected.has(index));
    if (!candidates.length) { note("请先勾选需要入库的候选元素"); return; }
    if (!activeNamespace) { note("当前版本没有可用命名空间，请先到「本体建模」创建命名空间"); return; }
    setBusy("commit");
    try {
      const outcome = await modelingApi.commitExtraction({ sourceType, filename: preview.filename, candidates, versionId, namespaceId: activeNamespace });
      await reload();
      await loadRuns();
      setPreview(null);
      note(`已入库 ${outcome.created.length} 个元素${outcome.failures.length ? `，${outcome.failures.length} 个失败` : ""}`);
    } catch (error) {
      note(`入库失败：${error.message}`);
    } finally {
      setBusy("");
    }
  };
  const pickFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setContent(text);
    setFilename(file.name);
    note(`已读取文件 ${file.name}`);
    event.target.value = "";
  };
  const toggle = (index) => setSelected((current) => {
    const next = new Set(current);
    next.has(index) ? next.delete(index) : next.add(index);
    return next;
  });
  const visible = (preview?.candidates || []).map((item, index) => ({ item, index })).filter(({ item }) => [item.label, item.element_type, item.definition, item.evidence].join(" ").toLowerCase().includes(keyword.toLowerCase()));
  const byType = preview?.byType || {};
  const highCount = (preview?.candidates || []).filter((item) => item.confidence >= 0.8).length;

  return <div className="spg-core-workspace">
    <div className="spg-core-heading">
      <div>
        <span className="eyebrow">SPG SCHEMA 智能抽取</span>
        <h1>{config.label}</h1>
        <p>{config.summary}</p>
      </div>
      <div className="spg-core-heading-actions">
        <SpgVersionSwitcher model={model} versionId={versionId} onChange={onVersionChange} disabled={loading} />
      </div>
    </div>

    <div className="extraction-layout">
      <section className="card extraction-panel">
        <div className="card-head">
          <div><h2>抽取来源</h2><small>粘贴内容或直接上传文件，系统会按来源类型解析本体要素</small></div>
        </div>
        <div className="extraction-form">
          <label><span>来源文件名</span><input value={filename} onChange={(event) => setFilename(event.target.value)} placeholder="engine_schema.sql" /></label>
          <label><span>领域 / 专业（可为空）</span><input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="如：动力系统" /></label>
          <label className="wide"><span>{config.label}内容</span>
            <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder={config.placeholder} spellCheck={false} />
          </label>
          <div className="extraction-actions">
            <button type="button" className="plain-action" onClick={() => { setContent(config.sample); setFilename(config.filename); }}><Wand2 size={14} />填入示例</button>
            <button type="button" className="plain-action" onClick={() => fileRef.current?.click()}><Upload size={14} />上传文件</button>
            <input ref={fileRef} type="file" accept=".sql,.json,.csv,.txt,.md,.docx" hidden onChange={pickFile} />
          </div>
          <div className="extraction-actions">
            <button type="button" className="primary" disabled={!!busy || !content.trim()} onClick={runPreview}>
              <Sparkles size={15} />{busy === "preview" ? "抽取中..." : "抽取预览"}
            </button>
            <button type="button" className="plain-action" onClick={() => { setPreview(null); setContent(""); }}>重置</button>
          </div>
          <p className="extraction-hint">抽取结果不会直接写入本体，需要人工勾选确认后入库；入库元素会带 <code>origin=extraction</code> 标记。</p>
        </div>
      </section>

      <section className="card extraction-panel">
        <div className="card-head">
          <div><h2>候选元素</h2><small>{preview ? `共 ${preview.totalCandidates} 个候选 · 高置信 ${highCount} 个` : "运行抽取预览后在这里确认候选"}</small></div>
          {preview && <div className="row-actions">
            <button type="button" onClick={() => setSelected(new Set(preview.candidates.map((_, index) => index)))}>全选</button>
            <button type="button" onClick={() => setSelected(new Set())}>清空</button>
          </div>}
        </div>
        {preview && <div className="extraction-summary">
          {Object.entries(byType).map(([kind, count]) => <span key={kind}><em className={`spg-element-kind ${kind}`}>{modelingApi.ELEMENT_KIND_LABELS[kind] || kind}</em><b>{count}</b></span>)}
          <span className="extraction-summary-total">已选 <b>{selected.size}</b></span>
          <label className="extraction-target">
            <span>入库命名空间</span>
            <select value={activeNamespace} onChange={(event) => setNamespaceId(event.target.value)}>
              {!namespaces.length && <option value="">无可用命名空间</option>}
              {namespaces.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>}
        {!preview && <div className="ontology-empty large">尚未执行抽取。先在左侧填写或上传内容，然后点击「抽取预览」。</div>}
        {preview && <>
          <div className="extraction-table">
            <div className="extraction-row extraction-head"><span /><span>元素类型</span><span>候选名称</span><span>定义 / 证据</span><span>置信度</span></div>
            {visible.map(({ item, index }) => <div className={`extraction-row${selected.has(index) ? " chosen" : ""}`} key={`${item.element_type}-${item.id}-${index}`}>
              <span><input type="checkbox" checked={selected.has(index)} onChange={() => toggle(index)} aria-label={`选择${item.label}`} /></span>
              <span><em className={`spg-element-kind ${item.element_type}`}>{modelingApi.ELEMENT_KIND_LABELS[item.element_type] || item.element_type}</em></span>
              <span className="extraction-candidate-name"><b>{item.label}</b><small className="mono">{item.id}</small></span>
              <span className="extraction-evidence" title={item.definition || item.evidence}>{item.definition || item.evidence || "—"}</span>
              <span>
                <i className={`confidence-bar ${modelingApi.confidenceLevel(item.confidence)}`}><b style={{ width: `${Math.round(item.confidence * 100)}%` }} /></i>
                <em className="confidence">{Math.round(item.confidence * 100)}% · {modelingApi.confidenceText(item.confidence)}</em>
              </span>
            </div>)}
            {!visible.length && <div className="ontology-empty">没有匹配的候选元素</div>}
          </div>
          <div className="extraction-foot">
            <label className="ontology-search"><Search size={15} /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="筛选候选名称、类型或证据" /></label>
            <button type="button" className="primary" disabled={!!busy || !selected.size} onClick={commit}>
              <Check size={15} />{busy === "commit" ? "入库中..." : `确认入库（${selected.size}）`}
            </button>
          </div>
        </>}
      </section>
    </div>

    <section className="card extraction-panel">
      <div className="card-head"><div><h2>抽取批次记录</h2><small>保留最近 20 条入库批次</small></div></div>
      {!runs.length ? <div className="ontology-empty">暂无抽取批次</div> : <div className="run-table">
        <div className="run-row run-head"><span>批次</span><span>来源类型</span><span>文件</span><span>入库数量</span><span>失败</span><span>时间</span></div>
        {runs.map((run) => <div className="run-row" key={run.id}>
          <span className="mono">{run.id}</span>
          <span>{run.sourceType === "structured" ? "结构化" : run.sourceType === "semistructured" ? "半结构化" : "非结构化"}</span>
          <span>{run.filename}</span>
          <span><b>{run.createdCount}</b></span>
          <span>{run.failedCount}</span>
          <span>{formatTime(run.createdAt)}</span>
        </div>)}
      </div>}
    </section>
  </div>;
}

function SpgValidationPage({ mode, note, selectedVersionId, onVersionChange }) {
  const { model, versionId, loading, reload } = useSpgCoreModel(note, selectedVersionId, onVersionChange);
  const [result, setResult] = useState(null);
  const [runs, setRuns] = useState([]);
  const [dispositions, setDispositions] = useState({});
  const [busy, setBusy] = useState(false);
  const [severity, setSeverity] = useState("");
  const [issueType, setIssueType] = useState("");
  const [keyword, setKeyword] = useState("");
  const [ruleKeyword, setRuleKeyword] = useState("");
  const [disposeTarget, setDisposeTarget] = useState(null);

  const loadMeta = async () => {
    try {
      const [nextRuns, nextDispositions, last] = await Promise.all([modelingApi.listValidationRuns(), modelingApi.listDispositions(), modelingApi.loadLastValidation()]);
      setRuns(nextRuns);
      setDispositions(nextDispositions);
      setResult((current) => current || last);
    } catch { /* 忽略 */ }
  };
  useEffect(() => { loadMeta(); }, []);

  const run = async (trigger = "manual") => {
    setBusy(true);
    try {
      const next = await modelingApi.runValidationAndRecord(model, versionId, trigger);
      setResult(next);
      setRuns(await modelingApi.listValidationRuns());
      note(next.issueCount ? `验证完成，发现 ${next.issueCount} 个问题` : "验证通过，未发现问题");
    } catch (error) {
      note(`验证失败：${error.message}`);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!loading && versionId && !result && !busy) run("auto");
  }, [loading, versionId]);

  const issues = result ? modelingApi.applyDispositions(result.issues || [], dispositions) : [];
  const openIssues = issues.filter((item) => item.status === "open");
  const counts = { high: 0, medium: 0, low: 0 };
  openIssues.forEach((item) => { counts[item.severity] = (counts[item.severity] || 0) + 1; });
  const issueTypes = [...new Set(modelingApi.VALIDATION_RULES.map((item) => item.issueType))];
  const filteredIssues = openIssues.filter((item) => (!severity || item.severity === severity) && (!issueType || item.issueType === issueType) && [item.ruleId, item.ruleName, item.elementLabel, item.reason].join(" ").toLowerCase().includes(keyword.toLowerCase()));
  const rules = modelingApi.VALIDATION_RULES.filter((item) => (!issueType || item.issueType === issueType) && [item.ruleId, item.ruleName, item.ruleDescription].join(" ").toLowerCase().includes(ruleKeyword.toLowerCase()));
  const hitByRule = issues.reduce((acc, item) => ({ ...acc, [item.ruleId]: (acc[item.ruleId] || 0) + 1 }), {});

  const submitDispose = async ({ method, result: disposeResult, operator }) => {
    try {
      const saved = await modelingApi.disposeIssue(disposeTarget, { method, result: disposeResult, operator });
      setDispositions((current) => ({ ...current, [disposeTarget.issueId]: saved }));
      setDisposeTarget(null);
      note("处置结果已记录");
    } catch (error) {
      note(`处置失败：${error.message}`);
    }
  };

  return <div className="spg-core-workspace">
    <div className="spg-core-heading">
      <div>
        <span className="eyebrow">SPG SCHEMA 本体验证</span>
        <h1>{mode === "issues" ? "问题处置" : "自动验证"}</h1>
        <p>用 {modelingApi.VALIDATION_RULES.length} 条预置规则对当前本体版本做一致性与完整性验证，并跟踪每一条问题的处置结果。</p>
      </div>
      <div className="spg-core-heading-actions">
        <SpgVersionSwitcher model={model} versionId={versionId} onChange={onVersionChange} disabled={loading} />
        <button type="button" className="primary" disabled={busy || loading} onClick={() => run("manual")}>
          <RefreshCw size={15} />{busy ? "验证中..." : "运行验证"}
        </button>
      </div>
    </div>

    <div className="validation-stats">
      <div className="validation-stat"><span>参与验证元素</span><b>{result?.elementCount ?? 0}</b><small>当前本体版本</small></div>
      <div className="validation-stat"><span>规则总数</span><b>{modelingApi.VALIDATION_RULES.length}</b><small>语义 / 约束 / 完整性</small></div>
      <div className="validation-stat danger"><span>高严重问题</span><b>{counts.high}</b><small>需优先处理</small></div>
      <div className="validation-stat warn"><span>中严重问题</span><b>{counts.medium}</b><small>建议本轮处理</small></div>
      <div className="validation-stat info"><span>低严重问题</span><b>{counts.low}</b><small>可延后处理</small></div>
    </div>

    {mode === "auto" ? <section className="card validation-panel">
      <div className="card-head">
        <div><h2>规则库</h2><small>{rules.length} / {modelingApi.VALIDATION_RULES.length} 条规则{result ? ` · 最近验证于 ${formatTime(result.createdAt)}` : ""}</small></div>
        <label className="ontology-search"><Search size={15} /><input value={ruleKeyword} onChange={(event) => setRuleKeyword(event.target.value)} placeholder="搜索规则编号、名称或说明" /></label>
      </div>
      <div className="validation-rule-table">
        <div className="validation-rule-row validation-rule-head"><span>规则</span><span>规则名称</span><span>问题类型</span><span>默认级别</span><span>本轮命中</span><span>规则说明</span></div>
        {rules.map((rule) => <div className="validation-rule-row" key={rule.ruleId}>
          <span className="mono">{rule.ruleId}</span>
          <span><b>{rule.ruleName}</b></span>
          <span><em className="issue-type">{rule.issueType}</em></span>
          <span><i className={`severity-badge ${SEVERITY_META[rule.severity].tone}`}>{SEVERITY_META[rule.severity].label}</i></span>
          <span>{(hitByRule[rule.ruleId] || 0) > 0 ? <b className="hit">{hitByRule[rule.ruleId]}</b> : <i className="no-hit">0</i>}</span>
          <span className="rule-description" title={rule.ruleDescription}>{rule.ruleDescription}</span>
        </div>)}
        {!rules.length && <div className="ontology-empty">没有符合条件的规则</div>}
      </div>
    </section> : <section className="card validation-panel">
      <div className="card-head">
        <div><h2>待处理问题</h2><small>共 {openIssues.length} 条待处置，已处置 {issues.length - openIssues.length} 条</small></div>
        <div className="validation-filters">
          <label className="ontology-search"><Search size={15} /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索元素、规则或原因" /></label>
          <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
            <option value="">全部级别</option><option value="high">高</option><option value="medium">中</option><option value="low">低</option>
          </select>
          <select value={issueType} onChange={(event) => setIssueType(event.target.value)}>
            <option value="">全部类型</option>{issueTypes.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </div>
      </div>
      <div className="validation-issue-table">
        <div className="validation-issue-row validation-issue-head"><span>级别</span><span>规则</span><span>元素</span><span>问题原因</span><span>修复建议</span><span>操作</span></div>
        {filteredIssues.map((issue) => <div className="validation-issue-row" key={issue.issueId}>
          <span><i className={`severity-badge ${SEVERITY_META[issue.severity].tone}`}>{SEVERITY_META[issue.severity].label}</i></span>
          <span><b className="mono">{issue.ruleId}</b><small>{issue.ruleName}</small></span>
          <span><b>{issue.elementLabel}</b><small>{issue.elementTypeLabel} · {issue.elementType}</small></span>
          <span className="issue-reason" title={issue.reason}>{issue.reason}</span>
          <span className="issue-suggestion" title={issue.repairSuggestion?.result}>{issue.repairSuggestion?.method}</span>
          <span><button type="button" onClick={() => setDisposeTarget(issue)}>处置</button></span>
        </div>)}
        {!filteredIssues.length && <div className="ontology-empty">{result ? "没有符合筛选条件的问题，或当前本体已全部通过验证" : "尚未运行验证"}</div>}
      </div>
    </section>}

    <section className="card validation-panel">
      <div className="card-head"><div><h2>验证记录</h2><small>保留最近 30 次验证运行</small></div></div>
      {!runs.length ? <div className="ontology-empty">暂无验证记录</div> : <div className="run-table">
        <div className="run-row run-head"><span>运行编号</span><span>触发方式</span><span>元素数</span><span>问题数</span><span>高/中/低</span><span>结论</span><span>时间</span></div>
        {runs.map((run) => <div className="run-row" key={run.id}>
          <span className="mono">{run.id}</span>
          <span>{run.trigger === "auto" ? "进入页面自动" : "手动运行"}</span>
          <span>{run.elementCount}</span>
          <span><b>{run.issueCount}</b></span>
          <span>{run.severityCounts?.high || 0} / {run.severityCounts?.medium || 0} / {run.severityCounts?.low || 0}</span>
          <span><i className={`run-status ${run.status}`}>{run.status === "passed" ? "通过" : "待处理"}</i></span>
          <span>{formatTime(run.createdAt)}</span>
        </div>)}
      </div>}
    </section>

    {disposeTarget && <DisposeIssueModal issue={disposeTarget} close={() => setDisposeTarget(null)} submit={submitDispose} />}
  </div>;
}

function DisposeIssueModal({ issue, close, submit }) {
  const [method, setMethod] = useState(issue.repairSuggestion?.method || "人工复核");
  const [result, setResult] = useState(issue.repairSuggestion?.result || "");
  const [operator, setOperator] = useState(issue.repairSuggestion?.operatorRole || "本体建模人员");
  return <div className="mask">
    <div className="modal dispose-modal workspace-form-modal">
      <div className="modal-title">
        <div><small>{issue.ruleId} · {issue.issueType}</small><h2>问题处置</h2></div>
        <button type="button" onClick={close} aria-label="关闭"><X size={18} /></button>
      </div>
      <div className="dispose-body">
        <div className="dispose-summary">
          <span>问题元素</span><b>{issue.elementLabel}</b>
          <span>元素类型</span><b>{issue.elementTypeLabel}</b>
          <span>问题原因</span><b>{issue.reason}</b>
          <span>智能修复建议</span><b>{issue.repairSuggestion?.result || "—"}</b>
        </div>
        <label><span>处置方式</span>
          <select value={method} onChange={(event) => setMethod(event.target.value)}>
            <option value="采纳建议">采纳建议</option><option value="人工修正">人工修正</option><option value="忽略">忽略</option><option value="人工复核">人工复核</option>
          </select>
        </label>
        <label><span>处置结果说明</span><textarea value={result} onChange={(event) => setResult(event.target.value)} placeholder="记录本次处置做了什么" /></label>
        <label><span>处置角色</span><input value={operator} onChange={(event) => setOperator(event.target.value)} /></label>
      </div>
      <div className="modal-foot">
        <button type="button" onClick={close}>取消</button>
        <button type="button" className="primary" onClick={() => submit({ method, result, operator })}>保存处置</button>
      </div>
    </div>
  </div>;
}

const GRAPH_RINGS = { namespaces: 0, entityTypes: 1, conceptTypes: 1, eventTypes: 1, properties: 2, relations: 2, constraints: 3, rules: 3 };
const GRAPH_MIN_RADIUS = { 0: 0, 1: 170, 2: 285, 3: 400 };
const ARC_PER_NODE = 82; // 每节点至少占 82px 弧长，防止标签重叠
const GRAPH_PADDING = 96; // 视口留白，保证标签与箭头不被裁切

/**
 * 同心环布局：命名空间居中，实体/概念/事件次环，属性/关系再次环，约束/规则最外环。
 * 关键点是「先算相对坐标 → 按内容包围盒居中 → 再换算画布尺寸」，
 * 这样返回的 width/height 始终紧贴图形，配合 preserveAspectRatio 实现自适应铺满视口。
 */
function layoutGraph(nodes, visibleKinds) {
  const groups = {};
  nodes.filter((node) => visibleKinds[node.kind]).forEach((node) => {
    const ring = GRAPH_RINGS[node.kind] ?? 2;
    (groups[ring] = groups[ring] || []).push(node);
  });
  // 同一命名空间的元素排在一起，减少跨环交叉和长距离连线
  Object.values(groups).forEach((list) => list.sort((a, b) =>
    String(a.namespaceId || "").localeCompare(String(b.namespaceId || "")) ||
    String(a.kind || "").localeCompare(String(b.kind || "")) ||
    String(a.name || a.id || "").localeCompare(String(b.name || b.id || ""), "zh-Hans-CN")));

  const positions = {};
  Object.entries(groups).forEach(([ring, list]) => {
    const index = Number(ring);
    const minR = GRAPH_MIN_RADIUS[index] ?? 200;
    const needed = (list.length * ARC_PER_NODE) / (2 * Math.PI);
    const radius = index === 0 ? 0 : Math.max(minR, needed);
    if (!radius) {
      list.forEach((node, i) => { positions[node.id] = { x: (i - (list.length - 1) / 2) * 190, y: 0 }; });
      return;
    }
    // 每层起始角错开，避免相邻层的节点与连线完全重叠
    const start = index === 1 ? -Math.PI / 2 : Math.PI / 7 + (index - 2) * 0.26;
    list.forEach((node, i) => {
      const angle = start + (i / Math.max(list.length, 1)) * Math.PI * 2;
      positions[node.id] = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    });
  });

  const points = Object.values(positions);
  if (!points.length) return { positions: {}, width: 720, height: 460 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const width = Math.max(720, maxX - minX + GRAPH_PADDING * 2);
  const height = Math.max(460, maxY - minY + GRAPH_PADDING * 2 + 40);
  Object.entries(positions).forEach(([id, point]) => {
    positions[id] = { x: point.x - centerX + width / 2, y: point.y - centerY + height / 2 + 12 };
  });
  return { positions, width, height };
}

/**
 * 生成边的二次贝塞尔路径：控制点向画布中心弯曲，避免长边穿过节点。
 * 端点按节点半径回缩，箭头才不会被节点圆点盖住，也避免出现"线悬空"的错觉。
 */
function edgeGeometry(from, to, width, height) {
  const NODE_RADIUS = 15;
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const qx = (mx + width / 2) / 2;
  const qy = (my + height / 2) / 2;
  const sd = Math.hypot(qx - from.x, qy - from.y) || 1;
  const sx = from.x + ((qx - from.x) / sd) * NODE_RADIUS;
  const sy = from.y + ((qy - from.y) / sd) * NODE_RADIUS;
  const td = Math.hypot(to.x - qx, to.y - qy) || 1;
  const ex = to.x - ((to.x - qx) / td) * (NODE_RADIUS + 5);
  const ey = to.y - ((to.y - qy) / td) * (NODE_RADIUS + 5);
  return {
    d: `M ${sx} ${sy} Q ${qx} ${qy} ${ex} ${ey}`,
    lx: 0.25 * sx + 0.5 * qx + 0.25 * ex,
    ly: 0.25 * sy + 0.5 * qy + 0.25 * ey,
  };
}

function SpgModelPage({ mode, note, selectedVersionId, onVersionChange, ontology }) {
  const { model, versionId, loading, reload } = useSpgCoreModel(note, selectedVersionId, onVersionChange, ontology);
  const [visibleKinds, setVisibleKinds] = useState(() => Object.fromEntries(Object.keys(modelingApi.GRAPH_KIND_META).map((kind) => [kind, true])));
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [focusId, setFocusId] = useState("");
  const [query, setQuery] = useState("");
  const [showLabels, setShowLabels] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [importText, setImportText] = useState("");
  const [busy, setBusy] = useState("");
  const importRef = useRef(null);
  const wrapRef = useRef(null);
  const panRef = useRef(null);

  const graph = useMemo(() => modelingApi.buildGraph(model, versionId), [model, versionId]);
  const { positions, width, height } = useMemo(() => layoutGraph(graph.nodes, visibleKinds), [graph.nodes, visibleKinds]);
  const visibleNodes = graph.nodes.filter((node) => visibleKinds[node.kind]);
  const visibleEdges = graph.edges.filter((edge) => positions[edge.source] && positions[edge.target]);
  const orphanNodes = graph.diagnostics.isolatedNodes.filter((node) => visibleKinds[node.kind]);
  const brokenNodes = graph.diagnostics.invalidReferences;
  const matchedNodes = query.trim()
    ? visibleNodes.filter((node) => `${node.displayName || ""}${node.name || ""}${node.code || ""}${node.id}`.toLowerCase().includes(query.trim().toLowerCase()))
    : [];
  // 只有真正命中时才弱化其他节点，避免"零结果"把整张图压暗
  const searchActive = !!query.trim() && matchedNodes.length > 0;
  // 图谱交互仅由点击选中驱动；悬停效果交给 CSS，避免鼠标移动时触发 React 重渲染。
  const focusNode = graph.nodes.find((node) => node.id === focusId) || null;
  const focusEdges = focusNode ? visibleEdges.filter((edge) => edge.source === focusNode.id || edge.target === focusNode.id) : [];
  const detailNode = focusNode;

  // 视口尺寸跟随容器变化，保证缩放与适配基于真实可用空间计算
  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return undefined;
    const sync = () => setBox({ w: element.clientWidth, h: element.clientHeight });
    sync();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(sync);
    observer.observe(element);
    return () => observer.disconnect();
  }, [loading, mode]);

  // baseScale 让整图默认铺满视口（等价 fitView），zoom/pan 只在此基础上叠加
  const baseScale = box.w && box.h ? Math.min(box.w / width, box.h / height) : 1;
  const scale = baseScale * view.zoom;
  const offset = {
    x: (box.w - width * scale) / 2 + view.x,
    y: (box.h - height * scale) / 2 + view.y,
  };

  const viewportRef = useRef(null);
  viewportRef.current = { box, width, height, view };

  // 以光标位置为锚点缩放，避免滚轮缩放时图形跑出视口
  const zoomAtPoint = (px, py, factor) => {
    setView((current) => {
      const { box: rect, width: w, height: h } = viewportRef.current;
      const base = rect.w && rect.h ? Math.min(rect.w / w, rect.h / h) : 1;
      const nextZoom = Math.min(2.5, Math.max(0.4, +(current.zoom * factor).toFixed(3)));
      if (nextZoom === current.zoom) return current;
      const originX = (rect.w - w * base * current.zoom) / 2 + current.x;
      const originY = (rect.h - h * base * current.zoom) / 2 + current.y;
      const worldX = (px - originX) / (base * current.zoom);
      const worldY = (py - originY) / (base * current.zoom);
      const nextOriginX = px - worldX * base * nextZoom;
      const nextOriginY = py - worldY * base * nextZoom;
      return {
        zoom: nextZoom,
        x: nextOriginX - (rect.w - w * base * nextZoom) / 2,
        y: nextOriginY - (rect.h - h * base * nextZoom) / 2,
      };
    });
  };

  useEffect(() => {
    const element = wrapRef.current;
    if (!element || mode !== "visual") return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      zoomAtPoint(event.clientX - rect.left, event.clientY - rect.top, event.deltaY < 0 ? 1.12 : 1 / 1.12);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [mode, loading]);

  const resetView = () => { setView({ zoom: 1, x: 0, y: 0 }); setFocusId(""); };

  const download = (text, name, type) => {
    downloadBlob(new Blob([text], { type }), name);
    note(`已导出 ${name}`);
  };
  const doImport = async () => {
    if (!importText.trim()) { note("请先粘贴本体模板 JSON"); return; }
    setBusy("import");
    try {
      const parsed = modelingApi.parseModelTemplate(importText);
      const outcome = await modelingApi.importModelTemplate(parsed, versionId);
      await reload();
      setImportText("");
      note(`导入完成，写入 ${outcome.created} 个元素`);
    } catch (error) {
      note(`导入失败：${error.message}`);
    } finally {
      setBusy("");
    }
  };
  const pickTemplate = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportText(await file.text());
    event.target.value = "";
  };

  if (mode !== "visual") {
    return <div className="spg-core-workspace">
      <div className="spg-core-heading">
        <div>
          <span className="eyebrow">SPG SCHEMA 本体模型</span>
          <h1>导入导出</h1>
          <p>通过 Excel（CSV）、OWL 或 JSON 模板批量建模与批量导出，导出范围为当前选中的本体版本。</p>
        </div>
        <div className="spg-core-heading-actions">
          <SpgVersionSwitcher model={model} versionId={versionId} onChange={onVersionChange} disabled={loading} />
        </div>
      </div>
      <div className="io-grid">
        <section className="card io-card">
          <div className="card-head"><div><h2>批量导出</h2><small>导出当前版本 {graph.nodes.length} 个元素</small></div></div>
          <div className="io-body">
            <button type="button" className="io-action" onClick={() => download(modelingApi.exportModelCsv(model, versionId), `spg-model-${versionId || "latest"}.csv`, "text/csv;charset=utf-8")}>
              <Download size={16} /><span><b>导出 Excel（CSV）</b><small>实体、概念、事件、属性、关系、约束、规则清单</small></span>
            </button>
            <button type="button" className="io-action" onClick={() => download(modelingApi.exportModelOwl(model, versionId), `spg-model-${versionId || "latest"}.owl`, "application/rdf+xml;charset=utf-8")}>
              <Download size={16} /><span><b>导出 OWL</b><small>生成 owl:Class / DatatypeProperty / ObjectProperty</small></span>
            </button>
            <button type="button" className="io-action" onClick={() => download(modelingApi.exportModelTemplate(model, versionId), `spg-model-${versionId || "latest"}.json`, "application/json;charset=utf-8")}>
              <Download size={16} /><span><b>导出 JSON 模板</b><small>可再次导入，用于环境迁移与批量建模</small></span>
            </button>
          </div>
        </section>
        <section className="card io-card">
          <div className="card-head"><div><h2>批量导入</h2><small>支持 JSON 模板，按 ID 覆盖写入当前版本</small></div></div>
          <div className="io-body">
            <div className="io-actions-row">
              <button type="button" className="plain-action" onClick={() => importRef.current?.click()}><Upload size={14} />选择模板文件</button>
              <input ref={importRef} type="file" accept=".json" hidden onChange={pickTemplate} />
              <button type="button" className="plain-action" onClick={() => setImportText(modelingApi.exportModelTemplate(model, versionId))}><RefreshCw size={14} />填入当前版本</button>
            </div>
            <textarea className="io-textarea" value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="粘贴本体模板 JSON，格式与「导出 JSON 模板」一致" spellCheck={false} />
            <button type="button" className="primary" disabled={!!busy} onClick={doImport}>{busy === "import" ? "导入中..." : "执行导入"}</button>
          </div>
        </section>
      </div>
      <section className="card validation-panel">
        <div className="card-head"><div><h2>当前版本元素分布</h2><small>导入导出均以该快照为准</small></div></div>
        <div className="io-stats">
          {Object.entries(modelingApi.GRAPH_KIND_META).map(([kind, meta]) => <div className="io-stat" key={kind}>
            <i style={{ background: meta.color }} /><span>{meta.label}</span><b>{graph.stats[kind] || 0}</b>
          </div>)}
        </div>
      </section>
    </div>;
  }

  return <div className="spg-core-workspace">
    <div className="spg-core-heading">
      <div>
        <span className="eyebrow">SPG SCHEMA 本体模型</span>
        <h1>模型可视化</h1>
        <p>以语义网络展示当前本体版本的命名空间、实体、概念、事件、属性、关系、约束与规则，支持按类型筛选与节点钻取。</p>
      </div>
      <div className="spg-core-heading-actions">
        <SpgVersionSwitcher model={model} versionId={versionId} onChange={onVersionChange} disabled={loading} />
      </div>
    </div>

    <div className="model-graph-stats">
      {Object.entries(modelingApi.GRAPH_KIND_META).map(([kind, meta]) => <div className="graph-stat" key={kind}>
        <i style={{ background: meta.color }} /><span>{meta.label}</span><b>{graph.stats[kind] || 0}</b>
      </div>)}
      <div className="graph-stat"><i style={{ background: "#98a8bd" }} /><span>关系边</span><b>{graph.edges.length}</b></div>
    </div>

    <section className="card model-graph-card">
      <div className="card-head">
        <div>
          <h2>本体图谱</h2>
          <small>显示 {visibleNodes.length} / {graph.nodes.length} 个节点，{visibleEdges.length} / {graph.edges.length} 条关系边</small>
        </div>
        <div className="graph-toolbar">
          <label className="graph-search">
            <Search size={14} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索节点名称或编码" aria-label="搜索节点" />
            {query && <button type="button" onClick={() => setQuery("")} aria-label="清空搜索"><X size={13} /></button>}
          </label>
          <button type="button" className={`graph-toggle${showLabels ? " on" : ""}`} onClick={() => setShowLabels((value) => !value)} aria-pressed={showLabels}>关系标签</button>
          <div className="graph-zoom">
            <button type="button" onClick={() => zoomAtPoint((box.w || 0) / 2, (box.h || 0) / 2, 1 / 1.2)} aria-label="缩小"><ZoomOut size={15} /></button>
            <span>{Math.round(view.zoom * 100)}%</span>
            <button type="button" onClick={() => zoomAtPoint((box.w || 0) / 2, (box.h || 0) / 2, 1.2)} aria-label="放大"><ZoomIn size={15} /></button>
            <button type="button" onClick={resetView} aria-label="适应画布" title="适应画布"><RefreshCw size={15} /></button>
          </div>
        </div>
      </div>
      <div className="model-graph-legend">
        {Object.entries(modelingApi.GRAPH_KIND_META).map(([kind, meta]) => <button type="button" key={kind} className={visibleKinds[kind] ? "on" : ""} onClick={() => setVisibleKinds((current) => ({ ...current, [kind]: !current[kind] }))} aria-pressed={visibleKinds[kind]}>
          <i style={{ background: meta.color }} />{meta.label}<b>{graph.stats[kind] || 0}</b>
        </button>)}
        <span className="graph-legend-tip">滚轮缩放 · 拖拽平移 · 点击节点锁定详情 · 中英文名均可检索</span>
      </div>
      {query.trim() && <div className={`graph-notice${matchedNodes.length ? " ok" : ""}`}>
        {matchedNodes.length ? <>匹配到 <b>{matchedNodes.length}</b> 个节点：{matchedNodes.slice(0, 3).map((node) => node.displayName || node.name || node.id).join("、")}{matchedNodes.length > 3 ? " 等" : ""}<button type="button" onClick={() => setFocusId(matchedNodes[0].id)}>定位首个</button></> : <>未匹配到节点，请检查关键词</>}
      </div>}
      {(orphanNodes.length > 0 || brokenNodes.length > 0) && !query.trim() && <div className="graph-notice warn">
        {brokenNodes.length > 0 && <span><AlertTriangle size={13} />{brokenNodes.length} 处引用指向不存在的元素（{brokenNodes.slice(0, 2).map((item) => `${item.field}：${item.targetId}`).join("、")}{brokenNodes.length > 2 ? " 等" : ""}）</span>}
        {orphanNodes.length > 0 && <span>{orphanNodes.length} 个元素尚无连线（{orphanNodes.slice(0, 3).map((node) => node.name || node.id).join("、")}{orphanNodes.length > 3 ? " 等" : ""}）</span>}
      </div>}
      {loading ? <div className="ontology-loading">正在读取本体模型...</div> : <div className="model-graph-body">
        <div ref={wrapRef} className={`model-graph-wrap${isPanning ? " panning" : ""}`} onPointerDown={(event) => {
          if (event.button !== 0) return;
          if (event.target.closest?.(".spg-node")) return;
          panRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: view.x, originY: view.y, moved: false };
          event.currentTarget.setPointerCapture?.(event.pointerId);
          setIsPanning(true);
        }} onPointerMove={(event) => {
          const drag = panRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const dx = event.clientX - drag.startX;
          const dy = event.clientY - drag.startY;
          if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
          setView((current) => ({ ...current, x: drag.originX + dx, y: drag.originY + dy }));
        }} onPointerUp={(event) => {
          const drag = panRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          event.currentTarget.releasePointerCapture?.(event.pointerId);
          panRef.current = null;
          setIsPanning(false);
          if (!drag.moved) { setFocusId(""); setQuery(""); }
        }} onPointerCancel={() => { panRef.current = null; setIsPanning(false); }}>
          <svg className="model-graph-svg" viewBox={`0 0 ${Math.max(box.w, 1)} ${Math.max(box.h, 1)}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="本体模型图谱">
            <defs>
              {[["inherit", "#9db8d4"], ["relation", "#7292d1"], ["namespace", "#c3ccd8"], ["active", "#1677ff"]].map(([id, color]) => (
                <marker key={id} id={`graph-arrow-${id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path d="M 0 1 L 9 5 L 0 9 z" fill={color} />
                </marker>
              ))}
            </defs>
            <g transform={`translate(${offset.x} ${offset.y}) scale(${scale})`}>
              {visibleEdges.map((edge) => {
                const geometry = edgeGeometry(positions[edge.source], positions[edge.target], width, height);
                const active = focusNode && (edge.source === focusNode.id || edge.target === focusNode.id);
                const dim = !!focusNode && !active;
                const marker = active ? "active" : edge.kind;
                return <path key={edge.id} d={geometry.d} markerEnd={`url(#graph-arrow-${marker})`} className={`spg-edge ${edge.kind}${active ? " active" : ""}${dim ? " dim" : ""}`} />;
              })}
              {(showLabels || focusNode) && visibleEdges.map((edge) => {
                const active = focusNode && (edge.source === focusNode.id || edge.target === focusNode.id);
                if (focusNode && !active) return null;
                const geometry = edgeGeometry(positions[edge.source], positions[edge.target], width, height);
                return <text key={`${edge.id}-label`} x={geometry.lx} y={geometry.ly - 6} className="spg-edge-label">{edge.label}</text>;
              })}
              {visibleNodes.map((node) => {
                const point = positions[node.id];
                const meta = modelingApi.GRAPH_KIND_META[node.kind];
                const active = focusId === node.id;
                const related = !!(focusNode && focusEdges.some((edge) => edge.source === node.id || edge.target === node.id));
                const matched = matchedNodes.includes(node);
                const dim = (!!focusNode && !active && !related) || (searchActive && !matched);
                const label = String(node.displayName || node.name || node.id);
                return <g key={node.id} className={`spg-node${active ? " active" : ""}${dim ? " dim" : ""}${matched ? " matched" : ""}${orphanNodes.includes(node) ? " isolated" : ""}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setFocusId((current) => (current === node.id ? "" : node.id)); }}>
                  <title>{`${label}${node.name && node.name !== label ? `（${node.name}）` : ""} · ${modelingApi.ELEMENT_KIND_LABELS[node.kind] || node.kind}`}</title>
                  <rect className="spg-node-hitarea" x={point.x - 30} y={point.y - 30} width="60" height="60" rx="30" />
                  <circle className="spg-node-halo" cx={point.x} cy={point.y} r={22} fill="none" stroke={meta.color} />
                  <circle className="spg-node-dot" cx={point.x} cy={point.y} r={13} fill={meta.color} />
                  <text x={point.x} y={point.y + 33} className="spg-node-label">{label.length > 16 ? `${label.slice(0, 15)}…` : label}</text>
                </g>;
              })}
            </g>
          </svg>
        </div>
        <aside className="graph-detail-panel">
          <div className="graph-detail-head">
            <div><h3>节点详情</h3><small>{detailNode ? "已锁定节点，点击其他节点可切换" : "点击图谱节点即可查看完整定义"}</small></div>
            {focusId ? <button type="button" className="plain-action" onClick={() => setFocusId("")}>取消</button> : null}
          </div>
          {!detailNode ? <div className="graph-detail-empty"><Share2 size={22} /><b>请选择节点</b><span>节点已扩大为 60px 点击热区</span></div> : <div className="graph-detail-side">
            <div className="graph-detail-title"><i style={{ background: modelingApi.GRAPH_KIND_META[detailNode.kind]?.color }} /><div><b>{detailNode.displayName || detailNode.name || "—"}</b><span>{modelingApi.ELEMENT_KIND_LABELS[detailNode.kind] || detailNode.kind}</span></div></div>
            {detailNode.name && detailNode.name !== (detailNode.displayName || detailNode.name) && <div><span>英文名称</span><b>{detailNode.name}</b></div>}
            <div><span>编码</span><b className="mono">{detailNode.code || detailNode.id}</b></div>
            <div><span>命名空间</span><b>{(model.namespaces || []).find((item) => item.id === detailNode.namespaceId)?.name || "—"}</b></div>
            <div><span>数据类型 / 值域</span><b>{detailNode.dataType || detailNode.valueType || "—"}</b></div>
            <div><span>目标类型</span><b>{detailNode.targetType || "—"}</b></div>
            <div><span>表达式</span><b className="mono">{detailNode.expression || detailNode.constraintType || "—"}</b></div>
            <div><span>更新时间</span><b>{formatTime(detailNode.updatedAt)}</b></div>
            <div className="wide"><span>描述</span><b>{detailNode.description || "—"}</b></div>
            <div className="wide graph-detail-links">
              <span>关联节点（{focusEdges.length}）</span>
              {focusEdges.length ? <div className="graph-detail-chips">
                {focusEdges.map((edge) => {
                  const otherId = edge.source === detailNode.id ? edge.target : edge.source;
                  const other = graph.rowMap[otherId];
                  if (!other) return null;
                  const otherName = other.displayName || other.name || otherId;
                  return <button type="button" key={edge.id} onClick={() => setFocusId(otherId)}>
                    <i style={{ background: modelingApi.GRAPH_KIND_META[other.kind]?.color }} />{edge.label === otherName ? otherName : `${edge.label} · ${otherName}`}
                  </button>;
                })}
              </div> : <b>该节点暂无连线</b>}
            </div>
          </div>}
        </aside>
      </div>}
    </section>
  </div>;
}

function SimplePage({ title, text }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}</h2>
      </div>
      <div className="empty-state">
        <b>{text}</b>
      </div>
    </section>
  );
}
async function bootstrap() {
  const { worker } = await import("./mocks/browser");
  await worker.start({ onUnhandledRequest: "bypass" });
  await api.listOntologyModels();
  installOntologyDemo(localStorage, spgSchemaApi.normalizeSpgModel(spgSchemaApi.spgSchemaSeed));
  createRoot(document.getElementById("root")).render(<App />);
}

bootstrap();

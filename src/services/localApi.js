import { assetMetadataType } from './assetMetadata';
import { demoLineageFiles, demoLineageJob, demoLineageRecord } from './demoLineage';

const DIRECTORY_KEY = 'datapilot.directories';
const SOURCE_KEY = 'datapilot.sources';
const JOB_KEY = 'datapilot.jobs';
const RECORD_KEY = 'datapilot.records';
const DATA_ASSET_KEY = 'datapilot.dataAssets';
const TEMPLATE_KEY = 'datapilot.templates';
const METADATA_DEFINITION_KEY = 'datapilot.metadataDefinitions';
const THIRD_PARTY_APP_KEY = 'datapilot.thirdPartyApps';
const THIRD_PARTY_CALL_KEY = 'datapilot.thirdPartyCalls';
const DEMO_SEED_KEY = 'datapilot.demoSeedVersion';
const PROJECTS_KEY = 'datapilot.projects';
const CURRENT_PROJECT_KEY = 'datapilot.currentProject';
const ONTOLOGY_MODELS_KEY = 'datapilot.ontologyModels';
const ACTIVE_ONTOLOGY_MODEL_KEY = 'datapilot.activeOntologyModel';
const GLOBAL_RESOURCE_OWNER = 'global';
// The browser mock worker intercepts these same-origin API requests by default.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const USE_API = import.meta.env.VITE_USE_API !== 'false';

// 资源 -> localStorage key 的映射，便于统一做按项目过滤和级联清理
const RESOURCE_KEYS = {
  directories: DIRECTORY_KEY,
  sources: SOURCE_KEY,
  tasks: JOB_KEY,
  records: RECORD_KEY,
  dataAssets: DATA_ASSET_KEY,
  templates: TEMPLATE_KEY,
  metadataDefinitions: METADATA_DEFINITION_KEY,
  thirdPartyApps: THIRD_PARTY_APP_KEY,
  thirdPartyCalls: THIRD_PARTY_CALL_KEY,
};

// 默认演示项目
const DEFAULT_PROJECTS = [
  { id: 'project-demo-main', name: '主数据治理', description: '面向客户、产品、组织等主数据治理的演示项目', createdAt: '2026-09-01T08:00:00.000Z' },
  { id: 'project-demo-supply', name: '供应链本体', description: '面向供应商、采购、库存等供应链领域本体的演示项目', createdAt: '2026-09-01T08:30:00.000Z' },
];
const DEFAULT_PROJECT_ID = DEFAULT_PROJECTS[0].id;
const DEFAULT_ONTOLOGY_MODELS = [
  { id: 'model-industrial-equipment', projectId: 'project-demo-main', name: '工业装备本体模型', code: 'industrial-equipment', domain: '工业制造', description: '设备、工单、维护与质检活动的统一语义模型。', status: 'ACTIVE', validationStatus: 'passed', schemaVersionId: 'spg-ontology-v3', namespaceCount: 2, elementCount: 36, linkedAssetIds: ['file-demo-structured-order-table'], createdAt: '2026-09-01T08:20:00.000Z', updatedAt: '2026-09-04T09:30:00.000Z' },
  { id: 'model-master-data', projectId: 'project-demo-main', name: '企业主数据本体模型', code: 'enterprise-master-data', domain: '主数据', description: '客户、组织、产品与统一编码体系。', status: 'DRAFT', validationStatus: 'pending', schemaVersionId: 'spg-ontology-v2', namespaceCount: 3, elementCount: 24, linkedAssetIds: ['file-demo-customer-03'], createdAt: '2026-09-02T10:00:00.000Z', updatedAt: '2026-09-03T15:10:00.000Z' },
  { id: 'model-supply-chain', projectId: 'project-demo-supply', name: '供应链协同本体模型', code: 'supply-chain-collaboration', domain: '供应链', description: '供应商、物料、采购与库存领域语义模型。', status: 'ACTIVE', validationStatus: 'passed', schemaVersionId: 'spg-ontology-v3', namespaceCount: 2, elementCount: 28, linkedAssetIds: ['file-demo-order-02'], createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-04T10:20:00.000Z' },
];

async function backend(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.status === 204 ? null : response.json();
}
const resource = (type) => `/api/resources/${type}`;

const emptyDirectories = [{ id: 'all', name: '全部资产', count: 0, system: true, open: true, children: [] }];
const demoTasks = [
  demoLineageJob,
  { id: 'task-demo-customer-batch', name: '客户主数据多文件采集', type: 'data_collection', status: 'succeeded', priority: 5, connectionConfigId: 'connection-demo', assetDirectoryId: 'dir-demo-customer-archive', assetDirectoryName: '历史归档', duplicateFilePolicy: 'replace', requestJson: { databaseName: 'master_data', schemaName: 'public', tableNames: ['customer_profile', 'customer_contact', 'customer_tag'], extractionMode: 'full' }, createdAt: '2026-10-19T01:00:00.000Z', updatedAt: '2026-10-19T01:03:00.000Z' },
  { id: 'task-demo-customer', name: '客户主数据全量提取', type: 'data_collection', status: 'succeeded', priority: 5, connectionConfigId: 'connection-demo', requestJson: { schemaName: 'master_data', tableName: 'customer_profile', extractionMode: 'full' }, createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-01T08:06:00.000Z' },
  { id: 'task-demo-orders', name: '订单流水增量提取', type: 'data_collection', status: 'succeeded', priority: 7, connectionConfigId: 'connection-demo', requestJson: { schemaName: 'sales', tableName: 'order_transaction', extractionMode: 'incremental', incrementalField: 'updated_at' }, createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T09:09:00.000Z' },
  { id: 'task-demo-enrich-customer', name: '客户数据元数据富化', type: 'metadata_enrichment', status: 'succeeded', priority: 4, assetFileId: 'file-demo-customer-03', templateDefinitionId: 'template-demo-quality', requestJson: { enrichmentType: 'file_content', assetDirectoryId: 'dir-demo-master', assetFileIds: ['file-demo-customer-03'], fileParser: 'auto', sampleSize: '100', inferSchema: true, extractBusinessTerms: true }, maxRetryCount: 3, retryCount: 0, createdAt: '2026-09-01T09:05:00.000Z', updatedAt: '2026-09-01T09:07:00.000Z' },
  { id: 'task-demo-enrich-order', name: '订单数据元数据富化', type: 'metadata_enrichment', status: 'succeeded', priority: 4, assetFileId: 'file-demo-order-02', templateDefinitionId: 'template-demo-quality', requestJson: { enrichmentType: 'lineage', assetDirectoryId: 'dir-demo-business', assetFileIds: ['file-demo-order-02'], lineageDirection: 'both', lineageDiscovery: 'path_and_schema', lineageConfidence: '0.8' }, maxRetryCount: 3, retryCount: 0, createdAt: '2026-09-01T09:45:00.000Z', updatedAt: '2026-09-01T09:48:00.000Z' },
];
const demoTemplates = [
  { id: 'template-demo-quality', name: '数据文件基础属性模板', description: '预置资产目录中文件的基础属性，可按需增删', status: 'enabled', creatorId: 'local-user', createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-01T08:00:00.000Z' },
];
const demoMetadataDefinitions = [
  { id: 'metadata-demo-file-name', templateId: 'template-demo-quality', name: '文件名称', fieldCode: 'fileName', fieldType: 'string', description: '资产目录中展示的文件名称', validationJson: null, status: 'enabled', creatorId: 'local-user', createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-01T08:00:00.000Z' },
  { id: 'metadata-demo-file-type', templateId: 'template-demo-quality', name: '文件类型', fieldCode: 'fileType', fieldType: 'string', description: '文件扩展名或 MIME 类型', validationJson: null, status: 'enabled', creatorId: 'local-user', createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-01T08:00:00.000Z' },
  { id: 'metadata-demo-file-size', templateId: 'template-demo-quality', name: '文件大小', fieldCode: 'sizeBytes', fieldType: 'integer', description: '文件大小，单位为字节', validationJson: null, status: 'enabled', creatorId: 'local-user', createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-01T08:00:00.000Z' },
  { id: 'metadata-demo-object-url', templateId: 'template-demo-quality', name: '对象存储 URL', fieldCode: 'objectUrl', fieldType: 'string', description: '文件的对象存储访问地址', validationJson: null, status: 'enabled', creatorId: 'local-user', createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-01T08:00:00.000Z' },
  { id: 'metadata-demo-uploaded-at', templateId: 'template-demo-quality', name: '上传时间', fieldCode: 'uploadedAt', fieldType: 'datetime', description: '文件上传至资产目录的时间', validationJson: null, status: 'enabled', creatorId: 'local-user', createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-01T08:00:00.000Z' },
];
const demoBatchCollectionFiles = [
  ['profile', '客户档案', 'customer_profile.json', 'customer_profile', 1287, { customer_id: 'C00001', name: '华东科技有限公司', level: 'A' }],
  ['contact', '客户联系方式', 'customer_contact.json', 'customer_contact', 2456, { customer_id: 'C00001', contact_name: '张明', contact_type: '业务联系人' }],
  ['tag-001', '客户标签分片一', 'customer_tag-part-001.json', 'customer_tag', 2000, { customer_id: 'C00001', tag_code: 'KEY_ACCOUNT', tag_name: '重点客户' }],
  ['tag-002', '客户标签分片二', 'customer_tag-part-002.json', 'customer_tag', 1368, { customer_id: 'C00002', tag_code: 'LONG_TERM', tag_name: '长期合作' }],
].map(([code, name, fileName, table, rows, sample], index) => ({
  id: `file-demo-customer-batch-${code}`, name, fileName,
  filePath: `/extracted/customer-batch/${fileName}`, objectKey: `extracted/customer-batch/${fileName}`,
  connectionConfigId: 'connection-demo', directoryId: 'dir-demo-customer-archive', directory: '历史归档',
  dataShape: 'structured', assetLevel: 'platform', status: 'ready', storageType: 'object_storage', storageService: 'MinIO（Mock）',
  sizeBytes: [188016, 294720, 216064, 149504][index], createdAt: '2026-10-19T01:03:00.000Z',
  content: { dataset: `master_data.public.${table}`, rows, extractedAt: '2026-10-19T01:03:00.000Z', schema: Object.keys(sample).map(field => ({ name: field, type: 'string', nullable: false })), sample: [sample] },
}));
const demoDataAssets = [
  ...demoLineageFiles,
  ...demoBatchCollectionFiles,
  { id: 'file-demo-customer-01', name: '客户主数据-20260901-0800', fileName: 'customers-20260901-0800.json', filePath: '/extracted/customers/20260901-0800.json', connectionConfigId: 'connection-demo', status: 'ready', sizeBytes: 184320, createdAt: '2026-09-01T08:02:00.000Z', content: { dataset: 'customers', extractedAt: '2026-09-01T08:02:00.000Z', rows: 1268, sample: [{ customer_id: 'C00001', name: '华东科技有限公司', level: 'A' }] } },
  { id: 'file-demo-customer-02', name: '客户主数据-20260901-0830', fileName: 'customers-20260901-0830.json', filePath: '/extracted/customers/20260901-0830.json', connectionConfigId: 'connection-demo', status: 'ready', sizeBytes: 186204, createdAt: '2026-09-01T08:32:00.000Z', content: { dataset: 'customers', extractedAt: '2026-09-01T08:32:00.000Z', rows: 1275, sample: [{ customer_id: 'C00001', name: '华东科技有限公司', level: 'A' }] } },
  { id: 'file-demo-customer-03', name: '客户主数据-20260901-0900', fileName: 'customers-20260901-0900.json', filePath: '/extracted/customers/20260901-0900.json', connectionConfigId: 'connection-demo', status: 'ready', sizeBytes: 188016, createdAt: '2026-09-01T09:02:00.000Z', content: { dataset: 'customers', extractedAt: '2026-09-01T09:02:00.000Z', rows: 1287, sample: [{ customer_id: 'C00001', name: '华东科技有限公司', level: 'A' }] } },
  { id: 'file-demo-order-01', name: '订单流水-20260901-0910', fileName: 'orders-20260901-0910.json', filePath: '/extracted/orders/20260901-0910.json', connectionConfigId: 'connection-demo', status: 'ready', sizeBytes: 462816, createdAt: '2026-09-01T09:12:00.000Z', content: { dataset: 'orders', extractedAt: '2026-09-01T09:12:00.000Z', rows: 3842, sample: [{ order_id: 'SO202609010001', customer_id: 'C00001', amount: 12800.5 }] } },
  { id: 'file-demo-order-02', name: '订单流水-20260901-0940', fileName: 'orders-20260901-0940.json', filePath: '/extracted/orders/20260901-0940.json', connectionConfigId: 'connection-demo', status: 'ready', sizeBytes: 475103, createdAt: '2026-09-01T09:42:00.000Z', content: { dataset: 'orders', extractedAt: '2026-09-01T09:42:00.000Z', rows: 3956, sample: [{ order_id: 'SO202609010001', customer_id: 'C00001', amount: 12800.5 }] } },
  { id: 'file-demo-structured-order-table', name: '订单表结构快照-20260901', fileName: 'order_transaction_schema.json', filePath: '/extracted/sales/order_transaction_schema.json', connectionConfigId: 'connection-demo', status: 'ready', sizeBytes: 24576, createdAt: '2026-09-01T10:05:00.000Z', dataShape: 'structured', directoryId: 'dir-demo-business', directory: '业务数据', content: { dataset: 'sales.order_transaction', extractedAt: '2026-09-01T10:05:00.000Z', rows: 3956, schema: [
    { name: 'order_id', type: 'varchar(32)', nullable: false, primaryKey: true },
    { name: 'customer_id', type: 'varchar(32)', nullable: false, primaryKey: false },
    { name: 'amount', type: 'decimal(18,2)', nullable: false, primaryKey: false },
    { name: 'updated_at', type: 'datetime', nullable: false, primaryKey: false },
  ], sample: [{ order_id: 'SO202609010001', customer_id: 'C00001', amount: 12800.5, updated_at: '2026-09-01 09:40:00' }] } },
];
const demoRecords = [demoLineageRecord, {
  id: 'exec-demo-customer-batch-001', taskId: 'task-demo-customer-batch', executionNo: 1,
  name: '客户主数据多文件采集 #1', status: 'succeeded', workerId: 'local-worker-01',
  startedTime: Date.parse('2026-10-19T01:00:00.000Z'), finishedTime: Date.parse('2026-10-19T01:03:00.000Z'), createdAt: '2026-10-19T01:03:00.000Z',
  requestJson: { databaseName: 'master_data', schemaName: 'public', tableNames: ['customer_profile', 'customer_contact', 'customer_tag'], extractionMode: 'full' },
  successCount: 4, errorCount: 0,
  resultJson: { message: '已采集 3 张数据表，客户标签按分片输出，共生成 4 个文件', files: demoBatchCollectionFiles.map(file => ({ assetFileId: file.id, fileName: file.fileName, directoryId: file.directoryId, directory: file.directory, sizeBytes: file.sizeBytes, objectUrl: `https://minio.mock.local/ontology-assets/${file.objectKey}`, action: 'created' })) },
}, ...[
  ['exec-demo-001', 'task-demo-customer', 'file-demo-customer-01', 1, '2026-09-01T08:00:00.000Z', '2026-09-01T08:02:00.000Z'],
  ['exec-demo-002', 'task-demo-customer', 'file-demo-customer-02', 2, '2026-09-01T08:30:00.000Z', '2026-09-01T08:32:00.000Z'],
  ['exec-demo-003', 'task-demo-customer', 'file-demo-customer-03', 3, '2026-09-01T09:00:00.000Z', '2026-09-01T09:02:00.000Z'],
  ['exec-demo-004', 'task-demo-orders', 'file-demo-order-01', 1, '2026-09-01T09:10:00.000Z', '2026-09-01T09:12:00.000Z'],
  ['exec-demo-005', 'task-demo-orders', 'file-demo-order-02', 2, '2026-09-01T09:40:00.000Z', '2026-09-01T09:42:00.000Z'],
].map(([id, taskId, assetFileId, executionNo, startedTime, finishedTime]) => ({ id, taskId, assetFileId, executionNo, name: `数据采集执行 #${executionNo}`, status: 'succeeded', workerId: 'local-worker-01', startedTime: Date.parse(startedTime), finishedTime: Date.parse(finishedTime), createdAt: finishedTime, requestJson: { mode: 'mock' }, resultJson: { assetFileId, message: '数据采集完成' }, successCount: 1, errorCount: 0 })).concat([
  { id: 'exec-demo-enrich-001', taskId: 'task-demo-enrich-customer', assetFileId: 'file-demo-customer-03', executionNo: 1, name: '客户数据元数据富化 #1', status: 'succeeded', workerId: 'metadata-worker-01', startedTime: Date.parse('2026-09-01T09:05:00.000Z'), finishedTime: Date.parse('2026-09-01T09:06:00.000Z'), createdAt: '2026-09-01T09:06:00.000Z', requestJson: { templateId: 'template-demo-quality' }, resultJson: { quality_level: 'A', quality_score: 0.98, completeness_rate: 0.997, duplicate_rate: 0.001 }, fieldCount: 4, successCount: 4, errorCount: 0 },
  { id: 'exec-demo-enrich-002', taskId: 'task-demo-enrich-customer', assetFileId: 'file-demo-customer-03', executionNo: 2, name: '客户数据元数据富化 #2', status: 'succeeded', workerId: 'metadata-worker-01', startedTime: Date.parse('2026-09-01T09:15:00.000Z'), finishedTime: Date.parse('2026-09-01T09:16:00.000Z'), createdAt: '2026-09-01T09:16:00.000Z', requestJson: { templateId: 'template-demo-quality' }, resultJson: { quality_level: 'A', quality_score: 0.97, completeness_rate: 0.995, duplicate_rate: 0.002 }, fieldCount: 4, successCount: 4, errorCount: 0 },
  { id: 'exec-demo-enrich-003', taskId: 'task-demo-enrich-order', assetFileId: 'file-demo-order-02', executionNo: 1, name: '订单数据元数据富化 #1', status: 'succeeded', workerId: 'metadata-worker-02', startedTime: Date.parse('2026-09-01T09:45:00.000Z'), finishedTime: Date.parse('2026-09-01T09:46:00.000Z'), createdAt: '2026-09-01T09:46:00.000Z', requestJson: { templateId: 'template-demo-quality' }, resultJson: { quality_level: 'B', quality_score: 0.91, completeness_rate: 0.982, duplicate_rate: 0.009 }, fieldCount: 4, successCount: 4, errorCount: 0 },
  { id: 'exec-demo-enrich-004', taskId: 'task-demo-enrich-order', assetFileId: 'file-demo-order-02', executionNo: 2, name: '订单数据元数据富化 #2', status: 'succeeded', workerId: 'metadata-worker-02', startedTime: Date.parse('2026-09-01T10:00:00.000Z'), finishedTime: Date.parse('2026-09-01T10:01:00.000Z'), createdAt: '2026-09-01T10:01:00.000Z', requestJson: { templateId: 'template-demo-quality' }, resultJson: { quality_level: 'B', quality_score: 0.92, completeness_rate: 0.986, duplicate_rate: 0.008 }, fieldCount: 4, successCount: 4, errorCount: 0 },
])];
const demoThirdPartyApps = [
  { id: 'app-demo-001', name: '知识图谱加工平台', description: '外部元数据富化调用方', appId: '2c94811c9f3cb45601a062c606334e73', appToken: 'a818a7ce0bc691faf132516baaec c974'.replace(/\s/g, ''), createdAt: '2026-09-01T08:30:00.000Z', status: 'enabled', lastAccessedAt: '2026-09-04T14:22:18.000Z' },
  { id: 'app-demo-002', name: '数据质量门户', description: '质量门户文件富化服务', appId: '7a412e5d8f3a4c9ab1d0e6f47255b188', appToken: 'f3d81b9a6c214e8db1c5f0a2739d6e42', createdAt: '2026-09-03T10:15:00.000Z', status: 'enabled', lastAccessedAt: '2026-09-04T09:08:42.000Z' },
];
const demoThirdPartyCalls = [
  {
    id: 'call-demo-001', appId: 'app-demo-001', templateId: 'template-demo-quality', templateName: '数据文件基础属性模板', fileId: 'file-demo-customer-03', fileName: 'customers-20260901-0900.json', authAt: '2026-09-04T14:22:16.000Z', authStatus: 'succeeded', enrichAt: '2026-09-04T14:22:18.000Z', enrichStatus: 'succeeded', createdAt: '2026-09-04T14:22:18.000Z',
    standardMetadata: { fileName: 'customers-20260901-0900.json', fileType: 'JSON', sizeBytes: 188016, objectUrl: 'https://minio.mock.local/ontology-assets/extracted/customers/20260901-0900.json', uploadedAt: '2026-09-01T09:02:00.000Z' },
    initialMetadata: { dataset: 'customers', sourceSystem: 'customer-center', rowCount: 1287 }, enrichedMetadata: { dataset: 'customers', sourceSystem: 'customer-center', rowCount: 1287, qualityLevel: 'A', qualityScore: 0.98, businessDomain: '客户主数据' },
  },
  {
    id: 'call-demo-002', appId: 'app-demo-002', templateId: 'template-demo-quality', templateName: '数据文件基础属性模板', fileId: 'file-demo-order-02', fileName: 'orders-20260901-0940.json', authAt: '2026-09-04T09:08:40.000Z', authStatus: 'succeeded', enrichAt: '2026-09-04T09:08:42.000Z', enrichStatus: 'failed', errorMessage: '模板字段校验未通过：缺少业务域字段', createdAt: '2026-09-04T09:08:42.000Z',
    standardMetadata: { fileName: 'orders-20260901-0940.json', fileType: 'JSON', sizeBytes: 475103, objectUrl: 'https://minio.mock.local/ontology-assets/extracted/orders/20260901-0940.json', uploadedAt: '2026-09-01T09:42:00.000Z' },
    initialMetadata: { dataset: 'orders', sourceSystem: 'order-center', rowCount: 3956 }, enrichedMetadata: { dataset: 'orders', sourceSystem: 'order-center', rowCount: 3956 },
  },
];

function read(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); return value; }
function appendMissing(items, demos) {
  const ids = new Set(items.map(item => item.id));
  return [...items, ...demos.filter(item => !ids.has(item.id))];
}

// ===== 项目(Project)管理 =====

function readProjects() {
  return read(PROJECTS_KEY, DEFAULT_PROJECTS);
}
function ensureProjects() {
  if (!localStorage.getItem(PROJECTS_KEY)) write(PROJECTS_KEY, DEFAULT_PROJECTS);
  return readProjects();
}
export function getCurrentProjectId() {
  const projects = ensureProjects();
  const stored = localStorage.getItem(CURRENT_PROJECT_KEY);
  if (stored && projects.some((project) => project.id === stored)) return stored;
  const fallback = projects[0]?.id || DEFAULT_PROJECT_ID;
  localStorage.setItem(CURRENT_PROJECT_KEY, fallback);
  return fallback;
}
export function setCurrentProjectId(id) {
  localStorage.setItem(CURRENT_PROJECT_KEY, id);
  return id;
}
export async function listProjects() {
  return later(ensureProjects().slice().sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)));
}
export async function createProject({ name, description, organizationId }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('请输入项目名称');
  const projects = ensureProjects();
  const project = {
    id: `project-${Date.now()}`,
    name: trimmed,
    description: String(description || '').trim(),
    ...(organizationId ? { organizationId } : {}),
    createdAt: new Date().toISOString(),
  };
  const next = [...projects, project];
  write(PROJECTS_KEY, next);
  setCurrentProjectId(project.id);
  return later(project);
}

function readOntologyModels() {
  const projectIds = new Set(ensureProjects().map((item) => item.id));
  const stored = read(ONTOLOGY_MODELS_KEY, []).filter((item) => projectIds.has(item.projectId));
  const rows = appendMissing(stored, DEFAULT_ONTOLOGY_MODELS.filter((item) => projectIds.has(item.projectId)));
  if (JSON.stringify(stored) !== JSON.stringify(rows)) write(ONTOLOGY_MODELS_KEY, rows);
  return rows;
}
export async function listOntologyModels(projectId = getCurrentProjectId()) {
  return later(readOntologyModels().filter((item) => item.projectId === projectId).sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)));
}
export function getActiveOntologyModelId(projectId = getCurrentProjectId()) {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_ONTOLOGY_MODEL_KEY) || '{}')[projectId] || '';
  } catch {
    return '';
  }
}
export function setActiveOntologyModelId(projectId, modelId) {
  let current = {};
  try { current = JSON.parse(localStorage.getItem(ACTIVE_ONTOLOGY_MODEL_KEY) || '{}'); } catch {}
  localStorage.setItem(ACTIVE_ONTOLOGY_MODEL_KEY, JSON.stringify({ ...current, [projectId]: modelId || '' }));
  return modelId;
}
export async function saveOntologyModel(payload) {
  const projectId = payload.projectId || getCurrentProjectId();
  const rows = readOntologyModels();
  const now = new Date().toISOString();
  const row = {
    status: 'DRAFT',
    validationStatus: 'pending',
    schemaVersionId: 'spg-ontology-v3',
    namespaceCount: 1,
    elementCount: 0,
    linkedAssetIds: [],
    ...payload,
    projectId,
    id: payload.id || `model-${Date.now()}`,
    code: String(payload.code || payload.name || 'ontology-model').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    createdAt: payload.createdAt || now,
    updatedAt: now,
  };
  write(ONTOLOGY_MODELS_KEY, payload.id ? rows.map((item) => item.id === payload.id ? row : item) : [row, ...rows]);
  return later(row);
}
export async function mergeOntologyModels({ sourceIds, name, description }) {
  const projectId = getCurrentProjectId();
  const sources = readOntologyModels().filter((item) => item.projectId === projectId && sourceIds.includes(item.id));
  if (sources.length < 2) throw new Error('请至少选择两个本体模型');
  return saveOntologyModel({
    projectId,
    name,
    description,
    domain: '融合模型',
    status: 'DRAFT',
    validationStatus: 'pending',
    sourceModelIds: sources.map((item) => item.id),
    namespaceCount: sources.reduce((sum, item) => sum + Number(item.namespaceCount || 0), 0),
    elementCount: sources.reduce((sum, item) => sum + Number(item.elementCount || 0), 0),
    linkedAssetIds: [...new Set(sources.flatMap((item) => item.linkedAssetIds || []))],
  });
}
export async function renameProject(id, { name, description }) {
  const projects = ensureProjects();
  const next = projects.map((project) => project.id === id ? {
    ...project,
    name: String(name || '').trim() || project.name,
    description: String(description || '').trim(),
  } : project);
  write(PROJECTS_KEY, next);
  return later(next.find((project) => project.id === id));
}
export async function deleteProject(id) {
  const projects = ensureProjects();
  if (projects.length <= 1) throw new Error('请至少保留一个项目');
  const next = projects.filter((project) => project.id !== id);
  write(PROJECTS_KEY, next);
  write(ONTOLOGY_MODELS_KEY, readOntologyModels().filter((item) => item.projectId !== id));
  if (getCurrentProjectId() === id) setCurrentProjectId(next[0].id);
  return later(true);
}

function seedDemoData() {
  if (localStorage.getItem(DEMO_SEED_KEY) === '6') return;
  const projectId = getCurrentProjectId();
  const tasks = read(JOB_KEY, []);
  const enriched = appendMissing(tasks, demoTasks).map(task => {
      const demo = demoTasks.find(item => item.id === task.id);
      const next = demo?.requestJson?.tableName && !task.requestJson?.tableName ? { ...task, requestJson: demo.requestJson } : task;
      return next.projectId ? next : { ...next, projectId };
    });
  if (JSON.stringify(tasks) !== JSON.stringify(enriched)) write(JOB_KEY, enriched);
  const records = read(RECORD_KEY, []);
  const batchRecord = demoRecords.find(row => row.id === 'exec-demo-customer-batch-001');
  const recordsWithBatch = records.some(row => row.id === batchRecord.id) ? records : [batchRecord, ...records];
  const recordsWithLineage = recordsWithBatch.some(row => row.id === demoLineageRecord.id) ? recordsWithBatch : [demoLineageRecord, ...recordsWithBatch];
  const nextRecords = appendMissing(recordsWithLineage, demoRecords).map(row => row.projectId ? row : { ...row, projectId });
  if (JSON.stringify(records) !== JSON.stringify(nextRecords)) write(RECORD_KEY, nextRecords);
  const files = read(DATA_ASSET_KEY, []);
  const nextFiles = appendMissing(files, demoDataAssets).map(row => row.projectId ? row : { ...row, projectId });
  if (JSON.stringify(files) !== JSON.stringify(nextFiles)) write(DATA_ASSET_KEY, nextFiles);
  const templates = read(TEMPLATE_KEY, []);
  const nextTemplates = appendMissing(templates, demoTemplates).map(row => row.projectId ? row : { ...row, projectId });
  if (JSON.stringify(templates) !== JSON.stringify(nextTemplates)) write(TEMPLATE_KEY, nextTemplates);
  const definitions = read(METADATA_DEFINITION_KEY, []);
  const nextDefinitions = appendMissing(definitions, demoMetadataDefinitions).map(row => row.projectId ? row : { ...row, projectId });
  if (JSON.stringify(definitions) !== JSON.stringify(nextDefinitions)) write(METADATA_DEFINITION_KEY, nextDefinitions);
  const apps = read(THIRD_PARTY_APP_KEY, []);
  const nextApps = appendMissing(apps, demoThirdPartyApps).map(row => row.projectId ? row : { ...row, projectId });
  if (JSON.stringify(apps) !== JSON.stringify(nextApps)) write(THIRD_PARTY_APP_KEY, nextApps);
  const calls = read(THIRD_PARTY_CALL_KEY, []);
  const nextCalls = appendMissing(calls, demoThirdPartyCalls).map(row => row.projectId ? row : { ...row, projectId });
  if (JSON.stringify(calls) !== JSON.stringify(nextCalls)) write(THIRD_PARTY_CALL_KEY, nextCalls);
  // 将其他没有 projectId 的数据也归到当前项目(兜底)
  Object.entries(RESOURCE_KEYS).forEach(([key]) => {
    const rows = read(key, []);
    const next = rows.map(row => row.projectId ? row : { ...row, projectId });
    if (JSON.stringify(rows) !== JSON.stringify(next)) write(key, next);
  });
  localStorage.setItem(DEMO_SEED_KEY, '6');
}
seedDemoData();
function later(value) { return new Promise(resolve => setTimeout(() => resolve(value), 120)); }
function walk(nodes, fn) { return nodes.map(node => fn({ ...node, children: walk(node.children || [], fn) })); }
function remove(nodes, id) { return nodes.filter(node => node.id !== id).map(node => ({ ...node, children: remove(node.children || [], id) })); }
function insert(nodes, parentId, child) { return nodes.map(node => node.id === parentId ? { ...node, children: [...(node.children || []), child] } : { ...node, children: insert(node.children || [], parentId, child) }); }

const ROOT_DIRECTORY_ID = 'all';
const ROOT_DIRECTORY_NAME = '全部资产';
export function defaultDirectoryTree() {
  return [{ id: ROOT_DIRECTORY_ID, name: ROOT_DIRECTORY_NAME, count: 0, system: true, open: true, children: [] }];
}
function buildDirectoryTree(rows) {
  const nodes = new Map(rows.filter((row) => row.id !== ROOT_DIRECTORY_ID).map((row) => [row.id, { ...row, count: 0, open: true, system: false, children: [] }]));
  const root = defaultDirectoryTree()[0];
  nodes.forEach((node) => {
    (nodes.get(node.parentId) || root).children.push(node);
  });
  return [root];
}
function directoryDescendants(rows, id) {
  const children = new Map();
  rows.forEach((row) => children.set(row.parentId || '', [...(children.get(row.parentId || '') || []), row.id]));
  const ids = [id];
  for (let index = 0; index < ids.length; index += 1) ids.push(...(children.get(ids[index]) || []));
  return ids;
}
export async function listDirectories() {
  return buildDirectoryTree(await backend('/api/asset-directories?scope=global'));
}
export function createDirectory(payload) {
  return backend('/api/asset-directories', { method: 'POST', body: JSON.stringify({ ...payload, name: payload.name, parentId: payload.parentId || '', projectId: GLOBAL_RESOURCE_OWNER }) });
}
export async function updateDirectory(id, payload) {
  const rows = await backend('/api/asset-directories?scope=global');
  const current = rows.find((row) => row.id === id);
  if (!current) throw new Error('目录不存在');
  return backend(`/api/asset-directories/${id}?scope=global`, { method: 'PUT', body: JSON.stringify({ name: payload.name || current.name, parentId: payload.parentId ?? current.parentId ?? '', projectId: current.projectId || GLOBAL_RESOURCE_OWNER }) });
}
export async function deleteDirectory(id) {
  await backend(`/api/asset-directories/${id}?scope=global`, { method: 'DELETE' });
}
export async function moveDirectory(id, parentId) {
  const rows = await backend('/api/asset-directories?scope=global');
  const current = rows.find((row) => row.id === id);
  if (!current || parentId === id || directoryDescendants(rows, id).includes(parentId)) return null;
  return backend(`/api/asset-directories/${id}?scope=global`, { method: 'PUT', body: JSON.stringify({ name: current.name, parentId: parentId || '', projectId: current.projectId || GLOBAL_RESOURCE_OWNER }) });
}
function removeAndCapture(nodes, id, capture) {
  return nodes.filter(node => {
    if (node.id === id) { capture(node); return false; }
    return true;
  }).map(node => ({ ...node, children: removeAndCapture(node.children || [], id, capture) }));
}
function contains(node, id) { return (node.children || []).some(child => child.id === id || contains(child, id)); }

export async function listSources() {
  return backend('/api/connection-configs?scope=global');
}
export async function listConnectionDataScope(connectionId) {
  return backend(`/api/connection-configs/${connectionId}/data-scope`);
}
export async function hasDuplicateSource(payload, excludeId = '') {
  const name = String(payload.name || '').trim().toLowerCase();
  if (!name) return false;
  const sources = await listSources();
  return sources.some(item => {
    if (item.id === excludeId) return false;
    return String(item.name || '').trim().toLowerCase() === name;
  });
}
export async function createSource(payload) {
  return backend('/api/connection-configs', { method: 'POST', body: JSON.stringify({ ...payload, projectId: GLOBAL_RESOURCE_OWNER }) });
}
export async function updateSource(id, payload) {
  return backend(`/api/connection-configs/${id}?scope=global`, { method: 'PUT', body: JSON.stringify(payload) });
}
export async function deleteSource(id) { return backend(`/api/connection-configs/${id}?scope=global`, { method: 'DELETE' }); }

export async function listJobs() {
  const [dataCollectionTasks, metadataEnrichmentTasks] = await Promise.all([
    backend('/api/data-collection-tasks?scope=global'),
    backend('/api/metadata-enrichment-tasks?scope=global'),
  ]);
  return [...dataCollectionTasks, ...metadataEnrichmentTasks];
}
export async function listRecords() {
  if (USE_API) return backend('/api/task-execution-records?scope=global');
  return later(read(RECORD_KEY, []));
}
export async function listDataAssets() {
  if (USE_API) return backend(`${resource('assets')}?scope=global`);
  return later(read(DATA_ASSET_KEY, []));
}
export async function listTemplates() {
  return backend('/api/template-definitions?scope=global');
}
export async function listMetadataDefinitions() {
  return backend('/api/metadata-definitions?scope=global');
}
export async function listThirdPartyApps() {
  return backend('/api/third-party-apps?scope=global');
}
export async function createThirdPartyApp(payload) {
  return backend('/api/third-party-apps', { method: 'POST', body: JSON.stringify({ ...payload, projectId: GLOBAL_RESOURCE_OWNER }) });
}
export async function updateThirdPartyApp(id, payload) {
  return backend(`/api/third-party-apps/${id}?scope=global`, { method: 'PUT', body: JSON.stringify(payload) });
}
export async function deleteThirdPartyApp(id) { return backend(`/api/third-party-apps/${id}?scope=global`, { method: 'DELETE' }); }
export async function listThirdPartyCalls() {
  return backend('/api/third-party-calls?scope=global');
}
export async function saveTemplateWithDefinitions(payload) {
  const projectId = payload.projectId || GLOBAL_RESOURCE_OWNER;
  if (USE_API) return payload.id ? backend(`/api/template-definitions/${payload.id}?scope=global`, { method: 'PUT', body: JSON.stringify({ ...payload, projectId }) }) : backend('/api/template-definitions', { method: 'POST', body: JSON.stringify({ ...payload, projectId }) });
  const now = new Date().toISOString();
  const templateId = payload.id || `template-${Date.now()}`;
  const template = {
    id: templateId,
    name: payload.name,
    description: payload.description || '',
    nativeFieldPolicy: payload.nativeFieldPolicy || { mode: 'all', fields: [] },
    status: payload.status || 'enabled',
    creatorId: payload.creatorId || 'local-user',
    createdAt: payload.createdAt || now,
    updatedAt: now,
    projectId,
  };
  const templates = read(TEMPLATE_KEY, []).filter(item => item.projectId === projectId);
  const nextTemplates = payload.id
    ? templates.map(item => item.id === templateId ? { ...item, ...template } : item)
    : [template, ...templates];
  const definitions = (payload.definitions || []).map((item, index) => ({
    id: item.id || `metadata-${Date.now()}-${index}`,
    name: item.name,
    description: item.description || '',
    status: item.status || 'enabled',
    creatorId: item.creatorId || 'local-user',
    createdAt: item.createdAt || now,
    updatedAt: now,
    templateId,
    projectId,
    fieldCode: item.fieldCode,
    fieldType: item.fieldType,
    validationJson: item.validationJson || null,
  }));
  const allTemplates = read(TEMPLATE_KEY, []).filter(item => item.projectId !== projectId);
  const allDefinitions = read(METADATA_DEFINITION_KEY, []).filter(item => !(item.templateId === templateId && item.projectId === projectId));
  write(TEMPLATE_KEY, [...allTemplates, ...nextTemplates]);
  write(METADATA_DEFINITION_KEY, [...allDefinitions, ...definitions]);
  return later(template);
}
export async function deleteTemplate(id) {
  const projectId = GLOBAL_RESOURCE_OWNER;
  if (USE_API) return backend(`/api/template-definitions/${id}?scope=global`, { method: 'DELETE' });
  const templates = read(TEMPLATE_KEY, []).filter(item => !(item.id === id && item.projectId === projectId));
  const definitions = read(METADATA_DEFINITION_KEY, []).filter(item => !(item.templateId === id && item.projectId === projectId));
  write(TEMPLATE_KEY, templates);
  write(METADATA_DEFINITION_KEY, definitions);
  return later(true);
}
export async function createTask(payload) {
  const projectId = GLOBAL_RESOURCE_OWNER;
  if (payload.type === 'data_collection') return backend('/api/data-collection-tasks', { method: 'POST', body: JSON.stringify({ ...payload, type: 'data_collection', projectId }) });
  if (payload.type === 'metadata_enrichment') return backend('/api/metadata-enrichment-tasks', { method: 'POST', body: JSON.stringify({ ...payload, type: 'metadata_enrichment', projectId }) });
  throw new Error(`Unsupported task type: ${payload.type || 'unknown'}`);
}
export async function updateTask(id, payload) {
  if (payload.type === 'data_collection') return backend(`/api/data-collection-tasks/${id}?scope=global`, { method: 'PUT', body: JSON.stringify({ ...payload, type: 'data_collection' }) });
  if (payload.type === 'metadata_enrichment') return backend(`/api/metadata-enrichment-tasks/${id}?scope=global`, { method: 'PUT', body: JSON.stringify({ ...payload, type: 'metadata_enrichment' }) });
  throw new Error(`Unsupported task type: ${payload.type || 'unknown'}`);
}
export async function deleteTask(id, type) {
  if (type === 'data_collection') return backend(`/api/data-collection-tasks/${id}?scope=global`, { method: 'DELETE' });
  if (type === 'metadata_enrichment') return backend(`/api/metadata-enrichment-tasks/${id}?scope=global`, { method: 'DELETE' });
  throw new Error(`Unsupported task type: ${type || 'unknown'}`);
}
export async function createExecutionRecord(payload) {
  const projectId = GLOBAL_RESOURCE_OWNER;
  if (USE_API) return backend('/api/task-execution-records', { method: 'POST', body: JSON.stringify({ status: 'succeeded', workerId: 'local-worker-01', startedTime: Date.now(), finishedTime: Date.now(), projectId, ...payload }) });
  const current = read(RECORD_KEY, []).filter(row => row.projectId === projectId);
  const sameTask = current.filter(row => row.taskId === payload.taskId).length;
  const row = { id: `exec-${Date.now()}`, executionNo: sameTask + 1, status: 'succeeded', workerId: 'local-worker-01', startedTime: Date.now(), finishedTime: Date.now(), createdAt: new Date().toISOString(), projectId, ...payload };
  return later(write(RECORD_KEY, [row, ...read(RECORD_KEY, [])]));
}
export async function createAssetFile(payload) {
  payload = { ...payload, dataShape: assetMetadataType(payload) };
  const projectId = GLOBAL_RESOURCE_OWNER;
  if (USE_API) return [await backend(resource('assets'), { method: 'POST', body: JSON.stringify({ id: `file-${Date.now()}`, status: 'ready', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), projectId, ...payload }) })];
  const file = { id: `file-${Date.now()}`, status: 'ready', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), projectId, ...payload };
  return later(write(DATA_ASSET_KEY, [file, ...read(DATA_ASSET_KEY, [])]));
}
export async function updateAssetFile(id, payload) {
  if (USE_API) return backend(`${resource('assets')}/${id}?scope=global`, { method: 'PUT', body: JSON.stringify(payload) });
  const projectId = payload.projectId || GLOBAL_RESOURCE_OWNER;
  const rows = read(DATA_ASSET_KEY, []);
  const current = rows.find((item) => item.id === id);
  if (!current) throw new Error('文件不存在');
  return later(write(DATA_ASSET_KEY, rows.map((item) => item.id === id ? { ...item, ...payload, updatedAt: new Date().toISOString() } : item)).find((item) => item.id === id));
}
export async function createExtraction(payload) {
  await createTask({ id: `job-${Date.now()}`, ...payload, status: '等待中', progress: 0, createdAt: new Date().toISOString() });
  return listJobs();
}

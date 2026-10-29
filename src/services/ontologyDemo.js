import { CORE_KINDS } from './spgModel.js';

const MAIN = 'project-demo-main';
const SUPPLY = 'project-demo-supply';
const date = '2026-10-26T08:30:00.000Z';
const BUSINESS_FIELDS = {
  Equipment: [['equipmentCode', '设备编码', 'String'], ['ratedPower', '额定功率', 'Decimal']], WorkOrder: [['orderNo', '工单号', 'String'], ['priority', '优先级', 'Integer']], ProductionLine: [['lineCode', '产线编号', 'String']], InspectionRecord: [['passed', '检验是否通过', 'Boolean']], Sensor: [['measurementUnit', '测量单位', 'String']],
  Customer: [['customerCode', '客户编码', 'String'], ['creditLevel', '信用等级', 'String']], Organization: [['organizationCode', '组织代码', 'String']], Product: [['sku', '商品编码', 'String'], ['price', '单价', 'Decimal']], Address: [['city', '城市', 'String']], Account: [['accountType', '账户类型', 'String']],
  Batch: [['batchNo', '生产批号', 'String']], QualityReport: [['qualified', '检验合格', 'Boolean']], Defect: [['severity', '缺陷等级', 'Integer']], CorrectiveAction: [['dueDate', '整改期限', 'DateTime']], ServiceTicket: [['ticketNo', '服务单号', 'String']], Agent: [['skill', '专业技能', 'String']], KnowledgeArticle: [['category', '知识分类', 'String']], Feedback: [['score', '服务评分', 'Integer']],
  Supplier: [['supplierCode', '供应商编码', 'String'], ['creditCode', '统一社会信用代码', 'String']], Material: [['materialCode', '物料编码', 'String'], ['unit', '计量单位', 'String']], PurchaseOrder: [['orderNo', '采购单号', 'String'], ['totalAmount', '采购金额', 'Decimal']], Warehouse: [['warehouseCode', '仓库代码', 'String'], ['address', '仓库地址', 'String']], Inventory: [['availableQuantity', '可用库存', 'Decimal']], Shipment: [['shipmentNo', '发运单号', 'String']],
  RiskSupplier: [['creditCode', '统一社会信用代码', 'String']], Qualification: [['expiresAt', '资质到期时间', 'DateTime']], RiskEvent: [['riskLevel', '风险等级', 'String']], Assessment: [['riskScore', '风险评分', 'Decimal']], StorageLocation: [['locationCode', '库位编码', 'String']], Carrier: [['licenseNo', '运输许可编号', 'String']], Waybill: [['waybillNo', '运单号', 'String']], Route: [['distanceKm', '路线距离', 'Decimal']], LogisticsNode: [['arrivalAt', '预计到达时间', 'DateTime']], Requisition: [['requestedAmount', '申请金额', 'Decimal']], Contract: [['contractNo', '合同编号', 'String']], ContractClause: [['clauseType', '条款类型', 'String']], Acceptance: [['acceptedAt', '验收时间', 'DateTime']],
};
const BUSINESS_RELATIONS = {
  'industrial-equipment': [['Equipment', 'ProductionLine', 'belongsTo', '归属产线'], ['WorkOrder', 'Equipment', 'maintains', '维护设备'], ['InspectionRecord', 'WorkOrder', 'inspects', '检验工单'], ['Sensor', 'Equipment', 'monitors', '监测设备']],
  'master-data': [['Customer', 'Organization', 'belongsTo', '归属组织'], ['Customer', 'Address', 'locatedAt', '联系地址'], ['Account', 'Customer', 'ownedBy', '账户持有人'], ['Organization', 'Product', 'manages', '管理产品']],
  'supply-chain': [['Supplier', 'Material', 'supplies', '供应物料'], ['PurchaseOrder', 'Supplier', 'orderedFrom', '采购自供应商'], ['PurchaseOrder', 'Material', 'contains', '采购物料'], ['Inventory', 'Warehouse', 'storedIn', '存放仓库'], ['Inventory', 'Material', 'stockOf', '对应物料'], ['Shipment', 'PurchaseOrder', 'fulfills', '交付采购单']],
  'quality': [['Batch', 'QualityReport', 'inspectedBy', '批次检验'], ['QualityReport', 'Defect', 'reports', '记录缺陷'], ['CorrectiveAction', 'Defect', 'resolves', '整改缺陷']],
  'service': [['ServiceTicket', 'Agent', 'assignedTo', '分配处理人'], ['ServiceTicket', 'KnowledgeArticle', 'references', '引用知识'], ['Feedback', 'ServiceTicket', 'evaluates', '评价服务']],
  'supplier-risk': [['RiskSupplier', 'Qualification', 'holds', '持有资质'], ['RiskEvent', 'RiskSupplier', 'affects', '涉及供应商'], ['Assessment', 'RiskSupplier', 'evaluates', '评估供应商']],
  'logistics': [['Carrier', 'Waybill', 'transports', '承运运单'], ['Waybill', 'Route', 'follows', '使用路线'], ['Route', 'LogisticsNode', 'passesThrough', '途经节点'], ['Waybill', 'StorageLocation', 'departsFrom', '出库库位']],
  'procurement': [['Requisition', 'Contract', 'convertedTo', '形成合同'], ['Contract', 'ContractClause', 'contains', '包含条款'], ['Acceptance', 'Contract', 'accepts', '验收合同']],
};
export const DEMO_PROFILES = [
  { id: 'industrial-equipment', projectId: MAIN, name: '工业装备本体模型', domain: '工业制造', description: '设备、工单、维护与质检活动的统一语义模型。', origin: '手工建模', entities: [['Equipment', '设备'], ['WorkOrder', '工单'], ['ProductionLine', '产线'], ['InspectionRecord', '质检记录'], ['Sensor', '传感器']] },
  { id: 'master-data', projectId: MAIN, name: '企业主数据本体模型', domain: '主数据', description: '客户、组织、产品与统一编码体系。', origin: '文件导入', entities: [['Customer', '客户'], ['Organization', '组织'], ['Product', '产品'], ['Address', '地址'], ['Account', '账户']] },
  { id: 'quality', projectId: MAIN, name: '产品质量追溯本体', domain: '质量管理', description: '覆盖批次、检验、缺陷与质量整改的追溯链路。', origin: '智能构建', entities: [['Batch', '生产批次'], ['QualityReport', '检验报告'], ['Defect', '缺陷'], ['CorrectiveAction', '整改措施']] },
  { id: 'service', projectId: MAIN, name: '客户服务知识本体', domain: '客户服务', description: '服务请求、处理人员、知识文档和客户反馈。', origin: '智能构建', entities: [['ServiceTicket', '服务工单'], ['Agent', '服务人员'], ['KnowledgeArticle', '知识文档'], ['Feedback', '客户反馈']] },
  { id: 'supply-chain', projectId: SUPPLY, name: '供应链协同本体模型', domain: '供应链', description: '供应商、物料、采购与库存领域语义模型。', origin: '手工建模', entities: [['Supplier', '供应商'], ['Material', '物料'], ['PurchaseOrder', '采购订单'], ['Warehouse', '仓库'], ['Inventory', '库存'], ['Shipment', '发运单']] },
  { id: 'supplier-risk', projectId: SUPPLY, name: '供应商风险评估本体', domain: '供应商管理', description: '供应商资质、履约表现、风险事件和评估规则。', origin: '文件导入', entities: [['RiskSupplier', '供应商主体'], ['Qualification', '资质证明'], ['RiskEvent', '风险事件'], ['Assessment', '风险评估']] },
  { id: 'logistics', projectId: SUPPLY, name: '仓储物流本体', domain: '物流运输', description: '库位、运输路线、物流节点与运单的语义关联。', origin: '智能构建', entities: [['StorageLocation', '库位'], ['Carrier', '承运商'], ['Waybill', '运单'], ['Route', '运输路线'], ['LogisticsNode', '物流节点']] },
  { id: 'procurement', projectId: SUPPLY, name: '采购合同本体', domain: '采购合同', description: '从采购申请、合同条款到履约验收的全过程。', origin: '智能构建', entities: [['Requisition', '采购申请'], ['Contract', '合同'], ['ContractClause', '合同条款'], ['Acceptance', '验收记录']] },
];

export function buildDemoNamespace(profile, namespaceId = `demo-ns-${profile.id}`, versionId = `demo-version-${profile.id}`) {
  const model = Object.fromEntries(CORE_KINDS.map(kind => [kind, []]));
  const common = { projectId: profile.projectId, namespaceId, versionId, status: 'DRAFT', semanticVersion: '1.0.0', updatedAt: date, scope: 'NAMESPACE', origin: 'demo' };
  const row = (kind, code, name, extra = {}) => { const item = { ...common, id: `demo-${profile.id}-${kind}-${code}${namespaceId.endsWith('-draft-v3') ? '-draft-v3' : ''}`, code, name, description: `${profile.domain}领域中的${name}定义。`, ...extra }; model[kind].push(item); return item; };
  model.namespaces.push({ ...common, id: namespaceId, namespaceId: undefined, baseId: namespaceId, name: profile.name, code: `synx.${profile.id.replaceAll('-', '.')}.main`, uri: `urn:spgo:${profile.id}:`, scope: 'PROJECT', description: profile.description, semanticVersion: '1.2.0', branch: 'main' });
  const entities = profile.entities.map(([code, name]) => row('entityTypes', code, name));
  entities.forEach(entity => {
    for (const [code, name, type] of [['id', '业务标识', 'String'], ['name', '名称', 'String'], ['createdAt', '创建时间', 'DateTime'], ...(BUSINESS_FIELDS[entity.code] || [])]) {
      const property = row('properties', `${entity.code}_${code}`, name, { code, parentId: entity.id, parentKind: 'entityTypes', dataType: type, cardinality: code === 'id' ? '1' : '0..1', required: code === 'id', description: `${entity.name}的${name}。` });
      if (code === 'id') row('constraints', `${entity.code}_id_required`, '标识必填', { parentId: property.id, parentKind: 'properties', constraintType: 'NOT_NULL', value: 'true', constraintGroup: 'VALUE' });
    }
  });
  for (const [source, target, predicate, name] of BUSINESS_RELATIONS[profile.id] || []) {
    const entity = entities.find(row => row.code === source), destination = entities.find(row => row.code === target);
    row('relations', `${source}_${predicate}_${target}`, name, { parentId: entity.id, parentKind: 'entityTypes', targetTypeId: destination.id, targetType: target, predicateCode: predicate, predicateSemantic: 'USE', sourceCardinality: '0..N', targetCardinality: '0..N', featureGroup: 'OBJECT', description: `${entity.name}${name}，关联${destination.name}。` });
  }
  const concept = row('conceptTypes', 'LifecycleStatus', '生命周期状态');
  row('properties', 'LifecycleStatus_label', '状态说明', { code: 'label', parentId: concept.id, parentKind: 'conceptTypes', dataType: 'String', cardinality: '1' });
  const event = row('eventTypes', 'StatusChange', '状态变更事件');
  row('properties', 'StatusChange_occurredAt', '发生时间', { code: 'occurredAt', parentId: event.id, parentKind: 'eventTypes', dataType: 'DateTime', cardinality: '1' });
  [['ACTIVE', '有效'], ['INACTIVE', '失效'], ['PENDING', '待确认']].forEach(([code, name]) => row('standardValues', code, name, { value: code, dataType: 'String' }));
  row('rules', 'normalize_business_id', '业务编码归一化', { parentId: model.properties[0].id, parentKind: 'properties', expression: 'upper(trim(value))', trigger: 'before.save', condition: 'value != null', action: '更新属性' });
  return model;
}

export const BUILD_STAGES = ['输入文件解析', '实体与属性提取', '关系提取', '约束与规则提取', '本体组装与输出'];
export function buildDemoStages(status, startedAt) {
  const start = new Date(startedAt).getTime();
  return BUILD_STAGES.map((name, index) => ({ id: `stage-${index + 1}`, sequence: index + 1, name,
    status: status === 'SUCCEEDED' ? 'SUCCEEDED' : status === 'FAILED' ? index < 2 ? 'SUCCEEDED' : index === 2 ? 'FAILED' : 'PENDING' : status === 'CANCELLED' ? index === 0 ? 'SUCCEEDED' : 'CANCELLED' : index < 2 ? 'SUCCEEDED' : index === 2 ? 'RUNNING' : 'PENDING',
    startedAt: status === 'SUCCEEDED' || (status === 'CANCELLED' ? index === 0 : index < 3) ? new Date(start + index * 4200).toISOString() : '', durationMs: status === 'SUCCEEDED' || (status === 'CANCELLED' ? index === 0 : index < 2) ? 4200 : 0,
    input: index === 0 ? '选定数据对象文件集合' : `${BUILD_STAGES[index - 1]}的输出`,
    output: status === 'SUCCEEDED' || index < 2 ? index === 4 ? '完整本体 JSON / DSL 文件' : `${name}结果 JSON` : '',
    message: status === 'FAILED' && index === 2 ? '关系目标 WarehouseCode 未在输入文件中定义，请补充仓库字典后重试。' : '演示数据：未调用算法或大模型服务。',
  }));
}

function candidatesFrom(model) {
  return CORE_KINDS.filter(kind => kind !== 'namespaces').flatMap(kind => model[kind].map(row => ({ id: row.id, element_type: kind, label: row.code, definition: row.description, confidence: 0.87, evidence: `示例文件 / ${row.name}`, domain: kind !== 'relations' ? row.parentId || '' : '', source: kind === 'relations' ? row.parentId : '', target: row.targetTypeId || '', range: row.dataType || '', constraintType: row.constraintType, expression: row.expression })));
}

// One additive migration per demo version. Existing edits and user-created resources are preserved.
export function installOntologyDemo(storage, initialModel) {
  const marker = 'datapilot.ontologyDemo.v4';
  if (storage.getItem(marker)) return;
  const read = (key, fallback) => { try { return JSON.parse(storage.getItem(key)) || fallback; } catch { return fallback; } };
  const model = read('datapilot.spgSchemaModel', initialModel);
  const models = read('datapilot.ontologyModels', []);
  const projects = read('datapilot.projects', []);
  const assets = read('datapilot.dataAssets', []);
  const workflows = read('datapilot.spgWorkflow', {});
  const histories = read('datapilot.ontologyMergeHistory', []);
  CORE_KINDS.forEach(kind => { model[kind] ||= []; }); model.versions ||= [];
  const directories = read('datapilot.directories', []);
  if (!directories.some(row => row.id === 'dir-demo-ontology-input')) directories.push({ id: 'dir-demo-ontology-input', name: '本体构建示例资料', parentId: '', projectId: 'global' });
  const seeded = [];
  for (const profile of DEMO_PROFILES.filter(row => projects.some(project => project.id === row.projectId))) {
    const modelId = `model-${profile.id}`;
    let ontology = models.find(row => row.id === modelId);
    let namespace = model.namespaces.find(row => row.id === ontology?.namespaceId && row.projectId === profile.projectId);
    if (!namespace && profile.id === 'industrial-equipment') namespace = model.namespaces.find(row => row.id === 'spg-industrial-data');
    if (!namespace && profile.id === 'master-data') namespace = model.namespaces.find(row => row.id === 'spg-supply-chain');
    const familyId = namespace?.baseId || namespace?.id;
    const isDraft = row => String(row.status || 'DRAFT').toUpperCase() === 'DRAFT' && String(model.versions.find(version => version.id === row.versionId)?.status || 'DRAFT').toUpperCase() === 'DRAFT';
    if (namespace && !isDraft(namespace)) namespace = model.namespaces.find(row => (row.baseId || row.id) === familyId && isDraft(row));
    const namespaceId = namespace?.id || `demo-ns-${profile.id}${familyId ? '-draft-v3' : ''}`;
    const versionId = namespace?.versionId || `demo-version-${profile.id}${familyId ? '-draft-v3' : ''}`;
    const generated = buildDemoNamespace(profile, namespaceId, versionId);
    if (!namespace) { namespace = { ...generated.namespaces[0], baseId: familyId || namespaceId }; model.namespaces.push(namespace); }
    if (!model.versions.some(row => row.id === versionId)) model.versions.push({ id: versionId, projectId: profile.projectId, name: 'v1.2.0', status: 'DRAFT', isLatest: true, createdAt: date, description: '新增业务关系与约束，待人工审核。' });
    const idMap = new Map();
    CORE_KINDS.filter(kind => kind !== 'namespaces').forEach(kind => {
      for (const item of generated[kind]) {
        const parentId = idMap.get(item.parentId) || item.parentId;
        const existing = model[kind].find(row => row.namespaceId === namespaceId && row.versionId === versionId && row.code === item.code && (row.parentId || '') === (parentId || ''));
        idMap.set(item.id, existing?.id || item.id);
        if (!existing) model[kind].push({ ...item, parentId, targetTypeId: idMap.get(item.targetTypeId) || item.targetTypeId || '' });
      }
    });
    for (const [suffix, semanticVersion, status] of [['released', '1.1.0', 'RELEASED'], ['archive', '1.0.0', 'ARCHIVED']]) {
      const historicalId = `demo-ns-${profile.id}-${suffix}`;
      if (model.namespaces.some(row => row.id === historicalId)) continue;
      const historicalVersion = `${historicalId}-version`;
      model.versions.push({ id: historicalVersion, projectId: profile.projectId, name: `v${semanticVersion}`, status, isLatest: false, createdAt: suffix === 'released' ? '2026-10-20T08:00:00.000Z' : '2026-10-01T08:00:00.000Z', description: suffix === 'released' ? '业务评审通过的发布快照。' : '第一版建模基线。' });
      const snapshot = buildDemoNamespace(profile, historicalId, historicalVersion);
      const remap = new Map(CORE_KINDS.flatMap(kind => snapshot[kind].map(row => [row.id, `${row.id}-${suffix}`])));
      CORE_KINDS.forEach(kind => { model[kind].push(...snapshot[kind].map(row => ({ ...row, id: kind === 'namespaces' ? historicalId : remap.get(row.id), namespaceId: kind === 'namespaces' ? undefined : historicalId, baseId: kind === 'namespaces' ? namespace.baseId || namespace.id : row.id, parentId: remap.get(row.parentId) || '', targetTypeId: remap.get(row.targetTypeId) || '', status, semanticVersion, updatedAt: '2026-10-20T08:00:00.000Z' }))); });
    }
    const fileIds = ['sql', 'json', 'txt'].map(extension => `demo-input-${profile.id}-${extension}`);
    const contents = [profile.entities.map(([code]) => `CREATE TABLE ${code} (id VARCHAR(64) NOT NULL, name VARCHAR(128), createdAt DATETIME${(BUSINESS_FIELDS[code] || []).map(([field, , type]) => `, ${field} ${{ Decimal: 'DECIMAL(18,2)', Integer: 'INT', Boolean: 'BOOLEAN', DateTime: 'DATETIME' }[type] || 'VARCHAR(128)'}`).join('')});`).join('\n\n'), JSON.stringify(Object.fromEntries(profile.entities.map(([code, name], index) => [code, { id: String(index + 1).padStart(3, '0'), name, status: 'ACTIVE' }])), null, 2), `${profile.name}业务规范\n\n${profile.entities.map(([, name]) => `${name}具有业务标识、名称和创建时间。业务标识不能为空。`).join('\n')}\n\n${(BUSINESS_RELATIONS[profile.id] || []).map(([source, target, , name]) => `${source}通过“${name}”关系关联${target}。`).join('\n')}`];
    const legacyContents = [`CREATE TABLE ${profile.entities[0][0]} (id VARCHAR(64), name VARCHAR(128), created_at DATETIME);`, JSON.stringify({ [profile.entities[0][0]]: { id: '001', name: profile.entities[0][1], status: 'ACTIVE' }, [profile.entities[1][0]]: { id: '002', name: profile.entities[1][1] } }, null, 2), `${profile.entities[0][1]}关联${profile.entities[1][1]}。${profile.entities[0][1]}具有业务标识、名称和创建时间。业务标识不能为空。`];
    fileIds.forEach((id, index) => { const old = assets.find(row => row.id === id); if (old?.content === legacyContents[index]) { old.content = contents[index]; old.sizeBytes = new TextEncoder().encode(contents[index]).length; } });
    fileIds.forEach((id, index) => { if (!assets.some(row => row.id === id)) assets.push({ id, name: `${profile.name}${['表结构', '业务模型', '业务规范'][index]}`, fileName: `${profile.id}.${['sql', 'json', 'txt'][index]}`, fileType: ['SQL', 'JSON', 'TXT'][index], sizeBytes: new TextEncoder().encode(contents[index]).length, mimeType: ['application/sql', 'application/json', 'text/plain'][index], metadataType: ['structured', 'semistructured', 'unstructured'][index], directoryId: 'dir-demo-ontology-input', directory: '本体构建示例资料', projectId: 'global', assetLevel: 'PLATFORM', content: contents[index], storageType: 'object_storage', storageService: 'RustFS（演示）', objectKey: `demo/ontology/${profile.id}.${['sql', 'json', 'txt'][index]}`, sourceType: 'manual_upload', collectionMethod: 'manual_upload', version: '1.0.0', status: 'published', createdAt: date, collectedAt: date }); });
    const count = CORE_KINDS.filter(kind => kind !== 'namespaces').reduce((sum, kind) => sum + model[kind].filter(row => row.namespaceId === namespaceId && row.versionId === versionId).length, 0);
    const addition = { namespaceId, schemaVersionId: versionId, semanticVersion: namespace.semanticVersion, branch: 'main', origin: ontology?.origin || profile.origin, linkedAssetIds: [...new Set([...(ontology?.linkedAssetIds || []), ...fileIds])], elementCount: count, namespaceCount: 1 };
    if (ontology) Object.assign(ontology, addition);
    else { ontology = { id: modelId, projectId: profile.projectId, name: profile.name, code: profile.id, domain: profile.domain, description: profile.description, status: 'DRAFT', linkedAssetIds: fileIds, createdAt: date, updatedAt: date, ...addition }; models.push(ontology); }
    seeded.push({ profile, ontology, generated, fileIds });
  }
  for (const owner of [MAIN, SUPPLY].filter(id => projects.some(row => row.id === id))) {
    const state = workflows[owner] ||= { tasks: [], records: [], comparisons: [], objects: {}, modelConfig: null };
    state.tasks ||= []; state.records ||= []; state.comparisons ||= []; state.objects ||= {};
    state.modelConfig ||= { connectionId: 'demo-llm-deepseek', connectionName: 'DeepSeek 业务语义模型（示例）', model: 'deepseek-chat', endpoint: 'https://api.deepseek.com/v1', location: 'remote' };
    seeded.filter(row => row.profile.projectId === owner).forEach(({ profile, ontology, generated, fileIds }, index) => {
      for (const [typeIndex, sourceType] of ['structured', 'semistructured', 'unstructured'].entries()) {
        if (index > 1 && typeIndex > 0) continue;
        const taskId = `demo-build-${profile.id}-${sourceType}`;
        if (!state.tasks.some(row => row.id === taskId)) state.tasks.push({ id: taskId, namespaceId: ontology.namespaceId, name: `${profile.domain}${['表结构建模', '业务模型提取', '规范文档建模'][typeIndex]}`, sourceType, assetFileIds: [fileIds[typeIndex]], modelSource: 'project', enabled: true, createdAt: date, updatedAt: date, demo: true });
        const status = typeIndex === 0 ? 'SUCCEEDED' : typeIndex === 1 ? 'FAILED' : index === 0 ? 'RUNNING' : 'CANCELLED';
        const recordId = `${taskId}-record-1`;
        const existingRecord = state.records.find(row => row.id === recordId);
        if (existingRecord && !existingRecord.demo) continue;
        const createdAt = new Date(new Date(date).getTime() + (index * 3 + typeIndex) * 60000).toISOString();
        const candidates = candidatesFrom(generated);
        const files = status === 'SUCCEEDED' ? ['json', 'dsl'].map(format => ({ name: `${profile.id}-ontology.${format}`, key: `spgo/demo/${recordId}.${format}`, format })) : [];
        files.forEach(file => { state.objects[file.key] = file.format === 'json' ? JSON.stringify({ namespaceId: ontology.namespaceId, createdAt, candidates }, null, 2) : candidates.map(row => `${row.element_type} ${row.label}`).join('\n'); });
        if (existingRecord) {
          existingRecord.candidateCount = status === 'SUCCEEDED' ? candidates.length : 0;
          continue;
        }
        state.records.push({ id: recordId, taskId, taskName: state.tasks.find(row => row.id === taskId).name, namespaceId: ontology.namespaceId, sourceType, createdAt, startedAt: createdAt, endedAt: status !== 'RUNNING' ? new Date(new Date(createdAt).getTime() + 21000).toISOString() : '', durationMs: status === 'RUNNING' ? null : 21000, status, candidateCount: status === 'SUCCEEDED' ? candidates.length : 0, modelConfig: { ...state.modelConfig }, engine: 'demo-parser', assetFileNames: [`${profile.id}.${['sql', 'json', 'txt'][typeIndex]}`], assetFileIds: [fileIds[typeIndex]], files, stages: buildDemoStages(status, createdAt), sequence: 1, actor: '演示账号', demo: true, error: status === 'FAILED' ? '示例：输入缺少关系目标定义，关系提取步骤失败。' : '' });
      }
      if (!histories.some(row => row.id === `demo-review-${profile.id}`)) histories.push({ id: `demo-review-${profile.id}`, projectId: owner, ontologyId: ontology.id, ontologyName: ontology.name, sourceName: `${profile.id}-v1.1.json`, sourceType: 'file', status: 'COMPLETED', demo: true, createdAt: '2026-10-20T09:00:00.000Z', updatedAt: date, logs: [['ADD', '新增业务标识'], ['UPDATE', '完善关系说明'], ['DELETE', '移除过时分类']].map(([operation, itemName], i) => ({ id: `demo-log-${profile.id}-${i}`, kind: ['properties', 'relations', 'conceptTypes'][i], operation, itemName, decision: i === 2 ? 'KEPT' : 'APPLIED', timestamp: `2026-10-20T09:0${i}:00.000Z`, before: i === 1 ? { description: '相关对象' } : null, after: { description: i === 1 ? '明确关联对象和业务含义' : itemName } })) });
    });
    state.records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  const connections = read('datapilot.llmConnections', []);
  for (const row of [{ id: 'demo-llm-deepseek', name: 'DeepSeek 业务语义模型（示例）', provider: 'DeepSeek', model: 'deepseek-chat', endpoint: 'https://api.deepseek.com/v1', location: 'remote', enabled: true }, { id: 'demo-llm-qwen', name: 'Qwen 本地建模（示例）', provider: 'Ollama', model: 'qwen3:8b', endpoint: 'http://localhost:11434/v1', location: 'local', enabled: true }, { id: 'demo-llm-backup', name: '备用模型网关（示例）', provider: 'OpenAI compatible', model: 'ontology-model', endpoint: 'https://model-gateway.example.com/v1', location: 'remote', enabled: false }]) if (!connections.some(item => item.id === row.id)) connections.push({ ...row, apiKey: '', demo: true, updatedAt: date });
  const writes = { 'datapilot.spgSchemaModel': model, 'datapilot.ontologyModels': models, 'datapilot.dataAssets': assets, 'datapilot.directories': directories, 'datapilot.spgWorkflow': workflows, 'datapilot.ontologyMergeHistory': histories, 'datapilot.llmConnections': connections };
  Object.entries(writes).forEach(([key, value]) => storage.setItem(key, JSON.stringify(value)));
  storage.setItem(marker, '1');
}

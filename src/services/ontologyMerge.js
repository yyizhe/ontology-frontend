import { CORE_KINDS } from './spgModel.js';

export const MERGE_KIND_LABELS = {
  entityTypes: 'General Entity', conceptTypes: 'Concept', eventTypes: 'Event',
  standardValues: 'Standard Value', properties: 'Property', relations: 'Relation', constraints: 'Constraint', rules: 'Rule',
};
export const MERGE_FIELD_LABELS = {
  name: '名称', code: '编码', description: '业务描述', dataType: '数据类型', value: '标准值',
  constraintType: '约束类型', expression: '表达式', targetTypeId: '关系目标', targetType: '目标类型',
  cardinality: '取值基数', required: '必填', multiValue: '多值', predicateCode: '关系谓词',
  predicateSemantic: '谓词语义', sourceCardinality: '出边基数', targetCardinality: '入边基数',
  featureGroup: '关系分组', trigger: '触发事件', condition: '判定条件', action: '执行动作', scope: '应用范围',
};
const COMPARE_FIELDS = Object.keys(MERGE_FIELD_LABELS);
const STORAGE_KEY = 'datapilot.ontologyMergeReview';
const HISTORY_KEY = 'datapilot.ontologyMergeHistory';

const kindRows = (model, versionId) => Object.fromEntries(CORE_KINDS.map((kind) => [kind,
  (model[kind] || []).filter((row) => !versionId || row.versionId === versionId)]));

export function snapshotNamespaceVersion(model, namespaceId, versionId) {
  return Object.fromEntries(CORE_KINDS.map((kind) => [kind,
    (model[kind] || []).filter((row) => row.versionId === versionId && (kind === 'namespaces' ? row.id === namespaceId : row.namespaceId === namespaceId))]));
}

export function elementIdentity(kind, row, rows) {
  const parent = row.parentId && row.parentKind !== 'namespaces'
    ? (rows[row.parentKind] || []).find((item) => item.id === row.parentId)
    : null;
  return [kind, row.parentKind || '', row.parentKind === 'namespaces' ? '@ontology' : parent?.code || '', row.code || ''].join('|');
}

function comparableValue(field, value, row, rows) {
  if (field === 'targetTypeId') {
    const target = ['entityTypes', 'conceptTypes', 'eventTypes', 'standardValues']
      .flatMap((kind) => rows[kind] || []).find((item) => item.id === value);
    return target?.code || target?.name || value || '';
  }
  return value == null ? '' : value;
}

export function buildOntologyDiff(currentModel, incomingModel, { versionId, fullSnapshot = true } = {}) {
  const current = kindRows(currentModel, versionId);
  const incoming = kindRows(incomingModel);
  const rows = [];
  const comparedKinds = CORE_KINDS.filter((kind) => kind !== 'namespaces');

  for (const kind of comparedKinds) {
    const currentByKey = new Map(current[kind].map((row) => [elementIdentity(kind, row, current), row]));
    const incomingByKey = new Map(incoming[kind].map((row) => [elementIdentity(kind, row, incoming), row]));
    for (const [key, next] of incomingByKey) {
      const previous = currentByKey.get(key);
      const changes = previous ? COMPARE_FIELDS.flatMap((field) => {
        const before = comparableValue(field, previous[field], previous, current);
        const after = comparableValue(field, next[field], next, incoming);
        return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ field, before, after }];
      }) : COMPARE_FIELDS.flatMap((field) => {
        const after = comparableValue(field, next[field], next, incoming);
        return after === '' ? [] : [{ field, before: '', after }];
      });
      if (!previous || changes.length) rows.push({
        id: `${kind}:${key}`, kind, key, operation: previous ? 'UPDATE' : 'ADD',
        existing: previous || null, incoming: next, changes, status: 'PENDING',
      });
    }
    if (fullSnapshot) for (const [key, previous] of currentByKey) if (!incomingByKey.has(key)) rows.push({
      id: `${kind}:${key}`, kind, key, operation: 'DELETE', existing: previous, incoming: null,
      changes: [
        { field: '存在状态', before: '存在', after: '待删除' },
        ...COMPARE_FIELDS.flatMap((field) => {
          const before = comparableValue(field, previous[field], previous, current);
          return before === '' ? [] : [{ field, before, after: '' }];
        }),
      ], status: 'PENDING',
    });
  }
  const order = { ADD: 0, UPDATE: 1, DELETE: 2 };
  rows.sort((a, b) => order[a.operation] - order[b.operation] || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  return { current, incoming, rows };
}

export function createMergeReviewSession({ currentModel, incomingModel, projectId, ontology, namespaceId, versionId, sourceName, sourceType = 'file', fullSnapshot = true }) {
  const { current, incoming, rows } = buildOntologyDiff(currentModel, incomingModel, { versionId, fullSnapshot });
  const now = new Date().toISOString();
  const session = {
    id: crypto.randomUUID(), projectId, ontologyId: ontology.id, ontologyName: ontology.name,
    namespaceId, versionId, sourceName, sourceType, current, incoming, rows, logs: [],
    status: rows.length ? 'REVIEWING' : 'COMPLETED', createdAt: now, updatedAt: now,
  };
  return session;
}

export function makeDemoIncomingModel(currentModel) {
  const incoming = Object.fromEntries(CORE_KINDS.map((kind) => [kind, (currentModel[kind] || []).map((row) => ({ ...row }))]));
  const namespace = incoming.namespaces.find((row) => row.versionId === currentModel.versions?.find((item) => item.isLatest)?.id) || incoming.namespaces[0];
  if (!namespace) throw new Error('当前本体没有可演示的 Namespace');

  const entity = incoming.entityTypes.find((row) => row.code === 'Equipment') || incoming.entityTypes[0];
  if (entity) entity.description = `${entity.description || '设备语义定义'}（差异审核演示：已更新说明）`;

  const existingCodes = new Set(incoming.entityTypes.map((row) => row.code));
  const demoCode = ['CalibrationPlanDemo', 'MaintenancePlanDemo', 'ReviewSampleEntity'].find((code) => !existingCodes.has(code));
  const newEntityId = `demo-entity-${crypto.randomUUID()}`;
  incoming.entityTypes.push({
    id: newEntityId, projectId: namespace.projectId, namespaceId: namespace.id, versionId: namespace.versionId,
    name: '校准计划（演示）', code: demoCode, description: '用于演示导入差异中的新增实体。',
    parentId: '', parentKind: '', status: 'DRAFT', semanticVersion: '1.0.0',
  });
  incoming.properties.push({
    id: `demo-property-${crypto.randomUUID()}`, projectId: namespace.projectId, namespaceId: namespace.id,
    versionId: namespace.versionId, parentId: newEntityId, parentKind: 'entityTypes',
    name: 'plannedAt', code: 'plannedAt', dataType: 'DateTime', cardinality: '0..1',
    description: '计划执行时间（演示新增属性）。', status: 'DRAFT', semanticVersion: '1.0.0',
  });

  const removalOrder = ['rules', 'constraints', 'properties', 'relations', 'standardValues', 'conceptTypes', 'eventTypes', 'entityTypes'];
  const removable = removalOrder.flatMap((kind) => (currentModel[kind] || []).map((row) => ({ kind, row }))).find(({ row }) => {
    const allRows = CORE_KINDS.flatMap((kind) => currentModel[kind] || []);
    const hasChildren = allRows.some((item) => item.parentId === row.id);
    const isReferenced = allRows.some((item) => item.targetTypeId === row.id);
    return !hasChildren && !isReferenced;
  });
  if (removable) incoming[removable.kind] = incoming[removable.kind].filter((row) => row.id !== removable.row.id);
  return incoming;
}

export function readActiveMergeReview() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
}
export function persistMergeReview(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  const history = readMergeHistory();
  const summary = {
    id: session.id, projectId: session.projectId, ontologyId: session.ontologyId,
    ontologyName: session.ontologyName, sourceName: session.sourceName, sourceType: session.sourceType,
    createdAt: session.createdAt, updatedAt: session.updatedAt, status: session.status,
    logs: session.logs || [],
  };
  const next = [summary, ...history.filter((item) => item.id !== session.id)].slice(0, 50);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}
export function clearActiveMergeReview() { localStorage.removeItem(STORAGE_KEY); }
export function readMergeHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}

import * as api from './localApi';
import * as schema from './spgSchemaApi';
import { CORE_KINDS } from './spgModel';

// Models keep a stable namespace family; a version is a snapshot of that ontology.
export function scopeOntology(model, ontology) {
  if (!ontology?.namespaceId) return model;
  const anchor = model.namespaces.find((row) => row.id === ontology.namespaceId || row.baseId === ontology.namespaceId);
  const family = anchor?.baseId || anchor?.id || ontology.namespaceId;
  const namespaces = model.namespaces.filter((row) => (row.baseId || row.id) === family);
  const ids = new Set(namespaces.map((row) => row.id));
  const versions = new Set(namespaces.map((row) => row.versionId));
  return { ...model, versions: model.versions.filter((row) => versions.has(row.id)), namespaces,
    ...Object.fromEntries(CORE_KINDS.filter((kind) => kind !== 'namespaces').map((kind) => [kind, (model[kind] || []).filter((row) => ids.has(row.namespaceId))])) };
}

export async function bindOntologyModels(rows, isCurrent = () => true) {
  if (!rows.length) return rows;
  const model = await schema.listSpgCoreModel();
  const draft = model.versions.find((row) => row.isLatest && row.status === 'DRAFT') || model.versions.find((row) => row.status === 'DRAFT');
  const used = new Set(rows.map((row) => row.namespaceId).filter(Boolean));
  const result = [];
  for (const row of rows) {
    if (!isCurrent()) return [];
    let namespace = model.namespaces.find((item) => item.id === row.namespaceId);
    if (!namespace) {
      namespace = model.namespaces.find((item) => item.versionId === draft?.id && !used.has(item.id));
      if (!namespace) {
        if (!draft) throw new Error('当前项目没有可用于新建本体的草稿版本');
        namespace = await schema.saveSpgCoreElement('namespaces', { name: row.name, code: row.code || `ontology_${row.id}`, versionId: draft.id, uri: `urn:spgo:${row.id}:`, scope: 'PROJECT', description: row.description || '' });
        model.namespaces.push(namespace);
      }
      used.add(namespace.id);
      await api.saveOntologyModel({ ...row, namespaceId: namespace.id, schemaVersionId: namespace.versionId, namespaceCount: 1 });
    }
    const scoped = scopeOntology(model, { namespaceId: namespace.id });
    const latest = [...scoped.versions].sort((a, b) => Number(Boolean(b.isLatest)) - Number(Boolean(a.isLatest)) || new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
    const current = scoped.namespaces.find((item) => item.versionId === latest?.id) || namespace;
    result.push({ ...row, namespaceId: namespace.id, namespaceCount: 1, schemaVersionId: current.versionId, semanticVersion: current.semanticVersion || row.semanticVersion || '1.0.0', branch: row.branch || current.branch || 'main',
      elementCount: CORE_KINDS.filter((kind) => kind !== 'namespaces').reduce((sum, kind) => sum + scoped[kind].filter((item) => item.versionId === current.versionId).length, 0) });
  }
  return result;
}

export async function importOntologyElements(parsed, namespace) {
  const kinds = CORE_KINDS.filter((kind) => kind !== 'namespaces');
  if (!kinds.some((kind) => Array.isArray(parsed[kind]) && parsed[kind].length)) throw new Error('文件没有可导入的 SPGO 元素，请选择本系统导出的本体 JSON 文件');
  const ids = new Map(kinds.flatMap((kind) => (parsed[kind] || []).map((row) => [row.id, null])));
  for (const kind of kinds) for (const row of parsed[kind] || []) {
    if (!row.id || !row.name || !row.code) throw new Error('元素必须包含 id、name、code');
    if (row.parentId && row.parentKind !== 'namespaces' && !ids.has(row.parentId)) throw new Error(`元素 ${row.name} 的父元素不在文件中`);
    if (row.targetTypeId && !ids.has(row.targetTypeId)) throw new Error(`元素 ${row.name} 的关系目标不在文件中`);
  }
  const pending = kinds.flatMap((kind) => (parsed[kind] || []).map((row) => ({ kind, row })));
  const created = new Set();
  while (pending.length) {
    const index = pending.findIndex(({ row }) => (!row.parentId || row.parentKind === 'namespaces' || created.has(row.parentId)) && (!row.targetTypeId || created.has(row.targetTypeId)));
    if (index < 0) throw new Error('本体文件存在循环引用，无法导入');
    const { kind, row } = pending.splice(index, 1)[0];
    const saved = await schema.saveSpgCoreElement(kind, { ...row, id: undefined, schemaId: undefined, namespaceId: namespace.id, versionId: namespace.versionId,
      parentId: row.parentKind === 'namespaces' ? namespace.id : ids.get(row.parentId) || '',
      targetTypeId: ids.get(row.targetTypeId) || '', baseId: undefined, status: 'DRAFT', origin: 'import',
      ...(['conceptTypes', 'eventTypes', 'standardValues'].includes(kind) ? { hypernymPredicate: '' } : {}) });
    ids.set(row.id, saved.id);
    created.add(row.id);
  }
  return created.size;
}

export function extractionTemplate(candidates) {
  const result = Object.fromEntries(CORE_KINDS.filter((kind) => kind !== 'namespaces').map((kind) => [kind, []]));
  const byId = new Map(candidates.map((row) => [row.id, row]));
  for (const row of candidates) {
    if (!result[row.element_type]) throw new Error(`不支持的构建元素类型 ${row.element_type}`);
    const parentId = row.element_type === 'relations' ? row.source : row.domain;
    const parent = byId.get(parentId);
    result[row.element_type].push({ id: row.id, name: row.label, code: row.label || row.id,
      description: row.definition || row.evidence || '', parentId: parent?.id || '', parentKind: parent?.element_type || '',
      dataType: row.range || 'String', targetTypeId: row.element_type === 'relations' ? row.target : '',
      targetType: row.targetLabel || '', cardinality: '0..1', constraintType: row.constraintType || 'NOT_NULL',
      expression: row.expression || '', origin: 'extraction' });
  }
  return result;
}

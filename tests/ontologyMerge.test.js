import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOntologyDiff, makeDemoIncomingModel, snapshotNamespaceVersion } from '../src/services/ontologyMerge.js';

function model() {
  const versionId = 'version-draft';
  return {
    versions: [{ id: versionId, isLatest: true, status: 'DRAFT' }],
    namespaces: [
      { id: 'namespace-a', versionId, projectId: 'project-a', name: 'A', code: 'a' },
      { id: 'namespace-b', versionId, projectId: 'project-a', name: 'B', code: 'b' },
    ],
    entityTypes: [
      { id: 'entity-a', versionId, namespaceId: 'namespace-a', name: 'Customer', code: 'Customer', description: '原描述' },
      { id: 'entity-b', versionId, namespaceId: 'namespace-b', name: 'Customer', code: 'Customer', description: '另一 Namespace' },
    ],
    conceptTypes: [], eventTypes: [], standardValues: [],
    properties: [
      { id: 'property-a', versionId, namespaceId: 'namespace-a', parentId: 'entity-a', parentKind: 'entityTypes', name: 'name', code: 'name', dataType: 'String' },
      { id: 'property-b', versionId, namespaceId: 'namespace-b', parentId: 'entity-b', parentKind: 'entityTypes', name: 'name', code: 'name', dataType: 'String' },
    ],
    relations: [], constraints: [], rules: [],
  };
}

test('namespace snapshot isolates elements that share the same project version', () => {
  const current = snapshotNamespaceVersion(model(), 'namespace-a', 'version-draft');
  assert.deepEqual(current.namespaces.map((row) => row.id), ['namespace-a']);
  assert.deepEqual(current.entityTypes.map((row) => row.id), ['entity-a']);
  assert.deepEqual(current.properties.map((row) => row.id), ['property-a']);
});

test('diff reports additions, field updates and deletions with reviewable values', () => {
  const current = snapshotNamespaceVersion(model(), 'namespace-a', 'version-draft');
  const incoming = structuredClone(current);
  incoming.entityTypes[0] = { ...incoming.entityTypes[0], id: 'external-entity', description: '新描述' };
  incoming.properties = [];
  incoming.conceptTypes.push({ id: 'external-concept', name: '状态', code: 'Status', description: '设备状态' });

  const result = buildOntologyDiff(current, incoming, { versionId: 'version-draft' });
  assert.deepEqual(result.rows.map((row) => row.operation).sort(), ['ADD', 'DELETE', 'UPDATE']);
  assert.ok(result.rows.find((row) => row.operation === 'UPDATE').changes.some((change) => change.field === 'description'));
  assert.ok(result.rows.find((row) => row.operation === 'ADD').changes.some((change) => change.field === 'name'));
  assert.ok(result.rows.find((row) => row.operation === 'DELETE').changes.some((change) => change.field === '存在状态'));
});

test('partial build records do not imply deletion of omitted current definitions', () => {
  const current = snapshotNamespaceVersion(model(), 'namespace-a', 'version-draft');
  const result = buildOntologyDiff(current, { entityTypes: [{ ...current.entityTypes[0], description: '更新' }] }, { fullSnapshot: false });
  assert.ok(result.rows.every((row) => row.operation !== 'DELETE'));
});

test('demo model includes safe add, update and leaf deletion cases', () => {
  const current = snapshotNamespaceVersion(model(), 'namespace-a', 'version-draft');
  current.versions = [{ id: 'version-draft', isLatest: true }];
  current.rules = [{ id: 'rule-a', versionId: 'version-draft', namespaceId: 'namespace-a', name: 'Rule', code: 'Rule' }];
  const incoming = makeDemoIncomingModel(current);
  const result = buildOntologyDiff(current, incoming, { versionId: 'version-draft' });
  assert.ok(result.rows.some((row) => row.operation === 'ADD' && row.kind === 'entityTypes'));
  assert.ok(result.rows.some((row) => row.operation === 'ADD' && row.kind === 'properties'));
  assert.ok(result.rows.some((row) => row.operation === 'UPDATE'));
  assert.ok(result.rows.some((row) => row.operation === 'DELETE' && row.kind === 'rules'));
});

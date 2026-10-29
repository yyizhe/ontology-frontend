import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_PROFILES, buildDemoNamespace, installOntologyDemo } from '../src/services/ontologyDemo.js';
import { CORE_KINDS } from '../src/services/spgModel.js';

function fixture() {
  const data = new Map();
  const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
  storage.setItem('datapilot.projects', JSON.stringify(['project-demo-main', 'project-demo-supply'].map(id => ({ id }))));
  const initial = { versions: [], ...Object.fromEntries(CORE_KINDS.map(kind => [kind, []])) };
  return { data, storage, initial, read: key => JSON.parse(storage.getItem(`datapilot.${key}`)) };
}

test('both projects have four populated ontologies with valid scoped references and three versions', () => {
  const f = fixture();
  installOntologyDemo(f.storage, f.initial);
  const model = f.read('spgSchemaModel');
  const models = f.read('ontologyModels');
  assert.equal(models.length, 8);
  assert.equal(new Set(CORE_KINDS.flatMap(kind => model[kind].map(row => row.id))).size, CORE_KINDS.reduce((sum, kind) => sum + model[kind].length, 0));
  for (const ontology of models) {
    assert.ok(ontology.elementCount > 25);
    const family = model.namespaces.filter(row => (row.baseId || row.id) === ontology.namespaceId);
    assert.equal(family.length, 3);
    assert.deepEqual(new Set(family.map(row => row.status)), new Set(['DRAFT', 'RELEASED', 'ARCHIVED']));
    for (const namespace of family) {
      assert.equal(namespace.projectId, ontology.projectId);
      const elements = CORE_KINDS.flatMap(kind => model[kind]).filter(row => row.namespaceId === namespace.id);
      const ids = new Set(elements.map(row => row.id));
      for (const element of elements) {
        assert.equal(element.versionId, namespace.versionId);
        if (element.parentId) assert.ok(ids.has(element.parentId), `missing parent ${element.parentId}`);
        if (element.targetTypeId) assert.ok(ids.has(element.targetTypeId), `missing target ${element.targetTypeId}`);
      }
    }
  }
});

test('workflow examples connect to readable input, complete outputs, five steps and varied states', () => {
  const f = fixture(); installOntologyDemo(f.storage, f.initial);
  const assets = f.read('dataAssets');
  assert.equal(assets.length, 24);
  for (const state of Object.values(f.read('spgWorkflow'))) {
    assert.equal(state.tasks.length, 8); assert.equal(state.records.length, 8);
    assert.deepEqual(new Set(state.records.map(row => row.status)), new Set(['SUCCEEDED', 'FAILED', 'RUNNING', 'CANCELLED']));
    state.tasks.forEach(task => task.assetFileIds.forEach(id => assert.ok(assets.find(row => row.id === id)?.content)));
    for (const record of state.records) {
      assert.equal(record.stages.length, 5);
      if (record.status === 'SUCCEEDED') {
        assert.equal(record.files.length, 2);
        const candidates = JSON.parse(state.objects[record.files[0].key]).candidates;
        const ids = new Set(candidates.map(row => row.id));
        for (const row of candidates) for (const key of ['domain', 'source', 'target']) if (row[key]) assert.ok(ids.has(row[key]));
      } else assert.equal(record.files.length, 0);
      for (const stage of record.stages) if (['PENDING', 'CANCELLED'].includes(stage.status)) assert.equal(stage.startedAt, '');
    }
  }
});

test('migration is additive and idempotent and keeps existing edits and custom resources', () => {
  const f = fixture();
  const profile = DEMO_PROFILES[0];
  const model = { versions: [{ id: 'custom-version' }], ...buildDemoNamespace(profile, 'custom-ns', 'custom-version') };
  model.entityTypes[0].description = '用户编辑的描述';
  f.storage.setItem('datapilot.spgSchemaModel', JSON.stringify(model));
  f.storage.setItem('datapilot.ontologyModels', JSON.stringify([{ id: 'model-industrial-equipment', projectId: profile.projectId, namespaceId: 'custom-ns', name: '用户命名', linkedAssetIds: ['custom-file'] }]));
  f.storage.setItem('datapilot.dataAssets', JSON.stringify([{ id: 'custom-file', content: '用户内容' }]));
  installOntologyDemo(f.storage, f.initial);
  assert.equal(f.read('spgSchemaModel').entityTypes.find(row => row.id === model.entityTypes[0].id).description, '用户编辑的描述');
  assert.equal(f.read('ontologyModels').find(row => row.id === 'model-industrial-equipment').name, '用户命名');
  assert.ok(f.read('ontologyModels')[0].linkedAssetIds.includes('custom-file'));
  const before = [...f.data.entries()];
  installOntologyDemo(f.storage, f.initial);
  assert.deepEqual([...f.data.entries()], before);
});

test('seeding never modifies a released ontology snapshot', () => {
  const f = fixture();
  const profile = DEMO_PROFILES.find(row => row.id === 'supply-chain');
  const source = buildDemoNamespace(profile);
  CORE_KINDS.forEach(kind => source[kind].forEach(row => { row.status = 'RELEASED'; }));
  const model = { ...source, versions: [{ id: source.namespaces[0].versionId, status: 'RELEASED', projectId: profile.projectId }] };
  f.storage.setItem('datapilot.spgSchemaModel', JSON.stringify(model));
  f.storage.setItem('datapilot.ontologyModels', JSON.stringify([{ id: 'model-supply-chain', projectId: profile.projectId, namespaceId: source.namespaces[0].id }]));
  installOntologyDemo(f.storage, model);
  const next = f.read('spgSchemaModel');
  for (const kind of CORE_KINDS) for (const row of source[kind]) assert.deepEqual(next[kind].find(item => item.id === row.id), JSON.parse(JSON.stringify(row)));
  const ids = CORE_KINDS.flatMap(kind => next[kind].map(row => row.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(next.namespaces.some(row => row.baseId === source.namespaces[0].id && row.status === 'DRAFT'));
});

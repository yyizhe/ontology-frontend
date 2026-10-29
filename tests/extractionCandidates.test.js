import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeCandidates } from '../src/services/extractionCandidates.js';

test('multi-table extraction preserves id/name fields on each table', () => {
  const rows = ['Supplier', 'Material', 'PurchaseOrder'].flatMap(domain => ['id', 'name'].map(label => ({ id: `${domain}-${label}`, element_type: 'properties', domain, label })));
  assert.deepEqual(dedupeCandidates([...rows, { ...rows[0], evidence: '重复证据' }]), rows);
});

test('relationships with different targets and elements of different kinds remain separate', () => {
  const rows = [
    { element_type: 'relations', label: '供应', source: 'Supplier', target: 'Material' },
    { element_type: 'relations', label: '供应', source: 'Supplier', target: 'Product' },
    { element_type: 'entityTypes', label: '供应' },
  ];
  assert.deepEqual(dedupeCandidates(rows), rows);
});

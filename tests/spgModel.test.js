import test from "node:test";
import assert from "node:assert/strict";
import { CORE_KINDS, saveElement, removeElement, cloneNamespace, restoreElementSnapshot, snapshotElementAncestors, statusOf } from "../src/services/spgModel.js";

function fixture() {
  const model = Object.fromEntries(CORE_KINDS.map((kind) => [kind, []]));
  model.versions = [{ id: "v1", projectId: "p1", status: "DRAFT", isLatest: true }];
  model.namespaces = [{ id: "n1", projectId: "p1", versionId: "v1", name: "Demo", code: "demo", semanticVersion: "1.0.0", status: "DRAFT" }];
  model.entityTypes = [{ id: "e1", projectId: "p1", versionId: "v1", namespaceId: "n1", name: "Entity", code: "Entity", status: "DRAFT", semanticVersion: "1.2.3" }];
  model.properties = [{ id: "a1", projectId: "p1", versionId: "v1", namespaceId: "n1", parentId: "e1", parentKind: "entityTypes", name: "code", code: "code", description: "Old", status: "DRAFT", semanticVersion: "1.2.3" }];
  return model;
}
const value = (extra = {}) => ({ projectId: "p1", versionId: "v1", namespaceId: "n1", name: "New", code: "new", ...extra });
test("description edits bump property and owning entity patch", () => {
  const model = fixture();
  const result = saveElement(model, "properties", { id: "a1", projectId: "p1", description: "Updated" });
  assert.equal(result.row.semanticVersion, "1.2.4");
  assert.equal(result.model.entityTypes[0].semanticVersion, "1.2.4");
  assert.equal(model.properties[0].description, "Old");
});
test("new property requires an existing anchored subject", () => {
  assert.throws(() => saveElement(fixture(), "properties", value()), /主体/);
  assert.throws(() => saveElement(fixture(), "properties", value({ parentId: "missing", parentKind: "entityTypes" })), /主体/);
});
test("only general entities support subclass inheritance", () => {
  for (const kind of ["conceptTypes", "eventTypes", "standardValues"]) {
    assert.throws(() => saveElement(fixture(), kind, value({ parentId: "e1", parentKind: "entityTypes" })), /继承/);
    assert.throws(() => saveElement(fixture(), kind, value({ hypernymPredicate: "isA" })), /继承/);
  }
  assert.ok(saveElement(fixture(), "entityTypes", value({ parentId: "e1", parentKind: "entityTypes" })).row.id);
});
test("released namespace locks descendants, including draft descendants", () => {
  const model = fixture();
  model.namespaces[0].status = "RELEASED";
  assert.equal(statusOf(model, model.properties[0]), "RELEASED");
  assert.throws(() => saveElement(model, "properties", { id: "a1", projectId: "p1", description: "Updated" }), /新镜像/);
  assert.throws(() => removeElement(model, "entityTypes", "e1", "p1"), /新镜像/);
});
test("archived version blocks new namespace and all edits", () => {
  const model = fixture();
  model.versions[0].status = "ARCHIVED";
  assert.throws(() => saveElement(model, "namespaces", value()), /新镜像/);
});
test("cross project and version subjects cannot be attached", () => {
  const model = fixture();
  model.entityTypes[0].projectId = "p2";
  assert.throws(() => saveElement(model, "properties", value({ parentId: "e1", parentKind: "entityTypes" })), /主体/);
});
test("anchored subject cannot be changed after creation", () => {
  const model = fixture();
  model.entityTypes.push({ ...model.entityTypes[0], id: "e2", code: "Other", name: "Other" });
  assert.throws(() => saveElement(model, "properties", { id: "a1", projectId: "p1", parentId: "e2" }), /不可迁移/);
});
test("namespace clone remaps attributes and relationship references without changing source", () => {
  const model = fixture();
  model.namespaces[0].status = "RELEASED";
  model.relations = [value({ id: "r1", parentId: "e1", parentKind: "entityTypes", targetTypeId: "e1" })];
  const result = cloneNamespace(model, "n1", "p1");
  const entity = result.model.entityTypes.find((item) => item.namespaceId === result.namespaceId);
  const property = result.model.properties.find((item) => item.namespaceId === result.namespaceId);
  const relation = result.model.relations.find((item) => item.namespaceId === result.namespaceId);
  assert.equal(property.parentId, entity.id);
  assert.equal(relation.targetTypeId, entity.id);
  assert.equal(statusOf(result.model, property), "DRAFT");
  assert.equal(model.namespaces.length, 1);
  assert.equal(model.namespaces[0].status, "RELEASED");
});
test("deleting subject removes descendants and preserves other namespaces", () => {
  const model = fixture();
  model.standardValues = [value({ id: "s1", name: "Unit", code: "unit" })];
  const next = removeElement(model, "entityTypes", "e1", "p1");
  assert.equal(next.entityTypes.length, 0);
  assert.equal(next.properties.length, 0);
  assert.equal(next.standardValues.length, 1);
});
test("restoring a deleted child also restores every ancestor version snapshot", () => {
  const model = fixture();
  const rule = { ...value({ id: "r1", parentId: "a1", parentKind: "properties", name: "Rule", code: "rule" }), status: "DRAFT", semanticVersion: "1.0.0" };
  model.rules = [rule];
  const ancestors = snapshotElementAncestors(model, rule);
  const removed = removeElement(model, "rules", rule.id, "p1");

  assert.deepEqual(ancestors.map(({ kind }) => kind), ["properties", "entityTypes"]);
  assert.notEqual(removed.properties[0].semanticVersion, model.properties[0].semanticVersion);
  assert.notEqual(removed.entityTypes[0].semanticVersion, model.entityTypes[0].semanticVersion);

  let restored = restoreElementSnapshot(removed, "rules", rule, "p1");
  for (const ancestor of ancestors) restored = restoreElementSnapshot(restored, ancestor.kind, ancestor.snapshot, "p1");
  assert.deepEqual(restored.rules[0], rule);
  assert.deepEqual(restored.properties[0], model.properties[0]);
  assert.deepEqual(restored.entityTypes[0], model.entityTypes[0]);
});
test("relationship target references prevent destructive deletion", () => {
  const model = fixture();
  model.entityTypes.push({ ...model.entityTypes[0], id: "e2", code: "Other", name: "Other" });
  model.relations = [value({ id: "r1", parentId: "e2", parentKind: "entityTypes", targetTypeId: "e1" })];
  assert.throws(() => removeElement(model, "entityTypes", "e1", "p1"), /引用/);
});

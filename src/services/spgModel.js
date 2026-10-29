export const CORE_KINDS = ["namespaces", "entityTypes", "conceptTypes", "eventTypes", "standardValues", "properties", "relations", "constraints", "rules"];
export const CHILD_KINDS = {
  namespaces: ["entityTypes", "conceptTypes", "eventTypes", "standardValues"],
  entityTypes: ["entityTypes", "properties", "relations"],
  conceptTypes: ["properties"], eventTypes: ["properties", "relations"], standardValues: [],
  properties: ["properties", "constraints", "rules"],
  relations: ["properties", "constraints", "rules"], constraints: [], rules: [],
};
export const statusOf = (model, row) => {
  const version = model.versions?.find((item) => item.id === row?.versionId);
  const namespace = model.namespaces?.find((item) => item.id === row?.namespaceId);
  const statuses = [row?.status, namespace?.status, version?.status].map((value) => String(value || "DRAFT").toUpperCase());
  return statuses.includes("ARCHIVED") ? "ARCHIVED" : statuses.includes("RELEASED") ? "RELEASED" : "DRAFT";
};
export function bumpVersion(value = "1.0.0", level = "patch") {
  const parts = String(value).replace(/^v/, "").split(".").map((part) => Number(part) || 0);
  while (parts.length < 3) parts.push(0);
  const index = level === "major" ? 0 : level === "minor" ? 1 : 2;
  parts[index] += 1;
  for (let i = index + 1; i < 3; i++) parts[i] = 0;
  return parts.slice(0, 3).join(".");
}
function requireDraft(model, row) {
  if (row && statusOf(model, row) !== "DRAFT") throw new Error("已发布或归档的元素不可直接修改，请创建新镜像/草稿；修改整个 Namespace 需整库建新镜像。");
}
export function validateElement(model, kind, row, previous) {
  if (!CORE_KINDS.includes(kind)) throw new Error("不支持的元素类型");
  if (!row.name?.trim() || !row.code?.trim()) throw new Error("名称和编码不能为空");
  const version = model.versions?.find((item) => item.id === row.versionId && item.projectId === row.projectId);
  if (!version) throw new Error("本体版本不存在");
  requireDraft(model, previous || { versionId: row.versionId });
  if (previous && (row.projectId !== previous.projectId || row.versionId !== previous.versionId || row.namespaceId !== previous.namespaceId || row.parentId !== previous.parentId || row.parentKind !== previous.parentKind)) throw new Error("已锚定的主体、命名空间和版本不可迁移");
  if (!/^\d+\.\d+\.\d+$/.test(row.semanticVersion || "1.0.0")) throw new Error("语义版本必须采用 major.minor.patch 格式");
  if (kind !== "namespaces") {
    const namespace = model.namespaces?.find((item) => item.id === row.namespaceId && item.projectId === row.projectId && item.versionId === row.versionId);
    if (!namespace) throw new Error("命名空间不存在或不属于当前版本");
    requireDraft(model, namespace);
  }
  if (model[kind]?.some((item) => item.id !== row.id && item.projectId === row.projectId && item.versionId === row.versionId && item.namespaceId === row.namespaceId && item.parentId === row.parentId && item.code === row.code)) throw new Error("同一主体下编码不能重复");
  if (["conceptTypes", "eventTypes", "standardValues"].includes(kind) && (row.hypernymPredicate || (row.parentId && row.parentKind !== "namespaces"))) throw new Error("Concept / Event / Standard Value 不允许父类或子类继承");
  if (["properties", "relations"].includes(kind) && !row.parentId) throw new Error("必须先锚定主体，再创建属性或关系");
  if (row.parentId) {
    const parent = model[row.parentKind]?.find((item) => item.id === row.parentId && item.projectId === row.projectId && item.versionId === row.versionId);
    if (!parent || (row.parentKind === "namespaces" ? parent.id !== row.namespaceId : parent.namespaceId !== row.namespaceId)) throw new Error("主体不存在或不属于当前命名空间");
    if (!CHILD_KINDS[row.parentKind]?.includes(kind)) throw new Error("该主体不允许创建此类型元素");
    requireDraft(model, parent);
    const visited = new Set([row.id]);
    let ancestor = parent;
    while (ancestor) {
      if (visited.has(ancestor.id)) throw new Error("不允许循环继承或挂载");
      visited.add(ancestor.id);
      ancestor = model[ancestor.parentKind]?.find((item) => item.id === ancestor.parentId);
    }
  }
  if (kind === "relations") {
    const target = ["entityTypes", "conceptTypes", "eventTypes", "standardValues"].flatMap((key) => model[key] || []).find((item) => item.id === row.targetTypeId && item.projectId === row.projectId && item.versionId === row.versionId && item.namespaceId === row.namespaceId);
    if (!target) throw new Error("关系目标必须属于当前命名空间与版本");
  }
}
function bumpOwners(model, row, level) {
  const next = { ...model };
  const visited = new Set();
  let current = row;
  while (current?.parentId && !visited.has(current.parentId)) {
    visited.add(current.parentId);
    const parent = next[current.parentKind]?.find((item) => item.id === current.parentId);
    if (!parent) break;
    next[current.parentKind] = next[current.parentKind].map((item) => item.id === parent.id ? { ...item, semanticVersion: bumpVersion(item.semanticVersion, level), updatedAt: row.updatedAt } : item);
    current = parent;
  }
  return next;
}
export function saveElement(model, kind, value) {
  const previous = model[kind]?.find((item) => item.id === value.id && item.projectId === value.projectId);
  if (value.id && !previous) throw new Error("元素不存在");
  const row = { status: "DRAFT", semanticVersion: "1.0.0", ...previous, ...value, id: previous?.id || `spg-${kind}-${crypto.randomUUID()}`, updatedAt: new Date().toISOString() };
  validateElement(model, kind, row, previous);
  const descriptionOnly = previous && Object.keys(value).filter((key) => !["description", "updatedAt", "semanticVersion"].includes(key)).every((key) => value[key] === previous[key]);
  const level = !previous ? "minor" : descriptionOnly ? "patch" : "major";
  if (previous) row.semanticVersion = bumpVersion(previous.semanticVersion, level);
  const next = bumpOwners({ ...model, [kind]: previous ? model[kind].map((item) => item.id === row.id ? row : item) : [row, ...(model[kind] || [])] }, row, level);
  return { model: next, row };
}
export function restoreElementSnapshot(model, kind, snapshot, projectId) {
  if (!CORE_KINDS.includes(kind)) throw new Error("不支持的元素类型");
  if (!model.versions?.some((item) => item.id === snapshot.versionId && item.projectId === projectId)) throw new Error("本体版本不存在");
  const restored = { ...snapshot, projectId };
  const rows = model[kind] || [];
  return { ...model, [kind]: rows.some((item) => item.id === restored.id)
    ? rows.map((item) => item.id === restored.id ? restored : item)
    : [restored, ...rows] };
}
export function snapshotElementAncestors(model, row) {
  const snapshots = [];
  const visited = new Set([row?.id]);
  let child = row;
  while (child?.parentId && child.parentKind && child.parentKind !== "namespaces") {
    if (visited.has(child.parentId)) break;
    const kind = child.parentKind;
    const parent = (model[kind] || []).find((item) => item.id === child.parentId
      && item.projectId === child.projectId && item.versionId === child.versionId);
    if (!parent) break;
    snapshots.push({ kind, snapshot: { ...parent } });
    visited.add(parent.id);
    child = parent;
  }
  return snapshots;
}
export function removeElement(model, kind, id, projectId) {
  const target = model[kind]?.find((item) => item.id === id && item.projectId === projectId);
  if (!target) throw new Error("元素不存在");
  requireDraft(model, target);
  const ids = new Set([id]);
  let count;
  do {
    count = ids.size;
    CORE_KINDS.forEach((key) => (model[key] || []).forEach((item) => {
      if (item.projectId === projectId && (ids.has(item.parentId) || ids.has(item.namespaceId))) ids.add(item.id);
    }));
  } while (ids.size !== count);
  const references = CORE_KINDS.flatMap((key) => model[key] || []).filter((item) => !ids.has(item.id) && ids.has(item.targetTypeId));
  if (references.length) throw new Error("仍有关系引用此元素，请先删除关联关系");
  CORE_KINDS.forEach((key) => (model[key] || []).filter((item) => ids.has(item.id)).forEach((item) => requireDraft(model, item)));
  const next = bumpOwners(model, { ...target, updatedAt: new Date().toISOString() }, "major");
  CORE_KINDS.forEach((key) => { next[key] = (next[key] || []).filter((item) => !ids.has(item.id)); });
  return next;
}
export function cloneNamespace(model, namespaceId, projectId) {
  const source = model.namespaces?.find((item) => item.id === namespaceId && item.projectId === projectId);
  if (!source) throw new Error("命名空间不存在");
  const idMap = new Map();
  const rows = CORE_KINDS.flatMap((kind) => (model[kind] || []).filter((item) => item.projectId === projectId && (item.id === source.id || item.namespaceId === source.id)).map((item) => ({ ...item, kind })));
  rows.forEach((item) => idMap.set(item.id, `spg-${item.kind}-${crypto.randomUUID()}`));
  const versionId = `spg-version-${crypto.randomUUID()}`;
  const next = { ...model, versions: [{ id: versionId, projectId, name: `v${bumpVersion(source.semanticVersion, "minor")}`, status: "DRAFT", isLatest: true, createdAt: new Date().toISOString(), description: `${source.name} 新镜像`, sourceVersionId: source.versionId }, ...(model.versions || []).map((item) => item.projectId === projectId ? { ...item, isLatest: false } : item)] };
  rows.forEach(({ kind, ...item }) => {
    const copy = { ...item, id: idMap.get(item.id), baseId: item.baseId || item.id, versionId, status: "DRAFT", namespaceId: kind === "namespaces" ? undefined : idMap.get(source.id), parentId: idMap.get(item.parentId) || item.parentId || "", targetTypeId: idMap.get(item.targetTypeId) || item.targetTypeId || "", semanticVersion: bumpVersion(item.semanticVersion, "minor"), updatedAt: new Date().toISOString() };
    next[kind] = [...(next[kind] || []), copy];
  });
  return { model: next, namespaceId: idMap.get(source.id), versionId };
}

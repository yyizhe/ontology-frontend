const KEY = 'datapilot.llmConnections';
export function listLlmConnections() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
export function saveLlmConnection(value) {
  if (!value.name?.trim() || !value.model?.trim()) throw new Error('请填写连接名称和模型名称');
  const url = new URL(value.endpoint);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('连接地址必须使用 HTTP 或 HTTPS');
  const rows = listLlmConnections();
  if (rows.some((row) => row.id !== value.id && row.name === value.name.trim())) throw new Error('连接名称已存在');
  const row = { ...value, name: value.name.trim(), id: value.id || crypto.randomUUID(), updatedAt: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify([row, ...rows.filter((item) => item.id !== row.id)]));
  return row;
}
export function deleteLlmConnection(id) {
  localStorage.setItem(KEY, JSON.stringify(listLlmConnections().filter((row) => row.id !== id)));
}

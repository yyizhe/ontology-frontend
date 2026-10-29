export function dedupeCandidates(rows) {
  const seen = new Set();
  return rows.filter(row => {
    const key = JSON.stringify([row.element_type, row.label, row.domain || '', row.source || '', row.target || '']);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

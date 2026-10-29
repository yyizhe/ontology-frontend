export function collectionFiles(record, assets) {
  const snapshots = Array.isArray(record?.resultJson?.files) ? record.resultJson.files : [];
  const ids = [
    ...snapshots.map((item) => item.assetFileId),
    ...(Array.isArray(record?.resultJson?.assetFileIds) ? record.resultJson.assetFileIds : []),
    record?.assetFileId,
    record?.resultJson?.assetFileId,
  ].filter(Boolean);
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const snapshotById = new Map(snapshots.map((item) => [item.assetFileId, item]));
  return [...new Set(ids)].map((id) => {
    const snapshot = snapshotById.get(id) || {};
    const asset = byId.get(id);
    return { ...snapshot, ...asset, id, asset, fileName: asset?.fileName || asset?.name || snapshot.fileName || id };
  });
}

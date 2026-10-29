export const METADATA_TYPES = {
  structured: "结构化",
  semi_structured: "半结构化",
  unstructured: "非结构化",
};

export function assetMetadataType(file = {}, sourceType = "") {
  if (Object.hasOwn(METADATA_TYPES, file.dataShape)) return file.dataShape;
  if (sourceType === "database" || String(sourceType || "").startsWith("database_") || file.content?.schema?.length) return "structured";
  const extension = (file.fileName || file.name || "").match(/\.([^.]+)$/)?.[1]?.toLowerCase() || "";
  const mime = (file.mimeType || "").split(";")[0].trim().toLowerCase();
  if (["csv", "tsv", "xls", "xlsx", "ods", "parquet", "avro", "orc", "arrow", "feather", "sqlite", "sqlite3"].includes(extension)
    || ["text/csv", "text/tab-separated-values", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.oasis.opendocument.spreadsheet"].includes(mime)) return "structured";
  if (["json", "jsonl", "ndjson", "xml", "yaml", "yml", "toml"].includes(extension)
    || /(?:json|xml|yaml|toml)$/.test(mime) || mime === "application/x-ndjson") return "semi_structured";
  return "unstructured";
}

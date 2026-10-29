import Papa from "papaparse";
import { assetMetadataType } from "./assetMetadata.js";

function valueType(value) {
  if (value instanceof Date) return "datetime";
  if (value == null || value === "") return null;
  return typeof value === "number" ? (Number.isInteger(value) ? "integer" : "decimal") : typeof value === "object" ? "json" : typeof value;
}

export function tableMetadata(rows, dataset = "") {
  if (!rows.length || !rows[0]?.length) throw new Error("文件中没有表头");
  const used = new Set();
  const names = rows[0].map((value, index) => {
    const base = String(value ?? "").trim() || `column_${index + 1}`;
    let name = base;
    let suffix = 2;
    while (used.has(name)) name = `${base}_${suffix++}`;
    used.add(name);
    return name;
  });
  const data = rows.slice(1);
  if (data.some((row) => row.length > names.length)) throw new Error("数据列数超过表头列数");
  const schema = names.map((name, index) => {
    const values = data.map((row) => row[index]);
    const types = [...new Set(values.map(valueType).filter(Boolean))];
    const type = types.length === 1 ? types[0] : types.every((item) => ["integer", "decimal"].includes(item)) && types.length ? "decimal" : "string";
    return { name, type, nullable: !values.length || values.some((value) => value == null || value === "") };
  });
  return { dataset, rows: data.length, schema, sample: data.slice(0, 5).map((row) => Object.fromEntries(names.map((name, index) => [name, row[index] ?? null]))), parseStatus: "parsed" };
}

export async function parseUploadedMetadata(file) {
  const base = { uploadedFrom: "browser", sizeBytes: file.size };
  const extension = file.name.split(".").pop().toLowerCase();
  try {
    if (["csv", "tsv"].includes(extension)) {
      const text = await file.text();
      if (!text.trim()) throw new Error("文件中没有表头");
      const result = Papa.parse(text, { delimiter: extension === "tsv" ? "\t" : ",", header: true, skipEmptyLines: "greedy", dynamicTyping: true });
      if (result.errors.length) throw new Error(result.errors[0].message);
      const names = result.meta.fields || [];
      return { ...base, ...tableMetadata([names, ...result.data.map((row) => names.map((name) => row[name]))], file.name) };
    }
    if (extension === "xlsx") {
      const { default: readExcelFile } = await import("read-excel-file/browser");
      const sheets = await readExcelFile(file);
      const tables = sheets.filter((sheet) => sheet.data.length).map(({ sheet, data }) => ({ sheet, ...tableMetadata(data, sheet) }));
      if (!tables.length) throw new Error("工作簿中没有数据");
      return { ...base, parseStatus: "parsed", tables, rows: tables.reduce((total, table) => total + table.rows, 0) };
    }
    if (["json", "jsonl", "ndjson"].includes(extension)) {
      const text = await file.text();
      const data = extension === "json" ? JSON.parse(text) : text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
      const samples = Array.isArray(data) ? data : [data];
      const objects = samples.filter((row) => row && typeof row === "object" && !Array.isArray(row));
      const names = [...new Set(objects.flatMap(Object.keys))];
      return { ...base, ...tableMetadata([names, ...objects.map((row) => names.map((name) => row[name]))], file.name) };
    }
    return { ...base, ...(assetMetadataType({ fileName: file.name }) === "structured" ? { parseStatus: "unsupported", parseMessage: "当前支持 CSV、TSV、XLSX 结构解析；此格式需接入服务端解析器" } : {}) };
  } catch (error) {
    return { ...base, parseStatus: "failed", parseMessage: `结构解析失败：${error.message}` };
  }
}

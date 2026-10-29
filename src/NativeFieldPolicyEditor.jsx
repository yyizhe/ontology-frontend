import React, { useState } from "react";
import { Database, Search } from "lucide-react";
import { nativeFields } from "./services/enrichmentJobs.js";
import { assetMetadataType } from "./services/assetMetadata.js";
import { NATIVE_FIELD_MODES, normalizeNativeFieldPolicy } from "./services/templateFields.js";
import "./template-fields.css";

export default function NativeFieldPolicyEditor({ value, files, connections, onChange }) {
  const rule = normalizeNativeFieldPolicy(value);
  const [query, setQuery] = useState("");
  const sources = files.filter((file) => assetMetadataType(file, connections.find((item) => item.id === file.connectionConfigId)?.type) === "structured");
  const source = sources.find((file) => file.id === rule.sourceFileId);
  const fields = source ? nativeFields(source) : rule.sourceFields;
  const rows = fields.filter((field) => `${field.name} ${field.code} ${field.type}`.toLowerCase().includes(query.toLowerCase()));
  const selected = fields.filter((field) => rule.mode === "all" || (rule.mode === "selected" && rule.fields.includes(field.code)));
  const changeMode = (mode) => onChange({ ...rule, mode, fields: mode === "selected" ? (rule.mode === "all" ? fields.map((field) => field.code) : rule.fields) : rule.fields });
  const toggle = (code, checked) => {
    const codes = rule.mode === "all" ? fields.map((field) => field.code) : rule.mode === "none" ? [] : rule.fields;
    onChange({ ...rule, mode: "selected", fields: checked ? [...new Set([...codes, code])] : codes.filter((item) => item !== code) });
  };
  return <section className="native-field-editor" aria-label="原生字段配置">
    <div className="native-field-heading"><b><Database size={15} />原生字段</b><span>已纳入 {selected.length} / {fields.length} 项</span></div>
    <div className="native-field-controls"><div className="native-field-modes" role="radiogroup" aria-label="原生字段保留规则">{Object.entries(NATIVE_FIELD_MODES).map(([mode, label]) => <label key={mode}><input type="radio" name="native-field-mode" value={mode} checked={rule.mode === mode} onChange={() => changeMode(mode)} />{label}</label>)}</div>
      <label className="native-field-source">结构化数据<select aria-label="原生字段来源" value={rule.sourceFileId} onChange={(event) => {
        const file = sources.find((item) => item.id === event.target.value);
        const nextFields = file ? nativeFields(file).map(({ name, code, type, table }) => ({ name, code, type, table })) : [];
        onChange({ ...rule, sourceFileId: file?.id || "", sourceFields: nextFields });
      }}><option value="">选择数据文件</option>{sources.map((file) => <option key={file.id} value={file.id}>{file.content?.dataset || file.fileName || file.name}</option>)}</select></label></div>
    {fields.length ? <><div className="native-field-search"><Search size={14} /><input aria-label="搜索原生字段" placeholder="搜索字段名称或编码" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="native-field-table"><table><thead><tr><th>纳入</th><th>字段名称</th><th>字段编码</th><th>数据类型</th></tr></thead><tbody>{rows.map((field) => <tr key={field.code}><td><input type="checkbox" aria-label={`纳入 ${field.code}`} checked={rule.mode === "all" || (rule.mode === "selected" && rule.fields.includes(field.code))} onChange={(event) => toggle(field.code, event.target.checked)} /></td><td>{field.name}</td><td>{field.code}</td><td>{field.type || "未知"}</td></tr>)}</tbody></table>{!rows.length && <p className="native-field-empty">没有匹配的原生字段</p>}</div></> : <p className="native-field-empty">{rule.mode === "all" ? "全部原生字段已默认纳入" : "暂无原生字段"}</p>}
  </section>;
}

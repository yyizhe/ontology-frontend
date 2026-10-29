import React, { useEffect, useMemo, useRef, useState } from "react";
import { Database, FileText, Focus, Network, Search, Workflow, X, ZoomIn, ZoomOut } from "lucide-react";
import { assetTaskResults, displayValue, incubationLabel, LINEAGE_TYPES, metadataGraph } from "./services/enrichmentJobs.js";
import { nativeFieldPolicyLabel, normalizeNativeFieldPolicy } from "./services/templateFields.js";
import "./enrichment-results.css";
import "./template-fields.css";

const categories = { object: "数据对象", standard: "标准元数据", native: "原生字段", template: "模板孵化新增", source_object: "关联数据对象", source_field: "关联字段" };
const icons = { object: Network, standard: FileText, native: Database, template: Workflow, source_object: Database, source_field: Database };
const versionLabel = (version, fallback = "未命名版本") => version?.label || version?.name || version?.version || version?.id || fallback;
const versionKey = (version, fallback) => String(version?.id || version?.versionId || version?.metadataVersionId || version?.lineageVersionId || fallback);

export default function MetadataGraphModal({ file, taskResult, connections, tasks, records, templates = [], close }) {
  const connection = connections.find((item) => item.id === file.connectionConfigId);
  const mode = taskResult?.enrichmentType || "all";
  const results = useMemo(() => taskResult ? [taskResult] : assetTaskResults(file, records, tasks), [file, taskResult, records, tasks]);
  const templateCandidates = useMemo(() => {
    const ids = new Set(results.map((child) => child.resultJson?.templateId).filter(Boolean));
    return templates.filter((template) => !ids.size || ids.has(template.id));
  }, [results, templates]);
  const [templateId, setTemplateId] = useState(() => results.find((child) => templates.some((template) => template.id === child.resultJson?.templateId))?.resultJson.templateId || templateCandidates[0]?.id || "");
  const selectedTemplate = templates.find((item) => item.id === templateId) || templateCandidates.find((item) => item.id === templateId);
  const templateVersionOptions = useMemo(() => {
    if (!selectedTemplate) return [];
    const baseId = selectedTemplate.baseId || selectedTemplate.templateId || selectedTemplate.id;
    const embedded = selectedTemplate.versions || selectedTemplate.templateVersions;
    if (Array.isArray(embedded) && embedded.length) {
      return embedded.map((version, index) => ({
        ...version,
        id: version.id || version.versionId || `${selectedTemplate.id}:v${index + 1}`,
        templateId: version.templateId || selectedTemplate.id,
        baseId,
        label: version.label || version.name || version.version || `模板版本 ${index + 1}`,
      }));
    }
    const versions = templates.filter((item) => (item.baseId || item.templateId || item.id) === baseId);
    if (versions.length) {
      return versions.map((version, index) => ({
        ...version,
        templateId: version.templateId || (templates.some((item) => item.id === version.id) ? version.id : selectedTemplate.id),
        baseId,
        version: version.version || version.semanticVersion || `v${index + 1}.0`,
        label: version.label || version.version || version.semanticVersion || `v${index + 1}.0`,
      }));
    }
    return [{ ...selectedTemplate, id: `${selectedTemplate.id}:v1`, templateId: selectedTemplate.id, baseId, version: selectedTemplate.version || "v1.0", label: selectedTemplate.version || "v1.0" }];
  }, [selectedTemplate, templates]);
  const [templateVersionId, setTemplateVersionId] = useState("");
  const templateVersion = templateVersionOptions.find((version) => versionKey(version) === templateVersionId) || templateVersionOptions[0];
  const metadataVersionOptions = useMemo(() => results.filter((child) => {
    if (mode === "lineage") return false;
    if (templateId && child.resultJson?.templateId && child.resultJson.templateId !== templateId) return false;
    if (templateVersionId && child.resultJson?.templateVersionId && child.resultJson.templateVersionId !== templateVersionId) return false;
    return true;
  }).map((child, index) => ({ id: child.resultJson?.metadataVersionId || child.id, label: child.resultJson?.metadataVersion || `元数据版本 ${index + 1}`, templateId, result: child })), [results, mode, templateId, templateVersionId]);
  const lineageVersionOptions = useMemo(() => results.filter((child) => child.enrichmentType === "lineage").map((child, index) => ({ id: child.resultJson?.lineageVersionId || child.id, label: child.resultJson?.lineageVersion || `血缘版本 ${index + 1}`, result: child })), [results]);
  const [metadataVersionId, setMetadataVersionId] = useState("");
  const [lineageVersionId, setLineageVersionId] = useState("");
  useEffect(() => setTemplateVersionId((current) => current && templateVersionOptions.some((version) => versionKey(version) === current) ? current : (templateVersionOptions[0] ? versionKey(templateVersionOptions[0]) : "")), [templateId, templateVersionOptions]);
  useEffect(() => setMetadataVersionId((current) => current && metadataVersionOptions.some((version) => version.id === current) ? current : (metadataVersionOptions[0]?.id || "")), [templateVersionId, metadataVersionOptions]);
  useEffect(() => setLineageVersionId((current) => current && lineageVersionOptions.some((version) => version.id === current) ? current : (lineageVersionOptions[0]?.id || "")), [metadataVersionId, lineageVersionOptions]);
  const activeMetadataResult = metadataVersionOptions.find((version) => version.id === metadataVersionId)?.result;
  const activeLineageResult = lineageVersionOptions.find((version) => version.id === lineageVersionId)?.result;
  const policy = taskResult ? taskResult.resultJson?.nativeFieldPolicy : selectedTemplate?.nativeFieldPolicy;
  const graphResults = useMemo(() => [activeMetadataResult, activeLineageResult].filter(Boolean), [activeMetadataResult, activeLineageResult]);
  const graph = useMemo(() => metadataGraph(file, { results: graphResults.length ? graphResults : results, mode, sourceType: connection?.type, nativeFieldPolicy: normalizeNativeFieldPolicy(policy) }), [file, graphResults, results, mode, connection?.type, policy]);
  const [selected, setSelected] = useState("object");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [listView, setListView] = useState("metadata");
  const [scope, setScope] = useState("all");
  const [selectedRelation, setSelectedRelation] = useState(null);
  const [zoom, setZoom] = useState(0.82);
  const [nodeOffsets, setNodeOffsets] = useState({});
  const [dragging, setDragging] = useState("");
  const rowRefs = useRef({});
  const nodeRefs = useRef({});
  const dragRef = useRef(null);
  const NODE_WIDTH = 238;
  const NODE_HEIGHT = 88;
  const lineage = graph.edges.filter((edge) => edge.kind === "lineage");
  const sourcePositions = {};
  let sourceY = 70;
  graph.nodes.filter((node) => node.kind === "source_object").forEach((node) => {
    const fields = graph.nodes.filter((field) => field.parentId === node.id);
    sourcePositions[node.id] = { x: 48, y: sourceY + Math.max(0, fields.length - 1) * 55 };
    fields.forEach((field, index) => { sourcePositions[field.id] = { x: 300, y: sourceY + index * 108 }; });
    sourceY += Math.max(1, fields.length) * 108 + 32;
  });
  const coreNodes = graph.nodes.filter((node) => !sourcePositions[node.id] && node.kind !== "source_object" && node.kind !== "source_field");
  const objectNode = coreNodes.find((node) => node.kind === "object");
  const standardNodes = coreNodes.filter((node) => node.kind === "standard");
  const nativeNodes = coreNodes.filter((node) => node.kind === "native");
  const templateNodes = coreNodes.filter((node) => node.kind === "template");
  const centerX = lineage.length ? 760 : 390;
  const centerY = Math.max(300, Math.max(standardNodes.length, nativeNodes.length) * 52 + 90);
  const placeVertical = (nodes, x) => {
    const height = Math.max(1, nodes.length) * 110 - 22;
    const startY = Math.max(52, centerY - height / 2);
    return Object.fromEntries(nodes.map((node, index) => [node.id, { x, y: startY + index * 110 }]));
  };
  const placeHorizontal = (nodes, y) => {
    const totalWidth = Math.max(1, nodes.length) * (NODE_WIDTH + 22) - 22;
    const startX = Math.max(24, centerX - totalWidth / 2);
    return Object.fromEntries(nodes.map((node, index) => [node.id, { x: startX + index * (NODE_WIDTH + 22), y }]));
  };
  const groupedPositions = {
    ...(objectNode ? { [objectNode.id]: { x: centerX - NODE_WIDTH / 2, y: centerY } } : {}),
    ...placeVertical(standardNodes, Math.max(24, centerX - 420)),
    ...placeVertical(nativeNodes, centerX + 250),
    ...placeHorizontal(templateNodes, Math.max(centerY + 180, centerY + Math.max(standardNodes.length, nativeNodes.length) * 55)),
  };
  const positioned = graph.nodes.map((node) => {
    const base = sourcePositions[node.id] || groupedPositions[node.id] || { x: centerX - NODE_WIDTH / 2, y: centerY };
    const offset = nodeOffsets[node.id] || { x: 0, y: 0 };
    return { ...node, x: base.x + offset.x, y: base.y + offset.y };
  });
  const width = Math.max(lineage.length ? 1540 : 1160, ...positioned.map((node) => node.x + NODE_WIDTH)) + 40;
  const height = Math.max(620, ...positioned.map((node) => node.y + NODE_HEIGHT)) + 40;
  const groupLabels = [
    standardNodes.length ? { kind: "standard", label: "标准元数据", x: Math.max(24, centerX - 420), y: Math.max(18, (placeVertical(standardNodes, Math.max(24, centerX - 420))[standardNodes[0].id]?.y || 52) - 30) } : null,
    nativeNodes.length ? { kind: "native", label: "原生字段", x: centerX + 250, y: Math.max(18, (placeVertical(nativeNodes, centerX + 250)[nativeNodes[0].id]?.y || 52) - 30) } : null,
    templateNodes.length ? { kind: "template", label: "模板孵化新增", x: Math.max(24, centerX - ((templateNodes.length * (NODE_WIDTH + 22) - 22) / 2)), y: Math.max(centerY + 150, centerY + Math.max(standardNodes.length, nativeNodes.length) * 55) - 30 } : null,
  ].filter(Boolean);
  const active = graph.nodes.find((node) => node.id === selected) || graph.nodes[0];
  const activeRelation = lineage.find((edge) => edge.id === selectedRelation);
  const rows = graph.nodes.filter((node) => (category === "all" || node.kind === category) && `${node.label} ${node.qualifiedLabel || ""} ${displayValue(node.value)} ${categories[node.kind]}`.toLowerCase().includes(query.toLowerCase()));
  const relationRows = lineage.filter((edge) => (scope === "all" || edge.scope === scope) && `${edge.sourceLabel} ${edge.targetLabel} ${edge.label} ${edge.expression}`.toLowerCase().includes(query.toLowerCase()));
  const select = (id, origin) => { setSelected(id); setSelectedRelation(null); if (origin === "list") nodeRefs.current[id]?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" }); else requestAnimationFrame(() => rowRefs.current[id]?.scrollIntoView({ block: "nearest", behavior: "smooth" })); };
  const selectRelation = (edge) => { setSelected(edge.to); setSelectedRelation(edge.id); setListView("lineage"); nodeRefs.current[edge.to]?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" }); };
  const beginDrag = (event, id) => { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture?.(event.pointerId); dragRef.current = { id, x: event.clientX, y: event.clientY }; setDragging(id); };
  const moveDrag = (event) => { if (!dragRef.current) return; const drag = dragRef.current; const dx = (event.clientX - drag.x) / zoom; const dy = (event.clientY - drag.y) / zoom; setNodeOffsets((current) => ({ ...current, [drag.id]: { x: (current[drag.id]?.x || 0) + dx, y: (current[drag.id]?.y || 0) + dy } })); dragRef.current = { ...drag, x: event.clientX, y: event.clientY }; };
  const endDrag = () => { dragRef.current = null; setDragging(""); };
  const clickNode = (node) => { const relation = lineage.find((edge) => edge.from === node.id || edge.to === node.id); select(node.id, "graph"); if (relation) { setListView("lineage"); setQuery(""); setScope("all"); setSelectedRelation(relation.id); } };
  return <div className="incubation-graph-mask"><div className="incubation-graph-modal" role="dialog" aria-modal="true" aria-label="元数据图谱">
    <header><div><small>{taskResult ? incubationLabel(mode) : "全部元数据"}</small><h2>元数据图谱</h2><p>{file.fileName || file.name}{taskResult ? ` · ${taskResult.id}` : ""}</p></div><button onClick={close} aria-label="关闭图谱"><X size={20} /></button></header>
    <div className="incubation-template-filter">
      <label>展示模板<select aria-label="元数据展示模板" value={templateId} onChange={(event) => { setTemplateId(event.target.value); setTemplateVersionId(""); setMetadataVersionId(""); setLineageVersionId(""); setSelected("object"); setSelectedRelation(null); }}><option value="">全部模板</option>{templateCandidates.map((item) => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</select></label>
      <label>模板版本<select aria-label="元数据模板版本" value={templateVersion ? versionKey(templateVersion) : ""} onChange={(event) => { const next = templateVersionOptions.find((item) => versionKey(item) === event.target.value); if (next) { const linkedTemplateId = next.templateId || (templates.some((item) => item.id === next.id) ? next.id : templateId); setTemplateId(linkedTemplateId); setTemplateVersionId(event.target.value); setMetadataVersionId(""); setLineageVersionId(""); } }} disabled={!templateVersionOptions.length}>{templateVersionOptions.map((item) => <option key={versionKey(item)} value={versionKey(item)}>{versionLabel(item, "模板版本")}</option>)}</select></label>
      <label>元数据版本<select aria-label="元数据版本" value={metadataVersionId} onChange={(event) => setMetadataVersionId(event.target.value)} disabled={!metadataVersionOptions.length}><option value="">未选择</option>{metadataVersionOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>血缘版本<select aria-label="血缘版本" value={lineageVersionId} onChange={(event) => setLineageVersionId(event.target.value)} disabled={!lineageVersionOptions.length}><option value="">未选择</option>{lineageVersionOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <span>原生字段：{nativeFieldPolicyLabel(policy)} · 模板孵化新增字段全部保留</span>
    </div>
    <div className="incubation-graph-layout">
      <section className="incubation-graph-panel" aria-label="元数据关系图">
        <div className="incubation-graph-toolbar"><div className="incubation-graph-legend">{Object.entries(categories).filter(([kind]) => !kind.startsWith("source_") && graph.nodes.some((node) => node.kind === kind)).map(([kind, label]) => <span key={kind}><i className={`kind-${kind}`} />{label}</span>)}{Object.entries(LINEAGE_TYPES).filter(([value]) => lineage.some((edge) => edge.scope === value)).map(([value, label]) => <span key={value}><i className={`edge-${value}`} />{label}</span>)}</div><div className="incubation-graph-tools"><span className="graph-drag-hint">拖动节点调整布局</span><button title="缩小" aria-label="缩小" onClick={() => setZoom((value) => Math.max(0.35, value - 0.1))}><ZoomOut size={17} /></button><span>{Math.round(zoom * 100)}%</span><button title="放大" aria-label="放大" onClick={() => setZoom((value) => Math.min(1.6, value + 0.1))}><ZoomIn size={17} /></button><button title="定位选中节点" aria-label="定位选中节点" onClick={() => nodeRefs.current[selected]?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" })}><Focus size={17} /></button></div></div>
        {mode === "lineage" && !lineage.length && <div className="incubation-graph-notice">本次未发现可展示的血缘关系</div>}
        {file.content?.parseMessage && <div className="incubation-graph-notice">{file.content.parseMessage}</div>}
        <div className="incubation-graph-scroll"><div style={{ width: width * zoom, height: height * zoom }}><div className="incubation-graph-surface" style={{ width, height, transform: `scale(${zoom})` }}>
          {groupLabels.map((group) => <div key={group.kind} className={`incubation-graph-group-label group-${group.kind}`} style={{ left: group.x, top: group.y }}>{group.label}</div>)}
          <svg width={width} height={height} aria-hidden="true"><defs>{Object.keys(LINEAGE_TYPES).map((value) => <marker key={value} id={`incubation-arrow-${value}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={value === "metadata" ? "#bd6667" : "#9861a2"} /></marker>)}</defs>{graph.edges.map((edge, index) => { const from = positioned.find((node) => node.id === edge.from), to = positioned.find((node) => node.id === edge.to); if (!from || !to) return null; const horizontal = Math.abs(from.x - to.x) > 30; const reverse = from.x > to.x; const x1 = horizontal ? from.x + (reverse ? 0 : NODE_WIDTH) : from.x + NODE_WIDTH / 2; const x2 = horizontal ? to.x + (reverse ? NODE_WIDTH : 0) : to.x + NODE_WIDTH / 2; const y1 = horizontal ? from.y + NODE_HEIGHT / 2 : from.y + (from.y < to.y ? NODE_HEIGHT : 0); const y2 = horizontal ? to.y + NODE_HEIGHT / 2 : to.y + (from.y < to.y ? 0 : NODE_HEIGHT); const highlighted = activeRelation ? edge.id === activeRelation.id : selected === edge.from || selected === edge.to; return <path key={index} data-edge-id={edge.id} className={`${edge.kind} scope-${edge.scope || "metadata"}${highlighted ? " active" : ""}`} d={horizontal ? `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}` : `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`} fill="none" markerEnd={edge.kind === "lineage" ? `url(#incubation-arrow-${edge.scope})` : undefined} onClick={edge.kind === "lineage" ? () => selectRelation(edge) : undefined}><title>{edge.kind === "lineage" ? `${LINEAGE_TYPES[edge.scope]}：${edge.sourceLabel} → ${edge.targetLabel} · ${edge.label}` : "元数据归属"}</title></path>; })}</svg>
          {positioned.map((node) => { const Icon = icons[node.kind] || FileText; const highlighted = selected === node.id || activeRelation?.from === node.id || activeRelation?.to === node.id; return <button key={node.id} ref={(element) => { nodeRefs.current[node.id] = element; }} data-node-id={node.id} data-node-kind={node.kind} className={`incubation-graph-node kind-${node.kind}${highlighted ? " selected" : ""}${dragging === node.id ? " dragging" : ""}`} style={{ left: node.x, top: node.y }} onPointerDown={(event) => beginDrag(event, node.id)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onClick={() => clickNode(node)} aria-pressed={highlighted}><Icon size={19} /><span><b title={node.label}>{node.label}</b><small title={displayValue(node.value)}>{displayValue(node.value)}</small></span><em>{categories[node.kind]}</em></button>; })}
        </div></div></div>
      </section>
      <aside className="incubation-metadata-panel" aria-label="元数据清单"><div className="incubation-result-tabs" role="tablist" aria-label="图谱清单"><button role="tab" aria-selected={listView === "metadata"} onClick={() => { setListView("metadata"); setQuery(""); }}>元数据清单 <span>{graph.nodes.length}</span></button><button role="tab" aria-selected={listView === "lineage"} onClick={() => { setListView("lineage"); setQuery(""); }}>血缘清单 <span>{lineage.length}</span></button></div>
        <div className="incubation-metadata-filter"><label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={listView === "metadata" ? "搜索名称或值" : "搜索来源、目标或规则"} aria-label={listView === "metadata" ? "搜索元数据" : "搜索血缘"} /></label>{listView === "metadata" ? <select aria-label="元数据分类" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">全部类型</option>{Object.entries(categories).filter(([kind]) => graph.nodes.some((node) => node.kind === kind)).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select> : <select aria-label="血缘分类" value={scope} onChange={(event) => setScope(event.target.value)}><option value="all">全部血缘</option>{Object.entries(LINEAGE_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}</div>
        <div className="incubation-metadata-list"><table><thead><tr><th>{listView === "metadata" ? "名称 / 值" : "来源 → 目标"}</th><th>类型标签</th></tr></thead><tbody>{listView === "metadata" ? rows.map((node) => <tr ref={(element) => { rowRefs.current[node.id] = element; }} key={node.id} className={selected === node.id ? "selected" : ""} aria-selected={selected === node.id} onClick={() => select(node.id, "list")}><td><button><b>{node.label}</b><span>{displayValue(node.value)}</span></button></td><td><span className={`incubation-type-tag kind-${node.kind}`}>{categories[node.kind]}</span></td></tr>) : relationRows.map((edge) => <tr key={edge.id} data-relation-id={edge.id} className={selectedRelation === edge.id ? "selected" : ""} aria-selected={selectedRelation === edge.id} onClick={() => selectRelation(edge)}><td><button><b>{edge.sourceLabel}</b><span>→ {edge.targetLabel}</span><small>{edge.label}</small></button></td><td><span className={`incubation-type-tag edge-${edge.scope}`}>{LINEAGE_TYPES[edge.scope]}</span></td></tr>)}</tbody></table>{!(listView === "metadata" ? rows.length : relationRows.length) && <p className="incubation-empty">{listView === "metadata" ? "没有匹配的元数据" : "没有匹配的血缘关系"}</p>}</div>
        {(activeRelation || active) && <div className="incubation-node-details"><b>{activeRelation ? LINEAGE_TYPES[activeRelation.scope] : active.label}</b><dl>{Object.entries(activeRelation ? { "来源": activeRelation.sourceLabel, "目标": activeRelation.targetLabel, "关系": activeRelation.label, "转换规则": activeRelation.expression || "直接映射" } : { "类型": `${categories[active.kind]} · ${active.type || "—"}`, "值": active.value, ...active.details }).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{displayValue(value)}</dd></div>)}</dl></div>}
      </aside>
    </div>
  </div></div>;
}

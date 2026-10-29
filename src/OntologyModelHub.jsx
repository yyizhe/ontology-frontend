import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Download, GitCompare, History, Network, Plus, RotateCcw, Search, Upload, X } from 'lucide-react';
import * as api from './services/localApi';
import * as schema from './services/spgSchemaApi';
import * as modeling from './services/modelingApi';
import * as workflow from './services/spgWorkflow';
import { CORE_KINDS } from './services/spgModel';
import { extractionTemplate, importOntologyElements, scopeOntology } from './services/ontologyWorkspace';
import { createMergeReviewSession, makeDemoIncomingModel, persistMergeReview, readActiveMergeReview, readMergeHistory, snapshotNamespaceVersion } from './services/ontologyMerge';
import OntologyMergeReview from './OntologyMergeReview';
import { OntologyArchivePage, OntologyAuditPage, OntologyDemoGuide } from './OntologyDemoPages';
import './ontology-hub.css';

const time = (value) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
const codeFromName = (value) => String(value || 'ontology').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ontology';

function download(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importedSnapshot(parsed, sourceNamespace) {
  return Object.fromEntries(CORE_KINDS.map((kind) => [kind, (parsed[kind] || []).filter((row) => {
    if (!sourceNamespace?.id) return true;
    return kind === 'namespaces' ? row.id === sourceNamespace.id : !row.namespaceId || row.namespaceId === sourceNamespace.id;
  })]));
}

function findMatchingOntology(models, schemaModel, incomingNamespace, name) {
  const normalizedName = String(name || incomingNamespace?.name || '').trim().toLowerCase();
  return models.find((model) => {
    const namespace = schemaModel.namespaces.find((row) => row.id === model.namespaceId || row.baseId === model.namespaceId);
    return Boolean(
      (incomingNamespace?.code && namespace?.code === incomingNamespace.code) ||
      (incomingNamespace?.uri && namespace?.uri === incomingNamespace.uri) ||
      (normalizedName && [model.name, model.code, namespace?.name, namespace?.code].some((value) => String(value || '').trim().toLowerCase() === normalizedName)),
    );
  }) || null;
}

export default function OntologyModelHub({ models, project, activeModelId, openModel, createModel, refresh, note, navigate }) {
  const [section, setSection] = useState('models');
  const [schemaModel, setSchemaModel] = useState(null);
  useEffect(() => { let live = true; setSchemaModel(null); schema.listSpgCoreModel().then(value => { if (live) setSchemaModel(value); }).catch(error => note(error.message)); return () => { live = false; }; }, [models, project?.id]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState([]);
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState('');
  const [source, setSource] = useState('file');
  const [targetId, setTargetId] = useState('auto');
  const [file, setFile] = useState(null);
  const [recordId, setRecordId] = useState('');
  const [name, setName] = useState('');
  const [format, setFormat] = useState('json');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [review, setReview] = useState(null);
  const [reviewOntology, setReviewOntology] = useState(null);
  const state = workflow.readWorkflow();
  const records = state.records.filter((row) => row.status === 'SUCCEEDED' && row.files?.some((item) => item.format === 'json'));
  const history = readMergeHistory();
  const activeSession = readActiveMergeReview();
  const rows = models.filter((row) => `${row.name} ${row.code} ${row.domain}`.toLowerCase().includes(query.toLowerCase()));
  const pages = Math.max(1, Math.ceil(rows.length / 10));
  const current = Math.min(page, pages);
  const toggle = (id) => setSelected((old) => old.includes(id) ? old.filter((item) => item !== id) : [...old, id]);
  const open = (value) => { setDialog(value); setError(''); setName(''); setFile(null); setRecordId(''); setTargetId('auto'); };
  const beginReview = (session, ontology) => {
    persistMergeReview(session);
    setReview(session);
    setReviewOntology(ontology);
  };

  const prepareDraftTarget = async (ontology, currentRaw) => {
    const scoped = scopeOntology(currentRaw, ontology);
    const latestVersion = scoped.versions.find((item) => item.isLatest) || [...scoped.versions].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
    let namespace = scoped.namespaces.find((item) => item.versionId === latestVersion?.id) || scoped.namespaces.find((item) => item.id === ontology.namespaceId);
    if (!namespace) throw new Error('无法找到目标本体的 Namespace');
    const version = scoped.versions.find((item) => item.id === namespace.versionId);
    const statuses = [namespace.status, version?.status].filter(Boolean).map((value) => String(value).toUpperCase());
    if (statuses.some((value) => value !== 'DRAFT')) {
      const cloned = await schema.createNamespaceDraft(namespace.id);
      const refreshed = await schema.listSpgCoreModel();
      namespace = refreshed.namespaces.find((item) => item.id === cloned.namespaceId);
      if (!namespace) throw new Error('创建本体草稿失败');
      ontology = { ...ontology, namespaceId: namespace.id, schemaVersionId: cloned.versionId, semanticVersion: namespace.semanticVersion };
      await api.saveOntologyModel(ontology);
      await refresh();
      return { raw: refreshed, ontology, namespace };
    }
    return { raw: currentRaw, ontology: { ...ontology, namespaceId: namespace.id, schemaVersionId: namespace.versionId, semanticVersion: namespace.semanticVersion }, namespace };
  };

  const startDiffReview = async ({ incomingModel, sourceName, sourceType, ontology, fullSnapshot }) => {
    const raw = await schema.listSpgCoreModel();
    const prepared = await prepareDraftTarget(ontology, raw);
    const currentModel = snapshotNamespaceVersion(prepared.raw, prepared.namespace.id, prepared.namespace.versionId);
    const session = createMergeReviewSession({
      currentModel, incomingModel, projectId: project.id, ontology: prepared.ontology,
      namespaceId: prepared.namespace.id, versionId: prepared.namespace.versionId,
      sourceName, sourceType, fullSnapshot,
    });
    if (!session.rows.length) {
      note('导入内容与当前本体一致，没有需要审核的差异');
      return;
    }
    beginReview(session, prepared.ontology);
  };

  const startDemo = async () => {
    if (!project) { note('请先选择项目'); return; }
    const ontology = models.find((item) => item.id === activeModelId) || models.find((item) => item.code === 'industrial-equipment') || models[0];
    if (!ontology) { note('先创建或导入一个本体，再演示差异审核'); return; }
    setBusy(true); setError('');
    try {
      const raw = await schema.listSpgCoreModel();
      const prepared = await prepareDraftTarget(ontology, raw);
      const currentModel = snapshotNamespaceVersion(prepared.raw, prepared.namespace.id, prepared.namespace.versionId);
      const incomingModel = makeDemoIncomingModel(currentModel);
      const session = createMergeReviewSession({
        currentModel, incomingModel, projectId: project.id, ontology: prepared.ontology,
        namespaceId: prepared.namespace.id, versionId: prepared.namespace.versionId,
        sourceName: '差异审核交互演示', sourceType: 'demo', fullSnapshot: true,
      });
      beginReview(session, prepared.ontology);
    } catch (err) { setError(err.message || '无法启动差异审核演示'); }
    finally { setBusy(false); }
  };

  const resumeReview = () => {
    if (!activeSession || activeSession.projectId !== project?.id || activeSession.status !== 'REVIEWING') return;
    const ontology = models.find((item) => item.id === activeSession.ontologyId);
    if (!ontology) { note('审核记录对应的本体已不存在'); return; }
    setReview(activeSession);
    setReviewOntology(ontology);
  };

  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    let namespace;
    try {
      if (dialog === 'export') {
        const model = await schema.listSpgCoreModel();
        for (const row of models.filter((item) => selected.includes(item.id))) {
          const scoped = scopeOntology(model, row);
          const versionId = scoped.versions.find((item) => item.isLatest)?.id || row.schemaVersionId;
          const content = format === 'json' ? modeling.exportModelTemplate(scoped, versionId) : format === 'owl' ? modeling.exportModelOwl(scoped, versionId) : modeling.exportModelCsv(scoped, versionId);
          download(content, `${row.code || row.name}.${format}`, format === 'json' ? 'application/json' : format === 'owl' ? 'application/rdf+xml' : 'text/csv;charset=utf-8');
        }
        note(`已导出 ${selected.length} 个本体`);
      } else {
        let parsed;
        let sourceName;
        let sourceNamespace;
        if (source === 'file') {
          if (!file) throw new Error('请选择本体 JSON 文件');
          parsed = modeling.parseModelTemplate(await file.text());
          sourceName = file.name;
          const namespaces = parsed.namespaces || [];
          if (namespaces.length > 1) throw new Error('每次请导入一个 Namespace；多 Namespace 文件请先拆分');
          sourceNamespace = namespaces[0] || null;
          if (!Object.values(parsed).some((value) => Array.isArray(value) && value.length)) throw new Error('本体文件为空');
        } else {
          const record = records.find((row) => row.id === recordId);
          const jsonFile = record?.files?.find((item) => item.format === 'json');
          if (!jsonFile) throw new Error('请选择成功且包含 JSON 产出的本体构建记录');
          parsed = JSON.parse(state.objects[jsonFile.key] || '{}');
          if (!parsed.candidates?.length) throw new Error('构建记录没有可导入的元素');
          parsed = extractionTemplate(parsed.candidates);
          sourceName = `${record.taskName} · 构建记录`;
        }

        const imported = importedSnapshot(parsed, sourceNamespace);
        const model = await schema.listSpgCoreModel();
        const selectedTarget = targetId === 'new' ? null : targetId === 'auto'
          ? findMatchingOntology(models, model, sourceNamespace, name)
          : models.find((item) => item.id === targetId) || null;
        if (targetId !== 'new' && targetId !== 'auto' && !selectedTarget) throw new Error('所选本体已不存在，请重新选择');
        if (selectedTarget) {
          await startDiffReview({ incomingModel: imported, sourceName, sourceType: source === 'record' ? 'record' : 'file', ontology: selectedTarget, fullSnapshot: source === 'file' });
        } else {
          if (source === 'record' && !name.trim()) throw new Error('请填写新本体名称');
          const draft = model.versions.find((row) => row.projectId === project.id && row.isLatest && row.status === 'DRAFT') || model.versions.find((row) => row.projectId === project.id && row.status === 'DRAFT');
          if (!draft) throw new Error('当前项目没有可用的草稿版本');
          const modelName = name.trim() || sourceNamespace?.name || file?.name?.replace(/\.json$/i, '') || '导入本体';
          const code = sourceNamespace?.code || codeFromName(modelName);
          namespace = await schema.saveSpgCoreElement('namespaces', {
            name: sourceNamespace?.name || modelName, code, versionId: draft.id,
            uri: sourceNamespace?.uri || `urn:spgo:${code}:`, scope: 'PROJECT', status: 'DRAFT',
            semanticVersion: '1.0.0', description: sourceNamespace?.description || '',
          });
          const count = await importOntologyElements(imported, namespace);
          await schema.restoreSpgCoreElement('namespaces', namespace);
          await api.saveOntologyModel({
            name: modelName, code, projectId: project.id, namespaceId: namespace.id, schemaVersionId: draft.id,
            semanticVersion: '1.0.0', elementCount: count, namespaceCount: 1,
            description: source === 'file' ? `导入自 ${file.name}` : '导入自 SPGO 本体构建记录',
          });
          namespace = null;
          await refresh(); note('本体已创建，初始语义版本为 1.0.0');
        }
      }
      setDialog('');
    } catch (err) {
      if (namespace) await schema.deleteSpgCoreElement('namespaces', namespace.id).catch(() => {});
      setError(err.message || '本体导入失败');
    } finally { setBusy(false); }
  };

  if (review) return <OntologyMergeReview
    session={review}
    setSession={setReview}
    ontology={reviewOntology}
    onBack={() => { setReview(null); setReviewOntology(null); }}
    refresh={refresh}
    note={note}
  />;

  const toggleAll = (checked) => setSelected(checked ? [...new Set([...selected, ...rows.map((row) => row.id)])] : selected.filter((id) => !rows.some((row) => row.id === id)));

  return <div className="ontology-hub">
    <header className="ontology-hub-heading">
      <div><span className="eyebrow">SPGO · NAMESPACE MODEL</span><h1>SPGO（Namespace Model）</h1><p>{project?.name || '当前项目'} · 一个 Namespace 对应一个本体，进入工作区维护元素层级。</p></div>
      <div className="ontology-hub-actions">
        {activeSession && activeSession.projectId === project?.id && activeSession.status === 'REVIEWING' && <button onClick={resumeReview}><RotateCcw size={16} />继续审核</button>}
        <button onClick={() => setSection('history')}><History size={16} />审核记录{history.filter(row => row.projectId === project?.id).length ? `（${history.filter(row => row.projectId === project?.id).length}）` : ''}</button>
        <button onClick={startDemo} disabled={!project || busy}><GitCompare size={16} />差异审核演示</button>
        <button onClick={() => open('import')} disabled={!project}><Upload size={16} />导入</button>
        <button onClick={() => open('export')} disabled={!selected.length}><Download size={16} />导出{selected.length ? `（${selected.length}）` : ''}</button>
        <button className="primary" onClick={createModel}><Plus size={16} />新建本体</button>
      </div>
    </header>
    <div className="demo-metrics">{[['当前项目本体', models.length], ['本体元素', models.reduce((sum, row) => sum + (row.elementCount || 0), 0)], ['构建任务', state.tasks.length], ['成功执行 / 全部执行', `${state.records.filter(row => row.status === 'SUCCEEDED').length} / ${state.records.length}`]].map(([name, value]) => <article key={name}><span>{name}</span><strong>{value}</strong></article>)}</div>
    <nav className="demo-nav" aria-label="本体管理分页">{[['models', '本体清单'], ['guide', '构建流程演示'], ['versions', '版本档案'], ['history', '导入审核记录']].map(([id, name]) => <button key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)}>{name}</button>)}</nav>
    {section === 'guide' && <OntologyDemoGuide models={models} tasks={state.tasks} records={state.records} openModel={openModel} navigate={navigate} review={startDemo} />}
    {section === 'versions' && <OntologyArchivePage models={models} model={schemaModel} openModel={openModel} />}
    {section === 'history' && <OntologyAuditPage history={history.filter(row => row.projectId === project?.id)} resume={resumeReview} />}
    {section === 'models' && <section className="card ontology-hub-panel">
      <div className="ontology-hub-toolbar"><b>本体清单 <span>{models.length}</span></b><label className="ontology-search"><Search size={16} /><input placeholder="搜索本体名称、编码或领域" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label></div>
      <div className="ontology-table-scroll"><table className="ontology-table"><thead><tr><th><input aria-label="全选本体" type="checkbox" checked={rows.length > 0 && rows.every((row) => selected.includes(row.id))} onChange={(event) => toggleAll(event.target.checked)} /></th><th>本体名称 / 编码</th><th>领域</th><th>版本 / 创建方式</th><th>概要说明</th><th>元素数</th><th>关联数据对象</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead><tbody>{rows.slice((current - 1) * 10, current * 10).map((row) => <tr key={row.id} className={activeModelId === row.id ? 'selected' : ''}><td><input aria-label={`选择本体 ${row.name}`} type="checkbox" checked={selected.includes(row.id)} onChange={() => toggle(row.id)} /></td><td><b>{row.name}</b><small>{row.code}</small></td><td>{row.domain || '通用'}</td><td><b>{row.semanticVersion || '1.0.0'}</b><small>{row.branch || 'main'} · {row.origin || '手工建模'}</small></td><td className="ontology-description" title={row.description}>{row.description || '暂无说明'}</td><td>{row.elementCount || 0}</td><td>{row.linkedAssetIds?.length || 0}</td><td><span className={`model-state ${String(row.status).toLowerCase()}`}>{row.status === 'ACTIVE' ? '使用中' : row.status === 'MERGED' ? '已融合' : '草稿'}</span></td><td>{time(row.updatedAt)}</td><td><button className="ontology-enter" onClick={() => openModel(row)}>进入工作区<ChevronRight size={15} /></button></td></tr>)}</tbody></table></div>
      {!rows.length && <div className="empty-state"><Network size={28} /><b>{query ? '没有匹配的本体' : '当前项目暂无本体'}</b><span>新建本体或导入本体文件与构建记录。</span></div>}
      <div className="ontology-hub-pagination"><span>共 {rows.length} 条</span><button disabled={current === 1} onClick={() => setPage(current - 1)}>上一页</button><span>{current} / {pages}</span><button disabled={current === pages} onClick={() => setPage(current + 1)}>下一页</button></div>
    </section>}
    {section === 'models' && <div className="demo-info">三种建模入口：新建本体手工维护、导入本体文件、从构建记录导入候选。可在“构建流程演示”中按步骤体验任务、输出、审核与版本管理。</div>}
    {dialog && <div className="mask"><form className="modal ontology-transfer-modal" role="dialog" aria-modal="true" aria-label={dialog === 'import' ? '导入本体' : '导出本体'} onSubmit={submit}>
      <div className="modal-title"><div><h2>{dialog === 'import' ? '导入本体' : '导出本体'}</h2>{dialog === 'import' && <small>IMPORT · COMPARE · REVIEW</small>}</div><button type="button" disabled={busy} aria-label="关闭" onClick={() => setDialog('')}><X size={18} /></button></div>
      <div className="ontology-transfer-body">{dialog === 'import' ? <>
        <div className="ontology-import-tabs"><button type="button" className={source === 'file' ? 'active' : ''} onClick={() => setSource('file')}>本体文件</button><button type="button" className={source === 'record' ? 'active' : ''} onClick={() => setSource('record')}>本体构建记录</button></div>
        <label>本体名称<input required={source === 'record' || targetId === 'new'} value={name} onChange={(event) => setName(event.target.value)} placeholder="新本体名称；留空时使用文件中的 Namespace 名称" /></label>
        <label>导入目标<select value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="auto">自动匹配；无匹配时创建新本体</option><option value="new">创建为新本体</option>{models.map((row) => <option key={row.id} value={row.id}>比对并合入：{row.name}</option>)}</select><small>匹配到已有本体后进入逐条差异审核；每次确认都会即时保存。</small></label>
        {source === 'file' ? <label>本体文件（JSON）<input required type="file" accept=".json,application/json" onChange={(event) => setFile(event.target.files[0] || null)} /><small>支持本系统导出的单个 Namespace 本体 JSON。</small></label> : <label>成功的本体构建记录<select required value={recordId} onChange={(event) => setRecordId(event.target.value)}><option value="">选择构建记录</option>{records.map((row) => <option key={row.id} value={row.id}>{row.taskName} · {time(row.createdAt)} · {row.candidateCount} 个元素</option>)}</select>{!records.length && <small>当前项目暂无成功的构建记录。</small>}</label>}
      </> : <><p>导出已选的 {selected.length} 个本体，每个文件包含一个本体当前版本的元素。</p><label>文件格式<select value={format} onChange={(event) => setFormat(event.target.value)}><option value="json">JSON（可重新导入）</option><option value="owl">OWL</option><option value="csv">CSV</option></select></label></>}{error && <p className="ns-error" role="alert">{error}</p>}</div>
      <div className="modal-foot"><button type="button" disabled={busy} onClick={() => setDialog('')}>取消</button><button className="primary" disabled={busy || (dialog === 'import' && (source === 'file' ? !file : !recordId))}>{busy ? '处理中…' : dialog === 'import' ? '确认导入' : '确认导出'}</button></div>
    </form></div>}

  </div>;
}

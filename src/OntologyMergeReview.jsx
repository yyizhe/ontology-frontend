import React, { useMemo, useState } from 'react';
import { ArrowLeft, Check, Clock3, GitCompare, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import * as api from './services/localApi';
import * as schema from './services/spgSchemaApi';
import { elementIdentity, MERGE_FIELD_LABELS, MERGE_KIND_LABELS, persistMergeReview, snapshotNamespaceVersion } from './services/ontologyMerge';
import { snapshotElementAncestors } from './services/spgModel';
import './ontology-merge.css';

const time = (value) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
const pretty = (value) => value == null || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const statusName = { PENDING: '待审核', APPLIED: '已采用', KEPT: '已保留' };

function displayName(row) { return row?.name || row?.code || '未命名元素'; }

function resolveIncomingReference(session, current, kind, sourceId, parentKind) {
  if (!sourceId) return '';
  if (parentKind === 'namespaces') return session.namespaceId;
  const source = (session.incoming[kind] || []).find((item) => item.id === sourceId);
  if (!source) return (current[kind] || []).some((item) => item.id === sourceId) ? sourceId : '';
  const key = elementIdentity(kind, source, session.incoming);
  const change = session.rows.find((item) => item.kind === kind && item.key === key);
  if (change?.status === 'APPLIED') return change.resultId;
  if (change?.existing?.id) return change.existing.id;
  return (current[kind] || []).find((item) => elementIdentity(kind, item, current) === key)?.id || '';
}

function deletionBlocker(row, current) {
  const descendants = new Set([row.existing.id]);
  let changed = true;
  while (changed) {
    changed = false;
    Object.entries(current).forEach(([kind, values]) => values.forEach((item) => {
      if (item.parentId && descendants.has(item.parentId) && !descendants.has(item.id)) { descendants.add(item.id); changed = true; }
    }));
  }
  const children = [...descendants].filter((id) => id !== row.existing.id);
  if (children.length) return '请先处理该元素的下级元素';
  const referenced = Object.values(current).flat().some((item) => !descendants.has(item.id) && item.targetTypeId === row.existing.id);
  return referenced ? '仍有关系指向该元素，请先处理这些关系' : '';
}

export default function OntologyMergeReview({ session, setSession, ontology, onBack, refresh, note }) {
  const [kindFilter, setKindFilter] = useState('all');
  const [showResolved, setShowResolved] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(session.rows.find((row) => row.status === 'PENDING')?.id || '');
  const groups = useMemo(() => ['all', ...new Set(session.rows.map((row) => row.kind))], [session.rows]);
  const visible = session.rows.filter((row) => (kindFilter === 'all' || row.kind === kindFilter) && (showResolved || row.status === 'PENDING'));
  const selected = session.rows.find((row) => row.id === selectedId) || visible[0] || null;
  const pendingCount = session.rows.filter((row) => row.status === 'PENDING').length;
  const stats = {
    add: session.rows.filter((row) => row.operation === 'ADD').length,
    update: session.rows.filter((row) => row.operation === 'UPDATE').length,
    remove: session.rows.filter((row) => row.operation === 'DELETE').length,
  };

  const saveSession = (next) => {
    const updated = { ...next, updatedAt: new Date().toISOString() };
    persistMergeReview(updated);
    setSession(updated);
  };
  const apply = async (row, decision) => {
    if (!row || row.status !== 'PENDING' || busyId) return;
    setBusyId(row.id); setError('');
    try {
      const currentRaw = await schema.listSpgCoreModel();
      const current = snapshotNamespaceVersion(currentRaw, session.namespaceId, session.versionId);
      const namespaceBefore = current.namespaces.find((item) => item.id === session.namespaceId);
      if (!namespaceBefore) throw new Error('目标本体版本已变化，请重新开始差异审核');
      let before = null, resultId = '', ancestorsBefore = [];
      if (decision === 'APPLIED') {
        if (row.operation === 'DELETE') {
          const blocker = deletionBlocker(row, current);
          if (blocker) throw new Error(blocker);
          before = current[row.kind].find((item) => item.id === row.existing.id);
          ancestorsBefore = snapshotElementAncestors(current, before);
          await schema.deleteSpgCoreElement(row.kind, before.id);
        } else {
          const incoming = row.incoming;
          const parentId = incoming.parentId
            ? resolveIncomingReference(session, current, incoming.parentKind, incoming.parentId, incoming.parentKind)
            : '';
          const targetTypeId = incoming.targetTypeId
            ? ['entityTypes', 'conceptTypes', 'eventTypes', 'standardValues'].map((kind) => resolveIncomingReference(session, current, kind, incoming.targetTypeId, '')).find(Boolean) || ''
            : '';
          if (incoming.parentId && !parentId) throw new Error('父元素尚未导入，请先处理父元素差异');
          if (incoming.targetTypeId && !targetTypeId) throw new Error('关系目标尚未导入，请先处理目标元素差异');
          before = row.operation === 'UPDATE' ? current[row.kind].find((item) => item.id === row.existing.id) : null;
          ancestorsBefore = snapshotElementAncestors(current, {
            ...incoming,
            parentId: incoming.parentId ? parentId : before?.parentId,
            parentKind: incoming.parentId ? incoming.parentKind : before?.parentKind,
          });
          const saved = await schema.saveSpgCoreElement(row.kind, {
            ...incoming,
            id: before?.id,
            projectId: session.projectId,
            namespaceId: session.namespaceId,
            versionId: session.versionId,
            parentId: incoming.parentId ? parentId : before?.parentId,
            targetTypeId,
            status: 'DRAFT',
            baseId: before?.baseId,
          });
          resultId = saved.id;
        }
        await schema.saveSpgCoreElement('namespaces', { ...namespaceBefore, description: namespaceBefore.description || '' });
      }
      const log = {
        id: crypto.randomUUID(), diffId: row.id, kind: row.kind, itemName: displayName(row.incoming || row.existing),
        operation: row.operation, decision, timestamp: new Date().toISOString(), before,
        namespaceBefore: decision === 'APPLIED' ? namespaceBefore : null, ancestorsBefore, resultId,
      };
      const refreshedModel = decision === 'APPLIED' ? await schema.listSpgCoreModel() : currentRaw;
      log.before = decision === 'APPLIED' ? before : row.existing || null;
      log.after = decision === 'APPLIED' ? refreshedModel[row.kind].find(item => item.id === resultId) || null : row.existing || null;
      const nextCurrent = snapshotNamespaceVersion(refreshedModel, session.namespaceId, session.versionId);
      const nextRows = session.rows.map((item) => item.id === row.id ? { ...item, status: decision, resultId } : item);
      const next = { ...session, current: nextCurrent, rows: nextRows, logs: [...session.logs, log], status: nextRows.every((item) => item.status !== 'PENDING') ? 'COMPLETED' : 'REVIEWING' };
      saveSession(next);
      if (decision === 'APPLIED') {
        const latest = await schema.listSpgCoreModel();
        const namespace = latest.namespaces.find((item) => item.id === session.namespaceId);
        const count = ['entityTypes', 'conceptTypes', 'eventTypes', 'standardValues', 'properties', 'relations', 'constraints', 'rules']
          .reduce((sum, kind) => sum + latest[kind].filter((item) => item.namespaceId === session.namespaceId && item.versionId === session.versionId).length, 0);
        await api.saveOntologyModel({ ...ontology, namespaceId: session.namespaceId, schemaVersionId: session.versionId, semanticVersion: namespace?.semanticVersion, elementCount: count });
        await refresh();
      }
      note(decision === 'APPLIED' ? '该差异已写入本体' : '已保留现有定义');
    } catch (err) { setError(err.message || '差异处理失败'); }
    finally { setBusyId(''); }
  };

  const undoLast = async () => {
    const logIndex = [...session.logs].map((item, index) => ({ ...item, index })).reverse().find((item) => !item.undoneAt);
    if (!logIndex || busyId) return;
    setBusyId(logIndex.diffId); setError('');
    try {
      if (logIndex.decision === 'APPLIED') {
        if (logIndex.operation === 'ADD') await schema.deleteSpgCoreElement(logIndex.kind, logIndex.resultId);
        else await schema.restoreSpgCoreElement(logIndex.kind, logIndex.before);
        for (const ancestor of logIndex.ancestorsBefore || []) await schema.restoreSpgCoreElement(ancestor.kind, ancestor.snapshot);
        await schema.restoreSpgCoreElement('namespaces', logIndex.namespaceBefore);
        const latest = await schema.listSpgCoreModel();
        const namespace = latest.namespaces.find((item) => item.id === session.namespaceId);
        const count = ['entityTypes', 'conceptTypes', 'eventTypes', 'standardValues', 'properties', 'relations', 'constraints', 'rules']
          .reduce((sum, kind) => sum + latest[kind].filter((item) => item.namespaceId === session.namespaceId && item.versionId === session.versionId).length, 0);
        await api.saveOntologyModel({ ...ontology, namespaceId: session.namespaceId, schemaVersionId: session.versionId, semanticVersion: namespace?.semanticVersion, elementCount: count });
        await refresh();
      }
      const refreshedModel = await schema.listSpgCoreModel();
      const current = snapshotNamespaceVersion(refreshedModel, session.namespaceId, session.versionId);
      const logs = session.logs.map((item, index) => index === logIndex.index ? { ...item, undoneAt: new Date().toISOString() } : item);
      const rows = session.rows.map((item) => item.id === logIndex.diffId ? { ...item, status: 'PENDING', resultId: '' } : item);
      saveSession({ ...session, current, logs, rows, status: 'REVIEWING' });
      note('已撤回上一条审核操作');
    } catch (err) { setError(err.message || '撤回失败'); }
    finally { setBusyId(''); }
  };

  const currentModel = useMemo(() => {
    const base = session.current;
    return base;
  }, [session.current]);
  const pendingLogs = [...session.logs].reverse();
  const renderField = (field) => {
    if (field.field === '存在状态') return <div className="merge-field-diff" key={field.field}><b>{field.field}</b><del>{field.before}</del><ins>{field.after}</ins></div>;
    return <div className="merge-field-diff" key={field.field}><b>{MERGE_FIELD_LABELS[field.field] || field.field}</b><del title={pretty(field.before)}>{pretty(field.before)}</del><ins title={pretty(field.after)}>{pretty(field.after)}</ins></div>;
  };

  return <div className="ontology-merge-review">
    <header className="merge-review-heading"><div><button className="merge-back" onClick={onBack}><ArrowLeft size={16} />本体清单</button><span className="eyebrow">ONTOLOGY IMPORT · REVIEW</span><h1>本体差异审核</h1><p>{session.ontologyName} · 导入来源：{session.sourceName} · {session.sourceType === 'record' ? '成功的构建记录' : session.sourceType === 'demo' ? '演示样例' : '本体文件'}</p></div><div className="merge-review-actions"><button onClick={undoLast} disabled={!session.logs.some((item) => !item.undoneAt) || !!busyId}><RotateCcw size={15} />撤回上一条</button><button className="primary" onClick={onBack} disabled={pendingCount > 0 || !!busyId}><Check size={15} />{pendingCount ? `还剩 ${pendingCount} 条` : '完成审核'}</button></div></header>
    <section className="merge-review-summary"><div><b>{pendingCount}</b><span>待处理差异</span></div><div className="add"><b>{stats.add}</b><span>新增</span></div><div className="update"><b>{stats.update}</b><span>修改</span></div><div className="remove"><b>{stats.remove}</b><span>删除</span></div><div className="merge-review-version"><GitCompare size={16} /><span>当前语义版本</span><b>{ontology?.semanticVersion || '1.0.0'}</b></div></section>
    {error && <div className="merge-error" role="alert">{error}</div>}
    <div className="merge-review-layout">
      <aside className="merge-kind-nav"><b>差异分类</b>{groups.map((kind) => <button key={kind} className={kindFilter === kind ? 'active' : ''} onClick={() => setKindFilter(kind)}><span>{kind === 'all' ? '全部差异' : MERGE_KIND_LABELS[kind]}</span><small>{kind === 'all' ? session.rows.length : session.rows.filter((row) => row.kind === kind).length}</small></button>)}<label className="merge-resolved-toggle"><input type="checkbox" checked={showResolved} onChange={(event) => setShowResolved(event.target.checked)} />显示已处理</label></aside>
      <section className="merge-review-list"><div className="merge-list-heading"><div><h2>{kindFilter === 'all' ? '全部差异' : MERGE_KIND_LABELS[kindFilter]}</h2><span>{visible.length} 条 · 每条确认后即时保存</span></div><div className="merge-diff-legend"><span className="add">新增</span><span className="update">修改</span><span className="remove">删除</span></div></div>
        {!visible.length ? <div className="merge-empty"><ShieldCheck size={24} /><b>{pendingCount ? '该分类没有待处理差异' : '所有差异已处理'}</b><span>{pendingCount ? '切换分类或显示已处理项继续查看。' : '操作记录已保存，可以返回本体清单。'}</span></div> : visible.map((row) => {
          const blocker = row.operation === 'DELETE' ? deletionBlocker(row, currentModel) : '';
          return <article className={`merge-diff-card ${row.operation.toLowerCase()} ${row.status.toLowerCase()} ${selectedId === row.id ? 'selected' : ''}`} key={row.id} onClick={() => setSelectedId(row.id)}>
            <div className="merge-diff-card-heading"><span className={`merge-op ${row.operation.toLowerCase()}`}>{row.operation === 'ADD' ? '新增' : row.operation === 'UPDATE' ? '修改' : '删除'}</span><span className="merge-kind-label">{MERGE_KIND_LABELS[row.kind]}</span><b>{displayName(row.incoming || row.existing)}</b><code>{(row.incoming || row.existing).code}</code><span className={`merge-decision ${row.status.toLowerCase()}`}>{statusName[row.status]}</span></div>
            <div className="merge-diff-fields">{row.changes.length ? row.changes.map(renderField) : <div className="merge-no-change">定义内容无字段差异</div>}</div>
            {blocker && row.status === 'PENDING' && <p className="merge-blocker">{blocker}</p>}
            {row.status === 'PENDING' && <div className="merge-row-actions"><button type="button" onClick={(event) => { event.stopPropagation(); apply(row, 'KEPT'); }} disabled={!!busyId}><ShieldCheck size={14} />保留现有</button>{row.operation === 'DELETE' ? <button type="button" className="danger" onClick={(event) => { event.stopPropagation(); if (!blocker && confirm(`确认删除“${displayName(row.existing)}”？`)) apply(row, 'APPLIED'); }} disabled={!!busyId || !!blocker}><Trash2 size={14} />采用删除</button> : <button type="button" className="primary" onClick={(event) => { event.stopPropagation(); apply(row, 'APPLIED'); }} disabled={!!busyId}><Check size={14} />采用导入</button>}</div>}
          </article>;
        })}
      </section>
      <aside className="merge-audit-panel"><div className="merge-audit-heading"><div><b>操作记录</b><span>{session.logs.length} 条</span></div><Clock3 size={16} /></div>{pendingLogs.length ? <div className="merge-audit-list">{pendingLogs.map((log) => <div className={log.undoneAt ? 'undone' : ''} key={log.id}><span className={`merge-audit-dot ${log.decision.toLowerCase()}`} /><b>{log.decision === 'APPLIED' ? `${log.operation === 'DELETE' ? '删除' : '采用'} ${log.itemName}` : '保留现有'} </b><small>{MERGE_KIND_LABELS[log.kind]} · {time(log.timestamp)}</small>{log.undoneAt && <em>已撤回</em>}</div>)}</div> : <div className="merge-audit-empty">确认差异后，处理记录会即时显示在这里。</div>}<p>撤回仅恢复最近一次操作；其他已确认条目继续保留。</p></aside>
    </div>
  </div>;
}

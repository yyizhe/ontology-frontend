import React, { useState } from "react";
import { Eye, Search, X } from "lucide-react";
import { executionTasks, incubationLabel, jobStatistics, taskStatusLabel } from "./services/enrichmentJobs.js";
import { METADATA_TYPES } from "./services/assetMetadata.js";
import "./enrichment-results.css";

const time = (value) => value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—";
const duration = (start, end) => start && end ? `${Math.max(0, (new Date(end) - new Date(start)) / 1000).toFixed(2)} 秒` : "—";

export default function EnrichmentJobModal({ data, task, assetFiles, close, showResult }) {
  const children = executionTasks(data, task, assetFiles);
  const stats = jobStatistics(children);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const visible = children.filter((child) => (status === "all" || child.status === status) && `${child.fileName} ${child.id}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="mask"><div className="modal incubation-job-modal" role="dialog" aria-modal="true" aria-label="元数据孵化任务详情">
    <div className="modal-title"><div><small>JOB</small><h2>{data.jobName || task?.name || data.name}</h2><p className="incubation-job-id">{data.id}</p></div><button onClick={close} aria-label="关闭"><X size={20} /></button></div>
    <div className="incubation-job-body">
      <div className="incubation-job-meta"><span>状态 <b className={`incubation-status ${data.status}`}>{taskStatusLabel(data.status)}</b></span><span>孵化方式 <b>{incubationLabel(data.requestJson?.enrichmentType || task?.requestJson?.enrichmentType)}</b></span><span>开始时间 <b>{time(data.startedTime)}</b></span><span>结束时间 <b>{time(data.finishedTime)}</b></span><span>总耗时 <b>{duration(data.startedTime, data.finishedTime)}</b></span></div>
      <div className="incubation-job-stats">{[["文件 / 子任务", stats.total], ["成功", stats.success], ["失败", stats.failed], ["执行中 / 待执行", `${stats.running} / ${stats.pending}`], ["新增元数据", stats.fields], ["血缘关系", stats.lineage]].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b>{label === "血缘关系" && <small className="incubation-lineage-count">对象 {stats.objectLineage} · 元数据 {stats.metadataLineage}</small>}</div>)}</div>
      <div className="incubation-job-filter"><b>文件与子任务清单 <small>{visible.length} / {children.length}</small></b><label><Search size={14} /><input aria-label="搜索文件或子任务" placeholder="搜索文件或子任务" value={query} onChange={(event) => setQuery(event.target.value)} /></label><select aria-label="子任务状态" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">全部状态</option>{["succeeded", "failed", "running", "pending"].map((value) => <option key={value} value={value}>{taskStatusLabel(value)}</option>)}</select></div>
      <div className="incubation-task-table-wrap"><table className="incubation-task-table"><thead><tr><th>文件名称</th><th>子任务编号</th><th>元数据类型</th><th>孵化方式</th><th>状态</th><th>开始时间</th><th>结束时间</th><th>耗时</th><th>孵化结果</th></tr></thead><tbody>{visible.map((child) => <tr key={child.id}>
        <td><b>{child.fileName || child.assetFileId}</b>{child.errorMessage && <small className="incubation-error">{child.errorMessage}</small>}</td><td><span className="mono">{child.id}</span></td><td>{METADATA_TYPES[child.dataShape] || "—"}</td><td>{incubationLabel(child.enrichmentType)}</td><td><span className={`incubation-status ${child.status}`}>{taskStatusLabel(child.status)}</span></td><td>{time(child.startedTime)}</td><td>{time(child.finishedTime)}</td><td>{duration(child.startedTime, child.finishedTime)}</td><td><button className="incubation-result-button" disabled={child.status !== "succeeded" || (!child.fileSnapshot && !assetFiles.some((file) => file.id === child.assetFileId))} onClick={() => showResult(child)}><Eye size={14} />查看孵化结果</button></td>
      </tr>)}</tbody></table>{!visible.length && <p className="incubation-empty">{children.length ? "没有匹配的子任务" : "本次执行未包含文件子任务"}</p>}</div>
    </div><div className="modal-foot"><button className="primary" onClick={close}>关闭</button></div>
  </div></div>;
}

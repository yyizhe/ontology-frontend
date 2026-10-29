import React from "react";
import { ChevronRight, Ellipsis } from "lucide-react";
import "./tree-navigation.css";

export function ancestorPath(row, rowMap, parentOf = (item) => item.parentId) {
  const path = [];
  const seen = new Set();
  for (let current = row; current && !seen.has(current.id); current = rowMap[parentOf(current)]) {
    seen.add(current.id);
    path.unshift(current);
  }
  return path;
}

export function TreeBreadcrumb({ path, rootLabel, onNavigate }) {
  const hidden = path.length > 3 ? path.slice(0, -2) : [];
  const visible = hidden.length ? path.slice(-2) : path;
  return <div className="tree-breadcrumb" aria-label="当前位置" title={[rootLabel, ...path.map((item) => item.name)].join(" / ")}>
    <button type="button" onClick={() => onNavigate(null)}>{rootLabel}</button>
    {hidden.length > 0 && <><ChevronRight size={13} /><details className="tree-path-menu" key={path.map((item) => item.id).join("/")}><summary aria-label="查看上级路径" title="查看上级路径"><Ellipsis size={16} /></summary><div>{hidden.map((item, index) => <button type="button" key={item.id} title={item.name} onClick={(event) => { event.currentTarget.closest("details").open = false; onNavigate(item); }}><small>L{index + 1}</small><span>{item.name}</span></button>)}</div></details></>}
    {visible.map((item) => <React.Fragment key={item.id}><ChevronRight size={13} /><button type="button" title={item.name} aria-current={item.id === path[path.length - 1]?.id ? "location" : undefined} onClick={() => onNavigate(item)}>{item.name}</button></React.Fragment>)}
  </div>;
}

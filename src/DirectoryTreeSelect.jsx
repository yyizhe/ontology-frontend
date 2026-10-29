import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, FolderOpen, Search, X } from "lucide-react";
import "./directory-tree-select.css";

export default function DirectoryTreeSelect({ directories, value, fallbackName, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());
  const trigger = useRef(null);
  const dialog = useRef(null);
  const search = useRef(null);
  const id = useId();
  const index = useMemo(() => {
    const result = {};
    const visit = (nodes, ancestors = [], names = []) => nodes.forEach((node) => {
      const path = [...names, node.name];
      result[node.id] = { ...node, ancestors, depth: ancestors.length, path: path.join(" / ") };
      visit(node.children || [], [...ancestors, node.id], path);
    });
    visit(directories || []);
    return result;
  }, [directories]);
  const selectedPath = index[value]?.path || fallbackName || "自动创建临时目录";
  const normalizedQuery = query.trim().toLowerCase();
  const matches = new Set();
  if (normalizedQuery) Object.values(index).forEach((node) => {
    if (node.path.toLowerCase().includes(normalizedQuery)) {
      matches.add(node.id);
      node.ancestors.forEach((ancestor) => matches.add(ancestor));
    }
  });

  useEffect(() => {
    if (open) search.current?.focus();
  }, [open]);

  const show = () => {
    setDraft(value);
    setQuery("");
    setExpanded(new Set([
      ...Object.values(index).filter((node) => node.depth < 2).map((node) => node.id),
      ...(index[value]?.ancestors || []),
    ]));
    setOpen(true);
  };
  const dismiss = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      dismiss();
    }
    if (event.key === "Tab") {
      const controls = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled)')]
        .filter((node) => node.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };
  const renderNode = (node) => {
    if (normalizedQuery && !matches.has(node.id)) return null;
    const item = index[node.id];
    const children = node.children || [];
    const isExpanded = normalizedQuery ? !expanded.has(`search:${node.id}`) : expanded.has(node.id);
    return <li key={node.id}>
      <div className={`directory-picker-row${draft === node.id ? " selected" : ""}`} style={{ "--picker-indent": `${Math.min(item.depth, 4) * 16}px` }}>
        <button type="button" className="directory-picker-toggle" disabled={!children.length} aria-label={`${isExpanded ? "收起" : "展开"}${node.name}`} aria-expanded={children.length ? isExpanded : undefined} onClick={() => setExpanded((current) => {
          const next = new Set(current), key = normalizedQuery ? `search:${node.id}` : node.id;
          next.has(key) ? next.delete(key) : next.add(key);
          return next;
        })}>{children.length ? (isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />) : null}</button>
        <label title={item.path}>
          <input type="radio" name={id} value={node.id} checked={draft === node.id} onChange={() => setDraft(node.id)} />
          <FolderOpen size={16} /><span>{node.name}</span>
          {item.depth > 4 && <small className="tree-depth-badge">L{item.depth + 1}</small>}
        </label>
      </div>
      {children.length > 0 && isExpanded && <ul>{children.map(renderNode)}</ul>}
    </li>;
  };

  return <div className="directory-tree-select">
    <button ref={trigger} type="button" className="directory-picker-trigger" aria-label="选择资产目录" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-dialog` : undefined} title={selectedPath} onClick={show}>
      <FolderOpen size={16} /><span>{selectedPath}</span><ChevronDown size={16} />
    </button>
    {open && <div className="mask directory-picker-mask" onMouseDown={(event) => { if (event.target === event.currentTarget) dismiss(); }} onKeyDown={handleKeyDown}>
      <div ref={dialog} id={`${id}-dialog`} className="modal directory-picker-modal" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <div className="modal-title"><h2 id={`${id}-title`}>选择资产目录</h2><button type="button" aria-label="关闭目录选择" onClick={dismiss}><X size={18} /></button></div>
        <div className="directory-picker-search"><Search size={16} /><input ref={search} aria-label="搜索可选目录" placeholder="搜索目录名称或路径" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" aria-label="清空目录筛选" title="清空目录筛选" onClick={() => { setQuery(""); search.current?.focus(); }}><X size={14} /></button>}</div>
        <div className="directory-picker-options" role="group" aria-label="资产目录树（单选）">
          <label className={`directory-picker-auto${draft === "" ? " selected" : ""}`}><input type="radio" name={id} checked={draft === ""} onChange={() => setDraft("")} /><span>自动创建临时目录</span></label>
          <ul className="directory-picker-tree">{(directories || []).map(renderNode)}</ul>
          {normalizedQuery && matches.size === 0 && <p className="tree-no-results">未找到匹配目录</p>}
          {!directories?.length && <p className="tree-no-results">暂无可选目录</p>}
        </div>
        <div className="directory-picker-selection"><span>已选目录</span><b>{draft ? index[draft]?.path || fallbackName || "目录已不可用" : "自动创建临时目录"}</b></div>
        <div className="modal-foot"><button type="button" onClick={dismiss}>取消</button><button type="button" className="primary" disabled={Boolean(draft && !index[draft])} onClick={() => { onChange(index[draft] || null); dismiss(); }}>确定</button></div>
      </div>
    </div>}
  </div>;
}

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import "./connection-search-select.css";

export default function ConnectionSearchSelect({ options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [placement, setPlacement] = useState(null);
  const control = useRef(null);
  const input = useRef(null);
  const menu = useRef(null);
  const id = useId();
  const selected = options.find((option) => option.id === value);
  const term = query.trim().toLowerCase();
  const filtered = options.filter((option) => `${option.name} ${option.typeLabel} ${option.group} ${option.type}`.toLowerCase().includes(term));
  const active = Math.min(activeIndex, filtered.length - 1);
  const positioned = placement !== null;
  const dismiss = () => { setOpen(false); setQuery(""); };
  const show = () => {
    if (open) return;
    setQuery("");
    setActiveIndex(Math.max(0, options.findIndex((option) => option.id === value)));
    setOpen(true);
  };
  const choose = (option) => {
    onChange(option.id);
    dismiss();
  };

  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => {
      if (!control.current?.contains(event.target) && !menu.current?.contains(event.target)) dismiss();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  // Render above the modal's scrolling body so the results remain fully visible.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const position = () => {
      const rect = control.current.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop || 0;
      const viewportBottom = viewportTop + (viewport?.height || window.innerHeight);
      const below = viewportBottom - rect.bottom - 12;
      const above = rect.top - viewportTop - 12;
      const upward = below < 180 && above > below;
      setPlacement({ left: rect.left, width: rect.width, maxHeight: Math.max(0, Math.min(280, upward ? above : below)), ...(upward ? { bottom: window.innerHeight - rect.top + 5 } : { top: rect.bottom + 5 }) });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
    };
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, query, id, positioned]);

  const handleKeyDown = (event) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) show();
      else if (filtered.length) setActiveIndex((active + (event.key === "ArrowDown" ? 1 : -1) + filtered.length) % filtered.length);
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      if (filtered[active]) choose(filtered[active]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    } else if (event.key === "Tab") dismiss();
  };

  return <div className="connection-search-select">
    <div ref={control} className={`connection-select-control${open ? " expanded" : ""}`}>
      <Search size={16} />
      <input ref={input} role="combobox" aria-label="数据源连接配置" aria-required="true" aria-autocomplete="list" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} aria-activedescendant={open && filtered[active] ? `${id}-option-${active}` : undefined} autoComplete="off" placeholder="请选择或搜索数据源连接配置" value={open ? query : selected?.name || ""} title={selected?.name} onFocus={show} onClick={show} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); setOpen(true); }} onKeyDown={handleKeyDown} onBlur={dismiss} />
      {value && <button type="button" aria-label="清除已选连接" title="清除已选连接" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(""); setQuery(""); setActiveIndex(0); input.current?.focus(); setOpen(true); }}><X size={14} /></button>}
      <button type="button" aria-label={open ? "收起连接选项" : "展开连接选项"} title={open ? "收起连接选项" : "展开连接选项"} onMouseDown={(event) => event.preventDefault()} onClick={() => { input.current?.focus(); if (open) dismiss(); else show(); }}><ChevronDown size={16} /></button>
    </div>
    {selected && <div className="connection-select-summary">{selected.typeLabel} · {selected.statusLabel}</div>}
    {open && placement && createPortal(<div ref={menu} className="connection-select-menu" style={placement} id={`${id}-list`} role="listbox" aria-label="数据源连接配置选项" onMouseDown={(event) => event.preventDefault()}>
      {filtered.map((option, index) => <div key={option.id} id={`${id}-option-${index}`} role="option" aria-selected={value === option.id} className={`connection-select-option${active === index ? " active" : ""}`} onPointerMove={() => setActiveIndex(index)} onClick={() => choose(option)}>
        <i className={`icon ${option.tone}`}><option.Icon size={17} /></i>
        <span><b>{option.name}</b><small>{option.typeLabel} · {option.statusLabel}</small></span>
        {value === option.id && <Check size={16} />}
      </div>)}
      {!filtered.length && <div className="connection-select-empty" role="status">{options.length ? "未找到匹配的数据源连接配置" : "暂无数据源连接配置"}</div>}
    </div>, document.body)}
  </div>;
}

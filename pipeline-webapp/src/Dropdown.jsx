import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './ui';

const SEARCH_FROM = 9;
const optionsIn = (menu) => (menu ? [...menu.querySelectorAll('[role="option"]')] : []);
const MAX_HEIGHT = 320;

// The app's one dropdown. The browser's own option list can't be styled, so the list is drawn here, in a layer over
// the page (scrolling tables can't clip it). `options` are strings or { value, label, tone, muted }.
// The trigger is a button whose look comes from `className` and whose content is `children`.
const Dropdown = ({
  value, options, onChange, label, className = '', children, disabled = false, minWidth = 180, searchable, title,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);

  const items = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const withSearch = searchable ?? items.length >= SEARCH_FROM;
  const q = query.trim().toLowerCase();
  const shown = q ? items.filter((o) => String(o.label).toLowerCase().includes(q)) : items;

  const close = (refocus = true) => {
    setOpen(false);
    setPos(null);
    setQuery('');
    if (refocus) triggerRef.current?.focus();
  };

  const choose = (item) => {
    if (item.value !== value) onChange(item.value);
    close();
  };

  // Place the list under the trigger, or above it when there isn't room below.
  useLayoutEffect(() => {
    if (!open) return;
    const r = triggerRef.current.getBoundingClientRect();
    const width = Math.max(r.width, minWidth);
    const below = window.innerHeight - r.bottom;
    const up = below < 220 && r.top > below;
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      width,
      top: up ? undefined : r.bottom + 4,
      bottom: up ? window.innerHeight - r.top + 4 : undefined,
      maxHeight: Math.min(MAX_HEIGHT, (up ? r.top : below) - 12),
    });
  }, [open, minWidth]);

  // Once the list is on screen, put the keyboard in it: the search box, or the chosen option.
  const placed = open && !!pos;
  useEffect(() => {
    if (!placed) return;
    if (withSearch) searchRef.current?.focus();
    else {
      const list = optionsIn(menuRef.current);
      (list.find((el) => el.getAttribute('aria-selected') === 'true') || list[0])?.focus();
    }
  }, [placed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!menuRef.current?.contains(e.target) && !triggerRef.current?.contains(e.target)) close(false);
    };
    // The list stays put while the page scrolls, so scrolling anywhere else closes it.
    const onScroll = (e) => { if (!menuRef.current?.contains(e.target)) close(false); };
    const onResize = () => close(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusOption = (i) => {
    const list = optionsIn(menuRef.current);
    if (list.length) list[(i + list.length) % list.length].focus();
  };

  const onMenuKey = (e) => {
    const list = optionsIn(menuRef.current);
    const i = list.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') close(false);
    else if (e.key === 'ArrowDown') { e.preventDefault(); focusOption(i + 1); }
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (i <= 0 && withSearch) searchRef.current?.focus();
      else focusOption(i - 1);
    } else if (e.key === 'Home' && i >= 0) { e.preventDefault(); focusOption(0); }
    else if (e.key === 'End' && i >= 0) { e.preventDefault(); focusOption(list.length - 1); }
    else if (e.key === 'Enter' && document.activeElement === searchRef.current && shown.length) { e.preventDefault(); choose(shown[0]); }
  };

  if (disabled) {
    return <span className={`${className} is-disabled`} title={title}>{children}</span>;
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${className}${open ? ' is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        title={title}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); }
        }}
      >
        {children}
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          className="dd-menu"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
          onKeyDown={onMenuKey}
        >
          {withSearch && (
            <label className="dd-search">
              <Icon name="search" size={14} />
              <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" aria-label={`Search ${label || 'options'}`} />
            </label>
          )}
          <div className="dd-list" role="listbox" aria-label={label}>
            {shown.map((o, i) => {
              const selected = o.value === value || (!o.value && !value);
              return (
                <button
                  key={`${o.value}|${i}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`dd-option${selected ? ' is-selected' : ''}${o.muted ? ' is-muted' : ''}`}
                  onClick={() => choose(o)}
                >
                  {o.tone && <span className={`dd-dot tone-${o.tone}`} />}
                  <span className="dd-label">{o.label}</span>
                  {selected && <span className="dd-check"><Icon name="check" size={13} stroke={2.6} /></span>}
                </button>
              );
            })}
            {shown.length === 0 && <span className="dd-empty">No matches for “{query}”</span>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

export default Dropdown;

// A coloured pill in a grid cell that opens the dropdown. The empty choice shows `placeholder` and clears the value;
// `optionTone` gives each option its own colour dot.
export const PillSelect = ({ options, value, onChange, tone = 'neutral', placeholder = 'Set', format = (v) => v, disabled, label, optionTone }) => {
  const opts = value && !options.includes(value) ? [...options, value] : options;
  const items = [
    { value: '', label: placeholder, muted: true },
    ...opts.map((o) => ({ value: o, label: format(o), tone: optionTone ? optionTone(o) : undefined })),
  ];
  return (
    <Dropdown value={value || ''} options={items} onChange={onChange} label={label} disabled={disabled} className={`pill-select tone-${value ? tone : 'empty'}`}>
      <span className="pill-select-text">{value ? format(value) : placeholder}</span>
      {!disabled && <Icon name="chevronDown" size={12} stroke={2} />}
    </Dropdown>
  );
};

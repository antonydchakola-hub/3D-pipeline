import React, { useEffect, useRef, useState } from 'react';
import { usePipeline } from './PipelineContext';
import { Icon } from './ui';
import { projectProgress } from './pipelineModel';

const DoneBadge = ({ className = '' }) => (
  <span className={`done-badge ${className}`} aria-hidden="true"><Icon name="check" size={10} stroke={3.4} /></span>
);

const ProjectSwitcher = ({ projects, project, onProject }) => {
  const { data } = usePipeline();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef([]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    const options = optionRefs.current.filter(Boolean);
    (options.find((el) => el.getAttribute('aria-selected') === 'true') || options[0])?.focus();
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const onTriggerKey = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onListKey = (e) => {
    const items = optionRefs.current.filter(Boolean);
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') setOpen(false);
  };

  const choose = (p) => {
    onProject(p);
    close();
  };

  const currentDone = projectProgress(data, project).complete;

  return (
    <div className="project-switch" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`project-trigger${open ? ' is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Project: ${project}${currentDone ? ', all assets approved' : ''}. Change project`}
      >
        <span className="eyebrow">Project</span>
        <span className="project-current">{project}</span>
        {currentDone && <DoneBadge />}
        <Icon name="chevronDown" size={14} stroke={2} className="project-chevron" />
      </button>

      {open && (
        <div className="menu project-menu" role="listbox" aria-label="Projects" onKeyDown={onListKey}>
          <span className="menu-label">Switch project</span>
          {projects.map((p, i) => {
            const active = p === project;
            const progress = projectProgress(data, p);
            const count = progress.total;
            return (
              <button
                key={p}
                ref={(el) => { optionRefs.current[i] = el; }}
                type="button"
                role="option"
                aria-selected={active}
                aria-label={`${p}, ${count} ${count === 1 ? 'asset' : 'assets'}${progress.complete ? ', all approved' : `, ${progress.done} approved`}`}
                className={`project-option${active ? ' is-active' : ''}${progress.complete ? ' is-complete' : ''}`}
                onClick={() => choose(p)}
              >
                <span className="project-mark" aria-hidden="true">
                  {p.slice(0, 2).toUpperCase()}
                  {progress.complete && <DoneBadge className="on-mark" />}
                </span>
                <span className="project-name">{p}</span>
                <span className={`project-count${progress.complete ? ' is-complete' : ''}`}>
                  {progress.complete ? 'All approved' : `${count} ${count === 1 ? 'asset' : 'assets'}`}
                </span>
                <span className="project-check" aria-hidden="true">{active && <Icon name="check" size={15} stroke={2.4} />}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProjectSwitcher;

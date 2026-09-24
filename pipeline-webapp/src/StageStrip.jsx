import React from 'react';
import { STAGES, STAGE_LABEL, STAGE_TONE } from './pipelineModel';

const Bar = ({ parts }) => {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <div className="strip-bar"><span className="strip-seg seg-empty" style={{ flex: 1 }} /></div>;
  return (
    <div className="strip-bar">
      {parts.filter((p) => p.value > 0).map((p) => (
        <span key={p.key} className={`strip-seg seg-${p.tone}`} style={{ flex: p.value }} />
      ))}
    </div>
  );
};

const joinParts = (parts) => {
  const shown = parts.filter((p) => p.value > 0).map((p) => `${p.value} ${p.label}`);
  return shown.length ? shown.join(' · ') : 'nothing here yet';
};

const StageStrip = ({ health, active, onSelect }) => {
  const q = health.queue;
  const queueParts = [
    { key: 'high', value: q.high, tone: 'danger', label: 'high' },
    { key: 'medium', value: q.medium, tone: 'queue', label: 'medium' },
    { key: 'low', value: q.low, tone: 'muted', label: 'low' },
  ];

  return (
    <nav className="strip" aria-label="Pipeline stages">
      <button
        type="button"
        className={`strip-item${active === 'Manager' ? ' is-active' : ''}`}
        onClick={() => onSelect('Manager')}
        aria-current={active === 'Manager' ? 'page' : undefined}
        aria-label={`${STAGE_LABEL.Manager}: ${q.total} awaiting dispatch`}
      >
        <span className="strip-name"><span className="strip-key tone-queue" />{STAGE_LABEL.Manager}</span>
        <span className="strip-count"><span className="num">{q.total}</span><span className="strip-unit">awaiting dispatch</span></span>
        <Bar parts={queueParts} />
        <span className="strip-caption">{q.total ? joinParts(queueParts) : 'queue is clear'}</span>
      </button>

      {STAGES.map((stage) => {
        const s = health.stages[stage];
        const parts = [
          { key: 'fresh', value: s.fresh, tone: STAGE_TONE[stage], label: 'new' },
          { key: 'rework', value: s.rework, tone: 'rework', label: 'rework' },
          { key: 'overdue', value: s.overdue, tone: 'danger', label: 'overdue' },
        ];
        return (
          <button
            key={stage}
            type="button"
            className={`strip-item${active === stage ? ' is-active' : ''}`}
            onClick={() => onSelect(stage)}
            aria-current={active === stage ? 'page' : undefined}
            aria-label={`${STAGE_LABEL[stage]}: ${s.total} in stage, ${joinParts(parts)}`}
          >
            <span className="strip-name"><span className={`strip-key tone-${STAGE_TONE[stage]}`} />{STAGE_LABEL[stage]}</span>
            <span className="strip-count"><span className="num">{s.total}</span><span className="strip-unit">in stage</span></span>
            <Bar parts={parts} />
            <span className="strip-caption">{joinParts(parts)}</span>
          </button>
        );
      })}

      <div className="strip-item is-static">
        <span className="strip-name"><span className="strip-key tone-good" />Approved</span>
        <span className="strip-count">
          <span className="num">{health.approved.total}</span>
          {health.approved.week > 0 && <span className="strip-unit is-good">+{health.approved.week} this week</span>}
        </span>
        <Bar parts={[{ key: 'approved', value: health.approved.total, tone: 'good' }]} />
        <span className="strip-caption">{health.approved.total ? 'signed off in Lighting / QA' : 'none signed off yet'}</span>
      </div>
    </nav>
  );
};

export default StageStrip;

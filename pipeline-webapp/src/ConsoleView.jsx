import React, { useState } from 'react';
import { usePipeline } from './PipelineContext';
import { Avatar, Icon } from './ui';
import { STAGES, STAGE_LABEL, STAGE_TONE, consoleMetrics, formatDate, formatHours, todayISO } from './pipelineModel';

const HEAT = ['#f1f4f9', '#f6e3c6', '#e8b872', '#c98a2e', '#9a5f12'];
const heatColor = (n) => HEAT[Math.min(n, HEAT.length - 1)];

const ticksFor = (max) => {
  const step = max <= 5 ? 1 : Math.ceil(max / 4);
  const top = Math.max(step, step * Math.ceil(max / step));
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { top, ticks };
};

const Legend = ({ items }) => (
  <div className="legend">
    {items.map((it) => (
      <span key={it.label} className="legend-item"><span className={`legend-swatch tone-${it.tone}`} />{it.label}</span>
    ))}
  </div>
);

const Tile = ({ label, value, caption, tone }) => (
  <div className={`panel tile${tone ? ` tile-${tone}` : ''}`}>
    <span className="eyebrow">{label}</span>
    <div className="tile-body">
      <span className="tile-value num">{value}</span>
      <span className="tile-caption">{caption}</span>
    </div>
  </div>
);

const Funnel = ({ funnel }) => {
  const max = Math.max(1, ...funnel.map((f) => f.count));
  return (
    <div className="funnel">
      {funnel.map((f) => (
        <div key={f.stage} className="funnel-row">
          <span className="funnel-label">{f.label}</span>
          <div className="funnel-track">
            {f.count > 0 && <span className={`funnel-bar tone-${f.stage === 'Manager' ? 'queue' : STAGE_TONE[f.stage]}`} style={{ width: `${(f.count / max) * 100}%` }} />}
            <span className="funnel-count num">{f.count}</span>
            {f.sentBack > 0 && (
              <span className="funnel-back"><Icon name="rework" size={13} stroke={2} />{f.sentBack} of them sent back</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

const DueChart = ({ due, today }) => {
  const [hover, setHover] = useState(null);
  const columns = [
    { key: 'late', label: 'Late', counts: due.late, late: true },
    ...due.days.map((day, i) => ({ key: day, label: formatDate(day).slice(0, 2), day, counts: due.byDay[i], weekend: [0, 6].includes(new Date(`${day}T00:00:00`).getDay()) })),
  ];
  const totals = columns.map((c) => STAGES.reduce((s, st) => s + c.counts[st].length, 0));
  const { top, ticks } = ticksFor(Math.max(1, ...totals));
  const H = 168;
  const anyDue = totals.some(Boolean);

  if (!anyDue) {
    return <div className="panel-empty">Nothing due in the next 10 days and nothing overdue. Set due dates on stage rows to see the load here.</div>;
  }

  const h = hover !== null ? columns[hover] : null;
  return (
    <div className="due-chart">
      <div className="due-axis">
        {ticks.map((t) => (
          <span key={t} className="num" style={{ bottom: 26 + (t / top) * H - 6 }}>{t}</span>
        ))}
      </div>
      <div className="due-plot" style={{ height: H + 26 }}>
        {ticks.map((t) => (
          <span key={t} className={`due-grid${t === 0 ? ' is-base' : ''}`} style={{ bottom: 26 + (t / top) * H }} />
        ))}
        <div className="due-cols" style={{ height: H + 26 }}>
          {columns.map((c, i) => (
            <div
              key={c.key}
              className={`due-col${c.late ? ' is-late' : ''}${c.weekend ? ' is-weekend' : ''}${hover === i ? ' is-hover' : ''}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={totals[i] ? 0 : -1}
            >
              <div className="due-stack" style={{ height: H }}>
                {STAGES.map((st) => c.counts[st].length > 0 && (
                  <span key={st} className={`due-seg tone-${STAGE_TONE[st]}`} style={{ height: (c.counts[st].length / top) * H }} />
                ))}
              </div>
              <span className="due-label num">{c.late ? <><Icon name="alert" size={11} stroke={2.2} />Late</> : c.label}</span>
            </div>
          ))}
        </div>
        {h && totals[hover] > 0 && (
          <div className="tooltip" style={{ left: `${((hover + 0.5) / columns.length) * 100}%` }}>
            <span className="tooltip-title num">{h.late ? 'Overdue' : `${new Date(`${h.day}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}${h.day === today ? ' · today' : ''}`} · {totals[hover]} due</span>
            {STAGES.map((st) => h.counts[st].length > 0 && (
              <span key={st} className="tooltip-row">
                <span className={`legend-swatch tone-${STAGE_TONE[st]}`} />
                <span className="tooltip-label">{STAGE_LABEL[st]}</span>
                <span className="num tooltip-tcns">{h.counts[st].join(', ')}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const ConsoleView = ({ project }) => {
  const { data } = usePipeline();
  const today = todayISO();
  const m = consoleMetrics(data, project, today);

  const reworkLeader = STAGES.reduce((a, b) => (m.reworkTotals[b] > m.reworkTotals[a] ? b : a), 'Modelling');
  const workloadScale = Math.max(1, ...m.workload.map((w) => Math.max(w.alloc, w.spent)));
  const overBudget = m.workload.filter((w) => w.alloc > 0 && w.spent > w.alloc);
  const lateByStage = STAGES.map((st) => [st, m.overdue.filter((o) => o.stage === st).length]).filter(([, n]) => n);

  return (
    <div className="console">
      <div className="console-tiles">
        <Tile label="In flight" value={m.inFlight} caption="assets with an open stage row" />
        <Tile label="Approved this week" value={m.approvedWeek} caption={`${m.approvedTotal} approved in total`} />
        <Tile
          label="Rework rate"
          value={m.reworkRate === null ? '—' : `${m.reworkRate}%`}
          caption={m.dispatchedCount ? `${m.sentBackOnce} of ${m.dispatchedCount} dispatched sent back at least once` : 'nothing dispatched yet'}
          tone={m.reworkRate >= 20 ? 'warn' : undefined}
        />
        <Tile
          label="Overdue"
          value={m.overdue.length}
          caption={lateByStage.length ? lateByStage.map(([st, n]) => `${n} in ${st}`).join(' · ') : 'nothing past its due date'}
          tone={m.overdue.length ? 'danger' : undefined}
        />
      </div>

      <div className="console-row">
        <section className="panel span-2">
          <header className="panel-head">
            <h2>Where work is sitting — and what comes back</h2>
            <Legend items={[{ tone: 'queue', label: 'queue' }, ...STAGES.map((s) => ({ tone: STAGE_TONE[s], label: s }))]} />
          </header>
          <Funnel funnel={m.funnel} />
          <p className="panel-foot">
            {m.sentBackOnce} of {m.dispatchedCount} dispatched assets have been sent back at least once · {m.approvedTotal} approved
          </p>
        </section>

        <section className="panel">
          <header className="panel-head"><h2>Rework pressure</h2></header>
          <div className="heat">
            <div className="heat-row heat-head">
              <span />
              {m.weeks.map((w) => <span key={w} className="num">{formatDate(w)}</span>)}
            </div>
            {STAGES.map((st) => (
              <div key={st} className="heat-row">
                <span className="heat-label">{st}</span>
                {m.reworkByWeek[st].map((n, i) => (
                  <span key={m.weeks[i]} className="heat-cell" style={{ background: heatColor(n) }} title={`${n} sent back to ${st} in the week of ${formatDate(m.weeks[i])}`} />
                ))}
              </div>
            ))}
            <div className="heat-scale">
              <span className="num">0</span>
              {HEAT.map((c) => <span key={c} className="heat-swatch" style={{ background: c }} />)}
              <span className="num">4+ sent back</span>
            </div>
          </div>
          <p className="panel-foot">
            {m.reworkSum
              ? <>{reworkLeader} absorbs <strong>{Math.round((m.reworkTotals[reworkLeader] / m.reworkSum) * 100)}%</strong> of all rework ({m.reworkSum} send-backs in total).</>
              : 'No rework recorded yet.'}
          </p>
        </section>
      </div>

      <div className="console-row halves">
        <section className="panel">
          <header className="panel-head">
            <h2>Artist workload</h2>
            <Legend items={[{ tone: 'alloc', label: 'allocated' }, { tone: 'mod', label: 'spent' }, { tone: 'danger', label: 'over allocation' }]} />
          </header>
          {m.workload.length === 0 ? (
            <div className="panel-empty">No open stage rows have an artist assigned yet.</div>
          ) : (
            <div className="workload">
              {m.workload.map((w) => {
                const over = w.alloc > 0 && w.spent > w.alloc;
                return (
                  <div key={w.artist} className="workload-row">
                    <span className="workload-name"><Avatar name={w.artist} size={24} />{w.artist}</span>
                    <div className="workload-track">
                      <span className="workload-alloc" style={{ width: `${(w.alloc / workloadScale) * 100}%` }} />
                      <span className="workload-spent" style={{ width: `${(Math.min(w.spent, w.alloc || w.spent) / workloadScale) * 100}%` }} />
                      {over && <span className="workload-over" style={{ left: `calc(${(w.alloc / workloadScale) * 100}% + 2px)`, width: `calc(${((w.spent - w.alloc) / workloadScale) * 100}% - 2px)` }} />}
                    </div>
                    <span className={`workload-figure num${over ? ' is-over' : ''}`}>{formatHours(w.spent)} / {formatHours(w.alloc)} h · {w.assets}</span>
                  </div>
                );
              })}
            </div>
          )}
          {overBudget.length > 0 && (
            <p className="panel-foot"><Icon name="clock" size={14} stroke={2} />{overBudget.map((w) => w.artist).join(', ')} {overBudget.length === 1 ? 'is' : 'are'} past the hours allocated to their open assets.</p>
          )}
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>Due in the next 10 days</h2>
            <Legend items={STAGES.map((s) => ({ tone: STAGE_TONE[s], label: s }))} />
          </header>
          <DueChart due={m.due} today={today} />
        </section>
      </div>
    </div>
  );
};

export default ConsoleView;

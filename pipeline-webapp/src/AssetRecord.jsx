import React, { useState } from 'react';
import { usePipeline } from './PipelineContext';
import { Avatar, Icon, Pill } from './ui';
import {
  REWORK_FIELD, SEND_BACK_OPTIONS, STAGES, STAGE_LABEL, STAGE_TONE,
  assetStage, daysBetween, displayStatus, formatDate, formatHours, formatTimestamp, hours,
  isDispatched, priorityShort, priorityTone, rowsFor, stageSnapshot, statusTone, todayISO,
} from './pipelineModel';

const EVENT_TONE = {
  dispatch: 'queue', split: 'queue', status: 'queue',
  rework: 'rework', comment: 'brand', uploaded: 'light', approved: 'good',
};
const eventTone = (ev) => EVENT_TONE[ev.kind] || STAGE_TONE[ev.stage] || 'queue';

const STEPS = ['Dispatched', ...STAGES, 'Approved'];

const stepStates = (position, dispatched, snapshots) => {
  if (position.key === 'approved') return STEPS.map(() => 'done');
  if (position.key === 'queue') return STEPS.map((_, i) => (i === 0 ? 'current' : 'todo'));
  if (!position.stage) {
    return STEPS.map((s, i) => (i === 0 && dispatched) || snapshots[s] ? 'done' : 'todo');
  }
  const current = 1 + STAGES.indexOf(position.stage);
  return STEPS.map((_, i) => (i < current ? 'done' : i === current ? 'current' : 'todo'));
};

const dueChip = (dueDate, today) => {
  if (!dueDate) return null;
  const diff = daysBetween(today, dueDate);
  if (diff < 0) return <Pill tone="danger" icon="alert">{-diff} day{diff === -1 ? '' : 's'} late</Pill>;
  if (diff === 0) return <Pill tone="rework">due today</Pill>;
  return <Pill tone={diff <= 2 ? 'rework' : 'neutral'}>in {diff} day{diff === 1 ? '' : 's'}</Pill>;
};

const AssetRecord = ({ project, tcn, onBack }) => {
  const { data, handleStatusChange, addComment } = usePipeline();
  const [draft, setDraft] = useState('');
  const [target, setTarget] = useState('');
  const today = todayISO();

  const mgrRow = rowsFor(data, 'Manager', project).find((r) => r.tcin === tcn);
  const position = assetStage(data, project, mgrRow || { tcin: tcn });
  const dispatched = isDispatched(data, project, tcn);
  const snapshots = Object.fromEntries(STAGES.map((s) => [s, stageSnapshot(data, project, s, tcn)]));
  const steps = stepStates(position, dispatched, snapshots);
  const events = (data.events?.[project] || []).filter((e) => e.tcn === tcn).sort((a, b) => a.at.localeCompare(b.at));
  const reworkTotal = mgrRow ? STAGES.reduce((s, st) => s + (mgrRow[REWORK_FIELD[st]] || 0), 0) : 0;
  const latest = position.row || STAGES.map((s) => snapshots[s]).filter(Boolean).pop();
  const priority = mgrRow?.priority || latest?.priority;
  const openRow = position.row && position.key !== 'approved' ? position.row : null;
  const sendBackOptions = openRow ? SEND_BACK_OPTIONS[position.stage] : [];

  const legacyFeedback = events.length
    ? []
    : STAGES.flatMap((st) => rowsFor(data, st, project)
      .filter((r) => r.tcn === tcn && r.type === 'rework' && r.comments)
      .map((r) => ({ stage: st, comment: r.comments, id: r.id })));

  let primary = null;
  if (openRow) {
    if (position.stage === 'Modelling') primary = { label: 'Send to Texturing', icon: 'arrowRight', status: 'Done', tone: 'brand' };
    else if (position.stage === 'Texturing') primary = { label: 'Send to Lighting', icon: 'arrowRight', status: 'Done', tone: 'brand' };
    else if (openRow.status === 'Uploaded') primary = { label: 'Approve', icon: 'check', status: 'Approved', tone: 'good' };
    else primary = { label: 'Mark uploaded', icon: 'upload', status: 'Uploaded', tone: 'brand' };
  }

  const sendBack = () => {
    const text = draft.trim();
    const option = sendBackOptions.find((o) => o.status === target) || sendBackOptions[0];
    if (!text || !option || !openRow) return;
    handleStatusChange(position.stage, project, openRow.id, option.status, text);
    setDraft('');
    setTarget('');
  };

  const commentOnly = () => {
    const text = draft.trim();
    if (!text) return;
    addComment(project, tcn, position.stage || 'Manager', text);
    setDraft('');
  };

  const allotDate = mgrRow?.allotDate || latest?.allotDate;
  const approvedDate = mgrRow?.approvedDate;

  return (
    <div className="record">
      <header className="record-head">
        <div className="crumbs">
          <button type="button" className="crumb-back" onClick={onBack}><Icon name="chevronLeft" size={14} stroke={2} />Back</button>
          <span>{project}</span>
          <Icon name="chevronRight" size={12} stroke={2} />
          <span>Assets</span>
          <Icon name="chevronRight" size={12} stroke={2} />
          <span className="mono">{tcn}</span>
        </div>

        <div className="record-title">
          <h1 className="mono">{tcn}</h1>
          {priority && <Pill tone={priorityTone(priority)}>{priorityShort(priority)} priority</Pill>}
          {latest?.complexity && <Pill tone="neutral">{latest.complexity}</Pill>}
          {reworkTotal > 0 && <Pill tone="rework" icon="rework">{reworkTotal} rework{reworkTotal === 1 ? '' : 's'}</Pill>}
          <div className="spacer" />
          {primary && (
            <button type="button" className={`btn btn-${primary.tone}`} onClick={() => handleStatusChange(position.stage, project, openRow.id, primary.status)}>
              <Icon name={primary.icon} size={15} stroke={2.2} />{primary.label}
            </button>
          )}
        </div>

        <ol className="stepper">
          {STEPS.map((step, i) => {
            const state = steps[i];
            const rw = STAGES.includes(step) && mgrRow ? mgrRow[REWORK_FIELD[step]] || 0 : 0;
            const tone = STAGES.includes(step) ? STAGE_TONE[step] : 'good';
            return (
              <li key={step} className={`step is-${state}`}>
                <span className={`step-dot tone-${state === 'current' ? tone : 'good'}`}>
                  {state === 'done' && <Icon name="check" size={11} stroke={3.2} />}
                </span>
                <span className="step-label">{step === 'Lighting' ? STAGE_LABEL.Lighting : step}</span>
                {rw > 0 && <Pill tone="rework">+{rw} rework</Pill>}
                {state === 'current' && position.key === 'uploaded' && <Pill tone="light">uploaded, awaiting sign-off</Pill>}
                {state === 'current' && position.key === 'queue' && <Pill tone="neutral">in the Manager queue</Pill>}
              </li>
            );
          })}
        </ol>
      </header>

      <div className="record-body">
        <section className="panel activity">
          <header className="panel-head">
            <h2>Activity</h2>
            <span className="count-chip neutral">{events.length} event{events.length === 1 ? '' : 's'}</span>
          </header>

          <div className="timeline">
            {events.length === 0 && (
              <div className="timeline-empty">
                <p>No history recorded for this asset yet. Hand-offs, reworks and comments are logged here from now on.</p>
                {legacyFeedback.map((f) => (
                  <blockquote key={f.id} className="quote">
                    <span className="quote-text">“{f.comment}”</span>
                    <span className="quote-meta">Earlier rework feedback · {f.stage}</span>
                  </blockquote>
                ))}
              </div>
            )}
            {events.map((ev, i) => {
              const t = formatTimestamp(ev.at);
              const last = i === events.length - 1;
              return (
                <div key={ev.id} className={`event${last ? ' is-latest' : ''}`}>
                  <div className="event-time num"><span>{t.day}</span><span className="event-clock">{t.time}</span></div>
                  <div className="event-rail"><span className={`event-dot tone-${eventTone(ev)}`} />{!last && <span className="event-line" />}</div>
                  <div className="event-body">
                    <span className={`event-title${ev.kind === 'rework' ? ' is-rework' : ''}`}>{ev.text}</span>
                    {ev.detail && <span className="event-meta">{ev.detail}</span>}
                    {ev.comment && (
                      <blockquote className={`quote${ev.kind === 'comment' ? ' is-comment' : ''}`}>
                        <span className="quote-text">“{ev.comment}”</span>
                        {ev.from && <span className="quote-meta">raised in {ev.from}</span>}
                      </blockquote>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="composer">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={openRow ? 'Describe what needs to change — this goes to the artist with the asset…' : 'Add a note to this asset’s history…'}
              rows={2}
              aria-label="Feedback"
            />
            <div className="composer-actions">
              <button type="button" className="btn btn-ghost" onClick={commentOnly} disabled={!draft.trim()}>
                <Icon name="comment" size={14} />Comment only
              </button>
              <div className="spacer" />
              {sendBackOptions.length > 0 && (
                <>
                  <label className="select-inline">
                    <span>Send back to</span>
                    <select value={target || sendBackOptions[0].status} onChange={(e) => setTarget(e.target.value)}>
                      {sendBackOptions.map((o) => <option key={o.status} value={o.status}>{o.label}</option>)}
                    </select>
                  </label>
                  <button type="button" className="btn btn-rework" onClick={sendBack} disabled={!draft.trim()}>
                    <Icon name="rework" size={14} stroke={2} />Send back
                  </button>
                </>
              )}
            </div>
          </div>
        </section>

        <aside className="record-rail">
          <section className="panel">
            <header className="panel-head"><h2>Stage summary</h2></header>
            {STAGES.map((st) => {
              const snap = snapshots[st];
              const passes = rowsFor(data, st, project).filter((r) => r.tcn === tcn);
              const spent = passes.reduce((s, r) => s + hours(r.timeSpent), 0);
              const extra = passes.reduce((s, r) => s + hours(r.reworkTime), 0);
              const alloc = passes.reduce((s, r) => s + hours(r.allocTime), 0);
              const scale = Math.max(alloc, spent + extra, 1);
              const status = snap ? displayStatus(snap.status, st) : '';
              return (
                <div key={st} className="summary-stage">
                  <div className="summary-top">
                    <span className={`legend-swatch tone-${STAGE_TONE[st]}`} />
                    <span className="summary-name">{STAGE_LABEL[st]}</span>
                    <div className="spacer" />
                    {!snap ? <Pill tone="empty">Not started</Pill> : status ? <Pill tone={statusTone(status)}>{status}</Pill> : <Pill tone={STAGE_TONE[st]}>In progress</Pill>}
                  </div>
                  {snap && (
                    <>
                      <div className="summary-artist">
                        <Avatar name={snap.artist} />
                        <span>{snap.artist || 'Unassigned'}</span>
                        <div className="spacer" />
                        <span className="num muted">{alloc || spent || extra ? `${formatHours(spent + extra)} / ${formatHours(alloc)} h` : 'no hours logged'}</span>
                      </div>
                      {(alloc > 0 || spent + extra > 0) && (
                        <div className="summary-bar">
                          {spent > 0 && <span className={`tone-${STAGE_TONE[st]}`} style={{ width: `${(spent / scale) * 100}%` }} />}
                          {extra > 0 && <span className="tone-rework" style={{ width: `${(extra / scale) * 100}%` }} />}
                        </div>
                      )}
                      {extra > 0 && <span className="summary-note">{formatHours(spent)} h build · {formatHours(extra)} h rework</span>}
                    </>
                  )}
                </div>
              );
            })}
          </section>

          <section className="panel">
            <header className="panel-head"><h2>Timing</h2></header>
            <dl className="facts">
              <div><dt>Allotted</dt><dd className="num">{allotDate ? formatDate(allotDate) : '—'}</dd></div>
              <div><dt>Due</dt><dd className="num">{openRow?.dueDate ? <>{formatDate(openRow.dueDate)} {dueChip(openRow.dueDate, today)}</> : '—'}</dd></div>
              <div><dt>Uploaded</dt><dd className="num">{mgrRow?.uploadDate ? formatDate(mgrRow.uploadDate) : '—'}</dd></div>
              <div><dt>Approved</dt><dd className="num">{approvedDate ? formatDate(approvedDate) : '—'}</dd></div>
              <div className="facts-total">
                <dt>Time in pipeline</dt>
                <dd className="num">{allotDate ? `${Math.max(0, daysBetween(allotDate, approvedDate || today))} days` : '—'}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
};

export default AssetRecord;

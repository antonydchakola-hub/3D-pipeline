import React from 'react';
import { usePipeline } from './PipelineContext';
import { Avatar, Icon, Pill, PillSelect } from './ui';
import {
  COMPLEXITIES, PRIORITIES, STAGE_TONE, STATUS_OPTIONS, TYPES, artistOptions as rosterOptions,
  assetComment, displayStatus, formatHours, isSendBack, hours, isArchived, isLocked, isOverdue, matchesQuery,
  priorityShort, priorityTone, rowsFor, statusTone, todayISO, typeTone,
} from './pipelineModel';

const FROZEN = [
  { width: 44, left: 0 },
  { width: 132, left: 44 },
];
const frozenStyle = (i) => ({ left: FROZEN[i].left, width: FROZEN[i].width, minWidth: FROZEN[i].width });

const TimeCell = ({ row, disabled, onChange, tone }) => {
  const alloc = hours(row.allocTime);
  const spent = hours(row.timeSpent);
  const over = alloc > 0 && spent > alloc;
  const pct = alloc > 0 ? Math.min(100, (spent / alloc) * 100) : 0;
  return (
    <div className="time-cell">
      <input className="cell-input num" value={row.timeSpent || ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label="Time spent" inputMode="decimal" />
      {alloc > 0 && (
        <div className={`time-track${over ? ' is-over' : ''}`} title={`${formatHours(spent)} of ${formatHours(alloc)} h`}>
          <span className={`time-fill tone-${over ? 'danger' : tone}`} style={{ width: `${over ? 100 : pct}%` }} />
        </div>
      )}
    </div>
  );
};

const ProductionView = ({ stageName, project, query, filters, onOpenAsset }) => {
  const { data, updateRow, handleStatusChange, setAssetComment } = usePipeline();
  const today = todayISO();
  const tone = STAGE_TONE[stageName];
  const all = rowsFor(data, stageName, project);
  const set = (id, field) => (value) => updateRow(stageName, project, id, field, value);

  const artistOptions = rosterOptions(data, stageName);

  const commentFor = (tcn) => assetComment(data, project, tcn);
  const rows = all.filter((row) => {
    if (filters.priority && row.priority !== filters.priority) return false;
    if (filters.artist && row.artist !== filters.artist) return false;
    return matchesQuery(query, row.tcn, row.no, row.artist, commentFor(row.tcn));
  });

  if (!all.length) {
    return <div className="empty-state"><Icon name="cube" size={28} stroke={1.4} />Nothing in {stageName} for this project yet.</div>;
  }

  return (
    <div className="grid-scroll">
      <table className="grid">
        <thead>
          <tr className="cols">
            <th className="sticky" style={frozenStyle(0)}>No</th>
            <th className="sticky edge" style={frozenStyle(1)}>TCN</th>
            <th className="col-comment">Comments</th>
            <th>Type</th>
            <th>Priority</th>
            <th>Complexity</th>
            <th className="col-date">Allotted</th>
            <th className="col-date">Due</th>
            <th className="col-artist">Artist</th>
            <th className="col-status">Status</th>
            <th className="col-num">Alloc h</th>
            <th className="col-num">Spent h</th>
            <th className="col-num">Rework h</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={13} className="no-match">No rows match the current search or filters.</td></tr>
          )}
          {rows.map((row) => {
            const locked = isLocked(row);
            const overdue = isOverdue(row, today);
            const rework = row.type === 'rework' && !locked;
            const comment = commentFor(row.tcn);
            return (
              <tr key={row.id} className={`${locked ? 'is-archived' : ''}${overdue ? ' is-overdue' : ''}${rework ? ' is-rework' : ''}`}>
                <td className="sticky" style={frozenStyle(0)}><span className="mono muted">{row.no}</span></td>
                <td className="sticky edge" style={frozenStyle(1)}>
                  {row.isSplit && !locked ? (
                    <input className="cell-input mono strong" value={row.tcn || ''} onChange={(e) => set(row.id, 'tcn')(e.target.value)} aria-label="TCN" />
                  ) : (
                    <button type="button" className="tcin-link" onClick={() => onOpenAsset(row.tcn)} aria-label={`Open asset record for ${row.tcn}`}>
                      {row.tcn}<Icon name="chevronRight" size={13} stroke={2} />
                    </button>
                  )}
                </td>
                <td className="col-comment">
                  <input
                    className={`cell-input${rework && comment ? ' is-feedback' : ''}`}
                    value={comment}
                    title={comment}
                    disabled={locked}
                    placeholder={locked ? '' : 'Add a comment'}
                    onChange={(e) => setAssetComment(project, row.tcn, e.target.value)}
                    aria-label="Comments"
                  />
                </td>
                <td><PillSelect options={TYPES} value={row.type} onChange={set(row.id, 'type')} tone={typeTone(row.type)} disabled={locked} placeholder="Type" label="Type" /></td>
                <td><PillSelect options={PRIORITIES} value={row.priority} onChange={set(row.id, 'priority')} tone={priorityTone(row.priority)} format={priorityShort} disabled={locked} placeholder="Priority" label="Priority" /></td>
                <td><PillSelect options={COMPLEXITIES} value={row.complexity} onChange={set(row.id, 'complexity')} tone="neutral" disabled={locked} placeholder="Complexity" label="Complexity" /></td>
                <td className="col-date"><input type="date" className="cell-input date" value={row.allotDate || ''} disabled={locked} onChange={(e) => set(row.id, 'allotDate')(e.target.value)} aria-label="Allotment date" /></td>
                <td className="col-date">
                  <div className={`date-wrap${overdue ? ' is-late' : ''}`}>
                    {overdue && <Icon name="alert" size={13} stroke={2} />}
                    <input type="date" className="cell-input date" value={row.dueDate || ''} disabled={locked} onChange={(e) => set(row.id, 'dueDate')(e.target.value)} aria-label="Due date" />
                  </div>
                </td>
                <td className="col-artist">
                  <div className="artist-select">
                    <Avatar name={row.artist} />
                    <PillSelect options={artistOptions} value={row.artist} onChange={set(row.id, 'artist')} tone="plain" disabled={locked} placeholder="Assign" label="Artist" />
                  </div>
                </td>
                <td className="col-status">
                  {locked ? (
                    <Pill
                      tone={statusTone(row.status, stageName)}
                      icon={isArchived(row) || isSendBack(stageName, row.status) ? 'rework' : 'check'}
                      title={row.status}
                    >
                      {isArchived(row) || isSendBack(stageName, row.status) ? row.status : displayStatus(row.status, stageName)}
                    </Pill>
                  ) : (
                    <PillSelect options={STATUS_OPTIONS[stageName]} value={row.status} onChange={(v) => handleStatusChange(stageName, project, row.id, v)} tone={statusTone(row.status)} placeholder="In progress" label="Status" />
                  )}
                </td>
                <td className="col-num"><input className="cell-input num" value={row.allocTime || ''} disabled={locked} onChange={(e) => set(row.id, 'allocTime')(e.target.value)} aria-label="Allocated time" inputMode="decimal" /></td>
                <td className="col-num"><TimeCell row={row} disabled={locked} onChange={set(row.id, 'timeSpent')} tone={tone} /></td>
                <td className="col-num"><input className="cell-input num" value={row.reworkTime || ''} disabled={locked} onChange={(e) => set(row.id, 'reworkTime')(e.target.value)} aria-label="Rework time" inputMode="decimal" /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ProductionView;

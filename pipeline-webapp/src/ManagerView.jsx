import React from 'react';
import { usePipeline } from './PipelineContext';
import { ArtistCell, Dash, Icon, Pill, PillSelect } from './ui';
import {
  MAIN_STATUSES, PRIORITIES, REWORK_FIELD, STAGES, STAGE_LABEL, STAGE_TONE,
  assetStage, displayStatus, formatDate, isDispatched, isOverdue, matchesQuery,
  priorityShort, priorityTone, rowsFor, stageSnapshot, statusTone, todayISO,
} from './pipelineModel';

const FROZEN = [
  { key: 'chk', width: 44, left: 0 },
  { key: 'no', width: 64, left: 44 },
  { key: 'tcin', width: 132, left: 108 },
  { key: 'priority', width: 116, left: 240 },
];
const frozenStyle = (i) => ({ left: FROZEN[i].left, width: FROZEN[i].width, minWidth: FROZEN[i].width });

const managerRowView = (data, project, row) => {
  const stages = Object.fromEntries(STAGES.map((stage) => [stage, stageSnapshot(data, project, stage, row.tcin)]));
  return {
    stages,
    position: assetStage(data, project, row),
    dispatched: isDispatched(data, project, row.tcin),
  };
};

const ManagerView = ({ project, query, filters, onOpenAsset }) => {
  const { data, updateRow } = usePipeline();
  const today = todayISO();
  const set = (id, field) => (value) => updateRow('Manager', project, id, field, value);

  const rows = rowsFor(data, 'Manager', project)
    .map((row) => ({ row, view: managerRowView(data, project, row) }))
    .filter(({ row, view }) => {
      const artists = STAGES.map((s) => view.stages[s]?.artist);
      if (filters.priority && row.priority !== filters.priority) return false;
      if (filters.artist && !artists.includes(filters.artist)) return false;
      return matchesQuery(query, row.tcin, row.no, ...artists);
    });

  if (!rowsFor(data, 'Manager', project).length) {
    return <div className="empty-state"><Icon name="cube" size={28} stroke={1.4} />No assets in this project yet — add one to start.</div>;
  }

  return (
    <div className="grid-scroll">
      <table className="grid">
        <thead>
          <tr className="band">
            <th className="sticky edge" style={{ left: 0 }} colSpan={4}><span className="band-label">Asset</span></th>
            {STAGES.map((stage) => (
              <th key={stage} colSpan={3} className={`band-${STAGE_TONE[stage]}`}><span className="band-label">{STAGE_LABEL[stage]}</span></th>
            ))}
            <th colSpan={6} className="band-overall"><span className="band-label">Overall</span></th>
          </tr>
          <tr className="cols">
            <th className="sticky" style={frozenStyle(0)} aria-label="Select" />
            <th className="sticky" style={frozenStyle(1)}>No</th>
            <th className="sticky" style={frozenStyle(2)}>TCIN</th>
            <th className="sticky edge" style={frozenStyle(3)}>Priority</th>
            {STAGES.map((stage) => (
              <React.Fragment key={stage}>
                <th className="col-artist">Artist</th>
                <th className="col-status">Status</th>
                <th className="col-rw" title="Times sent back to this stage">RW</th>
              </React.Fragment>
            ))}
            <th className="col-date">Allotted</th>
            <th className="col-date">Due</th>
            <th className="col-stage">Stage</th>
            <th className="col-status">Main status</th>
            <th className="col-date">Uploaded</th>
            <th className="col-date">Approved</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={19} className="no-match">No assets match the current search or filters.</td></tr>
          )}
          {rows.map(({ row, view }) => {
            const { position, dispatched } = view;
            const dueRow = position.row;
            const overdue = isOverdue(dueRow, today);
            const approved = position.key === 'approved';
            return (
              <tr key={row.id} className={`${row.checked ? 'is-selected' : ''}${approved ? ' is-done' : ''}${overdue ? ' is-overdue' : ''}`}>
                <td className="sticky center" style={frozenStyle(0)}>
                  {dispatched ? (
                    <span className="lock" title="Already dispatched to Modelling"><Icon name="lock" size={14} /></span>
                  ) : (
                    <input
                      type="checkbox"
                      className="check"
                      checked={!!row.checked}
                      disabled={!row.tcin}
                      title={row.tcin ? 'Select for dispatch' : 'Add a TCIN first'}
                      onChange={(e) => set(row.id, 'checked')(e.target.checked)}
                    />
                  )}
                </td>
                <td className="sticky" style={frozenStyle(1)}>
                  <input className="cell-input mono muted" value={row.no || ''} onChange={(e) => set(row.id, 'no')(e.target.value)} aria-label="Number" />
                </td>
                <td className="sticky" style={frozenStyle(2)}>
                  {dispatched ? (
                    <button type="button" className="tcin-link" onClick={() => onOpenAsset(row.tcin)} aria-label={`Open asset record for ${row.tcin}`}>
                      {row.tcin}<Icon name="chevronRight" size={13} stroke={2} />
                    </button>
                  ) : (
                    <input className="cell-input mono strong" value={row.tcin || ''} placeholder="Enter TCIN" onChange={(e) => set(row.id, 'tcin')(e.target.value)} aria-label="TCIN" />
                  )}
                </td>
                <td className="sticky edge" style={frozenStyle(3)}>
                  <PillSelect options={PRIORITIES} value={row.priority} onChange={set(row.id, 'priority')} tone={priorityTone(row.priority)} format={priorityShort} placeholder="Priority" label="Priority" />
                </td>

                {STAGES.map((stage) => {
                  const snap = view.stages[stage];
                  const rw = row[REWORK_FIELD[stage]] || 0;
                  const status = displayStatus(snap?.status);
                  return (
                    <React.Fragment key={stage}>
                      <td className="col-artist"><ArtistCell name={snap?.artist} /></td>
                      <td className="col-status">
                        {snap ? (
                          status ? <Pill tone={statusTone(status)} icon={status === 'Approved' || status === 'Done' ? 'check' : status.startsWith('Rework') || status === 'Sent back' ? 'rework' : undefined}>{status}</Pill>
                            : <Pill tone={STAGE_TONE[stage]}>In progress</Pill>
                        ) : <Dash />}
                      </td>
                      <td className="col-rw center">{rw > 0 ? <span className="count-chip">{rw}</span> : <Dash />}</td>
                    </React.Fragment>
                  );
                })}

                <td className="col-date">
                  <input type="date" className="cell-input date" value={row.allotDate || ''} onChange={(e) => set(row.id, 'allotDate')(e.target.value)} aria-label="Allotted date" />
                </td>
                <td className="col-date">
                  {dueRow?.dueDate ? (
                    <span className={`due${overdue ? ' is-late' : ''}`}>
                      {overdue && <Icon name="alert" size={13} stroke={2} />}
                      {formatDate(dueRow.dueDate)}
                    </span>
                  ) : <Dash />}
                </td>
                <td className="col-stage"><Pill tone={position.tone} dot>{position.label}</Pill></td>
                <td className="col-status">
                  <PillSelect options={MAIN_STATUSES} value={row.mainStatus} onChange={set(row.id, 'mainStatus')} tone={statusTone(row.mainStatus)} placeholder="—" label="Main status" />
                </td>
                <td className="col-date">
                  <input type="date" className="cell-input date" value={row.uploadDate || ''} onChange={(e) => set(row.id, 'uploadDate')(e.target.value)} aria-label="Upload date" />
                </td>
                <td className="col-date">
                  <input type="date" className="cell-input date" value={row.approvedDate || ''} onChange={(e) => set(row.id, 'approvedDate')(e.target.value)} aria-label="Approved date" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ManagerView;

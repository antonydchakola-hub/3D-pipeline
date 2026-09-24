import React, { useState } from 'react';
import { usePipeline } from './PipelineContext';
import { Avatar, Dash, Icon, Pill } from './ui';
import { COMPLEXITIES, artistSummary, displayStatus, formatHours, hours, matchesQuery, statusTone } from './pipelineModel';

const COMPLEXITY_COLS = [...COMPLEXITIES.map((c) => ({ key: c, label: c })), { key: '', label: 'Not set' }];
const LOG_FIELDS = [
  { key: 'leaves', label: 'Leaves', unit: 'days' },
  { key: 'training', label: 'Training', unit: 'h' },
  { key: 'qaHours', label: 'QA', unit: 'h' },
];

const SORTS = {
  artist: (a, b) => a.artist.localeCompare(b.artist),
  completed: (a, b) => b.completed - a.completed || a.artist.localeCompare(b.artist),
  completedHours: (a, b) => b.completedHours - a.completedHours || a.artist.localeCompare(b.artist),
  timeSpent: (a, b) => b.timeSpent - a.timeSpent || a.artist.localeCompare(b.artist),
  reworkTime: (a, b) => b.reworkTime - a.reworkTime || a.artist.localeCompare(b.artist),
};

const Count = ({ value }) => (value ? <span className="num">{value}</span> : <Dash />);
const Hours = ({ value }) => (value ? <span className="num">{formatHours(value)}</span> : <Dash />);

const SortTh = ({ id, sort, onSort, className = '', style, children }) => (
  <th className={`${className} sortable${sort === id ? ' is-sorted' : ''}`} style={style} aria-sort={sort === id ? (id === 'artist' ? 'ascending' : 'descending') : 'none'}>
    <button type="button" onClick={() => onSort(id)}>{children}{sort === id && <Icon name="chevronDown" size={11} stroke={2.4} />}</button>
  </th>
);

const ArtistsView = ({ stage, projects, week, query, onOpenAsset }) => {
  const { data, setArtistLog } = usePipeline();
  const [sort, setSort] = useState('completed');
  const [expanded, setExpanded] = useState(null);

  const lighting = stage === 'Lighting';
  const log = data.artistLog?.[week] || {};
  const summary = artistSummary(data, projects, stage);
  const rows = summary.filter((a) => matchesQuery(query, a.artist)).sort(SORTS[sort]);

  const totals = rows.reduce((t, a) => ({
    completed: t.completed + a.completed,
    directUpload: t.directUpload + a.directUpload,
    qaDone: t.qaDone + a.qaDone,
    completedHours: t.completedHours + a.completedHours,
    timeSpent: t.timeSpent + a.timeSpent,
    reworkTime: t.reworkTime + a.reworkTime,
    byComplexity: Object.fromEntries(COMPLEXITY_COLS.map((c) => [c.key, t.byComplexity[c.key] + a.byComplexity[c.key]])),
    log: Object.fromEntries(LOG_FIELDS.map((f) => [f.key, t.log[f.key] + hours(log[a.artist]?.[f.key])])),
  }), {
    completed: 0, directUpload: 0, qaDone: 0, completedHours: 0, timeSpent: 0, reworkTime: 0,
    byComplexity: Object.fromEntries(COMPLEXITY_COLS.map((c) => [c.key, 0])),
    log: Object.fromEntries(LOG_FIELDS.map((f) => [f.key, 0])),
  });

  const colCount = 1 + 1 + COMPLEXITY_COLS.length + (lighting ? 2 : 0) + 3 + LOG_FIELDS.length;

  if (!summary.length) {
    return <div className="empty-state"><Icon name="user" size={28} stroke={1.4} />No artists have been assigned work in {stage} yet.</div>;
  }

  return (
    <div className="grid-scroll">
      <table className="grid artists">
        <thead>
          <tr className="band">
            <th className="sticky edge" style={{ left: 0 }} colSpan={2}><span className="band-label">Artist</span></th>
            <th colSpan={COMPLEXITY_COLS.length} className="band-overall"><span className="band-label">Completed by complexity</span></th>
            {lighting && <th colSpan={2} className="band-light"><span className="band-label">Lighting / QA</span></th>}
            <th colSpan={3} className="band-mod"><span className="band-label">Hours</span></th>
            <th colSpan={LOG_FIELDS.length} className="band-log"><span className="band-label">Selected week · entered by hand</span></th>
          </tr>
          <tr className="cols">
            <SortTh id="artist" sort={sort} onSort={setSort} className="sticky col-person" style={{ left: 0 }}>Artist</SortTh>
            <SortTh id="completed" sort={sort} onSort={setSort} className="sticky edge col-count" style={{ left: 260 }}>Completed</SortTh>
            {COMPLEXITY_COLS.map((c) => <th key={c.label} className="col-count">{c.label}</th>)}
            {lighting && <><th className="col-count" title="Uploaded, waiting for QA">Direct upload</th><th className="col-count" title="Approved in QA">QA done</th></>}
            <SortTh id="completedHours" sort={sort} onSort={setSort} className="col-hours">Completed h</SortTh>
            <SortTh id="timeSpent" sort={sort} onSort={setSort} className="col-hours">Time spent</SortTh>
            <SortTh id="reworkTime" sort={sort} onSort={setSort} className="col-hours">Rework</SortTh>
            {LOG_FIELDS.map((f) => <th key={f.key} className="col-log">{f.label} <span className="unit">{f.unit}</span></th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={colCount} className="no-match">No artists match the search.</td></tr>}
          {rows.map((a) => {
            const open = expanded === a.artist;
            return (
              <React.Fragment key={a.artist}>
                <tr className={open ? 'is-selected' : ''}>
                  <td className="sticky col-person" style={{ left: 0 }}>
                    <button type="button" className="person" onClick={() => setExpanded(open ? null : a.artist)} aria-expanded={open}>
                      <Icon name={open ? 'chevronDown' : 'chevronRight'} size={13} stroke={2.2} />
                      <Avatar name={a.artist} size={24} />
                      <span className="person-name">{a.artist}</span>
                      {a.inProgress > 0 && <span className="person-meta">{a.inProgress} in progress</span>}
                    </button>
                  </td>
                  <td className="sticky edge col-count strong-num" style={{ left: 260 }}><Count value={a.completed} /></td>
                  {COMPLEXITY_COLS.map((c) => (
                    <td key={c.label} className={`col-count${c.key === '' ? ' is-unset' : ''}`}><Count value={a.byComplexity[c.key]} /></td>
                  ))}
                  {lighting && <><td className="col-count"><Count value={a.directUpload} /></td><td className="col-count"><Count value={a.qaDone} /></td></>}
                  <td className="col-hours"><Hours value={a.completedHours} /></td>
                  <td className="col-hours"><Hours value={a.timeSpent} /></td>
                  <td className={`col-hours${a.reworkTime ? ' is-rework' : ''}`}><Hours value={a.reworkTime} /></td>
                  {LOG_FIELDS.map((f) => (
                    <td key={f.key} className="col-log">
                      <input
                        className="cell-input num"
                        inputMode="decimal"
                        value={log[a.artist]?.[f.key] || ''}
                        placeholder="0"
                        onChange={(e) => setArtistLog(week, a.artist, f.key, e.target.value)}
                        aria-label={`${f.label} for ${a.artist}`}
                      />
                    </td>
                  ))}
                </tr>
                {open && (
                  <tr className="detail-row">
                    <td colSpan={colCount}>
                      <div className="artist-detail">
                        {a.rows.length === 0 ? (
                          <span className="muted">No {stage} rows assigned yet.</span>
                        ) : (
                          <table className="mini">
                            <thead>
                              <tr><th>TCN</th>{projects.length > 1 && <th>Project</th>}<th>Type</th><th>Complexity</th><th>Status</th><th className="r">Alloc h</th><th className="r">Spent h</th><th className="r">Rework h</th></tr>
                            </thead>
                            <tbody>
                              {a.rows.map(({ project, row }) => (
                                <tr key={row.id}>
                                  <td>
                                    <button type="button" className="tcin-link" onClick={() => onOpenAsset(row.tcn, project)} aria-label={`Open asset record for ${row.tcn}`}>
                                      {row.tcn}<Icon name="chevronRight" size={12} stroke={2} />
                                    </button>
                                  </td>
                                  {projects.length > 1 && <td className="muted">{project}</td>}
                                  <td>{row.type || '—'}</td>
                                  <td>{row.complexity || <span className="muted">Not set</span>}</td>
                                  <td>{row.status ? <Pill tone={statusTone(row.status)}>{displayStatus(row.status)}</Pill> : <Pill tone="mod">In progress</Pill>}</td>
                                  <td className="r num">{row.allocTime || '—'}</td>
                                  <td className="r num">{row.timeSpent || '—'}</td>
                                  <td className="r num">{row.reworkTime || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
          {rows.length > 1 && (
            <tr className="totals">
              <td className="sticky col-person" style={{ left: 0 }}><span className="totals-label">Total · {rows.length} artists</span></td>
              <td className="sticky edge col-count" style={{ left: 260 }}><Count value={totals.completed} /></td>
              {COMPLEXITY_COLS.map((c) => <td key={c.label} className="col-count"><Count value={totals.byComplexity[c.key]} /></td>)}
              {lighting && <><td className="col-count"><Count value={totals.directUpload} /></td><td className="col-count"><Count value={totals.qaDone} /></td></>}
              <td className="col-hours"><Hours value={totals.completedHours} /></td>
              <td className="col-hours"><Hours value={totals.timeSpent} /></td>
              <td className="col-hours"><Hours value={totals.reworkTime} /></td>
              {LOG_FIELDS.map((f) => <td key={f.key} className="col-log"><Hours value={totals.log[f.key]} /></td>)}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default ArtistsView;

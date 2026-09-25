import React, { useState } from 'react';
import { Avatar, Icon, Pill } from './ui';
import { STAGE_LABEL, STAGE_TONE, daysBetween, formatDate, todayISO } from './pipelineModel';
import { NEW_ARTIST_WEEKS, SENT_BACK_NOTE, throughputMetrics } from './throughputModel';

const blank = (n) => n === null || n === undefined || Number.isNaN(n);
const fmt = (n) => (blank(n) ? '—' : String(Math.round(n)));
const pct = (x) => `${Math.round(x * 100)}%`;
// Names a few people and counts the rest, so a long list stays one line.
const names = (list, max = 3) => {
  if (list.length > max) return `${list.slice(0, max).join(', ')} and ${list.length - max} more`;
  return list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
};
const weekLabel = (s) => (s.current ? 'This week' : formatDate(s.week));
// Start dates more than about ten months back show the month and year.
const startLabel = (iso, today) => (daysBetween(iso, today) > 300
  ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
  : formatDate(iso));

const Change = ({ value }) => {
  if (blank(value)) return null;
  const p = Math.round(value * 100);
  if (Math.abs(p) < 3) return <span className="change is-flat">no change</span>;
  return <span className={`change ${p > 0 ? 'is-up' : 'is-down'}`}>{p > 0 ? '+' : '−'}{Math.abs(p)}%</span>;
};

const timeTakenLabel = (ratio) => {
  if (blank(ratio)) return '—';
  if (ratio >= 0.9 && ratio <= 1.1) return 'on allocation';
  return `${(Math.round(ratio * 10) / 10).toFixed(1)}× allocated`;
};

// ---------- why hours aren't keeping up, and who ----------

const reasonsFor = (m) => {
  const t = m.team;
  const peopleChange = t.artistsStart ? (t.artistsNow - t.artistsStart) / t.artistsStart : null;
  const hoursChange = t.hours.change;
  const keepingUp = peopleChange === null || hoursChange === null || hoursChange >= peopleChange - 0.05;

  const headline = hoursChange === null
    ? <>Not enough finished work yet to compare weeks.</>
    : keepingUp
      ? <>Hours are keeping up with the team: <strong>{t.artistsStart} → {t.artistsNow} artists</strong>, and allocated hours went from <strong>{fmt(t.hours.early)} to {fmt(t.hours.late)} a week</strong>.</>
      : <>The team grew from <strong>{t.artistsStart} to {t.artistsNow} artists</strong> ({pct(peopleChange)} more), but allocated hours only went from <strong>{fmt(t.hours.early)} to {fmt(t.hours.late)} a week</strong> ({hoursChange >= 0 ? `${pct(hoursChange)} more` : `${pct(-hoursChange)} less`}).</>;

  const why = [];
  for (const g of m.stages) {
    const yardstick = g.perArtistPerWeek;
    if (!yardstick) continue;
    const slow = g.artists.filter((a) => a.perWeek !== null && a.perWeek < yardstick * 0.7).sort((a, b) => a.perWeek - b.perWeek);
    const newcomers = slow.filter((a) => a.isNew);
    const others = slow.filter((a) => !a.isNew);
    const taking = (list) => {
      const ratios = list.map((a) => a.timeTaken).filter((r) => r && r >= 1.2);
      if (!ratios.length) return '';
      const lo = Math.min(...ratios).toFixed(1);
      const hi = Math.max(...ratios).toFixed(1);
      return `, taking ${lo === hi ? lo : `${lo}–${hi}`}× the allocated time`;
    };
    if (newcomers.length) {
      const share = newcomers.reduce((s, a) => s + a.perWeek, 0) / newcomers.length / yardstick;
      why.push({ tone: 'amber', icon: 'user', text: <><strong>{g.stage}:</strong> {names(newcomers.map((a) => a.name))} {newcomers.length === 1 ? 'is' : 'are'} new and at about {pct(share)} of the stage average{taking(newcomers)}.</> });
    }
    if (others.length) {
      why.push({ tone: 'amber', icon: 'user', text: <><strong>{g.stage}:</strong> {names(others.map((a) => `${a.name} (${fmt(a.perWeek)} h)`))} {others.length === 1 ? 'is' : 'are'} well below the stage average of {fmt(yardstick)} h a week{taking(others)}.</> });
    }
    const sentBack = g.artists.filter((a) => a.sentBack >= SENT_BACK_NOTE).sort((a, b) => b.sentBack - a.sentBack);
    if (sentBack.length) {
      why.push({ tone: 'rework', icon: 'rework', text: <><strong>{g.stage}:</strong> {names(sentBack.map((a) => `${a.name} (${a.sentBack}×)`))} {sentBack.length === 1 ? 'had' : 'have had'} work sent back for their own fixes.</> });
    }
  }
  // Some waiting is normal work in progress; flag a stage only when it has far more per artist than the others and it grew.
  const load = m.stages.filter((g) => g.artistsNow > 0).map((g) => ({ g, perArtist: g.waiting / g.artistsNow })).sort((a, b) => b.perArtist - a.perArtist);
  const [worst, next] = load;
  if (worst && worst.g.waiting >= 5 && (worst.g.waitingStart === null || worst.g.waiting > worst.g.waitingStart * 1.5) && (!next || worst.perArtist >= next.perArtist * 1.5)) {
    const g = worst.g;
    why.push({ tone: 'danger', icon: 'alert', text: <><strong>{g.stage} is the bottleneck:</strong> {g.waiting} models are waiting there{g.waitingStart !== null ? <>, up from {g.waitingStart}</> : null}, for {g.artistsNow} artist{g.artistsNow === 1 ? '' : 's'}. Work piles up in front of it however many people the other stages add.</> });
  }
  return { keepingUp, headline, why: keepingUp ? why.filter((w) => w.tone === 'danger') : why };
};

// ---------- chart: hours each week, with the 4-week average and the artist count ----------

const HoursChart = ({ group }) => {
  const [hover, setHover] = useState(null);
  const s = group.series;
  const max = Math.max(1, ...s.map((x) => Math.max(x.hours, x.average || 0))) * 1.12;
  const tone = group.stage ? STAGE_TONE[group.stage] : 'brand';
  const points = s.map((x, i) => (x.average === null ? null : [((i + 0.5) / s.length) * 100, 100 - (x.average / max) * 100])).filter(Boolean);
  const h = hover === null ? null : s[hover];
  const showLabels = s.length <= 8;
  return (
    <div className="hchart" onMouseLeave={() => setHover(null)}>
      <div className="hchart-plot">
        {s.map((x, i) => (
          <div key={x.week} className={`hchart-col${x.current ? ' is-partial' : ''}${hover === i ? ' is-hover' : ''}`} onMouseEnter={() => setHover(i)}>
            <span className={`hchart-bar tone-${tone}`} style={{ height: `${(x.hours / max) * 100}%` }}>
              {(showLabels || hover === i) && x.hours > 0 && <span className="hchart-value num">{fmt(x.hours)}</span>}
            </span>
          </div>
        ))}
        <svg className="hchart-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline points={points.map((p) => p.join(',')).join(' ')} vectorEffect="non-scaling-stroke" />
        </svg>
        {points.map(([x, y]) => <span key={x} className="hchart-dot" style={{ left: `${x}%`, top: `${y}%` }} />)}
        {h && (
          <div className={`tooltip${hover < s.length / 4 ? ' is-start' : hover >= (s.length * 3) / 4 ? ' is-end' : ''}`} style={{ left: `${((hover + 0.5) / s.length) * 100}%`, top: 0 }}>
            <span className="tooltip-title num">{h.current ? 'This week so far' : `Week of ${formatDate(h.week)}`}</span>
            <span className="tooltip-row"><span className={`legend-swatch tone-${tone}`} /><span className="tooltip-label">Allocated hours finished</span><span className="num tooltip-tcns">{fmt(h.hours)} h</span></span>
            {h.average !== null && <span className="tooltip-row"><span className="legend-swatch tone-ink" /><span className="tooltip-label">4-week average</span><span className="num tooltip-tcns">{fmt(h.average)} h</span></span>}
            <span className="tooltip-row"><span /><span className="tooltip-label">Artists</span><span className="num tooltip-tcns">{h.headcount}</span></span>
            <span className="tooltip-row"><span /><span className="tooltip-label">Per artist</span><span className="num tooltip-tcns">{blank(h.perArtist) ? '—' : `${fmt(h.perArtist)} h`}</span></span>
          </div>
        )}
      </div>
      <div className="hchart-axis" style={{ gridTemplateColumns: `repeat(${s.length}, minmax(0, 1fr))` }}>
        {s.map((x, i) => <span key={x.week} className={`num${hover === i ? ' is-hover' : ''}`}>{weekLabel(x)}</span>)}
      </div>
      <div className="hchart-people" style={{ gridTemplateColumns: `repeat(${s.length}, minmax(0, 1fr))` }}>
        {s.map((x, i) => {
          const grew = i > 0 && x.headcount > s[i - 1].headcount;
          return <span key={x.week} className={`num${grew ? ' is-grew' : ''}`} title={grew ? `+${x.headcount - s[i - 1].headcount} joined` : undefined}>{x.headcount}</span>;
        })}
      </div>
    </div>
  );
};

// ---------- the view ----------

const ThroughputView = ({ data, projects, weekCount, onOpenTeam }) => {
  const today = todayISO();
  const m = throughputMetrics(data, projects, { weekCount, today });
  const [selected, setSelected] = useState('team');

  if (!m.hasTimes) {
    return (
      <div className="console">
        <div className="panel-empty throughput-empty">
          <Icon name="trend" size={26} stroke={1.5} />
          <span>No finished work to measure yet. Throughput adds up the allocated hours of work each stage finishes in the app, so it fills up as the team works in the stage sheets.</span>
        </div>
      </div>
    );
  }

  const groups = [m.team, ...m.stages];
  const group = groups.find((g) => g.key === selected) || m.team;
  const reasons = reasonsFor(m);
  const artists = [...group.artists].sort((a, b) => (b.perWeek ?? -1) - (a.perWeek ?? -1));
  const yardstick = group.perArtistPerWeek;
  const barMax = Math.max(1, ...artists.map((a) => a.perWeek || 0), yardstick || 0);
  const seriesMax = Math.max(1, ...artists.flatMap((a) => a.series.map((v) => v || 0)));
  const label = group.stage ? STAGE_LABEL[group.stage] : 'Whole team';

  return (
    <div className="console throughput">
      <section className={`panel reason${reasons.keepingUp ? ' is-good' : ''}`}>
        <p className="reason-head">
          <Icon name={reasons.keepingUp ? 'check' : 'alert'} size={17} stroke={2.2} />
          <span>{reasons.headline}</span>
        </p>
        {reasons.why.length > 0 && (
          <ul className="reason-why">
            {reasons.why.map((w, i) => (
              <li key={i} className={`tone-${w.tone}`}><Icon name={w.icon} size={14} stroke={2} /><span>{w.text}</span></li>
            ))}
          </ul>
        )}
        {m.estimated.count > 0 && (
          <p className="reason-note">
            <Icon name="clock" size={13} stroke={2} />
            {m.estimated.count === m.estimated.total ? 'All' : `${m.estimated.count} of ${m.estimated.total}`} finished items in this period come from the sheets, which don’t record when each stage finished, so their weeks are estimated from the allotted and upload dates.
          </p>
        )}
        {m.missingStarts.length > 0 && (
          <p className="reason-note">
            <Icon name="user" size={13} stroke={2} />
            <span>
              {m.missingStarts.length} artist{m.missingStarts.length === 1 ? ' has' : 's have'} no start date, so they count from their first finished work — the team size only shows real hiring once start dates are filled in.
              {onOpenTeam && <> <button type="button" className="link-btn" onClick={onOpenTeam}>Add start dates</button></>}
            </span>
          </p>
        )}
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>Artists and allocated hours</h2>
          <span className="panel-hint">last {weekCount} weeks · changes compare the first and second half · click a row</span>
        </header>
        <div className="tp-table-wrap">
        <table className="tp-summary">
          <thead>
            <tr>
              <th />
              <th>Artists</th>
              <th>Allocated hours a week</th>
              <th>Hours per artist</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key} className={`${g.key === group.key ? 'is-selected' : ''}${g.stage ? '' : ' is-team'}`} onClick={() => setSelected(g.key)}>
                <td>
                  <button type="button" className="tp-group" aria-pressed={g.key === group.key}>
                    <span className={`legend-swatch tone-${g.stage ? STAGE_TONE[g.stage] : 'brand'}`} />
                    {g.stage ? STAGE_LABEL[g.stage] : 'Whole team'}
                  </button>
                </td>
                <td>
                  <span className="num tp-big">{g.artistsNow}</span>
                  {g.artistsNow !== g.artistsStart
                    ? <span className="change is-flat">{g.artistsNow > g.artistsStart ? '+' : '−'}{Math.abs(g.artistsNow - g.artistsStart)} since {formatDate(m.rangeStart)}</span>
                    : <span className="change is-flat">same as {formatDate(m.rangeStart)}</span>}
                </td>
                <td><span className="num tp-big">{fmt(g.hoursPerWeek)} h</span><Change value={g.hours.change} /></td>
                <td><span className="num tp-big">{fmt(g.perArtistPerWeek)} h</span><Change value={g.perArtist.change} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>{label} · allocated hours finished each week</h2>
          <div className="legend">
            <span className="legend-item"><span className={`legend-swatch tone-${group.stage ? STAGE_TONE[group.stage] : 'brand'}`} />hours</span>
            <span className="legend-item"><span className="legend-line" />4-week average</span>
            <span className="legend-item">numbers below: artists that week</span>
          </div>
        </header>
        <HoursChart key={group.key} group={group} />
        <p className="panel-foot"><span>Hours count in the week a stage finishes its part. This week is still in progress, so it’s shown lighter and left out of the average.</span></p>
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>{label} · who</h2>
          <span className="panel-hint">sorted by hours a week · new = joined in the last {NEW_ARTIST_WEEKS} weeks</span>
        </header>
        <div className="tp-table-wrap">
          <table className="tp-artists">
            <thead>
              <tr>
                <th>Artist</th>
                {!group.stage && <th>Stage</th>}
                <th>Started</th>
                <th>Allocated hours a week</th>
                <th>Week by week</th>
                <th>Time taken</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {artists.map((a) => {
                const low = yardstick && a.perWeek !== null && a.perWeek < yardstick * 0.7;
                return (
                  <tr key={a.name}>
                    <td>
                      <span className="tp-who">
                        <Avatar name={a.name} size={24} />
                        <span className="tp-name">{a.name}</span>
                        {a.isNew && <Pill tone="brand">New</Pill>}
                      </span>
                    </td>
                    {!group.stage && <td className="muted">{a.stages.join(', ') || '—'}</td>}
                    <td className="num">
                      {startLabel(a.start, today)}
                      {!a.startKnown && <span className="tp-sub">first job — no start date</span>}
                    </td>
                    <td>
                      <span className="tp-hours">
                        <span className={`num tp-hours-value${low ? ' is-low' : ''}`}>{fmt(a.perWeek)} h</span>
                        <span className="tp-hours-track">
                          <span className={`tone-${group.stage ? STAGE_TONE[group.stage] : 'brand'}`} style={{ width: `${((a.perWeek || 0) / barMax) * 100}%` }} />
                          {yardstick && <span className="tp-hours-avg" style={{ left: `${(yardstick / barMax) * 100}%` }} title={`Average ${fmt(yardstick)} h`} />}
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className="tp-spark" title="Allocated hours finished each week">
                        {a.series.map((v, i) => (
                          <span key={m.weeks[i]} className={v === null ? 'is-absent' : ''} style={{ height: v === null ? 3 : `${Math.max(4, (v / seriesMax) * 100)}%` }} />
                        ))}
                      </span>
                    </td>
                    <td className={`num${a.timeTaken >= 1.25 ? ' is-warn' : ''}`}>{timeTakenLabel(a.timeTaken)}</td>
                    <td>{a.sentBack >= SENT_BACK_NOTE && <Pill tone="rework" icon="rework">Work often sent back ({a.sentBack})</Pill>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="panel-foot">
          <span>
            The line in each bar marks the {group.stage ? group.stage : 'team'} average of {fmt(yardstick)} h a week. “Time taken” is logged hours against allocated hours; “sent back” only counts fixes allocated 0 hours (the artist’s own issue).
            {m.missingStarts.length > 0 && onOpenTeam && <> {m.missingStarts.length} people have no start date. <button type="button" className="link-btn" onClick={onOpenTeam}>Add them in Manage team</button></>}
          </span>
        </p>
      </section>
    </div>
  );
};

export default ThroughputView;

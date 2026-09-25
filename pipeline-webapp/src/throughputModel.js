import { STAGES, addDays, daysBetween, hours, isCreditedRow, isOpen, rowsFor, toISODate, todayISO, weekStart } from './pipelineModel';

// Artists who joined within this many weeks count as new.
export const NEW_ARTIST_WEEKS = 8;
// Sent back this many times in the period earns the "work often sent back" note.
export const SENT_BACK_NOTE = 2;
const AVERAGE_WEEKS = 4;

const PREV = { Texturing: 'Modelling', Lighting: 'Texturing' };

const dateOf = (ts) => toISODate(new Date(ts));
const sum = (list, fn) => list.reduce((s, x) => s + fn(x), 0);
const avg = (list) => (list.length ? sum(list, (x) => x) / list.length : null);
const change = (from, to) => (from > 0 && to !== null ? (to - from) / from : null);

// Every stage row is one pass of an asset through a stage. The rows don't carry times, so they come from the
// asset's history: the k-th row of an asset in a stage is the k-th time the asset entered that stage.
export const stagePasses = (data, project) => {
  const events = [...(data?.events?.[project] || [])].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const timeline = new Map();
  const lanes = (tcn) => {
    if (!timeline.has(tcn)) timeline.set(tcn, { Modelling: [], Texturing: [], Lighting: [] });
    return timeline.get(tcn);
  };
  const current = (tcn, stage) => lanes(tcn)[stage].at(-1);
  const enter = (tcn, stage, at) => lanes(tcn)[stage].push({ enteredAt: at });
  const exit = (tcn, stage, at) => {
    const pass = current(tcn, stage);
    if (pass && !pass.finishedAt) pass.finishedAt = at;
  };

  for (const ev of events) {
    const { tcn, stage, at } = ev;
    if (!tcn || !at) continue;
    const known = STAGES.includes(stage);
    if (ev.kind === 'dispatch') enter(tcn, 'Modelling', at);
    else if (ev.kind === 'advance') {
      if (PREV[stage]) exit(tcn, PREV[stage], at);
      if (known) enter(tcn, stage, at);
    } else if (ev.kind === 'rework') {
      if (STAGES.includes(ev.from)) exit(tcn, ev.from, at);
      if (known) enter(tcn, stage, at);
    } else if (ev.kind === 'assign' && known) {
      // Split-off sub-assets have no entry of their own; their first assignment starts them.
      if (!current(tcn, stage)) enter(tcn, stage, at);
    } else if (ev.kind === 'split' && known) exit(tcn, stage, at);
    else if (ev.kind === 'status' && known && /Split Done/.test(ev.text || '')) exit(tcn, stage, at);
    else if (ev.kind === 'uploaded' || ev.kind === 'approved') exit(tcn, 'Lighting', at);
  }

  const passes = [];
  for (const stage of STAGES) {
    const seen = new Map();
    const byTcn = new Map();
    for (const row of rowsFor(data, stage, project)) {
      const index = seen.get(row.tcn) || 0;
      seen.set(row.tcn, index + 1);
      const pass = {
        project,
        stage,
        tcn: row.tcn,
        artist: row.artist || '',
        alloc: hours(row.allocTime),
        spent: hours(row.timeSpent) + hours(row.reworkTime),
        enteredAt: timeline.get(row.tcn)?.[stage]?.[index]?.enteredAt,
        finishedAt: timeline.get(row.tcn)?.[stage]?.[index]?.finishedAt,
        credited: isCreditedRow(row),
        waiting: isOpen(row) && row.status !== 'Uploaded',
        sentBack: row.status === 'Archived Rework',
      };
      if (!byTcn.has(row.tcn)) byTcn.set(row.tcn, []);
      byTcn.get(row.tcn).push(pass);
      passes.push(pass);
    }
    // A send-back is the artist's own issue when its fix was allocated 0 hours; client changes get hours allocated.
    for (const list of byTcn.values()) {
      list.forEach((p, i) => {
        if (p.sentBack) p.artistsFault = !(list[i + 1]?.alloc > 0);
      });
    }
  }
  estimateMissingDates(data, project, passes);
  return passes;
};

// Work imported from the sheets has no history, so when each stage finished is estimated from the asset's dates:
// Lighting finished on the upload (or approval) date, and Modelling and Texturing part-way from allotment to then,
// in proportion to each stage's allocated hours. Assets not uploaded yet run up to today.
const estimateMissingDates = (data, project, passes) => {
  const today = todayISO();
  const managerRows = new Map(rowsFor(data, 'Manager', project).map((r) => [String(r.tcin || '').trim(), r]));
  // Split sub-assets (e.g. 95053877-A) take their dates from the original asset.
  const assetFor = (tcn) => managerRows.get(String(tcn || '').trim()) || managerRows.get(String(tcn || '').replace(/-[^-]*$/, '').trim());
  const byTcn = new Map();
  for (const p of passes) {
    if (!byTcn.has(p.tcn)) byTcn.set(p.tcn, []);
    byTcn.get(p.tcn).push(p);
  }
  for (const [tcn, list] of byTcn) {
    if (!list.some((p) => p.credited && !p.finishedAt)) continue;
    const asset = assetFor(tcn);
    const start = asset?.allotDate;
    if (!start) continue;
    const end = [asset.uploadDate, asset.approvedDate, today].find(Boolean);
    const span = Math.max(0, daysBetween(start, end < start ? start : end));
    const effort = Object.fromEntries(STAGES.map((stage) => [stage, sum(list.filter((p) => p.stage === stage), (p) => p.alloc || p.spent)]));
    const total = sum(STAGES, (stage) => effort[stage]);
    let done = 0;
    for (const stage of STAGES) {
      done += total ? effort[stage] : 1;
      const share = stage === 'Lighting' ? 1 : done / (total || STAGES.length);
      const day = addDays(start, Math.round(span * share));
      const at = new Date(`${day > today ? today : day}T12:00:00`).toISOString();
      for (const p of list) {
        if (p.stage === stage && p.credited && !p.finishedAt) {
          p.finishedAt = at;
          p.estimated = true;
        }
      }
    }
  }
};

// Team members over time. Without a start date, someone counts from the first work they finished; people with
// neither aren't counted, so a long imported team list doesn't all look like it joined this week.
const teamTimeline = (data, passes) => {
  const first = new Map();
  const last = new Map();
  for (const p of passes) {
    if (!p.artist || !p.finishedAt) continue;
    const d = dateOf(p.finishedAt);
    if (!first.has(p.artist) || d < first.get(p.artist)) first.set(p.artist, d);
    if (!last.has(p.artist) || d > last.get(p.artist)) last.set(p.artist, d);
  }
  return (data?.artists || [])
    .filter((m) => (m.role || 'Artist') !== 'Manager')
    .map((m) => {
      const start = m.startDate || first.get(m.name) || null;
      const end = m.active === false ? (m.endDate || last.get(m.name) || start) : null;
      return { name: m.name, stages: m.stages || [], start, end, startKnown: !!m.startDate };
    });
};

const presentIn = (member, week) => !!member.start && member.start <= addDays(week, 6) && (!member.end || member.end >= week);

// Work is measured in allocated hours, credited in the week a stage finishes its part.
export const throughputMetrics = (data, projects, { weekCount = 8, today = todayISO() } = {}) => {
  const thisWeek = weekStart(today);
  // A few extra weeks before the period feed the first points of the rolling average.
  const allWeeks = Array.from({ length: weekCount + AVERAGE_WEEKS - 1 }, (_, i) => addDays(thisWeek, (i - weekCount - AVERAGE_WEEKS + 2) * 7));
  const weeks = allWeeks.slice(AVERAGE_WEEKS - 1);
  const fullWeeks = weeks.slice(0, -1);
  const weekOf = (ts) => (ts ? weekStart(dateOf(ts)) : null);
  const inPeriod = (ts) => weeks.includes(weekOf(ts));

  const allPasses = projects.flatMap((p) => stagePasses(data, p));
  const passes = allPasses.filter((p) => p.credited && p.finishedAt);
  const periodStart = new Date(`${weeks[0]}T00:00:00`).toISOString();
  const team = teamTimeline(data, passes);
  const hoursIn = (list, week) => sum(list.filter((p) => weekOf(p.finishedAt) === week), (p) => p.alloc);
  const half = Math.floor(fullWeeks.length / 2);

  const groupFor = (key, stage) => {
    const members = stage ? team.filter((m) => m.stages.includes(stage)) : team;
    const mine = stage ? passes.filter((p) => p.stage === stage) : passes;
    const hoursByWeek = allWeeks.map((w) => hoursIn(mine, w));
    const series = weeks.map((week, i) => {
      const j = i + AVERAGE_WEEKS - 1;
      const headcount = members.filter((m) => presentIn(m, week)).length;
      const current = week === thisWeek;
      return {
        week,
        current,
        headcount,
        hours: hoursByWeek[j],
        perArtist: headcount ? hoursByWeek[j] / headcount : null,
        // The running average leaves out the week still in progress.
        average: current ? null : avg(hoursByWeek.slice(j - AVERAGE_WEEKS + 1, j + 1)),
      };
    });
    const full = series.filter((s) => !s.current);
    const early = full.slice(0, half);
    const late = full.slice(full.length - half);
    const trend = (fn) => {
      const a = avg(early.map(fn).filter((v) => v !== null));
      const b = avg(late.map(fn).filter((v) => v !== null));
      return { early: a, late: b, change: change(a, b) };
    };

    const artists = members
      .filter((m) => weeks.some((w) => presentIn(m, w)))
      .map((m) => {
        const theirs = mine.filter((p) => p.artist === m.name && inPeriod(p.finishedAt));
        const present = fullWeeks.filter((w) => presentIn(m, w));
        const timed = theirs.filter((p) => p.alloc > 0 && p.spent > 0);
        const daysIn = Math.max(0, daysBetween(m.start, today));
        return {
          name: m.name,
          stages: m.stages,
          start: m.start,
          startKnown: m.startKnown,
          weeksIn: Math.floor(daysIn / 7),
          // Only a real start date makes someone new; counting from their first job would make everyone look new.
          isNew: m.startKnown && daysIn < NEW_ARTIST_WEEKS * 7,
          perWeek: present.length ? sum(theirs.filter((p) => weekOf(p.finishedAt) !== thisWeek), (p) => p.alloc) / present.length : null,
          series: fullWeeks.map((w) => (presentIn(m, w) ? hoursIn(theirs, w) : null)),
          timeTaken: timed.length ? sum(timed, (p) => p.spent) / sum(timed, (p) => p.alloc) : null,
          sentBack: theirs.filter((p) => p.sentBack && p.artistsFault).length,
        };
      });
    // Work waiting in the stage now, and at the start of the period (rows that had arrived but weren't finished).
    const inStage = allPasses.filter((p) => p.stage === stage);
    const waiting = stage ? inStage.filter((p) => p.waiting).length : null;
    // Rows imported from the sheets don't say when they arrived, so the starting queue is only known from app history.
    const waitingStart = stage && inStage.some((p) => p.enteredAt)
      ? inStage.filter((p) => p.enteredAt && p.enteredAt < periodStart && (!p.finishedAt || p.finishedAt >= periodStart)).length
      : null;

    return {
      key,
      stage,
      series,
      artistsNow: series.at(-1).headcount,
      artistsStart: series[0].headcount,
      hours: trend((s) => s.hours),
      perArtist: trend((s) => s.perArtist),
      hoursPerWeek: avg(full.map((s) => s.hours)),
      perArtistPerWeek: (() => {
        const people = sum(full, (s) => s.headcount);
        return people ? sum(full, (s) => s.hours) / people : null;
      })(),
      artists,
      waiting,
      waitingStart,
    };
  };

  return {
    weeks,
    rangeStart: weeks[0],
    team: groupFor('team', null),
    stages: STAGES.map((stage) => groupFor(stage, stage)),
    hasTimes: passes.length > 0,
    // How much of the period's counted work has estimated dates (imported from the sheets).
    estimated: (() => {
      const counted = passes.filter((p) => inPeriod(p.finishedAt));
      return { count: counted.filter((p) => p.estimated).length, total: counted.length };
    })(),
    missingStarts: team.filter((m) => !m.startKnown && m.start).map((m) => m.name),
  };
};

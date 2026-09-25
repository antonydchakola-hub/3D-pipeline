import { addDays, formatDate, todayISO, weekStart } from './pipelineModel';

export const DEMO_PROJECT = 'Demo';

const NEXT = { Modelling: 'Texturing', Texturing: 'Lighting' };
const COUNTER = { Modelling: 'modRework', Texturing: 'textRework', Lighting: 'lightRework' };
const MGR_ARTIST = { Modelling: 'modArtist', Texturing: 'textArtist', Lighting: 'qaArtist' };

// Ops: [dayOffset, op, ...args]; day 0 is today. Each asset is replayed through the same rules the app applies.

// The demo team. Seven experienced artists, then four hires over the last five weeks — while Lighting stays at two
// people, so the Throughput view has a real bottleneck to find. `start` is days from today.
export const DEMO_TEAM = [
  { name: 'A. Silva', stage: 'Modelling', start: -900 },
  { name: 'J. Park', stage: 'Modelling', start: -700, sendBack: 0.3 },
  { name: 'D. Nair', stage: 'Modelling', start: -420 },
  { name: 'M. Oyelaran', stage: 'Modelling', start: -35 },
  { name: 'P. Iyer', stage: 'Modelling', start: -12 },
  { name: 'R. Menon', stage: 'Texturing', start: -800 },
  { name: 'L. Ferreira', stage: 'Texturing', start: -380 },
  { name: 'S. Thomas', stage: 'Texturing', start: -28 },
  { name: 'T. Wong', stage: 'Texturing', start: -9 },
  { name: 'K. Tan', stage: 'Lighting', start: -950 },
  { name: 'V. Rao', stage: 'Lighting', start: -500 },
];
const NEW_FOR_DAYS = 56;
const isNewcomer = (member, day) => day - member.start < NEW_FOR_DAYS;

// Small seeded random generator, so every reset produces the same history.
const seeded = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const COMPLEXITY_MIX = ['Very Simple', 'Simple', 'Simple', 'Medium', 'Medium', 'Medium', 'Hard', 'Hard', 'Very Hard'];
// Estimated hours and calendar days per complexity, for an experienced artist.
const EFFORT = {
  Modelling: { 'Very Simple': [6, 2], Simple: [10, 3], Medium: [16, 4], Hard: [20, 5], 'Very Hard': [28, 6] },
  Texturing: { 'Very Simple': [4, 1], Simple: [8, 2], Medium: [12, 3], Hard: [14, 3], 'Very Hard': [18, 4] },
  Lighting: { 'Very Simple': [5, 2], Simple: [6, 2], Medium: [8, 3], Hard: [10, 3], 'Very Hard': [12, 4] },
};
const FEEDBACK = {
  Modelling: [
    'Proportions are off against the reference photo — the handle should be thicker.',
    'Bevels read flat once the material is on; sharpen them and re-export the high-poly.',
    'Normals flipped on the lid — highlights read inside-out under the key light.',
    'Scale is wrong: the product is 20% too small next to the reference cube.',
  ],
  Texturing: [
    'Fabric weave tiles visibly across the cushion — needs a larger texture or a break-up mask.',
    'Label reads blurry in the hero render — please rebake it at 2K.',
    'Colour doesn’t match the swatch; the red is too saturated.',
    'Seams visible along the side panel UVs.',
  ],
};
const PRIORITY_MIX = ['High Priority', 'Medium Priority', 'Medium Priority', 'Low Priority'];

// Replays how work would have flowed through the team: each artist picks up the next asset when free,
// newcomers are slower and get more sent back, and anything not reached by today stays open.
const generateHistory = () => {
  const rand = seeded(20260924);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const round = (n) => Math.round(n * 2) / 2;
  const members = (stage) => DEMO_TEAM.filter((m) => m.stage === stage);
  const speed = (member, day) => (isNewcomer(member, day) ? 1.6 : 1);
  const hoursFor = (member, day, est) => round(est * (isNewcomer(member, day) ? 1.35 + rand() * 0.3 : 0.85 + rand() * 0.25));
  const sendBackChance = (member, day) => member.sendBack ?? (isNewcomer(member, day) ? 0.35 : 0.07);

  const assets = [];
  let serial = 0;
  for (const modeller of members('Modelling')) {
    let day = Math.max(modeller.start, -84) + (serial % 3);
    while (day <= -3) {
      const complexity = pick(COMPLEXITY_MIX);
      const [est, days] = EFFORT.Modelling[complexity];
      const asset = {
        tcin: String(95040100 + serial * 7),
        priority: pick(PRIORITY_MIX),
        complexity,
        allot: day,
        due: day + 14,
        ops: [],
        modeller,
      };
      serial += 1;
      asset.ops.push([day, 'dispatch'], [day, 'assign', 'Modelling', modeller.name, est]);
      const done = day + Math.ceil(days * speed(modeller, day));
      if (done > -1) {
        asset.ops.push([-1, 'log', 'Modelling', round(est * 0.5)]);
        asset.open = true;
      } else {
        asset.ops.push([done, 'log', 'Modelling', hoursFor(modeller, day, est)], [done, 'advance', 'Modelling']);
        asset.ready = done;
      }
      assets.push(asset);
      day = done;
    }
  }

  // Each later stage takes assets in the order they arrive, from whichever of its artists is free first.
  const runStage = (stage, upstream) => {
    const free = new Map(members(stage).map((m) => [m.name, m.start]));
    const queue = assets.filter((a) => a.ready !== undefined && !a.open).sort((a, b) => a.ready - b.ready);
    for (const asset of queue) {
      const people = members(stage);
      const artist = people.reduce((a, b) => (free.get(b.name) < free.get(a.name) ? b : a), people[0]);
      const start = Math.max(asset.ready + 1, free.get(artist.name));
      if (start > -1) {
        // Nobody free before today: it waits in this stage's queue, unassigned.
        asset.open = true;
        continue;
      }
      const [est, days] = EFFORT[stage][asset.complexity];
      asset.ops.push([start, 'assign', stage, artist.name, est]);
      let day = start + Math.ceil(days * speed(artist, start));
      const upstreamArtist = stage === 'Texturing' ? asset.modeller : asset.texturer;
      if (day <= -2 && rand() < sendBackChance(upstreamArtist, asset.ready)) {
        // Caught a problem from the stage before: back it goes, the same artist fixes it, and it returns.
        asset.ops.push([day, 'log', stage, round(est * 0.4)], [day, 'rework', stage, upstream, pick(FEEDBACK[upstream])]);
        // Most fixes are the artist's own issue and get 0 hours; client changes get hours allocated.
        asset.ops.push([day, 'assign', upstream, upstreamArtist.name, rand() < 0.75 ? 0 : 2]);
        const fixed = day + 1 + (isNewcomer(upstreamArtist, day) ? 1 : 0);
        asset.ops.push([fixed, 'log', upstream, round(1.5 + rand() * 2)], [fixed, 'advance', upstream]);
        const back = fixed;
        asset.ops.push([back, 'assign', stage, artist.name, est]);
        day = back + Math.ceil(days * speed(artist, back) * 0.6);
      }
      if (day > -1) {
        asset.ops.push([-1, 'log', stage, round(est * 0.5)]);
        asset.open = true;
        free.set(artist.name, day);
        continue;
      }
      asset.ops.push([day, 'log', stage, hoursFor(artist, start, est)]);
      free.set(artist.name, day);
      if (stage === 'Texturing') {
        asset.texturer = artist;
        asset.ops.push([day, 'advance', 'Texturing']);
        asset.ready = day;
      } else {
        asset.ops.push([day, 'uploaded']);
        const approved = day + 1 + Math.floor(rand() * 3);
        if (approved <= -1) asset.ops.push([approved, 'approved']);
      }
    }
  };
  runStage('Texturing', 'Modelling');
  runStage('Lighting', 'Texturing');
  for (const asset of assets) {
    delete asset.ready;
    delete asset.open;
    delete asset.modeller;
    delete asset.texturer;
    asset.ops.sort((a, b) => a[0] - b[0]);
  }
  return assets;
};

// Weekly manual entries (leaves in days, training and QA in hours), generated for the last 12 weeks.
// Newcomers spend time in training; experienced artists review their work.
const generateArtistLog = () => {
  const rand = seeded(7);
  const weeks = {};
  for (let offset = -11; offset <= 0; offset += 1) {
    const day = offset * 7;
    const entries = {};
    for (const m of DEMO_TEAM) {
      if (m.start > day + 6) continue;
      const newcomer = isNewcomer(m, day);
      const mentoring = !newcomer && DEMO_TEAM.some((o) => o.stage === m.stage && o.start <= day + 6 && isNewcomer(o, day));
      const entry = {
        leaves: rand() < 0.15 ? (rand() < 0.5 ? '0.5' : '1') : '0',
        training: newcomer ? String(day - m.start < 21 ? 6 : 3) : '0',
        qaHours: mentoring ? String(3 + Math.floor(rand() * 3)) : m.stage === 'Lighting' ? String(2 + Math.floor(rand() * 3)) : '0',
      };
      if (m.stage === 'Lighting') {
        entry.directUpload = String(1 + Math.floor(rand() * 3));
        entry.qaDone = String(2 + Math.floor(rand() * 3));
      }
      entries[m.name] = entry;
    }
    weeks[offset] = entries;
  }
  return weeks;
};

const DEMO_COMMENTS = {
  '95054002': 'Client wants the matte black variant, not gloss.',
  '95053918': 'Reference photos are in the shared drive, folder 1142.',
  '95053940': 'Hero asset for the homepage banner — prioritise render quality.',
  '95053851': 'Use the updated dimensions from the supplier sheet (v2).',
  '95053966': 'Same base mesh as 95053851 — reuse where possible.',
};

const CURRENT = [
  {
    tcin: '95053903', priority: 'High Priority', complexity: 'Hard', allot: -16, due: -4,
    ops: [
      [-16, 'dispatch'], [-16, 'assign', 'Modelling', 'A. Silva', 10], [-13, 'log', 'Modelling', 9], [-13, 'advance', 'Modelling'],
      [-12, 'assign', 'Texturing', 'L. Ferreira', 8], [-9, 'log', 'Texturing', 7], [-9, 'advance', 'Texturing'],
      [-8, 'assign', 'Lighting', 'K. Tan', 4], [-6, 'log', 'Lighting', 3], [-6, 'uploaded'], [-5, 'approved'],
    ],
  },
  {
    tcin: '95053888', priority: 'Medium Priority', complexity: 'Medium', allot: -12, due: 0,
    ops: [
      [-12, 'dispatch'], [-12, 'assign', 'Modelling', 'J. Park', 8], [-9, 'log', 'Modelling', 7], [-9, 'advance', 'Modelling'],
      [-8, 'assign', 'Texturing', 'R. Menon', 6], [-6, 'log', 'Texturing', 6], [-6, 'advance', 'Texturing'],
      [-5, 'assign', 'Lighting', 'K. Tan', 3], [-3, 'log', 'Lighting', 2.5], [-3, 'uploaded'], [-2, 'approved'],
    ],
  },
  {
    tcin: '95053870', priority: 'Low Priority', complexity: 'Simple', allot: -14, due: 1,
    ops: [
      [-14, 'dispatch'], [-14, 'assign', 'Modelling', 'M. Oyelaran', 5], [-12, 'log', 'Modelling', 4], [-12, 'advance', 'Modelling'],
      [-11, 'assign', 'Texturing', 'L. Ferreira', 4], [-9, 'log', 'Texturing', 4], [-9, 'advance', 'Texturing'],
      [-8, 'assign', 'Lighting', 'K. Tan', 3], [-6, 'log', 'Lighting', 2],
      [-5, 'rework', 'Lighting', 'Texturing', 'Label reads blurry in the hero render — please rebake the label at 2K.'],
      [-5, 'assign', 'Texturing', 'L. Ferreira', 2], [-4, 'log', 'Texturing', 1.5], [-4, 'advance', 'Texturing'],
      [-3, 'assign', 'Lighting', 'K. Tan', 2], [-2, 'log', 'Lighting', 1.5], [-2, 'uploaded'], [-1, 'approved'],
    ],
  },
  {
    tcin: '95053796', priority: 'High Priority', complexity: 'Hard', allot: -11, due: 2,
    ops: [
      [-11, 'dispatch'], [-11, 'assign', 'Modelling', 'A. Silva', 10], [-8, 'log', 'Modelling', 9], [-8, 'advance', 'Modelling'],
      [-7, 'assign', 'Texturing', 'R. Menon', 8],
      [-6, 'rework', 'Texturing', 'Modelling', 'Bevel on the top chamfer reads flat once the material is on — can you sharpen it and re-export the high-poly?'],
      [-6, 'assign', 'Modelling', 'A. Silva', 3], [-4, 'log', 'Modelling', 3], [-4, 'advance', 'Modelling'],
      [-4, 'assign', 'Texturing', 'R. Menon', 8], [-2, 'log', 'Texturing', 6], [-2, 'advance', 'Texturing'],
      [-1, 'assign', 'Lighting', 'K. Tan', 4], [0, 'log', 'Lighting', 2], [0, 'uploaded'],
    ],
  },
  {
    tcin: '95053940', priority: 'High Priority', complexity: 'Hard', allot: -10, due: 1,
    ops: [
      [-10, 'dispatch'], [-10, 'assign', 'Modelling', 'M. Oyelaran', 10], [-6, 'log', 'Modelling', 10], [-6, 'advance', 'Modelling'],
      [-5, 'assign', 'Texturing', 'R. Menon', 8], [-2, 'log', 'Texturing', 7], [-2, 'advance', 'Texturing'],
      [-1, 'assign', 'Lighting', 'K. Tan', 4], [0, 'log', 'Lighting', 1.8],
    ],
  },
  {
    tcin: '95053844', priority: 'Medium Priority', complexity: 'Medium', allot: -9, due: 3,
    ops: [
      [-9, 'dispatch'], [-9, 'assign', 'Modelling', 'J. Park', 8], [-6, 'log', 'Modelling', 8], [-6, 'advance', 'Modelling'],
      [-5, 'assign', 'Texturing', 'R. Menon', 6], [-2, 'log', 'Texturing', 5], [-2, 'advance', 'Texturing'],
      [-1, 'assign', 'Lighting', 'K. Tan', 3], [0, 'log', 'Lighting', 1],
    ],
  },
  {
    tcin: '95053812', priority: 'High Priority', complexity: 'Hard', allot: -13, due: -2,
    ops: [
      [-13, 'dispatch'], [-13, 'assign', 'Modelling', 'A. Silva', 8], [-10, 'log', 'Modelling', 8], [-10, 'advance', 'Modelling'],
      [-9, 'assign', 'Texturing', 'L. Ferreira', 6], [-7, 'log', 'Texturing', 6], [-7, 'advance', 'Texturing'],
      [-6, 'assign', 'Lighting', 'K. Tan', 3], [-4, 'log', 'Lighting', 2],
      [-3, 'rework', 'Lighting', 'Modelling', 'Normals flipped on the lid — highlights read inside-out under the key light.'],
      [-3, 'assign', 'Modelling', 'A. Silva', 2], [0, 'log', 'Modelling', 3],
    ],
  },
  {
    tcin: '95053925', priority: 'Low Priority', complexity: 'Simple', allot: -8, due: 4,
    ops: [
      [-8, 'dispatch'], [-8, 'assign', 'Modelling', 'J. Park', 4], [-6, 'log', 'Modelling', 4], [-6, 'advance', 'Modelling'],
      [-5, 'assign', 'Texturing', 'L. Ferreira', 4], [-2, 'log', 'Texturing', 3],
      [-1, 'rework', 'Texturing', 'Texturing', 'Label artwork is 512px — needs the 2K source before the final bake.'],
      [-1, 'assign', 'Texturing', 'L. Ferreira', 1], [0, 'log', 'Texturing', 0.5],
    ],
  },
  {
    tcin: '95054010', priority: 'Medium Priority', complexity: 'Medium', allot: -7, due: 5,
    ops: [
      [-7, 'dispatch'], [-7, 'assign', 'Modelling', 'J. Park', 8], [-3, 'log', 'Modelling', 7], [-3, 'advance', 'Modelling'],
      [-2, 'assign', 'Texturing', 'R. Menon', 6], [0, 'log', 'Texturing', 1.5],
    ],
  },
  {
    tcin: '95053851', priority: 'Medium Priority', complexity: 'Medium', allot: -5, due: 3,
    ops: [[-5, 'dispatch'], [-5, 'assign', 'Modelling', 'J. Park', 10], [0, 'log', 'Modelling', 6]],
  },
  {
    tcin: '95053877', priority: 'Low Priority', complexity: 'Very Hard', allot: -6, due: 7,
    ops: [
      [-6, 'dispatch'], [-6, 'assign', 'Modelling', 'M. Oyelaran', 10],
      [-4, 'split', 'Modelling', ['A', 'B']],
      [-4, 'assign', 'Modelling', 'M. Oyelaran', 5, '95053877-A'], [0, 'log', 'Modelling', 1.5, '95053877-A'],
      [-4, 'assign', 'Modelling', 'M. Oyelaran', 5, '95053877-B'],
    ],
  },
  {
    tcin: '95053990', priority: 'High Priority', complexity: 'Medium', allot: -9, due: -1,
    ops: [[-9, 'dispatch'], [-9, 'assign', 'Modelling', 'M. Oyelaran', 8], [0, 'log', 'Modelling', 9]],
  },
  {
    tcin: '95053966', priority: 'Medium Priority', complexity: 'Simple', allot: -1, due: 8,
    ops: [[-1, 'dispatch'], [-1, 'assign', 'Modelling', 'A. Silva', 6]],
  },
  { tcin: '95054002', priority: 'High Priority', allot: 0, ops: [] },
  { tcin: '95053918', priority: 'Medium Priority', allot: 0, ops: [] },
  { tcin: '95054017', priority: 'Medium Priority', allot: 1, ops: [] },
  { tcin: '95053971', priority: 'Low Priority', allot: 1, ops: [] },
  { tcin: '95054031', priority: 'Low Priority', allot: 2, ops: [] },
];

const ASSETS = [
  ...CURRENT,
  ...generateHistory(),
];

const num = (n) => (n === undefined || n === null ? '' : String(n));

export const buildDemoProject = (today = todayISO()) => {
  let seq = 0;
  const id = () => `demo-${++seq}`;
  const out = { Manager: [], Modelling: [], Texturing: [], Lighting: [], events: [] };
  const sentBackRows = new Set();
  const now = Date.now();

  ASSETS.forEach((asset, assetIndex) => {
    const allotDate = addDays(today, asset.allot);
    const dueDate = asset.due === undefined ? '' : addDays(today, asset.due);
    const mgr = {
      id: id(), checked: false, no: String(assetIndex + 1), tcin: asset.tcin, priority: asset.priority, allotDate,
      modArtist: '', modStatus: '', textArtist: '', textStatus: '', qaArtist: '',
      uploadDate: '', mainStatus: '', approvedDate: '', modRework: 0, textRework: 0, lightRework: 0,
    };
    out.Manager.push(mgr);

    const stamp = (day, opIndex) => {
      const d = new Date(`${addDays(today, day)}T09:00:00`);
      d.setMinutes(d.getMinutes() + opIndex * 25 + (assetIndex % 6) * 6);
      // Keep today's events in the past, still in op order.
      return new Date(Math.min(d.getTime(), now - (60 - opIndex) * 60000)).toISOString();
    };
    const event = (day, opIndex, tcn, kind, stage, text, extra = {}) =>
      out.events.push({ id: id(), at: stamp(day, opIndex), tcn, kind, stage, text, ...extra });

    const openRow = (stage, tcn = asset.tcin) => {
      const rows = out[stage].filter((r) => r.tcn === tcn && !['Archived Rework', 'Archived Split'].includes(r.status) && !r.status.startsWith('Sent to'));
      return rows[rows.length - 1];
    };
    const newRow = (stage, type, extra = {}) => {
      const row = {
        id: id(), no: mgr.no, tcn: asset.tcin, comments: '', type, priority: asset.priority, complexity: asset.complexity || '',
        allotDate, dueDate, artist: '', status: '', allocTime: '', timeSpent: '', reworkTime: '', ...extra,
      };
      out[stage].push(row);
      return row;
    };

    asset.ops.forEach(([day, op, ...args], i) => {
      if (op === 'dispatch') {
        newRow('Modelling', 'new');
        event(day, i, asset.tcin, 'dispatch', 'Modelling', 'Dispatched to Modelling', { detail: `allotted ${formatDate(allotDate)}` });
      } else if (op === 'assign') {
        const [stage, artist, alloc, tcn] = args;
        const row = openRow(stage, tcn);
        row.artist = artist;
        row.allocTime = num(alloc);
        if (!tcn) mgr[MGR_ARTIST[stage]] = artist;
        event(day, i, tcn || asset.tcin, 'assign', stage, `Assigned to ${artist}`, { detail: `${alloc} h allocated` });
      } else if (op === 'log') {
        const [stage, hrs, tcn] = args;
        const row = openRow(stage, tcn);
        if (sentBackRows.has(row.id)) row.reworkTime = num(hrs);
        else row.timeSpent = num(hrs);
      } else if (op === 'advance') {
        const [stage] = args;
        const row = openRow(stage);
        const to = NEXT[stage];
        const exists = out[to].some((r) => r.tcn === asset.tcin);
        row.status = `Sent to ${to}`;
        newRow(to, exists ? 'rework' : 'new', { comments: row.comments });
        if (stage === 'Texturing') mgr.textStatus = 'Done';
        const logged = row.reworkTime || row.timeSpent;
        event(day, i, asset.tcin, 'advance', to, `Sent to ${to}`, {
          detail: logged ? `${row.artist} logged ${logged} h${row.allocTime ? ` of ${row.allocTime} h` : ''}` : '',
        });
      } else if (op === 'rework') {
        const [from, to, comment] = args;
        const current = openRow(from);
        if (to === from) {
          current.status = 'Archived Rework';
          sentBackRows.add(newRow(to, 'rework', { comments: comment, artist: current.artist }).id);
        } else {
          current.status = `Sent to ${to}`;
          const upstream = out[to].filter((r) => r.tcn === asset.tcin).pop();
          if (upstream) upstream.status = 'Archived Rework';
          sentBackRows.add(newRow(to, 'rework', { comments: comment }).id);
        }
        mgr[COUNTER[to]] += 1;
        if (from === 'Texturing' && to === 'Modelling') mgr.textStatus = '';
        if (from === 'Lighting') {
          mgr.uploadDate = '';
          mgr.mainStatus = to === 'Lighting' ? 'Rework' : '';
          if (to === 'Modelling') mgr.textStatus = '';
        }
        const text = to === from ? `Internal rework in ${from}` : `Sent back from ${from} to ${to}`;
        event(day, i, asset.tcin, 'rework', to, text, { from, comment });
      } else if (op === 'uploaded') {
        openRow('Lighting').status = 'Uploaded';
        mgr.mainStatus = 'Uploaded';
        mgr.uploadDate = addDays(today, day);
        event(day, i, asset.tcin, 'uploaded', 'Lighting', 'Uploaded for QA');
      } else if (op === 'approved') {
        const row = out.Lighting.filter((r) => r.tcn === asset.tcin && r.status === 'Uploaded').pop();
        row.status = 'Approved';
        mgr.mainStatus = 'Approved';
        mgr.approvedDate = addDays(today, day);
        event(day, i, asset.tcin, 'approved', 'Lighting', 'Approved');
      } else if (op === 'split') {
        const [stage, suffixes] = args;
        openRow(stage).status = 'Archived Split';
        for (const s of suffixes) newRow(stage, 'new', { tcn: `${asset.tcin}-${s}`, isSplit: true });
        event(day, i, asset.tcin, 'split', stage, `Split in ${stage}`, { detail: `new sub-assets ${suffixes.map((s) => `${asset.tcin}-${s}`).join(', ')}` });
      }
    });
  });

  out.assetComments = { ...DEMO_COMMENTS };

  const thisWeek = weekStart(today);
  out.artistLog = Object.fromEntries(
    Object.entries(generateArtistLog()).map(([offset, entries]) => [addDays(thisWeek, Number(offset) * 7), entries]),
  );

  return out;
};

// Puts the demo artists on the team with their start dates, which the Throughput view uses for headcount.
const withDemoTeam = (artists, replace) => {
  const today = todayISO();
  const roster = Array.isArray(artists) ? [...artists] : [];
  for (const m of DEMO_TEAM) {
    const startDate = addDays(today, m.start);
    const i = roster.findIndex((a) => a.name.toLowerCase() === m.name.toLowerCase());
    if (i < 0) {
      roster.push({ id: `demo-${m.name.replace(/[^a-z]/gi, '').toLowerCase()}`, name: m.name, stages: [m.stage], email: '', role: 'Artist', active: true, startDate });
    } else if (replace || !roster[i].startDate) {
      roster[i] = { ...roster[i], startDate, stages: roster[i].stages?.includes(m.stage) ? roster[i].stages : [...(roster[i].stages || []), m.stage] };
    }
  }
  return roster;
};

export const withDemoProject = (state, { replace = false } = {}) => {
  if (!replace && state.Manager?.[DEMO_PROJECT]) return state;
  const demo = buildDemoProject();
  const artistLog = { ...state.artistLog };
  for (const [week, entries] of Object.entries(demo.artistLog)) {
    artistLog[week] = replace ? { ...artistLog[week], ...entries } : { ...entries, ...artistLog[week] };
  }
  return {
    ...state,
    artists: withDemoTeam(state.artists, replace),
    artistLog,
    assetComments: { ...state.assetComments, [DEMO_PROJECT]: demo.assetComments },
    Manager: { ...state.Manager, [DEMO_PROJECT]: demo.Manager },
    Modelling: { ...state.Modelling, [DEMO_PROJECT]: demo.Modelling },
    Texturing: { ...state.Texturing, [DEMO_PROJECT]: demo.Texturing },
    Lighting: { ...state.Lighting, [DEMO_PROJECT]: demo.Lighting },
    events: { ...state.events, [DEMO_PROJECT]: demo.events },
  };
};

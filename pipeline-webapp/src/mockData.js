import { addDays, formatDate, todayISO, weekStart } from './pipelineModel';

export const DEMO_PROJECT = 'Demo';

const NEXT = { Modelling: 'Texturing', Texturing: 'Lighting' };
const COUNTER = { Modelling: 'modRework', Texturing: 'textRework', Lighting: 'lightRework' };
const MGR_ARTIST = { Modelling: 'modArtist', Texturing: 'textArtist', Lighting: 'qaArtist' };

// Each asset's history, replayed through the same rules the app applies.
// Ops: [dayOffset, op, ...args]; day 0 is today.
// Older assets that went straight through (some with one send-back); they give the artist summary its history.
const HISTORY = [
  { tcin: '95052710', priority: 'High Priority', complexity: 'Hard', start: -44, mod: ['A. Silva', 10, 11], tex: ['R. Menon', 8, 7], light: ['K. Tan', 4, 3.5] },
  { tcin: '95052734', priority: 'Medium Priority', complexity: 'Medium', start: -42, mod: ['J. Park', 8, 7.5], tex: ['L. Ferreira', 6, 6], light: ['K. Tan', 3, 3] },
  { tcin: '95052751', priority: 'Low Priority', complexity: 'Very Simple', start: -40, mod: ['D. Nair', 3, 2.5], tex: ['S. Thomas', 2, 2], light: ['V. Rao', 1.5, 1] },
  {
    tcin: '95052768', priority: 'Medium Priority', complexity: 'Simple', start: -38, mod: ['M. Oyelaran', 5, 4], tex: ['R. Menon', 4, 4.5], light: ['K. Tan', 2, 2],
    sendBack: 'Modelling', comment: 'Handle proportions are off against the reference photo — the handle should be about 10% thicker.',
  },
  { tcin: '95052790', priority: 'High Priority', complexity: 'Very Hard', start: -36, mod: ['A. Silva', 14, 16], tex: ['S. Thomas', 10, 9], light: ['K. Tan', 5, 5] },
  { tcin: '95052815', priority: 'Medium Priority', complexity: 'Medium', start: -33, mod: ['D. Nair', 8, 8.5], tex: ['L. Ferreira', 6, 5.5], light: ['V. Rao', 3, 2.5] },
  { tcin: '95052832', priority: 'Low Priority', complexity: 'Simple', start: -31, mod: ['J. Park', 5, 4.5], tex: ['R. Menon', 4, 3.5], light: ['K. Tan', 2, 2] },
  {
    tcin: '95052857', priority: 'High Priority', complexity: 'Hard', start: -29, mod: ['M. Oyelaran', 10, 9.5], tex: ['S. Thomas', 8, 8], light: ['K. Tan', 4, 4],
    sendBack: 'Texturing', comment: 'Fabric weave tiles visibly across the seat cushion — needs a larger texture or a break-up mask.',
  },
  { tcin: '95052874', priority: 'Medium Priority', complexity: 'Simple', start: -26, mod: ['D. Nair', 5, 5], tex: ['L. Ferreira', 4, 4], light: ['V. Rao', 2, 1.5] },
  { tcin: '95052896', priority: 'Low Priority', complexity: 'Very Simple', start: -24, mod: ['J. Park', 3, 3], tex: ['S. Thomas', 2, 1.5], light: ['K. Tan', 1.5, 1.5] },
  { tcin: '95052913', priority: 'High Priority', complexity: 'Medium', start: -22, mod: ['A. Silva', 8, 7], tex: ['R. Menon', 6, 6.5], light: ['K. Tan', 3, 3] },
  { tcin: '95052938', priority: 'Medium Priority', complexity: 'Hard', start: -20, mod: ['D. Nair', 10, 12], tex: ['L. Ferreira', 8, 7.5], light: ['V. Rao', 4, 3.5] },
];

const historyOps = (h) => {
  let d = h.start;
  const ops = [];
  const at = (...op) => ops.push([d, ...op]);
  at('dispatch'); at('assign', 'Modelling', h.mod[0], h.mod[1]);
  d += 3; at('log', 'Modelling', h.mod[2]); at('advance', 'Modelling');
  d += 1; at('assign', 'Texturing', h.tex[0], h.tex[1]);
  if (h.sendBack === 'Modelling') {
    d += 1; at('rework', 'Texturing', 'Modelling', h.comment); at('assign', 'Modelling', h.mod[0], 2);
    d += 1; at('log', 'Modelling', 1.5); at('advance', 'Modelling'); at('assign', 'Texturing', h.tex[0], h.tex[1]);
  }
  d += 2; at('log', 'Texturing', h.tex[2]); at('advance', 'Texturing');
  d += 1; at('assign', 'Lighting', h.light[0], h.light[1]);
  if (h.sendBack === 'Texturing') {
    d += 1; at('rework', 'Lighting', 'Texturing', h.comment); at('assign', 'Texturing', h.tex[0], 1.5);
    d += 1; at('log', 'Texturing', 1); at('advance', 'Texturing'); at('assign', 'Lighting', h.light[0], h.light[1]);
  }
  d += 1; at('log', 'Lighting', h.light[2]); at('uploaded');
  d += 1; at('approved');
  return ops;
};

// Weekly manual entries (leaves in days, training and QA in hours); key 0 = this week, -1 = last week.
const ARTIST_LOG = {
  0: {
    'A. Silva': { leaves: '0', training: '2', qaHours: '0' },
    'J. Park': { leaves: '1', training: '0', qaHours: '0' },
    'M. Oyelaran': { leaves: '0', training: '4', qaHours: '0' },
    'D. Nair': { leaves: '0.5', training: '0', qaHours: '0' },
    'R. Menon': { leaves: '0', training: '0', qaHours: '1.5' },
    'L. Ferreira': { leaves: '0', training: '2', qaHours: '0' },
    'S. Thomas': { leaves: '1', training: '0', qaHours: '0' },
    'K. Tan': { directUpload: '2', qaDone: '3', leaves: '0', training: '0', qaHours: '6' },
    'V. Rao': { directUpload: '1', qaDone: '1', leaves: '0', training: '1', qaHours: '3' },
  },
  [-1]: {
    'A. Silva': { leaves: '1', training: '0', qaHours: '0' },
    'J. Park': { leaves: '0', training: '3', qaHours: '0' },
    'M. Oyelaran': { leaves: '0', training: '0', qaHours: '0' },
    'D. Nair': { leaves: '2', training: '0', qaHours: '0' },
    'R. Menon': { leaves: '0', training: '1', qaHours: '2' },
    'L. Ferreira': { leaves: '0.5', training: '0', qaHours: '0' },
    'S. Thomas': { leaves: '0', training: '2', qaHours: '0' },
    'K. Tan': { directUpload: '3', qaDone: '4', leaves: '0', training: '0', qaHours: '8' },
    'V. Rao': { directUpload: '1', qaDone: '2', leaves: '1', training: '0', qaHours: '2.5' },
  },
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
  ...HISTORY.map((h) => ({ tcin: h.tcin, priority: h.priority, complexity: h.complexity, allot: h.start, due: h.start + 12, ops: historyOps(h) })),
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
    Object.entries(ARTIST_LOG).map(([offset, entries]) => [addDays(thisWeek, Number(offset) * 7), entries]),
  );

  return out;
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
    artistLog,
    assetComments: { ...state.assetComments, [DEMO_PROJECT]: demo.assetComments },
    Manager: { ...state.Manager, [DEMO_PROJECT]: demo.Manager },
    Modelling: { ...state.Modelling, [DEMO_PROJECT]: demo.Modelling },
    Texturing: { ...state.Texturing, [DEMO_PROJECT]: demo.Texturing },
    Lighting: { ...state.Lighting, [DEMO_PROJECT]: demo.Lighting },
    events: { ...state.events, [DEMO_PROJECT]: demo.events },
  };
};

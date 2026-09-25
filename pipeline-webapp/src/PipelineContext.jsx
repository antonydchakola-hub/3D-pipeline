import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { STAGES, formatDate, todayISO } from './pipelineModel';
import { withDemoProject } from './mockData';
import { useAuth } from './auth';
import { applyRemoteRecord, diffStates, fetchChanges, fetchState, recordKey, recordsToState, seedDatabase, sendMutations } from './sync';

const PipelineContext = createContext();

export const usePipeline = () => useContext(PipelineContext);

const generateId = () => Math.random().toString(36).slice(2, 11);

const initialData = {
  Manager: {
    'Testing': [
      { id: generateId(), checked: false, no: '1', tcin: '95053796', priority: 'High Priority', allotDate: '2023-10-01', modArtist: 'Test', modStatus: 'Approved', textArtist: 'Artist A', textStatus: 'Approved', qaArtist: 'Artist B', uploadDate: '2023-10-10', mainStatus: 'Uploaded', approvedDate: '', modRework: 0, textRework: 1, lightRework: 0 },
      { id: generateId(), checked: true, no: '2', tcin: '124414', priority: 'Medium Priority', allotDate: '2023-10-02', modArtist: 'Test', modStatus: 'Sent to Texturing', textArtist: '', textStatus: '', qaArtist: '', uploadDate: '', mainStatus: '', approvedDate: '', modRework: 2, textRework: 0, lightRework: 0 },
    ],
    'C6_2026': [
      { id: generateId(), checked: false, no: 'C6-1', tcin: '999999', priority: 'Low Priority', allotDate: '2024-01-01', modArtist: 'Artist B', modStatus: 'Rework', textArtist: '', textStatus: '', qaArtist: '', uploadDate: '', mainStatus: '', approvedDate: '', modRework: 1, textRework: 0, lightRework: 0 },
    ]
  },
  Modelling: {
    'Testing': [
      { id: generateId(), no: '', tcn: '95053796', comments: 'Needs fixing', type: 'new', priority: 'High Priority', complexity: 'Hard', allotDate: '2023-10-01', dueDate: '2023-10-05', artist: 'Test', status: 'Approved', allocTime: '10', timeSpent: '8', reworkTime: '2' }
    ],
    'C6_2026': []
  },
  Texturing: { 'Testing': [], 'C6_2026': [] },
  Lighting: { 'Testing': [], 'C6_2026': [] },
  events: { 'Testing': [], 'C6_2026': [] },
  artistLog: {},
  assetComments: {},
};

const withAssetComment = (state, project, tcn, text) => ({
  ...state,
  assetComments: { ...state.assetComments, [project]: { ...state.assetComments?.[project], [tcn]: text } },
});

const makeEvent = (tcn, kind, stage, text, extra = {}) => ({
  id: generateId(),
  at: new Date().toISOString(),
  tcn,
  kind,
  stage,
  text,
  ...extra,
});


// Hand-offs carry the shared asset columns (the sheets' MAP, plus the due date); artist and hours belong to each stage's own pass.
const carryOver = (row) => ({
  no: row.no,
  tcn: row.tcn,
  comments: row.comments,
  type: row.type,
  priority: row.priority,
  complexity: row.complexity,
  allotDate: row.allotDate,
  dueDate: row.dueDate,
  artist: '',
  status: '',
  allocTime: '',
  timeSpent: '',
  reworkTime: '',
});

const replaceRows = (state, stage, project, rows) => ({
  ...state,
  [stage]: { ...state[stage], [project]: rows },
});

// The names the dropdowns offered before there was a roster.
const LEGACY_ARTISTS = ['Test', 'Artist A', 'Artist B'];
const MANAGER_ARTIST_FIELDS = { modArtist: 'Modelling', textArtist: 'Texturing', qaArtist: 'Lighting' };

const newMember = (name, stages = [], extra = {}) => ({
  id: generateId(), name, stages, email: '', role: 'Artist', active: true, ...extra,
});

// Everyone who already appears in the data joins the roster, with the stages they have worked in.
const withRoster = (state) => {
  const roster = Array.isArray(state.artists) ? state.artists.map((a) => ({ ...a, stages: [...(a.stages || [])] })) : [];
  const byName = new Map(roster.map((a) => [a.name.toLowerCase(), a]));
  const add = (name, stage) => {
    const clean = String(name || '').trim();
    if (!clean) return;
    let member = byName.get(clean.toLowerCase());
    if (!member) {
      member = newMember(clean);
      byName.set(clean.toLowerCase(), member);
      roster.push(member);
    }
    if (stage && !member.stages.includes(stage)) member.stages.push(stage);
  };
  if (!Array.isArray(state.artists)) LEGACY_ARTISTS.forEach((name) => STAGES.forEach((stage) => add(name, stage)));
  for (const stage of STAGES) {
    for (const rows of Object.values(state[stage] || {})) rows.forEach((r) => add(r.artist, stage));
  }
  for (const rows of Object.values(state.Manager || {})) {
    rows.forEach((r) => Object.entries(MANAGER_ARTIST_FIELDS).forEach(([field, stage]) => add(r[field], stage)));
  }
  return { ...state, artists: roster };
};

// Starting data for a brand-new, empty database.
const seedState = () => withRoster(withDemoProject(initialData));

const POLL_MS = 15000;
const SAVE_DELAY_MS = 250;
const RETRY_MS = 5000;

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const PipelineProvider = ({ children }) => {
  // Mounted only while signed in (see AuthGate), and remounted for each new sign-in.
  const { user, isAdmin } = useAuth();

  // The server signs every history entry too; this just lets the author see their own name without a reload.
  const withEvents = (state, project, events) => ({
    ...state,
    events: {
      ...state.events,
      [project]: [...(state.events?.[project] || []), ...events.map(ev => ({ ...ev, by: user.displayName, byUser: user.username }))],
    },
  });
  const [data, setData] = useState(null);
  const [loadState, setLoadState] = useState({ status: 'loading', error: '' });
  const [syncStatus, setSyncStatus] = useState('saved');
  const [notice, setNotice] = useState(null);
  const noticeTimer = useRef(null);

  // The latest state, readable synchronously inside actions (React state lags one render behind).
  const stateRef = useRef(null);
  // Server version of every record this browser has seen; sent back with each change so concurrent edits are caught.
  const versionsRef = useRef(new Map());
  // Changes waiting to be saved, and the batch currently being saved (only one at a time).
  const pendingRef = useRef(new Map());
  const inflightRef = useRef(null);
  const seqRef = useRef(0);
  const flushTimer = useRef(null);

  const notify = (text) => {
    clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = setTimeout(() => setNotice(null), 4200);
  };

  const replaceState = (next) => {
    stateRef.current = next;
    setData(next);
  };

  const loadFromServer = async () => {
    let res = await fetchState();
    if (!res.seeded && res.records.length === 0) {
      if (!isAdmin) throw new Error('The pipeline hasn’t been set up yet. An admin needs to sign in first.');
      const claimed = await seedDatabase(seedState());
      res = await fetchState();
      for (let i = 0; !claimed && !res.seeded && i < 40; i++) {
        await wait(1500);
        res = await fetchState();
      }
    }
    versionsRef.current = new Map(res.records.map(r => [recordKey(r), r.version]));
    seqRef.current = res.seq;
    pendingRef.current = new Map();
    replaceState(recordsToState(res.records));
  };

  const pullChanges = async () => {
    if (!stateRef.current) return;
    let more = true;
    while (more) {
      const res = await fetchChanges(seqRef.current);
      let next = stateRef.current;
      for (const r of res.records) {
        const key = recordKey(r);
        // A record this browser is still saving wins locally; if it clashed, the save is rejected and everything reloads.
        if (pendingRef.current.has(key) || inflightRef.current?.has(key)) continue;
        const known = versionsRef.current.get(key);
        if (known !== undefined && r.version <= known) continue;
        versionsRef.current.set(key, r.version);
        next = applyRemoteRecord(next, r);
      }
      seqRef.current = Math.max(seqRef.current, res.seq);
      if (next !== stateRef.current) replaceState(next);
      more = res.more;
    }
  };

  const flush = async () => {
    if (inflightRef.current || !pendingRef.current.size) return;
    const batch = pendingRef.current;
    pendingRef.current = new Map();
    inflightRef.current = batch;
    setSyncStatus('saving');
    const ops = [...batch.values()].map(op => ({ ...op, baseVersion: versionsRef.current.get(recordKey(op)) ?? null }));
    try {
      const res = await sendMutations(ops);
      for (const [key, version] of Object.entries(res.versions || {})) versionsRef.current.set(key, version);
      inflightRef.current = null;
      setSyncStatus(pendingRef.current.size ? 'saving' : 'saved');
    } catch (err) {
      inflightRef.current = null;
      if (err.conflict) {
        pendingRef.current = new Map();
        notify('Someone else changed this at the same time. The latest data is loaded — please try again.');
        await loadFromServer().catch(() => {});
        setSyncStatus('saved');
      } else if (!err.status || err.status >= 500) {
        // Network or server trouble: keep the changes (newer edits win) and try again shortly.
        pendingRef.current = new Map([...batch, ...pendingRef.current]);
        setSyncStatus('offline');
        clearTimeout(flushTimer.current);
        flushTimer.current = setTimeout(flush, RETRY_MS);
        return;
      } else {
        pendingRef.current = new Map();
        notify(`That change couldn't be saved: ${err.message}`);
        await loadFromServer().catch(() => {});
        setSyncStatus('saved');
      }
    }
    if (pendingRef.current.size) {
      clearTimeout(flushTimer.current);
      flushTimer.current = setTimeout(flush, 0);
    }
  };

  // Every change goes through here: update the screen immediately, then save just the records that changed.
  const commit = (updater) => {
    const prev = stateRef.current;
    if (!prev) return;
    const next = updater(prev);
    if (!next || next === prev) return;
    stateRef.current = next;
    setData(next);
    for (const op of diffStates(prev, next)) pendingRef.current.set(recordKey(op), op);
    if (inflightRef.current) return;
    clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  const retryLoad = () => {
    setLoadState({ status: 'loading', error: '' });
    loadFromServer()
      .then(() => setLoadState({ status: 'ready', error: '' }))
      .catch(err => setLoadState({ status: 'error', error: err.message }));
  };

  // loadFromServer and pullChanges only touch refs and state setters, so the first render's copies stay valid.
  useEffect(() => {
    let cancelled = false;
    loadFromServer()
      .then(() => { if (!cancelled) setLoadState({ status: 'ready', error: '' }); })
      .catch(err => { if (!cancelled) setLoadState({ status: 'error', error: err.message }); });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (loadState.status !== 'ready') return undefined;
    let busy = false;
    const pull = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        await pullChanges();
      } catch {
        // Offline for a moment; the next check tries again.
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(pull, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') pull(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', pull);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', pull);
    };
  }, [loadState.status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const warn = (e) => {
      if (pendingRef.current.size || inflightRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const updateManagerField = (project, tcn, field, value) => {
    commit(prev => {
      const projData = prev.Manager[project] || [];
      const newData = projData.map(row =>
        row.tcin === tcn ? { ...row, [field]: value } : row
      );
      return { ...prev, Manager: { ...prev.Manager, [project]: newData } };
    });
  };

  const incrementManagerRework = (project, tcn, field) => {
    commit(prev => {
      const projData = prev.Manager[project] || [];
      const newData = projData.map(row =>
        row.tcin === tcn ? { ...row, [field]: (row[field] || 0) + 1 } : row
      );
      return { ...prev, Manager: { ...prev.Manager, [project]: newData } };
    });
  };

  const dispatchToModelling = (project) => {
    const checkedRows = (stateRef.current.Manager[project] || []).filter(row => row.checked && row.tcin);
    if (checkedRows.length === 0) return;

    commit(prev => {
      const mgrData = prev.Manager[project] || [];
      const toSend = mgrData.filter(row => row.checked && row.tcin);

      const newModRows = toSend.map(row => ({
        id: generateId(),
        no: row.no,
        tcn: row.tcin,
        comments: '',
        type: 'new',
        priority: row.priority,
        complexity: '',
        allotDate: row.allotDate,
        dueDate: '',
        artist: '',
        status: '',
        allocTime: '',
        timeSpent: '',
        reworkTime: ''
      }));

      const newMgrData = mgrData.map(row =>
        row.checked ? { ...row, checked: false } : row
      );

      const existingMod = prev.Modelling[project] || [];
      const next = {
        ...prev,
        Manager: { ...prev.Manager, [project]: newMgrData },
        Modelling: { ...prev.Modelling, [project]: [...existingMod, ...newModRows] }
      };
      return withEvents(next, project, toSend.map(row => makeEvent(row.tcin, 'dispatch', 'Modelling', 'Dispatched to Modelling', {
        detail: row.allotDate ? `allotted ${formatDate(row.allotDate)}` : '',
      })));
    });
    notify(`${checkedRows.length} asset${checkedRows.length === 1 ? '' : 's'} dispatched to Modelling`);
  };

  const nextAssetNumber = (project) => {
    const projData = stateRef.current.Manager[project] || [];
    if (!projData.length) return '1';
    const lastNo = String(projData[projData.length - 1].no ?? '').trim();
    const parsed = parseInt(lastNo, 10);
    if (!isNaN(parsed) && String(parsed) === lastNo) return String(parsed + 1);
    const match = lastNo.match(/^(.*?)(\d+)$/);
    if (match) return match[1] + (parseInt(match[2], 10) + 1);
    return lastNo ? `${lastNo}-new` : '1';
  };

  const findAsset = (project, tcin) => {
    const clean = String(tcin || '').trim().toLowerCase();
    return (stateRef.current.Manager[project] || []).find(r => String(r.tcin || '').trim().toLowerCase() === clean);
  };

  // Returns the new row's id, or an error message.
  const addAsset = (project, { tcin, no, priority, allotDate, comment }) => {
    const cleanTcin = String(tcin || '').trim();
    if (!cleanTcin) return { error: 'Enter a TCIN' };
    if (findAsset(project, cleanTcin)) return { error: `${cleanTcin} is already in ${project}` };
    const newRow = {
      id: generateId(),
      checked: false,
      no: String(no || '').trim() || nextAssetNumber(project),
      tcin: cleanTcin,
      priority: priority || '',
      allotDate: allotDate || '',
      modArtist: '',
      modStatus: '',
      textArtist: '',
      textStatus: '',
      qaArtist: '',
      uploadDate: '',
      mainStatus: '',
      approvedDate: '',
      modRework: 0,
      textRework: 0,
      lightRework: 0,
    };
    commit(prev => {
      const next = { ...prev, Manager: { ...prev.Manager, [project]: [...(prev.Manager[project] || []), newRow] } };
      return comment?.trim() ? withAssetComment(next, project, cleanTcin, comment.trim()) : next;
    });
    notify(`${cleanTcin} added to ${project}`);
    return { id: newRow.id };
  };
  const updateRow = (stage, project, id, field, value) => {
    commit(prev => {
      const stageData = prev[stage][project] || [];
      const target = stageData.find(row => row.id === id);
      const next = replaceRows(prev, stage, project, stageData.map(row => row.id === id ? { ...row, [field]: value } : row));
      if (field === 'artist' && value && target && STAGES.includes(stage) && target.artist !== value) {
        return withEvents(next, project, [makeEvent(target.tcn, 'assign', stage, `Assigned to ${value}`, {
          detail: target.allocTime ? `${target.allocTime} h allocated` : '',
        })]);
      }
      return next;
    });
  };

  const setAssetComment = (project, tcn, text) => {
    if (!tcn) return;
    commit(prev => withAssetComment(prev, project, tcn, text));
  };

  const addComment = (project, tcn, stage, comment) => {
    commit(prev => withEvents(prev, project, [makeEvent(tcn, 'comment', stage, 'Comment', { comment })]));
  };

  // `providedComment` lets callers with their own feedback field skip the browser prompt.
  const handleStatusChange = (stage, project, id, newStatus, providedComment) => {
    const row = stateRef.current[stage][project]?.find(r => r.id === id);
    if (!row) return;

    const askReason = (message) => (providedComment !== undefined ? providedComment : window.prompt(message, ''));
    const timeDetail = row.timeSpent ? `${row.artist || 'Artist'} logged ${row.timeSpent} h${row.allocTime ? ` of ${row.allocTime} h` : ''}` : '';

    const sendBack = (toStage, message, counterField) => {
      const comment = askReason(message);
      if (comment === null) return false;
      commit(prev => {
        const fromRows = prev[stage][project] || [];
        let next;
        if (toStage === stage) {
          // Internal rework: archive this row and reopen it for the same artist.
          const duplicated = { ...carryOver(row), id: generateId(), type: 'rework', comments: comment, artist: row.artist || '' };
          next = replaceRows(prev, stage, project, [...fromRows.map(r => (r.id === id ? { ...r, status: 'Archived Rework' } : r)), duplicated]);
        } else {
          // As in the sheets: this row becomes "Sent to <stage>", and the asset's latest row upstream is archived
          // and reopened as a rework row carrying the feedback.
          const targetRows = prev[toStage][project] || [];
          let upstream = -1;
          for (let i = targetRows.length - 1; i >= 0; i--) {
            if (targetRows[i].tcn === row.tcn) { upstream = i; break; }
          }
          const source = upstream >= 0 ? targetRows[upstream] : row;
          const duplicated = { ...carryOver(source), id: generateId(), type: 'rework', comments: comment };
          next = replaceRows(prev, stage, project, fromRows.map(r => (r.id === id ? { ...r, status: `Sent to ${toStage}` } : r)));
          next = replaceRows(next, toStage, project, [
            ...targetRows.map((r, i) => (i === upstream ? { ...r, status: 'Archived Rework' } : r)),
            duplicated,
          ]);
        }
        const text = toStage === stage ? `Internal rework in ${stage}` : `Sent back from ${stage} to ${toStage}`;
        if (comment) next = withAssetComment(next, project, row.tcn, comment);
        return withEvents(next, project, [makeEvent(row.tcn, 'rework', toStage, text, { from: stage, comment })]);
      });
      incrementManagerRework(project, row.tcn, counterField);
      return true;
    };

    const split = () => {
      commit(prev => {
        const splitRow = { ...row, id: generateId(), tcn: row.tcn + '-', type: 'new', status: '', isSplit: true };
        const rows = (prev[stage][project] || []).map(r => r.id === id ? { ...r, status: 'Archived Split' } : r);
        return withEvents(replaceRows(prev, stage, project, [...rows, splitRow]), project, [
          makeEvent(row.tcn, 'split', stage, `Split in ${stage}`, { detail: `new sub-asset ${splitRow.tcn}` }),
        ]);
      });
    };

    const setStatus = (status, kind = 'status', text = `Status set to ${status}`) => {
      commit(prev => {
        const rows = (prev[stage][project] || []).map(r => r.id === id ? { ...r, status } : r);
        return withEvents(replaceRows(prev, stage, project, rows), project, [makeEvent(row.tcn, kind, stage, text)]);
      });
    };

    const advance = (toStage) => {
      const existsDownstream = (stateRef.current[toStage][project] || []).some(r => r.tcn === row.tcn);
      commit(prev => {
        const newRow = { ...carryOver(row), id: generateId(), type: existsDownstream ? 'rework' : 'new' };
        let next = replaceRows(prev, toStage, project, [...(prev[toStage][project] || []), newRow]);
        next = replaceRows(next, stage, project, (prev[stage][project] || []).map(r => r.id === id ? { ...r, status: `Sent to ${toStage}` } : r));
        return withEvents(next, project, [makeEvent(row.tcn, 'advance', toStage, `Sent to ${toStage}`, { detail: timeDetail })]);
      });
    };

    if (stage === 'Modelling') {
      if (newStatus === 'Done') {
        advance('Texturing');
      } else if (newStatus === 'Rework') {
        sendBack('Modelling', 'Rework Reason (Modelling):', 'modRework');
      } else if (newStatus === 'Split') {
        split();
      } else {
        setStatus(newStatus);
      }
    }

    else if (stage === 'Texturing') {
      if (newStatus === 'Done') {
        advance('Lighting');
        updateManagerField(project, row.tcn, 'textStatus', 'Done');
      } else if (newStatus === 'Rework (Modelling)') {
        if (sendBack('Modelling', 'Rework Reason for Modelling:', 'modRework')) {
          updateManagerField(project, row.tcn, 'textStatus', '');
        }
      } else if (newStatus === 'Rework (Texturing)') {
        sendBack('Texturing', 'Internal Texturing Rework Reason:', 'textRework');
      } else if (newStatus === 'Split') {
        split();
      } else {
        setStatus(newStatus);
      }
    }

    else if (stage === 'Lighting') {
      const today = todayISO();
      if (newStatus === 'Uploaded') {
        setStatus('Uploaded', 'uploaded', 'Uploaded for QA');
        updateManagerField(project, row.tcn, 'mainStatus', 'Uploaded');
        updateManagerField(project, row.tcn, 'uploadDate', today);
      } else if (newStatus === 'Approved') {
        setStatus('Approved', 'approved', 'Approved');
        updateManagerField(project, row.tcn, 'mainStatus', 'Approved');
        updateManagerField(project, row.tcn, 'approvedDate', today);
      } else if (newStatus === 'Rework (Modelling)') {
        if (sendBack('Modelling', 'Rework Reason for Modelling:', 'modRework')) {
          updateManagerField(project, row.tcn, 'mainStatus', '');
          updateManagerField(project, row.tcn, 'uploadDate', '');
          updateManagerField(project, row.tcn, 'textStatus', '');
        }
      } else if (newStatus === 'Rework (Texturing)') {
        if (sendBack('Texturing', 'Rework Reason for Texturing:', 'textRework')) {
          updateManagerField(project, row.tcn, 'mainStatus', '');
          updateManagerField(project, row.tcn, 'uploadDate', '');
        }
      } else if (newStatus === 'Rework (Lighting)') {
        if (sendBack('Lighting', 'Internal Lighting Rework Reason:', 'lightRework')) {
          updateManagerField(project, row.tcn, 'mainStatus', 'Rework');
          updateManagerField(project, row.tcn, 'uploadDate', '');
        }
      } else if (newStatus === 'Split') {
        split();
      } else {
        setStatus(newStatus);
      }
    }
  };

  const addProject = (projectName) => {
    if (!projectName || stateRef.current.Manager[projectName]) return;
    commit(prev => ({
      ...prev,
      Manager: { ...prev.Manager, [projectName]: [] },
      Modelling: { ...prev.Modelling, [projectName]: [] },
      Texturing: { ...prev.Texturing, [projectName]: [] },
      Lighting: { ...prev.Lighting, [projectName]: [] },
      events: { ...prev.events, [projectName]: [] },
    }));
  };

  const setArtistLog = (week, artist, field, value) => {
    commit(prev => {
      const weekLog = prev.artistLog?.[week] || {};
      return {
        ...prev,
        artistLog: {
          ...prev.artistLog,
          [week]: { ...weekLog, [artist]: { ...weekLog[artist], [field]: value } },
        },
      };
    });
  };

  const addArtist = ({ name, stages, email = '', role = 'Artist', startDate = todayISO() }) => {
    const clean = name.trim();
    if (!clean || (stateRef.current.artists || []).some(a => a.name.toLowerCase() === clean.toLowerCase())) return false;
    commit(prev => ({ ...prev, artists: [...(prev.artists || []), newMember(clean, stages, { email: email.trim(), role, startDate })] }));
    notify(`${clean} added to the team`);
    return true;
  };

  const updateArtist = (id, changes) => {
    commit(prev => ({ ...prev, artists: prev.artists.map(a => (a.id === id ? { ...a, ...changes } : a)) }));
  };

  // Renaming also updates every row and weekly entry that uses the old name, so history stays attached.
  const renameArtist = (id, nextName) => {
    const clean = nextName.trim();
    const member = stateRef.current.artists.find(a => a.id === id);
    if (!member || !clean || clean === member.name) return false;
    if (stateRef.current.artists.some(a => a.id !== id && a.name.toLowerCase() === clean.toLowerCase())) return false;
    const from = member.name;
    commit(prev => {
      const next = { ...prev, artists: prev.artists.map(a => (a.id === id ? { ...a, name: clean } : a)) };
      for (const stage of STAGES) {
        next[stage] = Object.fromEntries(Object.entries(prev[stage] || {}).map(([project, rows]) => [
          project, rows.map(r => (r.artist === from ? { ...r, artist: clean } : r)),
        ]));
      }
      next.Manager = Object.fromEntries(Object.entries(prev.Manager || {}).map(([project, rows]) => [
        project,
        rows.map(r => {
          const updated = { ...r };
          for (const field of Object.keys(MANAGER_ARTIST_FIELDS)) if (updated[field] === from) updated[field] = clean;
          return updated;
        }),
      ]));
      next.artistLog = Object.fromEntries(Object.entries(prev.artistLog || {}).map(([week, entries]) => {
        if (!entries[from]) return [week, entries];
        const { [from]: moved, ...rest } = entries;
        return [week, { ...rest, [clean]: moved }];
      }));
      return next;
    });
    notify(`Renamed ${from} to ${clean} everywhere`);
    return true;
  };

  const removeArtist = (id) => {
    commit(prev => ({ ...prev, artists: prev.artists.filter(a => a.id !== id) }));
  };

  const resetDemo = () => {
    commit(prev => withRoster(withDemoProject(prev, { replace: true })));
    notify('Demo data regenerated around today’s date');
  };

  const projects = data ? Object.keys(data.Manager) : [];

  return (
    <PipelineContext.Provider value={{ data, projects, notice, notify, loadState, syncStatus, retryLoad, updateRow, dispatchToModelling, handleStatusChange, addAsset, nextAssetNumber, findAsset, addProject, addComment, resetDemo, setArtistLog, addArtist, updateArtist, renameArtist, removeArtist, setAssetComment }}>
      {children}
    </PipelineContext.Provider>
  );
};

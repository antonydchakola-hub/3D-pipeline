import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { STAGES, formatDate, todayISO } from './pipelineModel';
import { withDemoProject } from './mockData';

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

const withEvents = (state, project, events) => ({
  ...state,
  events: { ...state.events, [project]: [...(state.events?.[project] || []), ...events] },
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

const loadInitial = () => {
  const saved = localStorage.getItem('pipelineData');
  try {
    return withRoster(withDemoProject(saved ? { ...initialData, ...JSON.parse(saved) } : initialData));
  } catch {
    return withRoster(withDemoProject(initialData));
  }
};

export const PipelineProvider = ({ children }) => {
  const [data, setData] = useState(loadInitial);
  const [notice, setNotice] = useState(null);
  const noticeTimer = useRef(null);

  useEffect(() => {
    localStorage.setItem('pipelineData', JSON.stringify(data));
  }, [data]);

  const notify = (text) => {
    clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = setTimeout(() => setNotice(null), 3200);
  };

  const updateManagerField = (project, tcn, field, value) => {
    setData(prev => {
      const projData = prev.Manager[project] || [];
      const newData = projData.map(row =>
        row.tcin === tcn ? { ...row, [field]: value } : row
      );
      return { ...prev, Manager: { ...prev.Manager, [project]: newData } };
    });
  };

  const incrementManagerRework = (project, tcn, field) => {
    setData(prev => {
      const projData = prev.Manager[project] || [];
      const newData = projData.map(row =>
        row.tcin === tcn ? { ...row, [field]: (row[field] || 0) + 1 } : row
      );
      return { ...prev, Manager: { ...prev.Manager, [project]: newData } };
    });
  };

  const dispatchToModelling = (project) => {
    const checkedRows = (data.Manager[project] || []).filter(row => row.checked && row.tcin);
    if (checkedRows.length === 0) return;

    setData(prev => {
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
    const projData = data.Manager[project] || [];
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
    return (data.Manager[project] || []).find(r => String(r.tcin || '').trim().toLowerCase() === clean);
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
    setData(prev => {
      const next = { ...prev, Manager: { ...prev.Manager, [project]: [...(prev.Manager[project] || []), newRow] } };
      return comment?.trim() ? withAssetComment(next, project, cleanTcin, comment.trim()) : next;
    });
    notify(`${cleanTcin} added to ${project}`);
    return { id: newRow.id };
  };
  const updateRow = (stage, project, id, field, value) => {
    setData(prev => {
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
    setData(prev => withAssetComment(prev, project, tcn, text));
  };

  const addComment = (project, tcn, stage, comment) => {
    setData(prev => withEvents(prev, project, [makeEvent(tcn, 'comment', stage, 'Comment', { comment })]));
  };

  // `providedComment` lets callers with their own feedback field skip the browser prompt.
  const handleStatusChange = (stage, project, id, newStatus, providedComment) => {
    const row = data[stage][project]?.find(r => r.id === id);
    if (!row) return;

    const askReason = (message) => (providedComment !== undefined ? providedComment : window.prompt(message, ''));
    const timeDetail = row.timeSpent ? `${row.artist || 'Artist'} logged ${row.timeSpent} h${row.allocTime ? ` of ${row.allocTime} h` : ''}` : '';

    const sendBack = (toStage, message, counterField) => {
      const comment = askReason(message);
      if (comment === null) return false;
      setData(prev => {
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
      setData(prev => {
        const splitRow = { ...row, id: generateId(), tcn: row.tcn + '-', type: 'new', status: '', isSplit: true };
        const rows = (prev[stage][project] || []).map(r => r.id === id ? { ...r, status: 'Archived Split' } : r);
        return withEvents(replaceRows(prev, stage, project, [...rows, splitRow]), project, [
          makeEvent(row.tcn, 'split', stage, `Split in ${stage}`, { detail: `new sub-asset ${splitRow.tcn}` }),
        ]);
      });
    };

    const setStatus = (status, kind = 'status', text = `Status set to ${status}`) => {
      setData(prev => {
        const rows = (prev[stage][project] || []).map(r => r.id === id ? { ...r, status } : r);
        return withEvents(replaceRows(prev, stage, project, rows), project, [makeEvent(row.tcn, kind, stage, text)]);
      });
    };

    const advance = (toStage) => {
      const existsDownstream = (data[toStage][project] || []).some(r => r.tcn === row.tcn);
      setData(prev => {
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
    if (!projectName || data.Manager[projectName]) return;
    setData(prev => ({
      ...prev,
      Manager: { ...prev.Manager, [projectName]: [] },
      Modelling: { ...prev.Modelling, [projectName]: [] },
      Texturing: { ...prev.Texturing, [projectName]: [] },
      Lighting: { ...prev.Lighting, [projectName]: [] },
      events: { ...prev.events, [projectName]: [] },
    }));
  };

  const setArtistLog = (week, artist, field, value) => {
    setData(prev => {
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

  const addArtist = ({ name, stages, email = '', role = 'Artist' }) => {
    const clean = name.trim();
    if (!clean || (data.artists || []).some(a => a.name.toLowerCase() === clean.toLowerCase())) return false;
    setData(prev => ({ ...prev, artists: [...(prev.artists || []), newMember(clean, stages, { email: email.trim(), role })] }));
    notify(`${clean} added to the team`);
    return true;
  };

  const updateArtist = (id, changes) => {
    setData(prev => ({ ...prev, artists: prev.artists.map(a => (a.id === id ? { ...a, ...changes } : a)) }));
  };

  // Renaming also updates every row and weekly entry that uses the old name, so history stays attached.
  const renameArtist = (id, nextName) => {
    const clean = nextName.trim();
    const member = data.artists.find(a => a.id === id);
    if (!member || !clean || clean === member.name) return false;
    if (data.artists.some(a => a.id !== id && a.name.toLowerCase() === clean.toLowerCase())) return false;
    const from = member.name;
    setData(prev => {
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
    setData(prev => ({ ...prev, artists: prev.artists.filter(a => a.id !== id) }));
  };

  const resetDemo = () => {
    setData(prev => withRoster(withDemoProject(prev, { replace: true })));
    notify('Demo data regenerated around today’s date');
  };

  const projects = Object.keys(data.Manager);

  return (
    <PipelineContext.Provider value={{ data, projects, notice, updateRow, dispatchToModelling, handleStatusChange, addAsset, nextAssetNumber, findAsset, addProject, addComment, resetDemo, setArtistLog, addArtist, updateArtist, renameArtist, removeArtist, setAssetComment }}>
      {children}
    </PipelineContext.Provider>
  );
};

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
};

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

export const PipelineProvider = ({ children }) => {
  const [data, setData] = useState(() => {
    const saved = localStorage.getItem('pipelineData');
    if (!saved) return withDemoProject(initialData);
    try {
      return withDemoProject({ ...initialData, ...JSON.parse(saved) });
    } catch {
      return withDemoProject(initialData);
    }
  });
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

  const addManagerRow = (project) => {
    setData(prev => {
      const projData = prev.Manager[project] || [];

      let nextNo = '1';
      if (projData.length > 0) {
        const lastNo = String(projData[projData.length - 1].no).trim();
        const parsed = parseInt(lastNo, 10);

        if (!isNaN(parsed) && String(parsed) === lastNo) {
          nextNo = String(parsed + 1);
        } else {
          const match = lastNo.match(/^(.*?)(\d+)$/);
          if (match) {
            nextNo = match[1] + (parseInt(match[2], 10) + 1);
          } else {
            nextNo = lastNo ? `${lastNo}-new` : '1';
          }
        }
      }

      const newRow = {
        id: generateId(),
        checked: false,
        no: nextNo,
        tcin: '',
        priority: '',
        allotDate: '',
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
        lightRework: 0
      };
      return { ...prev, Manager: { ...prev.Manager, [project]: [...projData, newRow] } };
    });
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
        const duplicated = { ...carryOver(row), id: generateId(), type: 'rework', comments: comment };
        const archived = (prev[stage][project] || []).map(r => r.id === id ? { ...r, status: 'Archived Rework' } : r);
        let next;
        if (toStage === stage) {
          next = replaceRows(prev, stage, project, [...archived, duplicated]);
        } else {
          next = replaceRows(prev, stage, project, archived);
          next = replaceRows(next, toStage, project, [...(prev[toStage][project] || []), duplicated]);
        }
        const text = toStage === stage ? `Internal rework in ${stage}` : `Sent back from ${stage} to ${toStage}`;
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

  const resetDemo = () => {
    setData(prev => withDemoProject(prev, { replace: true }));
    notify('Demo data regenerated around today’s date');
  };

  const projects = Object.keys(data.Manager);

  return (
    <PipelineContext.Provider value={{ data, projects, notice, updateRow, dispatchToModelling, handleStatusChange, addManagerRow, addProject, addComment, resetDemo, setArtistLog }}>
      {children}
    </PipelineContext.Provider>
  );
};

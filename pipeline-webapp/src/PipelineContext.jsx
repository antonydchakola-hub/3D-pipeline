import React, { createContext, useContext, useState, useEffect } from 'react';

const PipelineContext = createContext();

export const usePipeline = () => useContext(PipelineContext);

const generateId = () => Math.random().toString(36).substr(2, 9);

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
};

export const PipelineProvider = ({ children }) => {
  const [data, setData] = useState(() => {
    const saved = localStorage.getItem('pipelineData');
    return saved ? JSON.parse(saved) : initialData;
  });

  useEffect(() => {
    localStorage.setItem('pipelineData', JSON.stringify(data));
  }, [data]);

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
    setData(prev => {
      const mgrData = prev.Manager[project] || [];
      const checkedRows = mgrData.filter(row => row.checked);
      if (checkedRows.length === 0) return prev;

      const newModRows = checkedRows.map(row => ({
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

      return {
        ...prev,
        Manager: { ...prev.Manager, [project]: newMgrData },
        Modelling: { ...prev.Modelling, [project]: [...existingMod, ...newModRows] }
      };
    });
    alert("Dispatch complete. Selected rows appended to Modelling.");
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
      const newData = stageData.map(row => row.id === id ? { ...row, [field]: value } : row);
      return { ...prev, [stage]: { ...prev[stage], [project]: newData } };
    });
  };

  const handleStatusChange = (stage, project, id, newStatus) => {
    const row = data[stage][project]?.find(r => r.id === id);
    if (!row) return;

    if (stage === 'Modelling') {
      if (newStatus === 'Done') {
        // Check if exists in Texturing
        const existsInTex = (data.Texturing[project] || []).some(r => r.tcn === row.tcn);
        const nextType = existsInTex ? 'rework' : 'new';
        
        setData(prev => {
          const newTexRow = { ...row, id: generateId(), type: nextType, status: '' };
          const texData = [...(prev.Texturing[project] || []), newTexRow];
          const modData = prev.Modelling[project].map(r => r.id === id ? { ...r, status: 'Sent to Texturing' } : r);
          return { ...prev, Modelling: { ...prev.Modelling, [project]: modData }, Texturing: { ...prev.Texturing, [project]: texData } };
        });
      } else if (newStatus === 'Rework') {
        const comment = window.prompt("Rework Reason (Modelling):", "");
        if (comment === null) return; // cancelled
        setData(prev => {
          const duplicated = { ...row, id: generateId(), type: 'rework', comments: comment, status: '' };
          const modData = prev.Modelling[project].map(r => r.id === id ? { ...r, status: 'Archived Rework' } : r);
          modData.push(duplicated);
          return { ...prev, Modelling: { ...prev.Modelling, [project]: modData } };
        });
        incrementManagerRework(project, row.tcn, 'modRework');
      } else if (newStatus === 'Split') {
        setData(prev => {
          const splitRow = { ...row, id: generateId(), tcn: row.tcn + '-', type: 'new', status: '', isSplit: true };
          const modData = prev.Modelling[project].map(r => r.id === id ? { ...r, status: 'Archived Split' } : r);
          modData.push(splitRow);
          return { ...prev, Modelling: { ...prev.Modelling, [project]: modData } };
        });
      } else {
        updateRow(stage, project, id, 'status', newStatus);
      }
    } 
    
    else if (stage === 'Texturing') {
      if (newStatus === 'Done') {
        const existsInLight = (data.Lighting[project] || []).some(r => r.tcn === row.tcn);
        const nextType = existsInLight ? 'rework' : 'new';
        
        setData(prev => {
          const newLightRow = { ...row, id: generateId(), type: nextType, status: '' };
          const lightData = [...(prev.Lighting[project] || []), newLightRow];
          const texData = prev.Texturing[project].map(r => r.id === id ? { ...r, status: 'Sent to Lighting' } : r);
          return { ...prev, Texturing: { ...prev.Texturing, [project]: texData }, Lighting: { ...prev.Lighting, [project]: lightData } };
        });
        updateManagerField(project, row.tcn, 'textStatus', 'Done');
      } else if (newStatus === 'Rework (Modelling)') {
        const comment = window.prompt("Rework Reason for Modelling:", "");
        if (comment === null) return;
        setData(prev => {
          const duplicated = { ...row, id: generateId(), type: 'rework', comments: comment, status: '' };
          const modData = [...(prev.Modelling[project] || []), duplicated];
          const texData = prev.Texturing[project].map(r => r.id === id ? { ...r, status: 'Archived Rework' } : r);
          return { ...prev, Texturing: { ...prev.Texturing, [project]: texData }, Modelling: { ...prev.Modelling, [project]: modData } };
        });
        incrementManagerRework(project, row.tcn, 'modRework');
        updateManagerField(project, row.tcn, 'textStatus', '');
      } else if (newStatus === 'Rework (Texturing)') {
        const comment = window.prompt("Internal Texturing Rework Reason:", "");
        if (comment === null) return;
        setData(prev => {
          const duplicated = { ...row, id: generateId(), type: 'rework', comments: comment, status: '' };
          const texData = prev.Texturing[project].map(r => r.id === id ? { ...r, status: 'Archived Rework' } : r);
          texData.push(duplicated);
          return { ...prev, Texturing: { ...prev.Texturing, [project]: texData } };
        });
        incrementManagerRework(project, row.tcn, 'textRework');
      } else if (newStatus === 'Split') {
        setData(prev => {
          const splitRow = { ...row, id: generateId(), tcn: row.tcn + '-', type: 'new', status: '', isSplit: true };
          const texData = prev.Texturing[project].map(r => r.id === id ? { ...r, status: 'Archived Split' } : r);
          texData.push(splitRow);
          return { ...prev, Texturing: { ...prev.Texturing, [project]: texData } };
        });
      } else {
        updateRow(stage, project, id, 'status', newStatus);
      }
    }
    
    else if (stage === 'Lighting') {
      const today = new Date().toISOString().split('T')[0];
      if (newStatus === 'Uploaded') {
        updateRow(stage, project, id, 'status', 'Uploaded');
        updateManagerField(project, row.tcn, 'mainStatus', 'Uploaded');
        updateManagerField(project, row.tcn, 'uploadDate', today);
      } else if (newStatus === 'Approved') {
        updateRow(stage, project, id, 'status', 'Approved');
        updateManagerField(project, row.tcn, 'mainStatus', 'Approved');
        updateManagerField(project, row.tcn, 'approvedDate', today);
      } else if (newStatus === 'Rework (Modelling)') {
        const comment = window.prompt("Rework Reason for Modelling:", "");
        if (comment === null) return;
        setData(prev => {
          const duplicated = { ...row, id: generateId(), type: 'rework', comments: comment, status: '' };
          const modData = [...(prev.Modelling[project] || []), duplicated];
          const lightData = prev.Lighting[project].map(r => r.id === id ? { ...r, status: 'Archived Rework' } : r);
          return { ...prev, Lighting: { ...prev.Lighting, [project]: lightData }, Modelling: { ...prev.Modelling, [project]: modData } };
        });
        incrementManagerRework(project, row.tcn, 'modRework');
        updateManagerField(project, row.tcn, 'mainStatus', '');
        updateManagerField(project, row.tcn, 'uploadDate', '');
        updateManagerField(project, row.tcn, 'textStatus', '');
      } else if (newStatus === 'Rework (Texturing)') {
        const comment = window.prompt("Rework Reason for Texturing:", "");
        if (comment === null) return;
        setData(prev => {
          const duplicated = { ...row, id: generateId(), type: 'rework', comments: comment, status: '' };
          const texData = [...(prev.Texturing[project] || []), duplicated];
          const lightData = prev.Lighting[project].map(r => r.id === id ? { ...r, status: 'Archived Rework' } : r);
          return { ...prev, Lighting: { ...prev.Lighting, [project]: lightData }, Texturing: { ...prev.Texturing, [project]: texData } };
        });
        incrementManagerRework(project, row.tcn, 'textRework');
        updateManagerField(project, row.tcn, 'mainStatus', '');
        updateManagerField(project, row.tcn, 'uploadDate', '');
      } else if (newStatus === 'Rework (Lighting)') {
        const comment = window.prompt("Internal Lighting Rework Reason:", "");
        if (comment === null) return;
        setData(prev => {
          const duplicated = { ...row, id: generateId(), type: 'rework', comments: comment, status: '' };
          const lightData = prev.Lighting[project].map(r => r.id === id ? { ...r, status: 'Archived Rework' } : r);
          lightData.push(duplicated);
          return { ...prev, Lighting: { ...prev.Lighting, [project]: lightData } };
        });
        incrementManagerRework(project, row.tcn, 'lightRework');
        updateManagerField(project, row.tcn, 'mainStatus', 'Rework');
        updateManagerField(project, row.tcn, 'uploadDate', '');
      } else if (newStatus === 'Split') {
        setData(prev => {
          const splitRow = { ...row, id: generateId(), tcn: row.tcn + '-', type: 'new', status: '', isSplit: true };
          const lightData = prev.Lighting[project].map(r => r.id === id ? { ...r, status: 'Archived Split' } : r);
          lightData.push(splitRow);
          return { ...prev, Lighting: { ...prev.Lighting, [project]: lightData } };
        });
      } else {
        updateRow(stage, project, id, 'status', newStatus);
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
      Lighting: { ...prev.Lighting, [projectName]: [] }
    }));
  };

  const projects = Object.keys(data.Manager);

  return (
    <PipelineContext.Provider value={{ data, projects, updateRow, dispatchToModelling, handleStatusChange, addManagerRow, addProject }}>
      {children}
    </PipelineContext.Provider>
  );
};

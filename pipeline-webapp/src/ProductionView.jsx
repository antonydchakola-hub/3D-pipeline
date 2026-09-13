import React from 'react';
import DropdownCell from './DropdownCell';
import { usePipeline } from './PipelineContext';

const typeOptions = ['new', 'rework'];
const priorityOptions = ['High Priority', 'Medium Priority', 'Low Priority'];
const complexityOptions = ['Very Simple', 'Simple', 'Medium', 'Hard', 'Very Hard'];
const artistOptions = ['Test', 'Artist A', 'Artist B'];
// Status options change based on the stage
const getStatusOptions = (stage) => {
  const MOD_STATUSES = [
    'Done', 'Rework', 'Split', 'Split Done'
  ];
  const TEX_STATUSES = [
    'Done', 'Rework (Modelling)', 'Rework (Texturing)', 'Split', 'Split Done'
  ];
  const LIGHT_STATUSES = [
    'Uploaded', 'Approved', 'Rework (Modelling)', 'Rework (Texturing)', 'Rework (Lighting)', 'Split', 'Split Done'
  ];
  if (stage === 'Modelling') return MOD_STATUSES;
  if (stage === 'Texturing') return TEX_STATUSES;
  if (stage === 'Lighting') return LIGHT_STATUSES;
  return [];
};

const ProductionView = ({ stageName, activeProject }) => {
  const { data, updateRow, handleStatusChange } = usePipeline();
  const projectData = data[stageName][activeProject] || [];
  
  const statusOptions = getStatusOptions(stageName);

  return (
    <div className="table-wrapper">
      <div className="stage-header">
        <h2>{stageName} Stage - {activeProject}</h2>
      </div>
      <table className="pipeline-table">
        <thead>
          <tr>
            <th>No</th>
            <th>TCN</th>
            <th>Comments</th>
            <th>Type</th>
            <th>Priority</th>
            <th>Complexity</th>
            <th>Allotment Date</th>
            <th>Due Date</th>
            <th>Artist</th>
            <th>Status</th>
            <th>Allocated Time</th>
            <th>Time Spent</th>
            <th>Rework Time</th>
          </tr>
        </thead>
        <tbody>
          {projectData.length === 0 ? (
            <tr><td colSpan="13" style={{textAlign:'center', padding: '2rem', color: '#718096'}}>No assets in this project.</td></tr>
          ) : (
            projectData.map((row) => {
              const isArchived = row.status && row.status === 'Archived Rework';
              const rowStyle = isArchived ? { opacity: 0.5, backgroundColor: '#f7fafc' } : {};
              
              return (
                <tr key={row.id} style={rowStyle}>
                  <td style={{ fontWeight: row.no ? 'bold' : 'normal', color: '#4a5568' }}>{row.no}</td>
                  <td><input type="text" value={row.tcn || ''} onChange={(e) => updateRow(stageName, activeProject, row.id, 'tcn', e.target.value)} className="table-input" disabled={isArchived || !row.isSplit} style={{ fontFamily: 'monospace', fontSize: '0.95rem', cursor: (isArchived || !row.isSplit) ? 'not-allowed' : 'text' }} /></td>
                  <td><input type="text" value={row.comments || ''} onChange={(e) => updateRow(stageName, activeProject, row.id, 'comments', e.target.value)} className="table-input" disabled={isArchived} /></td>
                  <td><DropdownCell options={typeOptions} value={row.type} onChange={(v) => updateRow(stageName, activeProject, row.id, 'type', v)} /></td>
                  <td><DropdownCell options={priorityOptions} value={row.priority} onChange={(v) => updateRow(stageName, activeProject, row.id, 'priority', v)} /></td>
                  <td><DropdownCell options={complexityOptions} value={row.complexity} onChange={(v) => updateRow(stageName, activeProject, row.id, 'complexity', v)} /></td>
                  <td><input type="date" value={row.allotDate || ''} onChange={(e) => updateRow(stageName, activeProject, row.id, 'allotDate', e.target.value)} className="table-input date-input" disabled={isArchived} /></td>
                  <td><input type="date" value={row.dueDate || ''} onChange={(e) => updateRow(stageName, activeProject, row.id, 'dueDate', e.target.value)} className="table-input date-input" disabled={isArchived} /></td>
                  <td><DropdownCell options={artistOptions} value={row.artist} onChange={(v) => updateRow(stageName, activeProject, row.id, 'artist', v)} /></td>
                  <td>
                    {isArchived ? (
                      <span className="archived-status">{row.status}</span>
                    ) : (
                      <DropdownCell options={statusOptions} value={row.status} onChange={(v) => handleStatusChange(stageName, activeProject, row.id, v)} />
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}><input type="text" value={row.allocTime || ''} onChange={(e) => updateRow(stageName, activeProject, row.id, 'allocTime', e.target.value)} className="table-input num-input" disabled={isArchived} /></td>
                  <td style={{ textAlign: 'center' }}><input type="text" value={row.timeSpent || ''} onChange={(e) => updateRow(stageName, activeProject, row.id, 'timeSpent', e.target.value)} className="table-input num-input" disabled={isArchived} /></td>
                  <td style={{ textAlign: 'center' }}><input type="text" value={row.reworkTime || ''} onChange={(e) => updateRow(stageName, activeProject, row.id, 'reworkTime', e.target.value)} className="table-input num-input" disabled={isArchived} /></td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

export default ProductionView;

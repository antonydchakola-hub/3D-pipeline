import React from 'react';
import DropdownCell from './DropdownCell';
import { usePipeline } from './PipelineContext';
const priorityOptions = ['High Priority', 'Medium Priority', 'Low Priority'];
const modStatusOptions = ['Done', 'Rework', 'Split'];
const textStatusOptions = ['Done', 'Rework', 'Split'];
const mainStatusOptions = ['Uploaded', 'Approved', 'Rework'];
const artistOptions = ['Test', 'Artist A', 'Artist B'];

const ManagerView = ({ activeProject }) => {
  const { data, updateRow, dispatchToModelling, addManagerRow } = usePipeline();
  const projectData = data.Manager[activeProject] || [];

  const isRowDispatched = (tcin) => {
    if (!tcin) return false;
    const inMod = data.Modelling[activeProject]?.some(r => r.tcn === tcin);
    const inTex = data.Texturing[activeProject]?.some(r => r.tcn === tcin);
    const inLight = data.Lighting[activeProject]?.some(r => r.tcn === tcin);
    return inMod || inTex || inLight;
  };

  return (
    <div className="table-wrapper">
      <div className="stage-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Manager Stage - {activeProject}</h2>
        <div>
          <button 
            className="dispatch-button"
            onClick={() => addManagerRow(activeProject)}
            style={{ marginRight: '10px', background: 'linear-gradient(135deg, #48bb78 0%, #2f855a 100%)' }}
          >
            + Add Row
          </button>
          <button 
            className="dispatch-button"
            onClick={() => dispatchToModelling(activeProject)}
          >
            Push SELECTED Rows to Modeling
          </button>
        </div>
      </div>
      <table className="pipeline-table">
        <thead>
          <tr>
            <th>Dispatch</th>
            <th>No</th>
            <th>TCIN</th>
            <th>Priority</th>
            <th>Allotted Date</th>
            <th>Mod Artist</th>
            <th>Mod Status</th>
            <th>Text Artist</th>
            <th>Text Status</th>
            <th>QA Artist</th>
            <th>Upload Date</th>
            <th>Main Status</th>
            <th>Approved Date</th>
            <th>Mod RW</th>
            <th>Text RW</th>
            <th>Light RW</th>
          </tr>
        </thead>
        <tbody>
          {projectData.length === 0 ? (
            <tr><td colSpan="16" style={{textAlign:'center', padding: '2rem', color: '#718096'}}>No assets in this project.</td></tr>
          ) : (
            projectData.map((row) => {
              const dispatched = isRowDispatched(row.tcin);
              return (
              <tr key={row.id}>
                <td style={{ textAlign: 'center' }}>
                  <input 
                    type="checkbox" 
                    checked={row.checked || false} 
                    disabled={dispatched}
                    onChange={(e) => updateRow('Manager', activeProject, row.id, 'checked', e.target.checked)} 
                    title={dispatched ? "Already dispatched to Modelling" : ""}
                  />
                </td>
                <td style={{ fontWeight: 'bold' }}>
                  <input type="text" value={row.no || ''} onChange={(e) => updateRow('Manager', activeProject, row.id, 'no', e.target.value)} className="table-input num-input" />
                </td>
                <td style={{ fontFamily: 'monospace' }}>
                  <input type="text" value={row.tcin || ''} onChange={(e) => updateRow('Manager', activeProject, row.id, 'tcin', e.target.value)} className="table-input" />
                </td>
                <td><DropdownCell options={priorityOptions} value={row.priority} onChange={(v) => updateRow('Manager', activeProject, row.id, 'priority', v)} /></td>
                <td><input type="text" value={row.allotDate || ''} onChange={(e) => updateRow('Manager', activeProject, row.id, 'allotDate', e.target.value)} className="table-input date-input" /></td>
                <td><DropdownCell options={artistOptions} value={row.modArtist} onChange={(v) => updateRow('Manager', activeProject, row.id, 'modArtist', v)} /></td>
                <td><DropdownCell options={modStatusOptions} value={row.modStatus} onChange={(v) => updateRow('Manager', activeProject, row.id, 'modStatus', v)} /></td>
                <td><DropdownCell options={artistOptions} value={row.textArtist} onChange={(v) => updateRow('Manager', activeProject, row.id, 'textArtist', v)} /></td>
                <td><DropdownCell options={textStatusOptions} value={row.textStatus} onChange={(v) => updateRow('Manager', activeProject, row.id, 'textStatus', v)} /></td>
                <td><DropdownCell options={artistOptions} value={row.qaArtist} onChange={(v) => updateRow('Manager', activeProject, row.id, 'qaArtist', v)} /></td>
                <td><input type="text" value={row.uploadDate || ''} onChange={(e) => updateRow('Manager', activeProject, row.id, 'uploadDate', e.target.value)} className="table-input date-input" /></td>
                <td><DropdownCell options={mainStatusOptions} value={row.mainStatus} onChange={(v) => updateRow('Manager', activeProject, row.id, 'mainStatus', v)} /></td>
                <td><input type="text" value={row.approvedDate || ''} onChange={(e) => updateRow('Manager', activeProject, row.id, 'approvedDate', e.target.value)} className="table-input date-input" /></td>
                <td style={{ textAlign: 'center' }}>{row.modRework}</td>
                <td style={{ textAlign: 'center' }}>{row.textRework}</td>
                <td style={{ textAlign: 'center' }}>{row.lightRework}</td>
              </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

export default ManagerView;

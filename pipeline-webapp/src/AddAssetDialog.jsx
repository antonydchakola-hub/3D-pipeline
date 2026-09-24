import React, { useEffect, useRef, useState } from 'react';
import { usePipeline } from './PipelineContext';
import { Icon } from './ui';
import { PRIORITIES, priorityShort, priorityTone, todayISO } from './pipelineModel';

const AddAssetDialog = ({ project, onClose, onAdded }) => {
  const { addAsset, nextAssetNumber, findAsset } = usePipeline();
  const [tcin, setTcin] = useState('');
  const [no, setNo] = useState('');
  const [noTouched, setNoTouched] = useState(false);
  const [priority, setPriority] = useState('Medium Priority');
  const [allotDate, setAllotDate] = useState(todayISO());
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [added, setAdded] = useState([]);
  const tcinRef = useRef(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    tcinRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const suggestedNo = nextAssetNumber(project);
  const numberValue = noTouched ? no : suggestedNo;
  const duplicate = tcin.trim() ? findAsset(project, tcin) : null;

  const submit = (addAnother) => {
    const result = addAsset(project, { tcin, no: numberValue, priority, allotDate, comment });
    if (result.error) {
      setError(result.error);
      tcinRef.current?.focus();
      return;
    }
    onAdded(result.id);
    if (addAnother) {
      setAdded((list) => [...list, tcin.trim()]);
      setTcin('');
      setComment('');
      setNoTouched(false);
      setError('');
      tcinRef.current?.focus();
    } else {
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form
        className="modal add-asset"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-asset-title"
        onSubmit={(e) => { e.preventDefault(); submit(false); }}
      >
        <header className="modal-head">
          <div>
            <h2 id="add-asset-title">Add asset</h2>
            <p className="modal-sub">Goes into the Manager queue for <strong>{project}</strong>. Tick it there to dispatch it to Modelling.</p>
          </div>
          <div className="spacer" />
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={16} stroke={2} /></button>
        </header>

        <div className="form-body">
          <div className="form-row two">
            <label className="form-field">
              <span className="form-label">TCIN <span className="required">required</span></span>
              <input
                ref={tcinRef}
                className={`field mono${error || duplicate ? ' has-error' : ''}`}
                value={tcin}
                onChange={(e) => { setTcin(e.target.value); setError(''); }}
                placeholder="e.g. 95054120"
                inputMode="numeric"
                autoComplete="off"
              />
              {error ? <span className="field-error">{error}</span>
                : duplicate ? <span className="field-error">{duplicate.tcin} is already in {project} (row {duplicate.no}).</span>
                  : <span className="field-hint">The item number from the client sheet.</span>}
            </label>
            <label className="form-field narrow">
              <span className="form-label">No</span>
              <input className="field mono" value={numberValue} onChange={(e) => { setNo(e.target.value); setNoTouched(true); }} />
              <span className="field-hint">Next free number.</span>
            </label>
          </div>

          <div className="form-row two">
            <div className="form-field">
              <span className="form-label" id="priority-label">Priority</span>
              <div className="choice-group" role="radiogroup" aria-labelledby="priority-label">
                {PRIORITIES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={priority === p}
                    className={`choice tone-${priorityTone(p)}${priority === p ? ' is-on' : ''}`}
                    onClick={() => setPriority(p)}
                  >
                    {priorityShort(p)}
                  </button>
                ))}
              </div>
            </div>
            <label className="form-field narrow">
              <span className="form-label">Allotted date</span>
              <input className="field mono" type="date" value={allotDate} onChange={(e) => setAllotDate(e.target.value)} />
            </label>
          </div>

          <label className="form-field">
            <span className="form-label">Comment <span className="optional">optional</span></span>
            <textarea className="field textarea" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Anything every stage should know about this asset" />
          </label>

          {added.length > 0 && (
            <p className="added-list"><Icon name="check" size={13} stroke={2.6} />Added {added.join(', ')}</p>
          )}
        </div>

        <footer className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <div className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={() => submit(true)} disabled={!tcin.trim() || !!duplicate}>Add &amp; add another</button>
          <button type="submit" className="btn btn-brand" disabled={!tcin.trim() || !!duplicate}><Icon name="plus" size={14} stroke={2.2} />Add asset</button>
        </footer>
      </form>
    </div>
  );
};

export default AddAssetDialog;

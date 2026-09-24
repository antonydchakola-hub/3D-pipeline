import React, { useEffect, useRef, useState } from 'react';
import { usePipeline } from './PipelineContext';
import { Avatar, Icon } from './ui';
import { ROLES, STAGES, STAGE_TONE, artistUsage, matchesQuery } from './pipelineModel';

const StageToggles = ({ value, onChange, label }) => (
  <div className="stage-toggles" role="group" aria-label={label}>
    {STAGES.map((stage) => {
      const on = value.includes(stage);
      return (
        <button
          key={stage}
          type="button"
          className={`stage-toggle tone-${STAGE_TONE[stage]}${on ? ' is-on' : ''}`}
          aria-pressed={on}
          onClick={() => onChange(on ? value.filter((s) => s !== stage) : [...value, stage])}
        >
          {on && <Icon name="check" size={11} stroke={3} />}
          {stage}
        </button>
      );
    })}
  </div>
);

const MemberRow = ({ member }) => {
  const { data, updateArtist, renameArtist, removeArtist } = usePipeline();
  const [name, setName] = useState(member.name);
  const [nameError, setNameError] = useState('');
  const usage = artistUsage(data, member.name);
  const inactive = member.active === false;

  const commitName = () => {
    const clean = name.trim();
    if (clean === member.name) { setNameError(''); return; }
    if (!clean) { setName(member.name); setNameError(''); return; }
    if (renameArtist(member.id, clean)) setNameError('');
    else setNameError('Another artist already has this name');
  };

  return (
    <div className={`member${inactive ? ' is-inactive' : ''}`}>
      <Avatar name={member.name} size={28} />
      <div className="member-name">
        <input
          className={`field${nameError ? ' has-error' : ''}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape' && name !== member.name) { e.preventDefault(); setName(member.name); setNameError(''); }
          }}
          aria-label={`Name of ${member.name}`}
        />
        {nameError ? <span className="field-error">{nameError}</span> : <span className="member-meta">{usage ? `${usage} row${usage === 1 ? '' : 's'} assigned` : 'no work assigned yet'}</span>}
      </div>
      <StageToggles value={member.stages || []} onChange={(stages) => updateArtist(member.id, { stages })} label={`Stages for ${member.name}`} />
      <input
        className="field member-email"
        type="email"
        value={member.email || ''}
        placeholder="Login email"
        onChange={(e) => updateArtist(member.id, { email: e.target.value })}
        aria-label={`Login email for ${member.name}`}
      />
      <select className="field member-role" value={member.role || 'Artist'} onChange={(e) => updateArtist(member.id, { role: e.target.value })} aria-label={`Role of ${member.name}`}>
        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <div className="member-actions">
        <button type="button" className="btn btn-ghost btn-small" onClick={() => updateArtist(member.id, { active: inactive })}>
          {inactive ? 'Reactivate' : 'Deactivate'}
        </button>
        <button
          type="button"
          className="icon-btn danger"
          onClick={() => removeArtist(member.id)}
          disabled={usage > 0}
          title={usage > 0 ? 'Has work assigned — deactivate instead so their history stays' : `Remove ${member.name}`}
          aria-label={`Remove ${member.name}`}
        >
          <Icon name="close" size={14} stroke={2.2} />
        </button>
      </div>
    </div>
  );
};

const TeamDialog = ({ onClose, defaultStage }) => {
  const { data, addArtist } = usePipeline();
  const [name, setName] = useState('');
  const [stages, setStages] = useState(defaultStage ? [defaultStage] : []);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Artist');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const nameRef = useRef(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const members = [...(data.artists || [])]
    .filter((a) => matchesQuery(search, a.name, a.email))
    .sort((a, b) => (a.active === false) - (b.active === false) || a.name.localeCompare(b.name));

  const submit = (e) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) { setError('Enter a name'); return; }
    if (!stages.length) { setError('Pick at least one stage'); return; }
    if (!addArtist({ name: clean, stages, email, role })) { setError(`${clean} is already on the team`); return; }
    setName(''); setEmail(''); setRole('Artist'); setError('');
    nameRef.current?.focus();
  };

  const activeCount = (data.artists || []).filter((a) => a.active !== false).length;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal team" role="dialog" aria-modal="true" aria-labelledby="team-title">
        <header className="modal-head">
          <div>
            <h2 id="team-title">Team</h2>
            <p className="modal-sub">{activeCount} active · names here fill the Artist dropdowns for the stages ticked</p>
          </div>
          <div className="spacer" />
          <label className="search small">
            <Icon name="search" size={14} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find an artist…" aria-label="Find an artist" />
          </label>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={16} stroke={2} /></button>
        </header>

        <form className="add-member" onSubmit={submit}>
          <input ref={nameRef} className="field" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} placeholder="New artist name" aria-label="New artist name" />
          <StageToggles value={stages} onChange={(s) => { setStages(s); setError(''); }} label="Stages for the new artist" />
          <input className="field member-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Login email (optional)" aria-label="Login email for the new artist" />
          <select className="field member-role" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role for the new artist">
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button type="submit" className="btn btn-brand btn-small"><Icon name="plus" size={14} stroke={2.2} />Add artist</button>
          {error && <span className="field-error add-error">{error}</span>}
        </form>

        <div className="member-list">
          {members.length === 0 && <p className="muted member-empty">No artists match “{search}”.</p>}
          {members.map((m) => <MemberRow key={`${m.id}:${m.name}`} member={m} />)}
        </div>

        <footer className="modal-foot">
          <span>Renaming updates every row that uses the name. Artists with work assigned can be deactivated but not removed, so their history stays.</span>
        </footer>
      </div>
    </div>
  );
};

export default TeamDialog;

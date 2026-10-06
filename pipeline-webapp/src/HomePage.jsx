import React, { useEffect, useRef, useState } from 'react';
import { usePipeline } from './PipelineContext';
import { useAuth } from './auth';
import { Icon } from './ui';
import { PIPELINE_CLIENT, STAGE_TONE, matchesQuery } from './pipelineModel';
import { TOOLS, pipelineStats } from './homeModel';

const AddClientDialog = ({ onClose, onAdded }) => {
  const { addClient } = usePipeline();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const nameRef = useRef(null);
  const closeRef = useRef(onClose);

  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Enter the client’s name'); return; }
    const id = addClient({ name, description });
    if (!id) { setError(`${name.trim()} is already a client`); return; }
    onAdded(id);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal add-client" role="dialog" aria-modal="true" aria-labelledby="add-client-title" onSubmit={submit}>
        <header className="modal-head">
          <div>
            <h2 id="add-client-title">Add a client</h2>
            <p className="modal-sub">Its workflow and team are set up next.</p>
          </div>
          <div className="spacer" />
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={16} stroke={2} /></button>
        </header>
        <div className="form-body">
          <label className="form-field">
            <span className="form-label">Name <span className="required">required</span></span>
            <input ref={nameRef} className={`field${error ? ' has-error' : ''}`} value={name} onChange={(e) => { setName(e.target.value); setError(''); }} placeholder="e.g. Walmart" />
            {error && <span className="field-error">{error}</span>}
          </label>
          <label className="form-field">
            <span className="form-label">What you make for them <span className="optional">optional</span></span>
            <input className="field" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Furniture renders" />
          </label>
        </div>
        <footer className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <div className="spacer" />
          <button type="submit" className="btn btn-brand"><Icon name="plus" size={14} stroke={2.2} />Add client</button>
        </footer>
      </form>
    </div>
  );
};

const ClientCard = ({ client, stats }) => {
  const ready = client.id === PIPELINE_CLIENT;
  return (
    <a href={`#/client/${encodeURIComponent(client.id)}`} className="client-card">
      <div className="client-card-head">
        <span className="client-mark" style={{ background: client.color }}>{client.name.slice(0, 1).toUpperCase()}</span>
        <div className="client-card-name">
          <span className="client-name">{client.name}</span>
          <span className="client-desc">{client.description || 'No description yet'}</span>
        </div>
        <span className={`client-state ${ready ? 'is-active' : 'is-setup'}`}>{ready ? 'Active' : 'Setting up'}</span>
      </div>
      {ready ? (
        <>
          <div className="client-flow">
            {client.workflow.map((stage, i) => (
              <React.Fragment key={stage}>
                {i > 0 && <span className="client-flow-arrow" aria-hidden="true">→</span>}
                <span className={`client-flow-step tone-${STAGE_TONE[stage] || 'neutral'}`}>{stage}</span>
              </React.Fragment>
            ))}
          </div>
          <div className="client-stats">
            <span><strong className="num">{stats.projects}</strong>projects</span>
            <span><strong className="num">{stats.assets}</strong>assets</span>
            <span><strong className="num">{stats.artists}</strong>artists working</span>
          </div>
          <span className="client-go">Open pipeline<Icon name="arrowRight" size={14} stroke={2} /></span>
        </>
      ) : (
        <>
          <p className="client-note">No workflow yet. Its stages (for example Concept → Modelling → Review) and its team get set up next.</p>
          <span className="client-go">Set up workflow<Icon name="arrowRight" size={14} stroke={2} /></span>
        </>
      )}
    </a>
  );
};

const HomePage = () => {
  const { data, projects, clients } = usePipeline();
  const { canManage } = useAuth();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const stats = pipelineStats(data, projects);
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const shownClients = clients.filter((c) => matchesQuery(query, c.name, c.description));
  const shownTools = TOOLS.filter((t) => matchesQuery(query, t.name, t.description));

  return (
    <div className="home">
      <div className="home-inner">
        <div className="home-hero">
          <span className="eyebrow">{today}</span>
          <h1>Where do you want to work?</h1>
          <label className="search home-search">
            <Icon name="search" size={15} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a client or tool…" aria-label="Find a client or tool" />
          </label>
        </div>

        <section className="home-section">
          <div className="home-section-head">
            <h2>Clients</h2>
            <span>Each client has its own workflow and team</span>
          </div>
          <div className="client-grid">
            {shownClients.map((c) => <ClientCard key={c.id} client={c} stats={stats} />)}
            {canManage && !query && (
              <button type="button" className="client-add" onClick={() => setAdding(true)}>
                <span className="client-add-icon"><Icon name="plus" size={18} stroke={2} /></span>
                Add a client
              </button>
            )}
            {shownClients.length === 0 && query && <p className="muted">No clients match “{query}”.</p>}
          </div>
        </section>

        <section className="home-section">
          <div className="home-section-head">
            <h2>Management</h2>
            <span>Across every client</span>
          </div>
          <div className="tool-grid">
            {shownTools.map((t) => (
              <a key={t.id} href={`#/${t.id}`} className="tool-card">
                <span className={`tool-icon tone-${t.tone}`}><Icon name={t.icon} size={17} stroke={1.9} /></span>
                <span className="tool-name">{t.name}</span>
                <span className="tool-desc">{t.description}</span>
              </a>
            ))}
          </div>
        </section>
      </div>

      {adding && (
        <AddClientDialog
          onClose={() => setAdding(false)}
          onAdded={(id) => { setAdding(false); window.location.hash = `/client/${encodeURIComponent(id)}`; }}
        />
      )}
    </div>
  );
};

export default HomePage;

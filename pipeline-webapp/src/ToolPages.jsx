import React, { useState } from 'react';
import { usePipeline } from './PipelineContext';
import { useAuth } from './auth';
import { Avatar, Icon, Pill } from './ui';
import { DEMO_PROJECT } from './mockData';
import { PIPELINE_CLIENT, STAGES, STAGE_LABEL, isAssetComplete, openRows, rowsFor } from './pipelineModel';
import { TOOLS, pipelineStats } from './homeModel';

const PageHead = ({ title, sub, sample }) => (
  <div className="page-head">
    <a href="#/" className="page-back"><Icon name="chevronLeft" size={15} stroke={2} />Home</a>
    <div className="page-title">
      <h1>{title}</h1>
      {sample && <Pill tone="amber">Sample data</Pill>}
    </div>
    {sub && <p>{sub}</p>}
  </div>
);

// ---------- a client whose workflow isn't built yet ----------

export const ClientSetupPage = ({ clientId }) => {
  const { clients, updateClient, removeClient } = usePipeline();
  const { canManage } = useAuth();
  const client = clients.find((c) => c.id === clientId);
  if (!client) {
    return (
      <div className="page">
        <PageHead title="Client not found" sub="It may have been removed." />
      </div>
    );
  }
  return (
    <div className="page">
      <PageHead title={client.name} sub={client.description || undefined} />
      <section className="panel setup-panel">
        <span className="client-mark big" style={{ background: client.color }}>{client.name.slice(0, 1).toUpperCase()}</span>
        <h2>This client’s workflow isn’t set up yet</h2>
        <p>Each client gets its own stages and its own team. Setting up workflows is the next thing to be built; until then this page holds the client’s place on the home page.</p>
        {canManage && (
          <div className="setup-edit">
            <label className="form-field">
              <span className="form-label">Name</span>
              <input className="field" value={client.name} onChange={(e) => updateClient(client.id, { name: e.target.value })} />
            </label>
            <label className="form-field">
              <span className="form-label">What you make for them</span>
              <input className="field" value={client.description || ''} onChange={(e) => updateClient(client.id, { description: e.target.value })} />
            </label>
            <button
              type="button"
              className="btn btn-ghost danger-text"
              onClick={() => {
                if (window.confirm(`Remove ${client.name}? It has no work yet, so nothing else is lost.`)) {
                  removeClient(client.id);
                  window.location.hash = '/';
                }
              }}
            >
              Remove client
            </button>
          </div>
        )}
      </section>
    </div>
  );
};

// ---------- management tools (early sample versions) ----------

const Overview = () => {
  const { data, projects, clients } = usePipeline();
  const real = projects.filter((p) => p !== DEMO_PROJECT);
  const stats = pipelineStats(data, projects);
  const inStage = Object.fromEntries(STAGES.map((s) => [s, real.reduce((n, p) => n + openRows(data, s, p).length, 0)]));
  const approved = real.reduce((n, p) => n + rowsFor(data, 'Manager', p).filter((r) => r.tcin && isAssetComplete(data, p, r)).length, 0);
  return (
    <div className="tool-body">
      {clients.map((c) => (
        <section key={c.id} className="panel overview-client">
          <header className="panel-head">
            <span className="client-mark" style={{ background: c.color }}>{c.name.slice(0, 1).toUpperCase()}</span>
            <h2>{c.name}</h2>
            <a href={`#/client/${encodeURIComponent(c.id)}`} className="panel-hint">Open</a>
          </header>
          {c.id === PIPELINE_CLIENT ? (
            <div className="overview-stats">
              <span><strong className="num">{stats.projects}</strong>projects</span>
              <span><strong className="num">{stats.assets}</strong>assets</span>
              {STAGES.map((s) => <span key={s}><strong className="num">{inStage[s]}</strong>in {STAGE_LABEL[s]}</span>)}
              <span><strong className="num">{approved}</strong>approved</span>
              <span><strong className="num">{stats.artists}</strong>artists working</span>
            </div>
          ) : <p className="muted">Workflow not set up yet.</p>}
        </section>
      ))}
    </div>
  );
};

const SAMPLE_TEAM = [
  { name: 'A. Silva', client: 'Target', stage: 'Modelling', today: 'Working', leave: 0 },
  { name: 'J. Park', client: 'Target', stage: 'Modelling', today: 'Leave', leave: 2 },
  { name: 'R. Menon', client: 'Target', stage: 'Texturing', today: 'Working', leave: 0 },
  { name: 'S. Thomas', client: 'Target', stage: 'Texturing', today: 'Training', leave: 0 },
  { name: 'K. Tan', client: 'Target', stage: 'Lighting', today: 'Working', leave: 0.5 },
  { name: 'V. Rao', client: 'Target', stage: 'Lighting', today: 'Half day', leave: 0.5 },
];
const TODAY_TONE = { Working: 'good', Leave: 'danger', Training: 'brand', 'Half day': 'amber' };

const Team = () => (
  <div className="tool-body">
    <section className="panel">
      <table className="tool-table">
        <thead><tr><th>Person</th><th>Client</th><th>Stage</th><th>Today</th><th className="right">Leave this week</th></tr></thead>
        <tbody>
          {SAMPLE_TEAM.map((p) => (
            <tr key={p.name}>
              <td><span className="tp-who"><Avatar name={p.name} size={24} /><span className="tp-name">{p.name}</span></span></td>
              <td>{p.client}</td>
              <td>{p.stage}</td>
              <td><Pill tone={TODAY_TONE[p.today]}>{p.today}</Pill></td>
              <td className="right num">{p.leave ? `${p.leave} d` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  </div>
);

const SAMPLE_BILLING = [
  { month: 'July 2026', rows: [['C6_2026', 312], ['15.ODL_2027', 96]] },
  { month: 'August 2026', rows: [['C6_2026', 948], ['15.ODL_2027', 210], ['C5_UP_and_UP_2026', 84]] },
  { month: 'September 2026', rows: [['C6_2026', 1120], ['15.ODL_2027', 342], ['23.C1_2027', 136], ['24.C6_UP&UP_2026', 118]] },
];

const Billing = () => (
  <div className="tool-body">
    {SAMPLE_BILLING.map((m) => {
      const total = m.rows.reduce((s, [, h]) => s + h, 0);
      return (
        <section key={m.month} className="panel">
          <header className="panel-head"><h2>{m.month} · Target</h2><span className="panel-hint num">{total} h allocated</span></header>
          <table className="tool-table">
            <thead><tr><th>Project</th><th className="right">Allocated hours</th></tr></thead>
            <tbody>
              {m.rows.map(([project, h]) => <tr key={project}><td>{project}</td><td className="right num">{h} h</td></tr>)}
            </tbody>
          </table>
        </section>
      );
    })}
  </div>
);

const Tasks = () => {
  const [tasks, setTasks] = useState([
    { id: 1, text: 'Hire or reassign one more Lighting artist', due: 'Today', done: false },
    { id: 2, text: 'Send September hours to Target for invoicing', due: 'Fri', done: false },
    { id: 3, text: 'Add start dates for the imported artists', due: '', done: false },
    { id: 4, text: 'Import the Target sheets', due: '', done: true },
  ]);
  const [draft, setDraft] = useState('');
  const add = (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setTasks((list) => [...list, { id: Date.now(), text: draft.trim(), due: '', done: false }]);
    setDraft('');
  };
  return (
    <div className="tool-body">
      <section className="panel">
        <form className="task-add" onSubmit={add}>
          <input className="field" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a task…" aria-label="New task" />
          <button type="submit" className="btn btn-brand btn-small"><Icon name="plus" size={14} stroke={2.2} />Add</button>
        </form>
        <ul className="task-list">
          {tasks.map((t) => (
            <li key={t.id} className={t.done ? 'is-done' : ''}>
              <label>
                <input type="checkbox" checked={t.done} onChange={() => setTasks((list) => list.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))} />
                <span>{t.text}</span>
              </label>
              {t.due && <span className="task-due">{t.due}</span>}
            </li>
          ))}
        </ul>
        <p className="panel-foot"><span>Tasks here aren’t saved yet — this is a sample of how the page could work.</span></p>
      </section>
    </div>
  );
};

const TOOL_BODY = { overview: Overview, team: Team, billing: Billing, tasks: Tasks };
// The overview uses live numbers; the others show sample data for now.
const SAMPLE = { overview: false, team: true, billing: true, tasks: true };

export const ToolPage = ({ toolId }) => {
  const tool = TOOLS.find((t) => t.id === toolId);
  const Body = TOOL_BODY[toolId];
  if (!tool || !Body) {
    return <div className="page"><PageHead title="Page not found" /></div>;
  }
  return (
    <div className="page">
      <PageHead title={tool.name} sub={tool.description} sample={SAMPLE[toolId]} />
      <Body />
    </div>
  );
};

import React, { useRef, useState } from 'react';
import ManagerView from './ManagerView';
import ProductionView from './ProductionView';
import ConsoleView from './ConsoleView';
import AssetRecord from './AssetRecord';
import ArtistsView from './ArtistsView';
import ThroughputView from './ThroughputView';
import ProfileMenu from './ProfileMenu';
import ProjectSwitcher from './ProjectSwitcher';
import TeamDialog from './TeamDialog';
import AddAssetDialog from './AddAssetDialog';
import AccountsDialog from './AccountsDialog';
import { AuthGate, AuthProvider, useAuth } from './auth';
import StageStrip from './StageStrip';
import { PipelineProvider, usePipeline } from './PipelineContext';
import { Icon } from './ui';
import { DEMO_PROJECT } from './mockData';
import {
  PRIORITIES, STAGES, STAGE_LABEL, addDays, formatDate, priorityShort, rowsFor, stageHealth, todayISO, weekStart,
} from './pipelineModel';

const ALL_PROJECTS = '__all__';

const TopBar = ({ projects, project, onProject, onAddProject, onResetDemo, onManageTeam, onManageAccounts, canManage, query, onQuery }) => (
  <header className="topbar">
    <div className="brand">
      <span className="brand-mark"><Icon name="cube" size={17} stroke={1.6} /></span>
      <span className="brand-name">3D Model Pipeline</span>
    </div>
    <span className="divider" />
    <ProjectSwitcher projects={projects} project={project} onProject={onProject} />
    {canManage && (
      <button type="button" className="icon-btn" onClick={onAddProject} title="New project" aria-label="New project">
        <Icon name="plus" size={16} stroke={2} />
      </button>
    )}
    {canManage && project === DEMO_PROJECT && (
      <button type="button" className="btn btn-ghost btn-small" onClick={onResetDemo} title="Replace the Demo project with fresh sample data dated around today">
        Reset demo
      </button>
    )}
    <div className="spacer" />
    <label className="search">
      <Icon name="search" size={15} />
      <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search TCIN, artist, comment…" aria-label="Search" />
      {query && (
        <button type="button" className="search-clear" onClick={() => onQuery('')} aria-label="Clear search"><Icon name="close" size={13} stroke={2} /></button>
      )}
    </label>
    <ProfileMenu onManageTeam={onManageTeam} onManageAccounts={onManageAccounts} />
  </header>
);

const FilterSelect = ({ label, value, options, format = (v) => v, onChange }) => (
  <label className={`filter${value ? ' is-set' : ''}`}>
    {!value && <Icon name="filter" size={13} />}
    <span className="filter-label">{label}{value ? ':' : ''}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">Any</option>
      {options.map((o) => <option key={o} value={o}>{format(o)}</option>)}
    </select>
    {value ? (
      <button type="button" className="filter-clear" onClick={() => onChange('')} aria-label={`Clear ${label} filter`}><Icon name="close" size={12} stroke={2.2} /></button>
    ) : (
      <Icon name="chevronDown" size={12} />
    )}
  </label>
);

const MainApp = () => {
  const { data, projects, notice, notify, addProject, dispatchToModelling, resetDemo } = usePipeline();
  const { canManage, isAdmin } = useAuth();
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [project, setProject] = useState(projects.includes(DEMO_PROJECT) ? DEMO_PROJECT : projects[0]);
  const [chosenMode, setMode] = useState('grid');
  const [stage, setStage] = useState('Manager');
  const [asset, setAsset] = useState(null);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({ priority: '', artist: '' });
  const [artistStage, setArtistStage] = useState('Modelling');
  const [artistScope, setArtistScope] = useState(ALL_PROJECTS);
  const [flowScope, setFlowScope] = useState(null);
  const [flowWeeks, setFlowWeeks] = useState(8);
  const [week, setWeek] = useState(() => weekStart(todayISO()));
  const [teamOpen, setTeamOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [highlightId, setHighlightId] = useState(null);
  const highlightTimer = useRef(null);

  const showAdded = (id) => {
    setMode('grid');
    setStage('Manager');
    setAsset(null);
    setQuery('');
    setFilters({ priority: '', artist: '' });
    setHighlightId(id);
    clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightId(null), 2600);
  };

  // Throughput is for managers and admins only.
  const mode = chosenMode === 'throughput' && !canManage ? 'grid' : chosenMode;
  const activeProject = projects.includes(project) ? project : projects[0];
  const health = stageHealth(data, activeProject);
  const managerRows = rowsFor(data, 'Manager', activeProject);
  const selected = managerRows.filter((r) => r.checked && r.tcin).length;
  const stageRows = stage === 'Manager' ? managerRows : rowsFor(data, stage, activeProject);
  const artists = (data.artists || []).map((a) => a.name).sort((a, b) => a.localeCompare(b));

  const openAsset = (tcn, inProject) => {
    if (!tcn) return;
    if (inProject && inProject !== activeProject) setProject(inProject);
    setAsset(tcn);
  };

  const selectStage = (next) => {
    setAsset(null);
    if (mode === 'artists' && next !== 'Manager') {
      setArtistStage(next);
      return;
    }
    setStage(next);
    setMode('grid');
  };

  const thisWeek = weekStart(todayISO());
  const artistProjects = artistScope === ALL_PROJECTS ? projects : [artistScope].filter((p) => projects.includes(p));
  // Throughput looks at the whole team, so by default it covers every real project; the Demo only when you're in it.
  const realProjects = projects.filter((p) => p !== DEMO_PROJECT);
  const flowDefault = activeProject === DEMO_PROJECT || !realProjects.length ? DEMO_PROJECT : ALL_PROJECTS;
  const flowChoice = flowScope && (flowScope === ALL_PROJECTS || projects.includes(flowScope)) ? flowScope : flowDefault;
  const flowProjects = flowChoice === ALL_PROJECTS ? realProjects : [flowChoice];
  const stripActive = mode === 'grid' ? stage : mode === 'artists' ? artistStage : null;

  const handleAddProject = () => {
    const name = window.prompt('Enter new Project name:');
    if (name && name.trim()) {
      addProject(name.trim());
      setProject(name.trim());
      setAsset(null);
    }
  };

  const changeProject = (next) => {
    setProject(next);
    setAsset(null);
  };

  let content;
  if (asset) {
    content = <AssetRecord key={`${activeProject}:${asset}`} project={activeProject} tcn={asset} onBack={() => setAsset(null)} />;
  } else if (mode === 'console') {
    content = <ConsoleView project={activeProject} />;
  } else if (mode === 'throughput') {
    content = <ThroughputView data={data} projects={flowProjects} weekCount={flowWeeks} onOpenTeam={canManage ? () => setTeamOpen(true) : undefined} />;
  } else if (mode === 'artists') {
    content = <ArtistsView stage={artistStage} projects={artistProjects} week={week} query={query} onOpenAsset={openAsset} />;
  } else if (stage === 'Manager') {
    content = <ManagerView project={activeProject} query={query} filters={filters} onOpenAsset={openAsset} highlightId={highlightId} />;
  } else {
    content = <ProductionView stageName={stage} project={activeProject} query={query} filters={filters} onOpenAsset={openAsset} />;
  }

  return (
    <div className="app">
      <TopBar projects={projects} project={activeProject} onProject={changeProject} onAddProject={handleAddProject} onResetDemo={() => { if (window.confirm('Reset the Demo project for everyone? Any changes made to it will be replaced with fresh sample data.')) { setAsset(null); resetDemo(); } }} onManageTeam={() => setTeamOpen(true)} onManageAccounts={() => setAccountsOpen(true)} canManage={canManage} query={query} onQuery={setQuery} />

      {!asset && (
        <>
          <StageStrip health={health} active={stripActive} onSelect={selectStage} />

          <div className="commandbar">
            <div className="segmented" role="tablist" aria-label="View">
              <button type="button" role="tab" aria-selected={mode === 'grid'} className={mode === 'grid' ? 'is-active' : ''} onClick={() => setMode('grid')}>
                <Icon name="grid" size={14} />Grid
              </button>
              <button type="button" role="tab" aria-selected={mode === 'console'} className={mode === 'console' ? 'is-active' : ''} onClick={() => setMode('console')}>
                <Icon name="chart" size={14} />Console
              </button>
              <button type="button" role="tab" aria-selected={mode === 'artists'} className={mode === 'artists' ? 'is-active' : ''} onClick={() => setMode('artists')}>
                <Icon name="user" size={14} />Artists
              </button>
              {canManage && (
                <button type="button" role="tab" aria-selected={mode === 'throughput'} className={mode === 'throughput' ? 'is-active' : ''} onClick={() => setMode('throughput')}>
                  <Icon name="trend" size={14} />Throughput
                </button>
              )}
            </div>

            {mode === 'artists' && (
              <>
                <span className="divider" />
                <div className="segmented" role="tablist" aria-label="Artist summary stage">
                  {STAGES.map((s) => (
                    <button key={s} type="button" role="tab" aria-selected={artistStage === s} className={artistStage === s ? 'is-active' : ''} onClick={() => setArtistStage(s)}>
                      {STAGE_LABEL[s]}
                    </button>
                  ))}
                </div>
                <FilterSelect label="Project" value={artistScope === ALL_PROJECTS ? '' : artistScope} options={projects} onChange={(v) => setArtistScope(v || ALL_PROJECTS)} />
                <div className="spacer" />
                {canManage && (
                  <>
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => setTeamOpen(true)}>
                      <Icon name="user" size={14} stroke={2} />Manage team
                    </button>
                    <span className="divider" />
                  </>
                )}
                <div className="week-nav" aria-label="Week for leaves, training and QA hours">
                  <button type="button" className="icon-btn" onClick={() => setWeek((w) => addDays(w, -7))} aria-label="Previous week"><Icon name="chevronLeft" size={15} stroke={2} /></button>
                  <span className="week-label">
                    <span className="eyebrow">Week of</span>
                    <span className="num">{formatDate(week)}</span>
                  </span>
                  <button type="button" className="icon-btn" onClick={() => setWeek((w) => addDays(w, 7))} disabled={week >= thisWeek} aria-label="Next week"><Icon name="chevronRight" size={15} stroke={2} /></button>
                  {week !== thisWeek && <button type="button" className="btn btn-ghost btn-small" onClick={() => setWeek(thisWeek)}>This week</button>}
                </div>
              </>
            )}

            {mode === 'grid' && (
              <>
                <span className="divider" />
                <FilterSelect label="Priority" value={filters.priority} options={PRIORITIES} format={priorityShort} onChange={(v) => setFilters((f) => ({ ...f, priority: v }))} />
                <FilterSelect label="Artist" value={filters.artist} options={artists} onChange={(v) => setFilters((f) => ({ ...f, artist: v }))} />
              </>
            )}
            {mode === 'throughput' && (
              <>
                <span className="divider" />
                <div className="segmented" role="tablist" aria-label="Period">
                  {[4, 8, 12].map((n) => (
                    <button key={n} type="button" role="tab" aria-selected={flowWeeks === n} className={flowWeeks === n ? 'is-active' : ''} onClick={() => setFlowWeeks(n)}>
                      {n} weeks
                    </button>
                  ))}
                </div>
                <label className={`filter${flowChoice !== ALL_PROJECTS ? ' is-set' : ''}`}>
                  <Icon name="filter" size={13} />
                  <span className="filter-label">Projects:</span>
                  <select value={flowChoice} onChange={(e) => setFlowScope(e.target.value)} aria-label="Projects">
                    <option value={ALL_PROJECTS}>{realProjects.length ? 'All except Demo' : 'All'}</option>
                    {projects.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <Icon name="chevronDown" size={12} />
                </label>
                {flowChoice !== ALL_PROJECTS && <span className="commandbar-note">Output counts only {flowChoice}; headcount is the whole team.</span>}
              </>
            )}
            {mode === 'console' && <span className="commandbar-note">Live from {activeProject} — every figure is computed from the stage sheets.</span>}

            <div className="spacer" />

            {mode === 'grid' && stage === 'Manager' && canManage && (
              <>
                {selected > 0 && <span className="selection"><strong className="num">{selected}</strong> selected</span>}
                <button type="button" className="btn btn-brand" onClick={() => dispatchToModelling(activeProject)} disabled={!selected}>
                  Dispatch to Modelling<Icon name="arrowRight" size={15} stroke={2.1} />
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setAddOpen(true)}>
                  <Icon name="plus" size={14} stroke={2.1} />Add asset
                </button>
              </>
            )}          </div>
        </>
      )}

      <main className="main">{content}</main>

      {!asset && mode === 'grid' && (
        <footer className="statusbar">
          <span><strong className="num">{stageRows.length}</strong> {stage === 'Manager' ? 'assets' : `rows in ${STAGE_LABEL[stage]}`}</span>
          {stage === 'Manager' && selected > 0 && <span><strong className="num">{selected}</strong> selected</span>}
          {(query || filters.priority || filters.artist) && <span>Filtered</span>}
          <div className="spacer" />
          <span className="row-key"><span className="key-swatch is-done" />{stage === 'Manager' ? 'Approved' : 'Done in this sheet'}</span>
          {stage !== 'Manager' && (
            <>
              <span className="row-key"><span className="key-swatch is-sentback" />Sent back / reworked</span>
              <span className="row-key"><span className="key-swatch is-split" />Split</span>
            </>
          )}
          <span className="divider" />
          <SyncIndicator />
        </footer>
      )}

      {!asset && mode === 'artists' && (
        <footer className="statusbar">
          <span>{STAGE_LABEL[artistStage]} · running totals across {artistScope === ALL_PROJECTS ? `all ${projects.length} projects` : artistScope}</span>
          <span>Leaves, training and QA hours are for the week of {formatDate(week)}</span>
          <div className="spacer" />
          <SyncIndicator />
        </footer>
      )}

      {!asset && mode === 'throughput' && (
        <footer className="statusbar">
          <span>Last {flowWeeks} weeks · {flowChoice === ALL_PROJECTS ? (realProjects.length ? 'all projects except Demo' : 'all projects') : flowChoice}</span>
          <span>Work is measured in allocated hours, counted when each stage finishes its part</span>
          <div className="spacer" />
          <SyncIndicator />
        </footer>
      )}

      {addOpen && <AddAssetDialog project={activeProject} onClose={() => setAddOpen(false)} onAdded={showAdded} />}

      {accountsOpen && isAdmin && <AccountsDialog onClose={() => setAccountsOpen(false)} notify={notify} />}

      {teamOpen && canManage && <TeamDialog onClose={() => setTeamOpen(false)} defaultStage={mode === 'artists' ? artistStage : undefined} />}

      {notice && <div className="toast" role="status"><Icon name="check" size={15} stroke={2.4} />{notice}</div>}
    </div>
  );
};

const SYNC_LABEL = {
  saved: 'All changes saved',
  saving: 'Saving…',
  offline: 'Can’t reach the server — retrying',
};

const SyncIndicator = () => {
  const { syncStatus } = usePipeline();
  return (
    <span className={`saved is-${syncStatus}`} role="status">
      <span className="saved-dot" />
      {SYNC_LABEL[syncStatus]}
    </span>
  );
};

const LoadGate = ({ children }) => {
  const { loadState, retryLoad } = usePipeline();
  if (loadState.status === 'ready') return children;
  return (
    <div className="gate">
      <span className="brand-mark"><Icon name="cube" size={20} stroke={1.6} /></span>
      {loadState.status === 'loading' ? (
        <>
          <span className="gate-title">Loading the pipeline…</span>
          <span className="gate-sub">Fetching the latest data shared by your team.</span>
        </>
      ) : (
        <>
          <span className="gate-title">Couldn’t load the pipeline</span>
          <span className="gate-sub">{loadState.error || 'The server did not respond.'}</span>
          <button type="button" className="btn btn-brand" onClick={retryLoad}>Try again</button>
        </>
      )}
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <PipelineProvider>
          <LoadGate>
            <MainApp />
          </LoadGate>
        </PipelineProvider>
      </AuthGate>
    </AuthProvider>
  );
}

export default App;

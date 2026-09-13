import React, { useState } from 'react';
import ManagerView from './ManagerView';
import ProductionView from './ProductionView';
import { PipelineProvider, usePipeline } from './PipelineContext';
import './index.css';

const MainApp = () => {
  const { data, projects, addProject } = usePipeline();
  const [activeTab, setActiveTab] = useState('Manager');
  const [activeProject, setActiveProject] = useState('Testing');

  const tabs = ['Manager', 'Modelling', 'Texturing', 'Lighting'];

  const getTabCount = (tabName) => {
    return (data[tabName] && data[tabName][activeProject]) ? data[tabName][activeProject].length : 0;
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'Manager':
        return <ManagerView activeProject={activeProject} />;
      case 'Modelling':
        return <ProductionView stageName="Modelling" activeProject={activeProject} />;
      case 'Texturing':
        return <ProductionView stageName="Texturing" activeProject={activeProject} />;
      case 'Lighting':
        return <ProductionView stageName="Lighting" activeProject={activeProject} />;
      default:
        return <ManagerView activeProject={activeProject} />;
    }
  };

  const handleAddProject = () => {
    const name = window.prompt("Enter new Project name:");
    if (name && name.trim()) {
      addProject(name.trim());
      setActiveProject(name.trim());
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-left">
          <h1>3D Model Pipeline</h1>
          <nav className="top-tab-navigation">
            {tabs.map((tab) => (
              <div 
                key={tab} 
                className={`top-tab-wrapper ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                <div className="top-tab-content">
                  {tab} <span className="tab-badge">{getTabCount(tab)}</span>
                </div>
              </div>
            ))}
          </nav>
        </div>
        
        <div className="header-right">
          <div className="search-bar">
            <span className="search-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </span>
            <input type="text" placeholder="Search by ID, Artist, TCIN..." />
          </div>
          <button className="icon-button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
          </button>
          <div className="user-profile">
            <div className="avatar">JD</div>
            <span className="dropdown-arrow">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </span>
          </div>
        </div>
      </header>
      
      <main className="glass-panel main-panel">
        <div className="tab-content">
          {renderContent()}
        </div>
        
        <footer className="project-navigation">
          <div className="project-tabs-container">
            {projects.map(proj => (
              <button 
                key={proj} 
                className={`project-tab ${activeProject === proj ? 'active' : ''}`}
                onClick={() => setActiveProject(proj)}
              >
                {proj}
              </button>
            ))}
            <button 
              className="project-tab add-project-btn" 
              onClick={handleAddProject}
              title="Add New Project"
            >
              +
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
};

function App() {
  return (
    <PipelineProvider>
      <MainApp />
    </PipelineProvider>
  );
}

export default App;

import { DEMO_PROJECT } from './mockData';
import { STAGES, isOpen, rowsFor } from './pipelineModel';

// The management tools listed on the home page.
export const TOOLS = [
  { id: 'overview', name: 'Company overview', description: 'Workload, overdue work and output for all clients on one page.', icon: 'chart', tone: 'brand' },
  { id: 'team', name: 'Team & attendance', description: 'Leave, training and who is on which client this week.', icon: 'user', tone: 'tex' },
  { id: 'billing', name: 'Billing & hours', description: 'Allocated hours per client and project, month by month.', icon: 'clock', tone: 'amber' },
  { id: 'tasks', name: 'Tasks & notes', description: 'Manager to-dos and deadlines that aren’t tied to one asset.', icon: 'check', tone: 'light' },
];

// Target's live numbers: its real projects (not the Demo), their assets, and the artists with open work right now.
export const pipelineStats = (data, projects) => {
  const real = projects.filter((p) => p !== DEMO_PROJECT);
  const assets = real.reduce((n, p) => n + rowsFor(data, 'Manager', p).filter((r) => r.tcin).length, 0);
  const working = new Set();
  for (const p of real) {
    for (const stage of STAGES) {
      for (const r of rowsFor(data, stage, p)) if (r.artist && isOpen(r) && r.status !== 'Uploaded') working.add(r.artist.trim().toLowerCase());
    }
  }
  return { projects: real.length, assets, artists: working.size };
};

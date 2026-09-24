import React from 'react';
import { avatarTone, initials } from './pipelineModel';

const PATHS = {
  cube: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5l8 4.5 8-4.5" /><path d="M12 12v9" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" /></>,
  chevronDown: <path d="M6 9.5l6 6 6-6" />,
  chevronRight: <path d="M9.5 5.5l6.5 6.5-6.5 6.5" />,
  chevronLeft: <path d="M14.5 5.5L8 12l6.5 6.5" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" /></>,
  arrowRight: <><path d="M4.5 12h14" /><path d="M13 6.5l6 5.5-6 5.5" /></>,
  arrowUp: <><path d="M12 19V6" /><path d="M6 11.5L12 5.5l6 6" /></>,
  rework: <><path d="M4 8h11a5 5 0 0 1 0 10H9" /><path d="M7.5 4.5L4 8l3.5 3.5" /></>,
  alert: <><path d="M12 4.5L21 19.5H3z" /><path d="M12 10.5v3.5" /><path d="M12 17h0.01" /></>,
  plus: <><path d="M12 5.5v13" /><path d="M5.5 12h13" /></>,
  grid: <><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="M3.5 10h17" /><path d="M9.5 10v9" /></>,
  chart: <><path d="M4 20h16" /><path d="M7 16v-5" /><path d="M12 16V6" /><path d="M17 16v-8" /></>,
  close: <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  split: <><path d="M7 4v16" /><path d="M7 12h6a4 4 0 0 0 4-4V4" /></>,
  upload: <><path d="M12 16V5" /><path d="M7 9.5l5-5 5 5" /><path d="M5 19h14" /></>,
  comment: <path d="M20 15a2 2 0 0 1-2 2H8l-4 3.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5" /></>,
  filter: <><path d="M4 6.5h16" /><path d="M7 12h10" /><path d="M10 17.5h4" /></>,
};

export const Icon = ({ name, size = 16, stroke = 1.8, className, style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    aria-hidden="true"
  >
    {PATHS[name]}
  </svg>
);

export const Pill = ({ tone = 'neutral', icon, dot, children, title }) => (
  <span className={`pill tone-${tone}`} title={title}>
    {dot && <span className="pill-dot" />}
    {icon && <Icon name={icon} size={12} stroke={2.2} />}
    {children}
  </span>
);

export const Dash = () => <span className="dash">—</span>;

export const Avatar = ({ name, size = 22 }) => {
  if (!name) return <span className="avatar avatar-empty" style={{ width: size, height: size }} />;
  return (
    <span className={`avatar tone-${avatarTone(name)}`} style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {initials(name)}
    </span>
  );
};

export const ArtistCell = ({ name }) =>
  name ? (
    <span className="artist">
      <Avatar name={name} />
      <span className="artist-name">{name}</span>
    </span>
  ) : (
    <Dash />
  );

export const PillSelect = ({ options, value, onChange, tone = 'neutral', placeholder = 'Set', format = (v) => v, disabled, label }) => {
  const opts = value && !options.includes(value) ? [...options, value] : options;
  return (
    <label className={`pill-select tone-${value ? tone : 'empty'}${disabled ? ' is-disabled' : ''}`}>
      <select value={value || ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label={label}>
        <option value="">{placeholder}</option>
        {opts.map((o) => (
          <option key={o} value={o}>{format(o)}</option>
        ))}
      </select>
      <Icon name="chevronDown" size={12} stroke={2} />
    </label>
  );
};

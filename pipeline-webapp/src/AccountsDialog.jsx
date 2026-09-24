import React, { useEffect, useRef, useState } from 'react';
import { Avatar, Icon, Pill } from './ui';
import { ROLE_LABEL, useAuth } from './auth';
import { api } from './sync';
import { matchesQuery } from './pipelineModel';

const ROLES = ['admin', 'manager', 'artist'];
const ROLE_HELP = {
  admin: 'Everything, including accounts',
  manager: 'Runs the pipeline: assets, dispatch, projects, team',
  artist: 'Works in the Modelling / Texturing / Lighting sheets',
};

const formatWhen = (iso) => {
  if (!iso) return 'Never signed in';
  const d = new Date(iso);
  return `Last sign-in ${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};

const PasswordFields = ({ onSubmit, onCancel, submitLabel }) => {
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const submit = async () => {
    if (password.length < 8) { setError('At least 8 characters'); return; }
    if (password !== again) { setError('The two passwords don’t match'); return; }
    try {
      await onSubmit(password);
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div className="password-reset">
      <input ref={ref} className="field" type="password" autoComplete="new-password" placeholder="New password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} aria-label="New password" />
      <input className="field" type="password" autoComplete="new-password" placeholder="Type it again" value={again} onChange={(e) => { setAgain(e.target.value); setError(''); }} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} aria-label="Type the new password again" />
      <button type="button" className="btn btn-brand btn-small" onClick={submit}>{submitLabel}</button>
      <button type="button" className="btn btn-ghost btn-small" onClick={onCancel}>Cancel</button>
      {error && <span className="field-error">{error}</span>}
    </div>
  );
};

const AccountRow = ({ account, isSelf, onChanged, onRemoved, notify }) => {
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');

  const patch = async (changes, done) => {
    setError('');
    try {
      const res = await api(`/api/users/${account.id}`, { method: 'PATCH', body: JSON.stringify(changes) });
      onChanged(res.user);
      if (done) notify(done);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete the account "${account.username}"? It has never been used.`)) return;
    try {
      await api(`/api/users/${account.id}`, { method: 'DELETE', body: '{}' });
      onRemoved(account.id);
      notify(`${account.username} deleted`);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className={`account${account.active ? '' : ' is-off'}`}>
      <div className="account-main">
        <Avatar name={account.displayName} size={30} />
        <div className="account-who">
          <span className="account-name">
            {account.displayName}
            {isSelf && <span className="you-tag">you</span>}
          </span>
          <span className="account-meta"><span className="mono">{account.username}</span> · {formatWhen(account.lastLoginAt)}</span>
        </div>
        <div className="account-badges">
          {!account.active && <Pill tone="neutral">Turned off</Pill>}
          {account.locked && <Pill tone="danger" icon="lock">Locked</Pill>}
        </div>
        <select
          className="field account-role"
          value={account.role}
          onChange={(e) => patch({ role: e.target.value }, `${account.username} is now ${ROLE_LABEL[e.target.value]}`).catch(() => {})}
          aria-label={`Role of ${account.username}`}
        >
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <div className="account-actions">
          {account.locked && (
            <button type="button" className="btn btn-ghost btn-small" onClick={() => patch({ unlock: true }, `${account.username} unlocked`).catch(() => {})}>Unlock</button>
          )}
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setResetting((r) => !r)}>Reset password</button>
          {!isSelf && (
            <button type="button" className="btn btn-ghost btn-small" onClick={() => patch({ active: !account.active }, account.active ? `${account.username} turned off` : `${account.username} turned back on`).catch(() => {})}>
              {account.active ? 'Turn off' : 'Turn on'}
            </button>
          )}
          {!isSelf && !account.lastLoginAt && (
            <button type="button" className="icon-btn danger" onClick={remove} aria-label={`Delete ${account.username}`} title="Delete (only for accounts never used)">
              <Icon name="close" size={14} stroke={2.2} />
            </button>
          )}
        </div>
      </div>
      {resetting && (
        <PasswordFields
          submitLabel="Set password"
          onCancel={() => setResetting(false)}
          onSubmit={async (password) => {
            await patch({ password }, `New password set for ${account.username}${isSelf ? '' : ' — they’ll need to sign in again'}`);
            setResetting(false);
          }}
        />
      )}
      {error && <p className="field-error account-error">{error}</p>}
    </div>
  );
};

const AccountsDialog = ({ onClose, notify }) => {
  const { user: me } = useAuth();
  const [accounts, setAccounts] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ username: '', displayName: '', role: 'artist', password: '', again: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const closeRef = useRef(onClose);
  const firstRef = useRef(null);

  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    firstRef.current?.focus();
    api('/api/users').then((res) => setAccounts(res.users)).catch((err) => setLoadError(err.message));
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const set = (field) => (e) => { setForm((f) => ({ ...f, [field]: e.target.value })); setFormError(''); };

  const create = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) { setFormError('Passwords must be at least 8 characters'); return; }
    if (form.password !== form.again) { setFormError('The two passwords don’t match'); return; }
    setSaving(true);
    try {
      const res = await api('/api/users', {
        method: 'POST',
        body: JSON.stringify({ username: form.username.trim(), displayName: form.displayName.trim(), role: form.role, password: form.password }),
      });
      setAccounts((list) => [...(list || []), res.user]);
      notify(`Account "${res.user.username}" created`);
      setForm({ username: '', displayName: '', role: form.role, password: '', again: '' });
      firstRef.current?.focus();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const shown = (accounts || [])
    .filter((a) => matchesQuery(search, a.username, a.displayName))
    .sort((a, b) => (b.active - a.active) || a.displayName.localeCompare(b.displayName));

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal accounts" role="dialog" aria-modal="true" aria-labelledby="accounts-title">
        <header className="modal-head">
          <div>
            <h2 id="accounts-title">Accounts</h2>
            <p className="modal-sub">Who can sign in, and what they can do. Only admins see this.</p>
          </div>
          <div className="spacer" />
          <label className="search small">
            <Icon name="search" size={14} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find an account…" aria-label="Find an account" />
          </label>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={16} stroke={2} /></button>
        </header>

        <form className="add-account" onSubmit={create} autoComplete="off">
          <input ref={firstRef} className="field mono" placeholder="Username" value={form.username} onChange={set('username')} aria-label="Username" autoCapitalize="none" spellCheck={false} />
          <input className="field" placeholder="Full name" value={form.displayName} onChange={set('displayName')} aria-label="Full name" />
          <select className="field" value={form.role} onChange={set('role')} aria-label="Role" title={ROLE_HELP[form.role]}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
          <input className="field" type="password" autoComplete="new-password" placeholder="Password" value={form.password} onChange={set('password')} aria-label="Password" />
          <input className="field" type="password" autoComplete="new-password" placeholder="Type it again" value={form.again} onChange={set('again')} aria-label="Type the password again" />
          <button type="submit" className="btn btn-brand btn-small" disabled={saving}><Icon name="plus" size={14} stroke={2.2} />Add account</button>
          <span className="add-account-hint">{formError ? <span className="field-error">{formError}</span> : `${ROLE_LABEL[form.role]}: ${ROLE_HELP[form.role]}.`}</span>
        </form>

        <div className="account-list">
          {loadError && <p className="field-error member-empty">{loadError}</p>}
          {!accounts && !loadError && <p className="muted member-empty">Loading accounts…</p>}
          {accounts && shown.length === 0 && <p className="muted member-empty">No accounts match “{search}”.</p>}
          {shown.map((a) => (
            <AccountRow
              key={a.id}
              account={a}
              isSelf={a.id === me?.id}
              notify={notify}
              onChanged={(u) => setAccounts((list) => list.map((x) => (x.id === u.id ? u : x)))}
              onRemoved={(id) => setAccounts((list) => list.filter((x) => x.id !== id))}
            />
          ))}
        </div>

        <footer className="modal-foot">
          <span>People can’t change their own passwords — reset them here. Resetting or turning off an account signs that person out. Accounts that have been used can be turned off but not deleted, so their history keeps a name.</span>
        </footer>
      </div>
    </div>
  );
};

export default AccountsDialog;

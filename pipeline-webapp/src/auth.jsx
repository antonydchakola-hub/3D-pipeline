import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Icon } from './ui';
import { UNAUTHORIZED_EVENT, api } from './sync';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const ROLE_LABEL = { admin: 'Admin', manager: 'Manager', artist: 'Artist' };

export const AuthProvider = ({ children }) => {
  const [state, setState] = useState({ status: 'checking', user: null, message: '' });

  useEffect(() => {
    let cancelled = false;
    api('/api/me')
      .then((res) => { if (!cancelled) setState({ status: 'signed-in', user: res.user, message: '' }); })
      .catch(() => { if (!cancelled) setState({ status: 'signed-out', user: null, message: '' }); });
    const onUnauthorized = () => setState({ status: 'signed-out', user: null, message: 'Your session ended. Please sign in again.' });
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => {
      cancelled = true;
      window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    };
  }, []);

  const signIn = async (username, password) => {
    const res = await api('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    setState({ status: 'signed-in', user: res.user, message: '' });
  };

  const signOut = async () => {
    await api('/api/logout', { method: 'POST', body: '{}' }).catch(() => {});
    setState({ status: 'signed-out', user: null, message: '' });
  };

  const user = state.user;
  const value = {
    ...state,
    signIn,
    signOut,
    isAdmin: user?.role === 'admin',
    canManage: user?.role === 'admin' || user?.role === 'manager',
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const SignInPage = () => {
  const { signIn, message } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const usernameRef = useRef(null);

  useEffect(() => { usernameRef.current?.focus(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await signIn(username.trim(), password);
    } catch (err) {
      setError(err.message);
      setPassword('');
      setBusy(false);
    }
  };

  return (
    <div className="signin">
      <form className="signin-card" onSubmit={submit} noValidate>
        <div className="signin-brand">
          <span className="brand-mark"><Icon name="cube" size={20} stroke={1.6} /></span>
          <span className="brand-name">3D Model Pipeline</span>
        </div>
        <h1>Sign in</h1>
        {message && !error && <p className="signin-note">{message}</p>}
        <label className="form-field">
          <span className="form-label">Username</span>
          <input
            ref={usernameRef}
            className="field"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
          />
        </label>
        <label className="form-field">
          <span className="form-label">Password</span>
          <input
            className="field"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <p className="signin-error" role="alert"><Icon name="alert" size={14} stroke={2} />{error}</p>}
        <button type="submit" className="btn btn-brand signin-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="signin-help">Accounts are set up by your admin. Ask them if you can’t sign in.</p>
      </form>
    </div>
  );
};

export const AuthGate = ({ children }) => {
  const { status } = useAuth();
  if (status === 'checking') {
    return (
      <div className="gate">
        <span className="brand-mark"><Icon name="cube" size={20} stroke={1.6} /></span>
        <span className="gate-title">Checking your sign-in…</span>
      </div>
    );
  }
  if (status === 'signed-out') return <SignInPage />;
  return children;
};

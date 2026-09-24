import React, { useEffect, useRef, useState } from 'react';
import { usePipeline } from './PipelineContext';
import { Avatar, Icon } from './ui';

// Cloudflare Access serves the signed-in user here once it protects the site; elsewhere this resolves to "not signed in".
const useIdentity = () => {
  const [identity, setIdentity] = useState({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    fetch('/cdn-cgi/access/get-identity', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!alive) return;
        setIdentity(json?.email ? { status: 'signed-in', email: json.email, name: json.name || '' } : { status: 'signed-out' });
      })
      .catch(() => alive && setIdentity({ status: 'signed-out' }));
    return () => { alive = false; };
  }, []);
  return identity;
};

const ProfileMenu = ({ onManageTeam }) => {
  const { data } = usePipeline();
  const identity = useIdentity();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const signedIn = identity.status === 'signed-in';
  const member = signedIn
    ? (data.artists || []).find((a) => a.email && a.email.toLowerCase() === identity.email.toLowerCase())
    : null;
  const displayName = member?.name || identity.name || (signedIn ? identity.email.split('@')[0] : '');
  const role = member ? member.role || 'Artist' : signedIn ? 'Not on the team list yet' : '';

  return (
    <div className="profile" ref={rootRef}>
      <button
        type="button"
        className={`profile-btn${open ? ' is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={signedIn ? `Account: ${displayName}` : 'Account'}
      >
        {signedIn ? <Avatar name={displayName} size={30} /> : <span className="avatar avatar-guest"><Icon name="user" size={16} /></span>}
        <Icon name="chevronDown" size={13} stroke={2} />
      </button>

      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            {signedIn ? (
              <>
                <Avatar name={displayName} size={36} />
                <div className="menu-who">
                  <span className="menu-name">{displayName}</span>
                  <span className="menu-email">{identity.email}</span>
                  <span className={`menu-role${member ? '' : ' is-warn'}`}>{role}{member?.stages?.length ? ` · ${member.stages.join(', ')}` : ''}</span>
                </div>
              </>
            ) : (
              <>
                <span className="avatar avatar-guest" style={{ width: 36, height: 36 }}><Icon name="user" size={18} /></span>
                <div className="menu-who">
                  <span className="menu-name">{identity.status === 'loading' ? 'Checking sign-in…' : 'Not signed in'}</span>
                  <span className="menu-email">Sign-in turns on when Cloudflare Access protects this site.</span>
                </div>
              </>
            )}
          </div>
          <button type="button" role="menuitem" className="menu-item" onClick={() => { setOpen(false); onManageTeam(); }}>
            <Icon name="user" size={15} />Manage team
          </button>
          {signedIn && (
            <a role="menuitem" className="menu-item" href="/cdn-cgi/access/logout">
              <Icon name="arrowRight" size={15} />Sign out
            </a>
          )}
        </div>
      )}
    </div>
  );
};

export default ProfileMenu;

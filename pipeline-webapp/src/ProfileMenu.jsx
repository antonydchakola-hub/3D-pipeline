import React, { useEffect, useRef, useState } from 'react';
import { Avatar, Icon } from './ui';
import { ROLE_LABEL, useAuth } from './auth';

const ProfileMenu = ({ onManageTeam, onManageAccounts }) => {
  const { user, canManage, isAdmin, signOut } = useAuth();
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

  if (!user) return null;

  return (
    <div className="profile" ref={rootRef}>
      <button
        type="button"
        className={`profile-btn${open ? ' is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${user.displayName}`}
      >
        <Avatar name={user.displayName} size={30} />
        <Icon name="chevronDown" size={13} stroke={2} />
      </button>

      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <Avatar name={user.displayName} size={36} />
            <div className="menu-who">
              <span className="menu-name">{user.displayName}</span>
              <span className="menu-email mono">{user.username}</span>
              <span className="menu-role">{ROLE_LABEL[user.role]}</span>
            </div>
          </div>
          {canManage && (
            <button type="button" role="menuitem" className="menu-item" onClick={() => { setOpen(false); onManageTeam(); }}>
              <Icon name="user" size={15} />Manage team
            </button>
          )}
          {isAdmin && (
            <button type="button" role="menuitem" className="menu-item" onClick={() => { setOpen(false); onManageAccounts(); }}>
              <Icon name="lock" size={15} />Accounts
            </button>
          )}
          <button type="button" role="menuitem" className="menu-item" onClick={() => { setOpen(false); signOut(); }}>
            <Icon name="arrowRight" size={15} />Sign out
          </button>
        </div>
      )}
    </div>
  );
};

export default ProfileMenu;

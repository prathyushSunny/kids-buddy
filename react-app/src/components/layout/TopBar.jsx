import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { signOut } from '../../features/auth/authSlice';

export default function TopBar() {
  const dispatch = useDispatch();
  const { email } = useSelector(s => s.auth);

  return (
    <div className="topbar">
      <span className="topbar-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <img src="/app-icon.png" style={{ width: 24, height: 24, borderRadius: 6 }} alt="" />
        KidsBuddy CMS
      </span>
      <div className="topbar-right">
        <span id="user-email">{email}</span>
        <button className="btn-signout" onClick={() => dispatch(signOut())}>Sign out</button>
      </div>
    </div>
  );
}

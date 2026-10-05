import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { signOut } from '../../features/auth/authSlice';

const NOTES_SVG = (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
);

const SIGNOUT_SVG = (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

export default function TopBar({ onNotesOpen }) {
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
        <button className="btn-topbar" onClick={onNotesOpen}>{NOTES_SVG} Notes</button>
        <button className="btn-topbar" onClick={() => dispatch(signOut())}>{SIGNOUT_SVG} Sign out</button>
      </div>
    </div>
  );
}

import React, { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { verifyAndLogin, clearAuthError } from '../features/auth/authSlice';
import { CLIENT_ID, OAUTH_SCOPES } from '../constants';

export default function SignIn() {
  const dispatch = useDispatch();
  const { error, isLoading } = useSelector(s => s.auth);
  const clientRef = useRef(null);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!window.google?.accounts?.oauth2) return;
      clearInterval(interval);

      clientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: OAUTH_SCOPES,
        callback: (resp) => {
          if (resp.error) {
            dispatch(clearAuthError());
            return;
          }
          const granted = (resp.scope || '').split(' ');
          if (!granted.includes('https://www.googleapis.com/auth/spreadsheets')) {
            clientRef.current.requestAccessToken({ prompt: 'consent' });
            return;
          }
          dispatch(verifyAndLogin({ token: resp.access_token, expiresIn: resp.expires_in }));
        },
      });
    }, 100);

    return () => clearInterval(interval);
  }, [dispatch]);

  const handleSignIn = () => {
    dispatch(clearAuthError());
    if (clientRef.current) {
      clientRef.current.requestAccessToken({ prompt: 'select_account' });
    }
  };

  return (
    <div className="signin-screen">
      <div className="signin-card">
        <h1 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <img src="/app-icon.png" style={{ width: 50, height: 50, borderRadius: 8 }} alt="KidsBuddy" />
          KidsBuddy CMS
        </h1>
        <p>Client Management System · Authorized team only</p>
        {error && (
          <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</p>
        )}
        <button className="google-btn" onClick={handleSignIn} disabled={isLoading}>
          <svg width="18" height="18" viewBox="0 0 48 48" style={{ display: 'block' }}>
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          {isLoading ? 'Signing in…' : 'Sign in with Google'}
        </button>
      </div>
    </div>
  );
}

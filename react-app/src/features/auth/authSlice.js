import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getUserInfo } from '../../services/sheetsApi';
import { ALLOWED_EMAILS, DEV_MODE } from '../../constants';

const SK = { token: 'kb_token', expiry: 'kb_expiry', email: 'kb_email', name: 'kb_name' };

export function saveSession(token, expiresIn, email, name = '') {
  localStorage.setItem(SK.token,  token);
  localStorage.setItem(SK.expiry, String(Date.now() + expiresIn * 1000));
  localStorage.setItem(SK.email,  email);
  localStorage.setItem(SK.name,   name);
}

export function loadSession() {
  const token  = localStorage.getItem(SK.token);
  const expiry = parseInt(localStorage.getItem(SK.expiry) || '0', 10);
  const email  = localStorage.getItem(SK.email);
  const name   = localStorage.getItem(SK.name) || '';
  if (token && email && expiry > Date.now() + 120_000) return { token, email, name };
  return null;
}

export function clearSession() {
  Object.values(SK).forEach(k => localStorage.removeItem(k));
}

// ── THUNK: verify token + email after OAuth callback ─────────────────────────
export const verifyAndLogin = createAsyncThunk(
  'auth/verifyAndLogin',
  async ({ token, expiresIn }, { rejectWithValue }) => {
    try {
      const info  = await getUserInfo(token);
      const email = (info.email || '').toLowerCase();
      if (!ALLOWED_EMAILS.map(e => e.toLowerCase()).includes(email)) {
        return rejectWithValue('Access denied — this dashboard is for authorized team members only.');
      }
      const name = info.name || info.given_name || '';
      saveSession(token, expiresIn || 3600, email, name);
      return { token, email, name };
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

const stored = loadSession();
// In DEV_MODE, auto-authenticate with a mock user so no OAuth popup is needed
const _devSession = DEV_MODE ? { token: 'dev-token', email: 'dev@kidsbuddy.local', name: 'Dev User' } : null;

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    token:           _devSession?.token || stored?.token  || null,
    email:           _devSession?.email || stored?.email  || null,
    name:            _devSession?.name  || stored?.name   || '',
    isAuthenticated: !!(DEV_MODE || stored),
    isLoading:       false,
    error:           null,
  },
  reducers: {
    signOut(state) {
      clearSession();
      state.token           = null;
      state.email           = null;
      state.name            = '';
      state.isAuthenticated = false;
      state.error           = null;
    },
    clearAuthError(state) {
      state.error = null;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(verifyAndLogin.pending, state => {
        state.isLoading = true;
        state.error     = null;
      })
      .addCase(verifyAndLogin.fulfilled, (state, { payload }) => {
        state.isLoading       = false;
        state.token           = payload.token;
        state.email           = payload.email;
        state.name            = payload.name;
        state.isAuthenticated = true;
      })
      .addCase(verifyAndLogin.rejected, (state, { payload }) => {
        state.isLoading = false;
        state.error     = payload;
      });
  },
});

export const { signOut, clearAuthError } = authSlice.actions;
export default authSlice.reducer;

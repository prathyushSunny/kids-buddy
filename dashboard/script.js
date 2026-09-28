// ── CONFIG ────────────────────────────────────────────────────────────────────
const CLIENT_ID      = '993142394562-4lrr9i1rvgu0d9kpou03tu6h6pm3jlhm.apps.googleusercontent.com';
const SPREADSHEET_ID = '1geFgIn4mAlObjLG0GJhuZZdmrNVD4AZP32ccCYVuZOA';
const SHEET_NAME     = 'Primary target sheet';
const ALLOWED_EMAILS = [
  'kids.buddy.hometution@gmail.com',
  's.kumari.shirisha@gmail.com'
];

// 0-based column indices matching TARGET_HEADERS in apps-script.js
const C = {
  APP_ID:0, SUBMITTED:1, EMAIL:2, NAME:3, PHONE:4,
  STUDENT:5, COLLEGE:6, LOCATION:7, TRAVEL:8,
  CLASSES:9, SUBJECTS:10, LANGUAGES:11, EXTRAS:12,
  TIMINGS:13, PAY:14, REFERRAL:15, OPEN:16, WORKHOURS:17,
  CONTACTED:18, NOTES:19, MAIL_SENT:20
};

// ── STATE ─────────────────────────────────────────────────────────────────────
let tokenClient;
let accessToken = null;
let allRows     = [];

// ── SESSION STORAGE ───────────────────────────────────────────────────────────
// Token + expiry stored for up to 1h (Google's hard limit).
// On load we use the stored token directly — no Google request needed.
const SK = { token: 'kb_token', expiry: 'kb_expiry', email: 'kb_email' };

function saveSession(token, expiresIn, email) {
  localStorage.setItem(SK.token,  token);
  localStorage.setItem(SK.expiry, Date.now() + (expiresIn * 1000));
  localStorage.setItem(SK.email,  email);
}

function loadSession() {
  const token  = localStorage.getItem(SK.token);
  const expiry = parseInt(localStorage.getItem(SK.expiry) || '0');
  const email  = localStorage.getItem(SK.email);
  // Require at least 2 minutes remaining so mid-session calls don't fail
  if (token && email && expiry > Date.now() + 120000) return { token, email };
  return null;
}

function clearSession() {
  Object.values(SK).forEach(k => localStorage.removeItem(k));
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
window.onload = () => {
  const stored = loadSession();

  if (stored) {
    // Valid token already in storage — go straight to dashboard, no Google call
    accessToken = stored.token;
    document.getElementById('user-email').textContent = stored.email;
    document.getElementById('signin-screen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    loadApplications();
  }

  // Init token client regardless (needed for sign-in button and sign-out)
  const ready = setInterval(() => {
    if (!window.google) return;
    clearInterval(ready);

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/userinfo.email'
      ].join(' '),
      callback: handleToken
    });
  }, 100);
};

function startSignIn() {
  tokenClient.requestAccessToken({ prompt: 'select_account' });
}

async function handleToken(resp) {
  if (resp.error) {
    showError('Sign-in failed: ' + resp.error);
    return;
  }

  accessToken = resp.access_token;

  try {
    const info  = await apiFetch('https://www.googleapis.com/oauth2/v3/userinfo');
    const email = (info.email || '').toLowerCase();

    if (!ALLOWED_EMAILS.map(e => e.toLowerCase()).includes(email)) {
      accessToken = null;
      showError('Access denied — this dashboard is for authorized team members only.');
      return;
    }

    saveSession(resp.access_token, resp.expires_in || 3600, email);
    document.getElementById('user-email').textContent = email;
    document.getElementById('signin-screen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    loadApplications();
  } catch (err) {
    showError('Could not verify your account: ' + err.message);
  }
}

function signOut() {
  if (accessToken) google.accounts.oauth2.revoke(accessToken, () => {});
  accessToken = null;
  allRows = [];
  clearSession();
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('signin-screen').style.display = 'flex';
  document.getElementById('error-banner').style.display = 'none';
}

// ── DATA ──────────────────────────────────────────────────────────────────────
async function loadApplications() {
  setTableMsg('Loading…');
  hideError();

  try {
    const range  = encodeURIComponent(`${SHEET_NAME}!A2:U`);
    const url    = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`;
    const result = await apiFetch(url);

    allRows = (result.values || []).filter(r => r.length > 0);
    populateClassFilter();
    applyFilters();
  } catch (err) {
    showError('Failed to load data: ' + err.message);
    setTableMsg('Could not load applications.');
  }
}

function populateClassFilter() {
  const seen = new Set();
  allRows.forEach(r => { const v = cell(r, C.CLASSES); if (v) seen.add(v); });

  const sel = document.getElementById('filter-classes');
  const cur = sel.value;
  sel.innerHTML = '<option value="">All — Classes</option>';
  [...seen].sort().forEach(cls => {
    const o = document.createElement('option');
    o.value = cls; o.textContent = cls;
    if (cls === cur) o.selected = true;
    sel.appendChild(o);
  });
}

function applyFilters() {
  const q         = document.getElementById('search').value.toLowerCase().trim();
  const contacted = document.getElementById('filter-contacted').value;
  const classes   = document.getElementById('filter-classes').value;

  const filtered = allRows.filter(r => {
    if (contacted && (cell(r, C.CONTACTED) || 'No') !== contacted) return false;
    if (classes   && cell(r, C.CLASSES) !== classes)               return false;
    if (q) {
      const hay = [C.NAME, C.PHONE, C.EMAIL, C.COLLEGE, C.APP_ID]
        .map(i => cell(r, i)).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  updateStats();
  renderTable(filtered);

  const rc = document.getElementById('result-count');
  rc.textContent = filtered.length === allRows.length
    ? `${allRows.length} applications`
    : `${filtered.length} of ${allRows.length} applications`;
}

// ── STATS ─────────────────────────────────────────────────────────────────────
function updateStats() {
  const total     = allRows.length;
  const contacted = allRows.filter(r => (cell(r, C.CONTACTED) || 'No') === 'Yes').length;
  document.getElementById('stat-total').textContent     = total;
  document.getElementById('stat-contacted').textContent = contacted;
  document.getElementById('stat-pending').textContent   = total - contacted;
}

// ── TABLE ─────────────────────────────────────────────────────────────────────
function renderTable(filtered) {
  const tbody = document.getElementById('table-body');

  if (!filtered.length) {
    setTableMsg(allRows.length ? 'No applications match the current filters.' : 'No applications yet.');
    return;
  }

  tbody.innerHTML = '';

  filtered.forEach((row, fi) => {
    const globalIdx = allRows.indexOf(row);
    const sheetRow  = globalIdx + 2;
    const uid       = `r${fi}`;

    const name      = cell(row, C.NAME)      || '—';
    const phone     = cell(row, C.PHONE)     || '—';
    const contacted = cell(row, C.CONTACTED) || 'No';
    const mailSent  = cell(row, C.MAIL_SENT) || 'No';

    const digits = phone.replace(/\D/g, '');
    const waNum  = digits.length === 10 ? '91' + digits : digits;
    const waHref = digits
      ? `https://wa.me/${waNum}?text=${encodeURIComponent('Hello ' + name + ', I\'m contacting you regarding your submission for KidsBuddy home tuitions.')}`
      : null;

    const tr = document.createElement('tr');
    tr.className = 'data-row';
    tr.dataset.uid = uid;
    tr.innerHTML = `
      <td class="td-id">${esc(cell(row, C.APP_ID))}</td>
      <td class="td-name">${esc(name)}</td>
      <td class="td-phone">
        ${esc(phone)}
        ${waHref ? `<a class="wa-link" href="${waHref}" target="_blank" rel="noopener" onclick="event.stopPropagation()">WhatsApp ↗</a>` : ''}
      </td>
      <td>${esc(cell(row, C.CLASSES))}</td>
      <td class="td-date">${esc(cell(row, C.SUBMITTED))}</td>
      <td>
        <button class="btn-toggle ${contacted === 'Yes' ? 'yes' : 'no'}"
          data-sheet-row="${sheetRow}"
          data-col="${C.CONTACTED + 1}"
          data-current="${esc(contacted)}"
          onclick="event.stopPropagation(); handleToggle(this)">
          ${contacted}
        </button>
      </td>
      <td>
        <button class="btn-toggle ${mailSent === 'Yes' ? 'yes' : 'no'}"
          data-sheet-row="${sheetRow}"
          data-col="${C.MAIL_SENT + 1}"
          data-current="${esc(mailSent)}"
          onclick="event.stopPropagation(); handleToggle(this)">
          ${mailSent}
        </button>
      </td>`;
    tr.onclick = () => toggleDetail(uid, tr);
    tbody.appendChild(tr);

    const dr = document.createElement('tr');
    dr.className = 'detail-row';
    dr.id = `detail-${uid}`;
    dr.innerHTML = `
      <td colspan="7">
        <div class="detail-grid">
          ${df('Email',                  cell(row, C.EMAIL))}
          ${df('Student / Working',      cell(row, C.STUDENT))}
          ${df('College / Company',      cell(row, C.COLLEGE))}
          ${df('Stay Location',          cell(row, C.LOCATION))}
          ${df('Travel Mode',            cell(row, C.TRAVEL))}
          ${df('Subjects',               cell(row, C.SUBJECTS))}
          ${df('Languages',              cell(row, C.LANGUAGES))}
          ${df('Extra Activities',       cell(row, C.EXTRAS))}
          ${df('Available Timings',      cell(row, C.TIMINGS))}
          ${df('Expected Pay / hr',      cell(row, C.PAY))}
          ${df('Referral',               cell(row, C.REFERRAL))}
          ${df('Open to Contact',        cell(row, C.OPEN))}
          ${df('College / Work Timings', cell(row, C.WORKHOURS))}
        </div>
        <div class="notes-row">
          <span class="notes-label">Notes</span>
          <div class="notes-wrap">
            <textarea class="notes-input" rows="2"
              data-sheet-row="${sheetRow}"
              data-original="${esc(cell(row, C.NOTES))}"
              onclick="event.stopPropagation()"
              onblur="handleSaveNotes(this)"
            >${esc(cell(row, C.NOTES))}</textarea>
            <div class="save-status" id="ns-${sheetRow}"></div>
          </div>
        </div>
      </td>`;
    tbody.appendChild(dr);
  });
}

function df(label, value) {
  return `<div class="detail-field"><label>${label}</label><span>${esc(value || '—')}</span></div>`;
}

function toggleDetail(uid, tr) {
  const dr   = document.getElementById(`detail-${uid}`);
  const open = dr.classList.toggle('open');
  tr.classList.toggle('expanded', open);
}

// ── INLINE EDITS ──────────────────────────────────────────────────────────────
async function handleToggle(btn) {
  const sheetRow = parseInt(btn.dataset.sheetRow);
  const colNum   = parseInt(btn.dataset.col);
  const current  = btn.dataset.current;
  const next     = current === 'Yes' ? 'No' : 'Yes';

  btn.disabled = true;
  try {
    await updateCell(sheetRow, colNum, next);
    btn.textContent      = next;
    btn.className        = `btn-toggle ${next === 'Yes' ? 'yes' : 'no'}`;
    btn.dataset.current  = next;

    const ri = sheetRow - 2;
    if (colNum === C.CONTACTED + 1) allRows[ri][C.CONTACTED] = next;
    if (colNum === C.MAIL_SENT + 1) allRows[ri][C.MAIL_SENT]  = next;
    updateStats();
  } catch (err) {
    showError('Update failed: ' + err.message);
  }
  btn.disabled = false;
}

async function handleSaveNotes(textarea) {
  const sheetRow = parseInt(textarea.dataset.sheetRow);
  const value    = textarea.value;
  const original = textarea.dataset.original;

  if (value === original) return;

  const status = document.getElementById(`ns-${sheetRow}`);
  status.textContent = 'Saving…';

  try {
    await updateCell(sheetRow, C.NOTES + 1, value);
    allRows[sheetRow - 2][C.NOTES] = value;
    textarea.dataset.original      = value;
    status.textContent = 'Saved ✓';
    setTimeout(() => { status.textContent = ''; }, 2000);
  } catch (err) {
    status.textContent = 'Failed to save.';
    showError('Notes save failed: ' + err.message);
  }
}

// ── API HELPERS ───────────────────────────────────────────────────────────────
async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type':  'application/json',
      ...(opts.headers || {})
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function updateCell(sheetRow, colNum, value) {
  const col   = numToCol(colNum - 1);
  const range = encodeURIComponent(`${SHEET_NAME}!${col}${sheetRow}`);
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?valueInputOption=RAW`;
  await apiFetch(url, { method: 'PUT', body: JSON.stringify({ values: [[value]] }) });
}

function numToCol(n) {
  n++;
  let s = '';
  while (n > 0) {
    s = String.fromCharCode(64 + ((n - 1) % 26 + 1)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// ── UTILS ─────────────────────────────────────────────────────────────────────
function cell(row, idx) { return String(row[idx] || '').trim(); }

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function setTableMsg(msg) {
  document.getElementById('table-body').innerHTML =
    `<tr><td colspan="7" class="state-msg">${msg}</td></tr>`;
}

function showError(msg) {
  const el = document.getElementById('error-banner');
  el.textContent = msg;
  el.style.display = 'block';
}

function hideError() {
  document.getElementById('error-banner').style.display = 'none';
}

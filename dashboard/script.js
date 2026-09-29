// constants.js loaded before this file — CLIENT_ID, SPREADSHEET_ID, SHEETS, C, PAGE_SIZE, ALLOWED_EMAILS

// ── STATE ─────────────────────────────────────────────────────────────────────
let tokenClient;
let accessToken   = null;
let allRows       = [];
let filteredRows  = [];
let renderedCount = 0;
let scrollObserver = null;

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
  // window.__kbSession was set synchronously by the inline script in index.html
  // before first paint, so the correct screen is already visible by now.
  const stored = window.__kbSession || loadSession();

  if (stored) {
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

  // Google's granular-permissions UI lets users uncheck individual scopes.
  // If Sheets scope was unchecked every API call will 403 — catch it here
  // before saving the session so the user gets a clear prompt to retry.
  const granted = (resp.scope || '').split(' ');
  if (!granted.includes('https://www.googleapis.com/auth/spreadsheets')) {
    showError(
      'Sheets access was not granted. Please sign in again and make sure ' +
      'the "Google Sheets" checkbox is checked on the permissions screen.'
    );
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
    // Reload so the inline FOUC script shows the dashboard instantly
    // and window.onload loads data via the same reliable path used on every refresh.
    window.location.reload();
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
    const range  = encodeURIComponent(`${SHEETS.TUTORS_APPLIED}!A2:U`);
    const url    = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`;
    const result = await apiFetch(url);

    allRows = (result.values || []).filter(r => r.length > 0);
    // Stamp real sheet row number BEFORE sorting (row 1 = header, data starts at 2)
    allRows.forEach((row, i) => { row._sheetRow = i + 2; });
    allRows.sort((a, b) => parseDate(cell(b, C.SUBMITTED)) - parseDate(cell(a, C.SUBMITTED)));
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
const WA_SVG   = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;
const MAIL_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg>`;
const CALL_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.01 1.18 2 2 0 012 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14.92z"/></svg>`;

function renderTable(filtered) {
  filteredRows  = filtered;
  renderedCount = 0;

  if (scrollObserver) { scrollObserver.disconnect(); scrollObserver = null; }

  const tbody = document.getElementById('table-body');
  tbody.innerHTML = '';

  if (!filtered.length) {
    setTableMsg(allRows.length ? 'No applications match the current filters.' : 'No applications yet.');
    return;
  }

  appendRows();
}

function appendRows() {
  if (renderedCount >= filteredRows.length) return;

  const tbody = document.getElementById('table-body');

  const old = document.getElementById('scroll-sentinel');
  if (old) old.remove();

  const batch = filteredRows.slice(renderedCount, renderedCount + PAGE_SIZE);
  batch.forEach((row, bi) => {
    const fi       = renderedCount + bi;
    const sheetRow = row._sheetRow;
    const uid      = `r${fi}`;

    const name      = cell(row, C.NAME)      || '—';
    const phone     = cell(row, C.PHONE)     || '—';
    const email     = cell(row, C.EMAIL);
    const contacted = cell(row, C.CONTACTED) || 'No';
    const mailSent  = cell(row, C.MAIL_SENT) || 'No';

    const digits = phone.replace(/\D/g, '');
    const waNum  = digits.length === 10 ? '91' + digits : digits;
    const waHref = digits
      ? `https://wa.me/${waNum}?text=${encodeURIComponent('Hello ' + name + ', I\'m contacting you regarding your submission for KidsBuddy home tuitions.')}`
      : null;

    const submittedFmt = formatDate(cell(row, C.SUBMITTED));

    const tr = document.createElement('tr');
    tr.className = 'data-row';
    tr.dataset.uid = uid;
    tr.innerHTML = `
      <td class="td-id">${esc(cell(row, C.APP_ID))}</td>
      <td class="td-name">${esc(name)}</td>
      <td class="td-phone">
        <span class="phone-num">${esc(phone)}</span>
        <span class="contact-icons">
          ${digits ? `<a class="icon-call" href="tel:${digits}" onclick="event.stopPropagation()" title="Call">${CALL_SVG}</a>` : ''}
          ${waHref ? `<a class="icon-wa" href="${waHref}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="WhatsApp">${WA_SVG}</a>` : ''}
          ${email  ? `<a class="icon-mail" href="mailto:${email}" onclick="event.stopPropagation()" title="Email">${MAIL_SVG}</a>` : ''}
        </span>
      </td>
      <td class="td-classes">
        ${esc(cell(row, C.CLASSES))}
        <div class="mobile-extra">
          ${cell(row, C.SUBJECTS)  ? `<span class="me-row">${esc(cell(row, C.SUBJECTS))}</span>`  : ''}
          ${cell(row, C.LOCATION)  ? `<span class="me-row">${esc(cell(row, C.LOCATION))}</span>`  : ''}
        </div>
      </td>
      <td class="td-date">${esc(submittedFmt)}</td>
      <td>
        <div class="toggle-wrap">
          <span class="toggle-label">Contacted</span>
          <button class="pill-toggle ${contacted === 'Yes' ? 'yes' : 'no'}"
            data-sheet-row="${sheetRow}"
            data-col="${C.CONTACTED + 1}"
            data-current="${esc(contacted)}"
            onclick="event.stopPropagation(); handleToggle(this)">
            <span class="pt-yes">YES</span>
            <span class="pt-no">NO</span>
          </button>
        </div>
      </td>
      <td class="td-mail-sent">
        <button class="btn-toggle ${mailSent === 'Yes' ? 'yes' : 'no'}"
          data-sheet-row="${sheetRow}"
          data-col="${C.MAIL_SENT + 1}"
          data-current="${esc(mailSent)}"
          onclick="event.stopPropagation(); handleToggle(this)">
          ${mailSent}
        </button>
      </td>
      <td class="td-expand">
        <button class="btn-expand" data-uid="${uid}" onclick="event.stopPropagation(); handleExpand(this)">
          Full information <span class="expand-chevron"></span>
        </button>
      </td>`;
    tr.onclick = () => toggleDetail(uid, tr);
    tbody.appendChild(tr);

    const dr = document.createElement('tr');
    dr.className = 'detail-row';
    dr.id = `detail-${uid}`;
    dr.innerHTML = `
      <td colspan="8">
        <div class="detail-grid">
          ${df('Submitted',              formatDate(cell(row, C.SUBMITTED)))}
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

  renderedCount += batch.length;

  if (renderedCount < filteredRows.length) {
    const sentinel = document.createElement('tr');
    sentinel.id = 'scroll-sentinel';
    sentinel.innerHTML = '<td colspan="8" style="padding:0;height:1px"></td>';
    tbody.appendChild(sentinel);

    if (!scrollObserver) {
      scrollObserver = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) appendRows();
      }, { rootMargin: '300px' });
    }
    scrollObserver.observe(sentinel);
  } else if (scrollObserver) {
    scrollObserver.disconnect();
    scrollObserver = null;
  }
}

function df(label, value) {
  return `<div class="detail-field"><label>${label}</label><span>${esc(value || '—')}</span></div>`;
}

function toggleDetail(uid, tr) {
  const dr   = document.getElementById(`detail-${uid}`);
  const open = dr.classList.toggle('open');
  tr.classList.toggle('expanded', open);
  const chevron = tr.querySelector('.expand-chevron');
  if (chevron) chevron.classList.toggle('up', open);
}

function handleExpand(btn) {
  const uid = btn.dataset.uid;
  const tr  = document.querySelector(`tr.data-row[data-uid="${uid}"]`);
  toggleDetail(uid, tr);
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
    if (btn.classList.contains('pill-toggle')) {
      btn.className = `pill-toggle ${next === 'Yes' ? 'yes' : 'no'}`;
    } else {
      btn.textContent = next;
      btn.className   = `btn-toggle ${next === 'Yes' ? 'yes' : 'no'}`;
    }
    btn.dataset.current = next;

    const ri = allRows.findIndex(r => r._sheetRow === sheetRow);
    if (ri !== -1) {
      if (colNum === C.CONTACTED + 1) allRows[ri][C.CONTACTED] = next;
      if (colNum === C.MAIL_SENT + 1) allRows[ri][C.MAIL_SENT] = next;
    }
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
    const ri = allRows.findIndex(r => r._sheetRow === sheetRow);
    if (ri !== -1) allRows[ri][C.NOTES] = value;
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
  if (!res.ok) {
    const text = await res.text();
    // Stored session token may lack the Sheets scope (user unchecked it during
    // a previous login). Clear the session so the next sign-in re-requests it.
    if (res.status === 403 && text.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
      clearSession();
      showError(
        'This session is missing Sheets permission. ' +
        'Please sign in again and check the "Google Sheets" checkbox.'
      );
      setTimeout(signOut, 1500);
      throw new Error('Insufficient scope');
    }
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function updateCell(sheetRow, colNum, value) {
  const col   = numToCol(colNum - 1);
  const range = encodeURIComponent(`${SHEETS.TUTORS_APPLIED}!${col}${sheetRow}`);
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

// Parse "DD/MM/YYYY HH:MM:SS" (Google Sheets locale) → Date object
function parseDate(str) {
  if (!str) return new Date(0);
  // "DD/MM/YYYY HH:MM:SS" — Google Sheets locale
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1], +(m[4]||0), +(m[5]||0), +(m[6]||0));
  const d = new Date(str);
  return isNaN(d) ? new Date(0) : d;
}

function formatTime(d) {
  let h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')}${ampm}`;
}

function formatDate(str) {
  if (!str) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = parseDate(str);
  if (!d.getTime()) return str;

  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day   = new Date(d.getFullYear(),   d.getMonth(),   d.getDate());
  const diff  = today - day;
  const time  = formatTime(d);

  if (diff === 0)        return `Today, ${time}`;
  if (diff === 86400000) return `Yesterday, ${time}`;
  return `${d.getDate()} ${months[d.getMonth()]}, ${d.getFullYear()}, ${time}`;
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function setTableMsg(msg) {
  document.getElementById('table-body').innerHTML =
    `<tr><td colspan="8" class="state-msg">${msg}</td></tr>`;
}

function showError(msg) {
  const el = document.getElementById('error-banner');
  el.textContent = msg;
  el.style.display = 'block';
}

function hideError() {
  document.getElementById('error-banner').style.display = 'none';
}

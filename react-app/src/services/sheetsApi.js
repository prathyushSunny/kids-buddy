import { SPREADSHEET_ID } from '../constants';
import { parseDate, pad2 } from '../utils/dateUtils';

const BASE     = 'https://sheets.googleapis.com/v4/spreadsheets';
const CAL_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const USERINFO = 'https://www.googleapis.com/oauth2/v3/userinfo';

const SHEETS_ERR = /^#[A-Z/0-9]+[!?]$/;

// ── CELL HELPERS ──────────────────────────────────────────────────────────────
export function cellValue(row, idx) {
  const v = String(row[idx] ?? '').trim();
  return SHEETS_ERR.test(v) ? '' : v;
}

export function normalizePhone(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0'))  d = d.slice(1);
  return d;
}

// Convert 0-based index to spreadsheet column letter(s): 0→A, 25→Z, 26→AA
function numToCol(n) {
  let s = '';
  n++;
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

// ── CORE FETCH ────────────────────────────────────────────────────────────────
export async function apiFetch(url, options = {}, token) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // Re-throw with a flag so callers can handle scope errors
    const err = new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    err.body   = text;
    throw err;
  }
  return res.json();
}

export async function getUserInfo(token) {
  return apiFetch(USERINFO, {}, token);
}

// ── SHEET READS ───────────────────────────────────────────────────────────────
export async function fetchSheetRows(sheetName, from, to, token) {
  const range = encodeURIComponent(`${sheetName}!${from}:${to}`);
  return apiFetch(`${BASE}/${SPREADSHEET_ID}/values/${range}`, {}, token);
}

export async function fetchRowCount(sheetName, token) {
  const range = encodeURIComponent(`${sheetName}!A:A`);
  const res = await apiFetch(`${BASE}/${SPREADSHEET_ID}/values/${range}`, {}, token);
  // Subtract 1 for the header row; Sheets API omits trailing empty rows so length is accurate
  return Math.max(0, (res.values || []).length - 1);
}

// ── SHEET WRITES ──────────────────────────────────────────────────────────────
export async function appendRow(sheetName, row, token) {
  const range = encodeURIComponent(`${sheetName}!A1`);
  return apiFetch(
    `${BASE}/${SPREADSHEET_ID}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: [row] }) },
    token,
  );
}

// sheetRow: 1-based row number, col1Based: 1-based column number, sheetName: sheet tab name
export async function updateCell(sheetName, sheetRow, col1Based, value, token) {
  const col   = numToCol(col1Based - 1);
  const range = encodeURIComponent(`${sheetName}!${col}${sheetRow}`);
  return apiFetch(
    `${BASE}/${SPREADSHEET_ID}/values/${range}?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values: [[value]] }) },
    token,
  );
}

export async function updateCellByRange(rangeStr, value, token) {
  const range = encodeURIComponent(rangeStr);
  return apiFetch(
    `${BASE}/${SPREADSHEET_ID}/values/${range}?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values: [[value]] }) },
    token,
  );
}

export async function batchUpdateCells(updates, token) {
  const data = updates.map(u => ({ range: u.range, values: [[u.value]] }));
  return apiFetch(
    `${BASE}/${SPREADSHEET_ID}/values:batchUpdate`,
    { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data }) },
    token,
  );
}

// sheetRowIndex: 1-based
export async function deleteRow(sheetId, sheetRowIndex, token) {
  return apiFetch(
    `${BASE}/${SPREADSHEET_ID}:batchUpdate`,
    {
      method: 'POST',
      body: JSON.stringify({
        requests: [{
          deleteDimension: {
            range: { sheetId, dimension: 'ROWS', startIndex: sheetRowIndex - 1, endIndex: sheetRowIndex },
          },
        }],
      }),
    },
    token,
  );
}

export async function getSheetIds(token) {
  const meta = await apiFetch(`${BASE}/${SPREADSHEET_ID}?fields=sheets.properties`, {}, token);
  const map = {};
  (meta.sheets || []).forEach(s => { map[s.properties.title] = s.properties.sheetId; });
  return map;
}

// ── CALENDAR API ──────────────────────────────────────────────────────────────
export function buildCalendarBody(tutorName, tutorEmail, dateStr, description = '', eventName = '') {
  const d   = parseDate(dateStr);
  const end = new Date(d.getTime() + 60 * 60 * 1000);
  const iso = dt => `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}T${pad2(dt.getHours())}:${pad2(dt.getMinutes())}:00`;
  const sName = description.match(/Student:\s*(.+)/)?.[1]?.trim();
  const defTitle = sName
    ? `Invitation: KidsBuddy Tutor <> ${sName}`
    : 'Invitation: KidsBuddy Tutor <> Student Visit';
  const body = {
    summary: eventName || defTitle,
    start:   { dateTime: iso(d),   timeZone: 'Asia/Kolkata' },
    end:     { dateTime: iso(end), timeZone: 'Asia/Kolkata' },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 60 },
        { method: 'email', minutes: 60 },
      ],
    },
  };
  if (description) body.description = description;
  if (tutorEmail)  body.attendees   = [{ email: tutorEmail }];
  body.conferenceData = {
    createRequest: {
      requestId: `kb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      conferenceSolutionKey: { type: 'hangoutsMeet' },
    },
  };
  return body;
}

export async function createCalendarEvent(body, token) {
  return apiFetch(`${CAL_BASE}?conferenceDataVersion=1&sendUpdates=all`, { method: 'POST', body: JSON.stringify(body) }, token);
}

export async function updateCalendarEvent(eventId, body, token) {
  return apiFetch(`${CAL_BASE}/${eventId}?conferenceDataVersion=1&sendUpdates=all`, { method: 'PATCH', body: JSON.stringify(body) }, token);
}

export async function deleteCalendarEvent(eventId, token) {
  const res = await fetch(`${CAL_BASE}/${eventId}?sendUpdates=all`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 410) {
    throw new Error(`Calendar DELETE ${res.status}`);
  }
}

// ── NOTES ─────────────────────────────────────────────────────────────────────
function _noteRow(note) {
  return [
    note.noteId,
    note.createdAt,
    note.updatedAt,
    note.author,
    note.title,
    JSON.stringify(note.items),
    note.pinned ? 'TRUE' : 'FALSE',
    note.status,
  ];
}

export async function fetchNotes(token) {
  const res = await fetchSheetRows('Notes', 'A', 'H', token);
  return (res.values || [])
    .slice(1)
    .map((r, i) => ({
      noteId:    r[0] || '',
      createdAt: r[1] || '',
      updatedAt: r[2] || '',
      author:    r[3] || '',
      title:     r[4] || '',
      items:     (() => { try { return JSON.parse(r[5] || '[]'); } catch { return []; } })(),
      pinned:    r[6] === 'TRUE',
      status:    r[7] || 'open',
      _row:      i + 2,
    }))
    .filter(n => n.status !== 'deleted');
}

export async function createNote(note, token) {
  return appendRow('Notes', _noteRow(note), token);
}

export async function saveNote(rowIndex, note, token) {
  const range = encodeURIComponent(`Notes!A${rowIndex}:H${rowIndex}`);
  return apiFetch(
    `${BASE}/${SPREADSHEET_ID}/values/${range}?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values: [_noteRow(note)] }) },
    token,
  );
}

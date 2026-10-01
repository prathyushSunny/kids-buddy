// Matches vanilla: parseDate, formatDate, formatTime, nowSheetFmt, pad2

export function pad2(n) {
  return String(n).padStart(2, '0');
}

// Parses "DD/MM/YYYY HH:MM:SS" (Sheets locale) → JS Date
export function parseDate(str) {
  if (!str) return new Date(0);
  const m = String(str).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0));
  }
  const d = new Date(str);
  return isNaN(d) ? new Date(0) : d;
}

// Returns "Today, 9:00AM" / "Yesterday, 9:00AM" / "3 Oct, 2026, 9:00AM"
export function formatDate(str) {
  if (!str) return '';
  const d = parseDate(str);
  if (!d || d.getTime() === 0) return str;

  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dDay  = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff  = today - dDay; // ms

  const timeStr = formatTime(d);
  if (diff === 0)      return `Today, ${timeStr}`;
  if (diff === 86400000) return `Yesterday, ${timeStr}`;

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${months[d.getMonth()]}, ${d.getFullYear()}, ${timeStr}`;
}

export function formatTime(d) {
  let h = d.getHours(), m = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${pad2(m)}${ap}`;
}

// Returns current local time as "DD/MM/YYYY HH:MM:00"
export function nowSheetFmt() {
  const d = new Date();
  return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`;
}

// Days remaining before 30-day purge
export function daysLeft(deletedAtStr) {
  if (!deletedAtStr) return 30;
  const deleted = parseDate(deletedAtStr);
  const elapsed = Math.floor((Date.now() - deleted.getTime()) / 86400000);
  return Math.max(0, 30 - elapsed);
}

// Format "DD/MM/YYYY HH:MM:00" from date + hour(1-12) + min + ampm
export function buildSheetDateTime(dateStr, h12, min, ap) {
  if (!dateStr) return '';
  const [day, month, year] = dateStr.split('/');
  let h = parseInt(h12, 10);
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return `${pad2(parseInt(day))}/${pad2(parseInt(month))}/${year} ${pad2(h)}:${pad2(min)}:00`;
}

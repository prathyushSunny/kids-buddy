import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { C, SHEETS, DEV_MODE } from '../../constants';
import { cellValue, updateCell, createCalendarEvent, updateCalendarEvent, buildCalendarBody } from '../../services/sheetsApi';
import { parseDate, formatDate, formatTime } from '../../utils/dateUtils';
import { closeCalPromptModal, showToast, showLoader, hideLoader } from '../../features/ui/uiSlice';
import { updateRowInPlace } from '../../features/tutors/tutorsSlice';

// Only these emails are allowed to receive real calendar invites during dev
const _CAL_ALLOWED_EMAILS = ['s.kumari.shirisha@gmail.com', 'prathyushsunny@gmail.com'];

export default function CalendarPromptModal() {
  const dispatch  = useDispatch();
  const token     = useSelector(s => s.auth.token);
  const { open, sheetRow, tutorName, tutorEmail, dateStr, parentName, studentName, parentAddress } =
    useSelector(s => s.ui.modals.calPrompt);
  const tutorRows = useSelector(s => s.tutors.allRows);

  const [eventName, setEventName] = useState('');
  const [desc,      setDesc]      = useState('');
  const [saving,    setSaving]    = useState(false);

  const timeChip = (() => {
    if (!dateStr) return '';
    const start = parseDate(dateStr);
    const end   = new Date(start.getTime() + 60 * 60 * 1000);
    return `${formatDate(dateStr)} – ${formatTime(end)}`;
  })();

  const defTitle = studentName
    ? `Invitation: KidsBuddy Tutor <> ${studentName}`
    : 'Invitation: KidsBuddy Tutor <> Student Visit';

  const defDesc = (() => {
    const lines = [`KidsBuddy Visit — ${tutorName || ''}`];
    if (parentName)    lines.push(`Parent: ${parentName}`);
    if (studentName)   lines.push(`Student: ${studentName}`);
    if ((parentAddress || '').trim()) lines.push(`Address: ${parentAddress.trim()}`);
    return lines.join('\n');
  })();

  useEffect(() => {
    if (!open) return;
    setEventName(defTitle);
    setDesc(defDesc);
    setSaving(false);
  }, [open]);

  if (!open) return null;

  const close = () => dispatch(closeCalPromptModal());

  const blockCalendar = async () => {
    if (!tutorEmail) return;

    // Dev restriction: only send to whitelisted emails
    if (!_CAL_ALLOWED_EMAILS.includes((tutorEmail || '').toLowerCase())) {
      close();
      dispatch(showToast({ message: 'Calendar invite restricted to test accounts. No invite sent.', type: 'error' }));
      return;
    }

    if (DEV_MODE) {
      close();
      dispatch(showToast('Calendar: blocked (dev mode)'));
      return;
    }

    setSaving(true);
    dispatch(showLoader());
    try {
      const row        = tutorRows.find(r => r[31] === sheetRow);
      const existingId = row ? (cellValue(row, C.CALENDAR_EVENT_ID) || '').trim() : '';

      let calId;
      let meetLink = '';
      const body = buildCalendarBody(tutorName, tutorEmail, dateStr, desc, eventName);
      if (existingId) {
        const res = await updateCalendarEvent(existingId, body, token);
        calId = existingId;
        meetLink = res?.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || '';
      } else {
        const res = await createCalendarEvent(body, token);
        calId = res.id;
        meetLink = res?.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || '';
      }

      if (calId) {
        dispatch(updateRowInPlace({ sheetRow, colIdx: C.CALENDAR_EVENT_ID, value: calId }));
        await updateCell(SHEETS.TUTORS_APPLIED, sheetRow, C.CALENDAR_EVENT_ID + 1, calId, token);
      }
      if (meetLink) {
        dispatch(updateRowInPlace({ sheetRow, colIdx: C.MEET_LINK, value: meetLink }));
        await updateCell(SHEETS.TUTORS_APPLIED, sheetRow, C.MEET_LINK + 1, meetLink, token);
      }

      dispatch(hideLoader());
      close();
      dispatch(showToast(meetLink ? `Calendar event created · Meet link saved` : 'Calendar event created'));
    } catch (err) {
      dispatch(hideLoader());
      close();
      dispatch(showToast({ message: 'Calendar failed: ' + err.message, type: 'error' }));
    }
    setSaving(false);
  };

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="cal-modal-heading">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="4" width="20" height="18" rx="3" fill="#fff" stroke="#ddd" strokeWidth="1.5"/>
            <rect x="2" y="4" width="20" height="7" rx="3" fill="#4285F4"/>
            <rect x="2" y="8" width="20" height="3" fill="#4285F4"/>
            <line x1="8" y1="2" x2="8" y2="6" stroke="#4285F4" strokeWidth="2" strokeLinecap="round"/>
            <line x1="16" y1="2" x2="16" y2="6" stroke="#4285F4" strokeWidth="2" strokeLinecap="round"/>
            <text x="6.5" y="20" fontSize="7.5" fill="#1a73e8" fontWeight="700" fontFamily="sans-serif">31</text>
          </svg>
          Block in Google Calendar?
        </div>

        <div className="cal-time-chip">{timeChip}</div>

        <div className="cal-tutor-info">
          <div className="cal-tutor-name">{tutorName}</div>
          <div className="cal-tutor-email">{tutorEmail || '(no email on file)'}</div>
        </div>

        <label className="modal-label">Event name</label>
        <input
          className="modal-input"
          style={{ marginBottom: 10 }}
          value={eventName}
          onChange={e => setEventName(e.target.value)}
          placeholder="Event title…"
        />
        <label className="modal-label">Event description</label>
        <textarea
          className="cal-desc-area"
          value={desc}
          onChange={e => setDesc(e.target.value)}
          placeholder="Add details…"
        />

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="btn-modal-cancel" style={{ flex: 1 }} onClick={close}>Skip</button>
          <button
            className="btn-schedule-save"
            style={{ flex: 2 }}
            onClick={blockCalendar}
            disabled={saving || !tutorEmail}
          >
            {saving ? '…' : 'Yes, Block'}
          </button>
        </div>
      </div>
    </div>
  );
}

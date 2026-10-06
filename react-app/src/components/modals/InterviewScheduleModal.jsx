import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { C, SHEETS, DEV_MODE } from '../../constants';
import { cellValue, updateCell, buildCalendarBody, createCalendarEvent, updateCalendarEvent } from '../../services/sheetsApi';
import { pad2, parseDate, buildSheetDateTime } from '../../utils/dateUtils';
import {
  closeInterviewScheduleModal, showToast, showLoader, hideLoader, openWAShareModal,
} from '../../features/ui/uiSlice';
import { updateRowInPlace } from '../../features/tutors/tutorsSlice';


const ITEM_H = 48;

function DrumCol({ items, defaultIndex, onChange }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.scrollTop = (defaultIndex + 1) * ITEM_H;
  }, []);
  const handleScroll = useCallback(() => {
    if (!ref.current) return;
    const idx = Math.max(0, Math.min(Math.round(ref.current.scrollTop / ITEM_H) - 1, items.length - 1));
    onChange(idx);
  }, [items, onChange]);
  return (
    <div className="drum-col" ref={ref} onScroll={handleScroll}>
      <div className="drum-item drum-pad" /><div className="drum-item drum-pad" />
      {items.map((v, i) => <div key={i} className="drum-item">{v}</div>)}
      <div className="drum-item drum-pad" /><div className="drum-item drum-pad" />
    </div>
  );
}

function parseSchedules(raw) {
  try { return JSON.parse(raw || '[]') || []; } catch { return []; }
}

export default function InterviewScheduleModal() {
  const dispatch   = useDispatch();
  const token      = useSelector(s => s.auth.token);
  const tutorRows  = useSelector(s => s.tutors.allRows);
  const { open, sheetRow, uid, tutorName, tutorEmail, scheduleId, current } =
    useSelector(s => s.ui.modals.interviewSchedule);

  const parsedDefaults = (() => {
    if (!current) return { date: null, h12: 9, min: 0, ap: 'AM' };
    const d = parseDate(current);
    const raw = d.getHours();
    return { date: d, h12: raw % 12 || 12, min: d.getMinutes(), ap: raw >= 12 ? 'PM' : 'AM' };
  })();

  const [selDate,   setSelDate]   = useState(parsedDefaults.date);
  const [hourIdx,   setHourIdx]   = useState(parsedDefaults.h12 - 1);
  const [minIdx,    setMinIdx]    = useState(parsedDefaults.min);
  const [ampm,      setAmpm]      = useState(parsedDefaults.ap);
  const [eventName, setEventName] = useState('');
  const [dateErr,   setDateErr]   = useState(false);
  const [saving,    setSaving]    = useState(false);

  const hours   = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  useEffect(() => {
    if (!open) return;
    const d = current ? parseDate(current) : null;
    setSelDate(d);
    if (d) {
      const raw = d.getHours();
      setHourIdx((raw % 12 || 12) - 1);
      setMinIdx(d.getMinutes());
      setAmpm(raw >= 12 ? 'PM' : 'AM');
    } else {
      setHourIdx(8); setMinIdx(0); setAmpm('AM');
    }
    const defTitle = tutorName
      ? `Interview: KidsBuddy × ${tutorName}`
      : 'Interview: KidsBuddy Tutor';
    setEventName(defTitle);
    setDateErr(false);
    setSaving(false);
  }, [open, sheetRow]);

  if (!open) return null;
  const close = () => dispatch(closeInterviewScheduleModal());

  const save = async () => {
    if (!selDate) { setDateErr(true); return; }

    const d = selDate;
    const dateStr = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
    const h12 = hourIdx + 1;
    const fmt = buildSheetDateTime(dateStr, h12, minIdx, ampm);

    setSaving(true);
    dispatch(showLoader());

    try {
      // ── Google Calendar + Meet (mandatory) ─────────────────────────────────
      let calId    = '';
      let meetLink = '';

      if (!DEV_MODE && tutorEmail) {
        const row       = tutorRows.find(r => r[31] === sheetRow);
        const existingId = row && scheduleId
          ? (parseSchedules(cellValue(row, C.SCHEDULES)).find(s => s.id === scheduleId)?.calId || '')
          : '';

        const calBody = buildCalendarBody(tutorName, tutorEmail, fmt, '', eventName);
        let res;
        if (existingId) {
          res   = await updateCalendarEvent(existingId, calBody, token);
          calId = existingId;
        } else {
          res   = await createCalendarEvent(calBody, token);
          calId = res.id || '';
        }
        meetLink = res?.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || '';
      }

      // ── Save to SCHEDULES JSON ─────────────────────────────────────────────
      if (!DEV_MODE) {
        const row = tutorRows.find(r => r[31] === sheetRow);
        const schedules = parseSchedules(row ? cellValue(row, C.SCHEDULES) : '');
        const entry = { id: scheduleId || `iv-${Date.now()}`, type: 'interview', at: fmt, calId, meetLink };
        const updated = scheduleId
          ? schedules.map(s => s.id === scheduleId ? entry : s)
          : [...schedules, entry];
        await updateCell(SHEETS.TUTORS_APPLIED, sheetRow, C.SCHEDULES + 1, JSON.stringify(updated), token);
        dispatch(updateRowInPlace({ sheetRow, colIdx: C.SCHEDULES, value: JSON.stringify(updated) }));
      }

      // ── Auto-mark Contacted + Status ───────────────────────────────────────
      const row = tutorRows.find(r => r[31] === sheetRow);
      if (row && cellValue(row, C.CONTACTED) !== 'Yes') {
        dispatch(updateRowInPlace({ sheetRow, colIdx: C.CONTACTED, value: 'Yes' }));
        if (!DEV_MODE) updateCell(SHEETS.TUTORS_APPLIED, sheetRow, C.CONTACTED + 1, 'Yes', token).catch(() => {});
      }
      dispatch(hideLoader());
      close();
      setSaving(false);

      // ── WA Share ──────────────────────────────────────────────────────────
      const tutorPhone = row ? cellValue(row, C.PHONE) : '';
      dispatch(openWAShareModal({
        type: 'interview',
        tutorName, tutorPhone, tutorEmail,
        dateStr: fmt, meetLink,
        sheetRow, existingCalId: calId,
      }));

    } catch (err) {
      dispatch(hideLoader());
      dispatch(showToast({ message: 'Failed: ' + err.message, type: 'error' }));
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Schedule Interview</h3>
        <div className="iv-modal-sub">A Google Meet link will be created and sent to the tutor.</div>

        <label className="modal-label">Date</label>
        <DatePicker
          selected={selDate}
          onChange={d => { setSelDate(d); setDateErr(false); }}
          minDate={new Date()}
          dateFormat="dd/MM/yyyy"
          placeholderText="Pick a date"
          className="modal-input"
          wrapperClassName="schedule-datepicker-wrap"
          popperPlacement="bottom-start"
          autoComplete="off"
        />
        {dateErr && <div className="field-error">Please pick a date.</div>}

        <label className="modal-label">Time</label>
        <div className="time-drum-row">
          <div className="time-drum" id="time-drum">
            <div className="drum-fade-top" />
            <div className="drum-fade-bot" />
            <div className="drum-highlight" />
            <DrumCol items={hours}   defaultIndex={hourIdx} onChange={setHourIdx} />
            <div className="drum-sep">:</div>
            <DrumCol items={minutes} defaultIndex={minIdx}  onChange={setMinIdx} />
          </div>
          <div id="drum-ampm">
            <button className={`ampm-btn${ampm === 'AM' ? ' active' : ''}`} onClick={() => setAmpm('AM')}>AM</button>
            <button className={`ampm-btn${ampm === 'PM' ? ' active' : ''}`} onClick={() => setAmpm('PM')}>PM</button>
          </div>
        </div>

        <label className="modal-label">Event title</label>
        <input
          className="modal-input"
          value={eventName}
          onChange={e => setEventName(e.target.value)}
          placeholder="Interview event title…"
          style={{ marginBottom: 4 }}
        />

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="btn-modal-cancel" onClick={close}>Cancel</button>
          <button className="btn-schedule-save" onClick={save} disabled={saving}>
            {saving ? 'Creating Meet…' : 'Schedule Interview'}
          </button>
        </div>
      </div>
    </div>
  );
}

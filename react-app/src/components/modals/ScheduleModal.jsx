import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { C, CP, SHEETS, DEV_MODE } from '../../constants';
import { cellValue, updateCell } from '../../services/sheetsApi';

function parseSchedules(raw) {
  try { return JSON.parse(raw || '[]') || []; } catch { return []; }
}
import { pad2, parseDate, buildSheetDateTime } from '../../utils/dateUtils';
import {
  closeScheduleModal, showToast, showLoader, hideLoader,
  openWAShareModal, openCalPromptModal,
} from '../../features/ui/uiSlice';
import { updateRowInPlace } from '../../features/tutors/tutorsSlice';
import { loadParents } from '../../features/parents/parentsSlice';

const ITEM_H = 48;

// ── Time Drum Col ─────────────────────────────────────────────────────────────
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
      <div className="drum-item drum-pad" />
      <div className="drum-item drum-pad" />
      {items.map((v, i) => (
        <div key={i} className="drum-item">{v}</div>
      ))}
      <div className="drum-item drum-pad" />
      <div className="drum-item drum-pad" />
    </div>
  );
}

// ── Parent search ─────────────────────────────────────────────────────────────
function ParentSearch({ selectedParent, onSelect, onClear }) {
  const [query, setQuery]     = useState('');
  const [matches, setMatches] = useState([]);
  const parentCache           = useSelector(s => s.parents.cache);
  const parentRows            = useSelector(s => s.parents.allRows);
  const parentsLoading        = useSelector(s => s.parents.isLoading);
  const dispatch              = useDispatch();

  useEffect(() => {
    if (!parentRows.length && !parentsLoading) {
      dispatch(loadParents({ tabKey: 'all' }));
    }
  }, []);

  const pool = parentCache.length ? parentCache : parentRows;

  const search = (q) => {
    setQuery(q);
    if (!q.trim()) { setMatches([]); return; }
    const lq = q.toLowerCase();
    setMatches(
      pool.filter(r =>
        [CP.NAME, CP.PHONE, CP.STUDENT_NAME].some(i =>
          (r[i] || '').toLowerCase().includes(lq),
        ),
      ).slice(0, 8),
    );
  };

  const pick = (r) => {
    setQuery('');
    setMatches([]);
    onSelect({
      name:        r[CP.NAME]        || '',
      phone:       r[CP.PHONE]       || '',
      studentName: r[CP.STUDENT_NAME]|| '',
      address:     r[CP.ADDRESS]     || '',
      mapsLink:    r[CP.MAPS_LINK]   || '',
    });
  };

  return (
    <div className="modal-parent-wrap">
      {selectedParent ? (
        <div className="modal-parent-chip" style={{ display: 'flex' }}>
          <div>
            <div className="mpchip-name">{selectedParent.name}</div>
            <div className="mpchip-sub">
              {selectedParent.studentName ? `& ${selectedParent.studentName} · ` : ''}{selectedParent.phone}
            </div>
          </div>
          <button className="mpchip-clear" onClick={onClear} title="Remove">×</button>
        </div>
      ) : (
        <>
          <input
            type="text"
            className="modal-input"
            placeholder={parentsLoading ? 'Loading parents…' : 'Search parent name or number…'}
            value={query}
            onChange={e => search(e.target.value)}
            autoComplete="off"
            style={{ marginBottom: 0 }}
            disabled={parentsLoading}
          />
          {matches.length > 0 && (
            <div className="modal-parent-dd" style={{ display: 'block' }}>
              {matches.map((r, i) => (
                <div key={i} className="mpdd-item" onClick={() => pick(r)}>
                  <div className="mpdd-name">{r[CP.NAME]}</div>
                  <div className="mpdd-sub">
                    {r[CP.STUDENT_NAME] ? `${r[CP.STUDENT_NAME]} · ` : ''}{r[CP.PHONE]}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ScheduleModal() {
  const dispatch    = useDispatch();
  const token       = useSelector(s => s.auth.token);
  const { open, sheetRow, current, scheduleId } = useSelector(s => s.ui.modals.schedule);
  const tutorRows   = useSelector(s => s.tutors.allRows);

  const parsedDefaults = (() => {
    if (!current) return { date: null, h12: 9, min: 0, ap: 'AM' };
    const d = parseDate(current);
    const raw = d.getHours();
    return { date: d, h12: raw % 12 || 12, min: d.getMinutes(), ap: raw >= 12 ? 'PM' : 'AM' };
  })();

  const [selDate,  setSelDate]  = useState(parsedDefaults.date);
  const [hourIdx,  setHourIdx]  = useState(parsedDefaults.h12 - 1);
  const [minIdx,   setMinIdx]   = useState(parsedDefaults.min);
  const [ampm,     setAmpm]     = useState(parsedDefaults.ap);
  const [parent,   setParent]   = useState(null);
  const [dateErr,  setDateErr]  = useState(false);
  const [parentErr,setParentErr]= useState(false);
  const [saving,   setSaving]   = useState(false);

  const hours   = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  // Pre-fill parent from existing row data when opening
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
      setHourIdx(8); // default 9AM
      setMinIdx(0);
      setAmpm('AM');
    }
    setDateErr(false);
    setParentErr(false);
    setSaving(false);

    const row = tutorRows.find(r => r[31] === sheetRow);
    if (row) {
      const raw = (row[C.SCHEDULED_PARENT] || '').trim();
      if (raw) {
        const [pName, pPhone, pStudent, pAddress, pMapsLink] = raw.split('|');
        setParent({ name: pName || '', phone: pPhone || '', studentName: pStudent || '', address: pAddress || '', mapsLink: pMapsLink || '' });
      } else {
        setParent(null);
      }
    } else {
      setParent(null);
    }
  }, [open, sheetRow]);

  if (!open) return null;

  const close = () => dispatch(closeScheduleModal());

  const save = async () => {
    setDateErr(!selDate);
    setParentErr(!parent);
    if (!selDate || !parent) return;

    const d = selDate;
    const dateStr = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
    const h12 = hourIdx + 1;
    const fmt = buildSheetDateTime(dateStr, h12, minIdx, ampm);
    const parentStr = [parent.name, parent.phone, parent.studentName, parent.address || '', parent.mapsLink || ''].join('|');

    setSaving(true);
    const row = tutorRows.find(r => r[31] === sheetRow);

    if (!DEV_MODE) {
      dispatch(showLoader());
      try {
        // Legacy columns (backward compat)
        await updateCell(SHEETS.TUTORS_APPLIED, sheetRow, C.INTERVIEW_STATUS + 1, 'Scheduled', token);
        await updateCell(SHEETS.TUTORS_APPLIED, sheetRow, C.INTERVIEW_AT     + 1, fmt,         token);
        await updateCell(SHEETS.TUTORS_APPLIED, sheetRow, C.SCHEDULED_PARENT + 1, parentStr,   token);

        // SCHEDULES JSON
        const schedules = parseSchedules(row ? cellValue(row, C.SCHEDULES) : '');
        const entry = { id: scheduleId || `vis-${Date.now()}`, type: 'visit', at: fmt, parent: parentStr, calId: '' };
        const updated = scheduleId
          ? schedules.map(s => s.id === scheduleId ? entry : s)
          : [...schedules, entry];
        await updateCell(SHEETS.TUTORS_APPLIED, sheetRow, C.SCHEDULES + 1, JSON.stringify(updated), token);
        dispatch(updateRowInPlace({ sheetRow, colIdx: C.SCHEDULES, value: JSON.stringify(updated) }));
      } catch (err) {
        dispatch(hideLoader());
        dispatch(showToast({ message: 'Schedule failed: ' + err.message, type: 'error' }));
        setSaving(false);
        return;
      }
      dispatch(hideLoader());
    }

    dispatch(updateRowInPlace({ sheetRow, colIdx: C.INTERVIEW_STATUS, value: 'Scheduled' }));
    dispatch(updateRowInPlace({ sheetRow, colIdx: C.INTERVIEW_AT,     value: fmt         }));
    dispatch(updateRowInPlace({ sheetRow, colIdx: C.SCHEDULED_PARENT, value: parentStr   }));

    // Auto-mark Contacted = Yes
    if (row && cellValue(row, C.CONTACTED) !== 'Yes') {
      dispatch(updateRowInPlace({ sheetRow, colIdx: C.CONTACTED, value: 'Yes' }));
      if (!DEV_MODE) updateCell(SHEETS.TUTORS_APPLIED, sheetRow, C.CONTACTED + 1, 'Yes', token).catch(() => {});
    }

    close();
    setSaving(false);

    // Show WA share modal after scheduling
    const tutorName  = row ? cellValue(row, C.NAME)  : '';
    const tutorPhone = row ? cellValue(row, C.PHONE) : '';
    const tutorEmail = row ? cellValue(row, C.EMAIL) : '';
    dispatch(openWAShareModal({
      type: 'visit',
      tutorName, tutorPhone, dateStr: fmt,
      parentName:   parent.name,
      parentPhone:  parent.phone,
      studentName:  parent.studentName,
      parentAddress: parent.address || '',
      parentMapsLink: parent.mapsLink || '',
      tutorEmail,
      sheetRow,
    }));
  };

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Schedule a Visit</h3>

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

        <label className="modal-label">Parent / Student</label>
        <ParentSearch
          selectedParent={parent}
          onSelect={p => { setParent(p); setParentErr(false); }}
          onClear={() => setParent(null)}
        />
        {parentErr && <div className="field-error">Please select a parent / student.</div>}

        <div className="modal-actions">
          <button className="btn-modal-cancel" onClick={close}>Cancel</button>
          <button className="btn-schedule-save" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

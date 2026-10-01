import React, { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { C, SHEETS, SOURCE_OPTIONS, DEV_MODE } from '../../constants';
import NotesSection from '../common/NotesSection';
import { cellValue, normalizePhone, updateCell, appendRow, deleteRow, getSheetIds } from '../../services/sheetsApi';
import { formatDate, nowSheetFmt } from '../../utils/dateUtils';
import { setConfirmCallback } from '../../utils/confirmService';
import {
  toggleUidSelection, showToast, showLoader, hideLoader,
  openConfirmModal, openActionsModal, openEditCardModal,
  openScheduleModal, openInLoopModal, openWAShareModal,
  openCalPromptModal, openPostRejectionModal,
} from '../../features/ui/uiSlice';
import { updateRowInPlace, removeRow, incrementTabCount } from '../../features/tutors/tutorsSlice';

// ── SVGs (matching vanilla) ───────────────────────────────────────────────────
const HAMBURGER = (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5"/>
    <circle cx="5.5" cy="9" r="1.1" fill="currentColor"/>
    <circle cx="9" cy="9" r="1.1" fill="currentColor"/>
    <circle cx="12.5" cy="9" r="1.1" fill="currentColor"/>
  </svg>
);
const PENCIL = (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const TRASH = (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14H6L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/>
    <path d="M9 6V4h6v2"/>
  </svg>
);
const CHEVRON = (
  <svg className="expand-icon" width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
    <path d="M6 8L1 3h10z"/>
  </svg>
);
const CALL_SVG = (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.4h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 6.09 6.09l1.97-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
);
const WA_SVG = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.556 4.116 1.526 5.842L.057 23.928a.5.5 0 0 0 .612.612l6.086-1.469A11.935 11.935 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.92 0-3.72-.52-5.27-1.424l-.378-.225-3.914.945.96-3.798-.246-.39A9.942 9.942 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
  </svg>
);
const MAIL_SVG = (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <rect x="2" y="4" width="20" height="16" rx="2"/>
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
  </svg>
);
const COPY_SVG = (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);
const NOTE_SVG = (
  <svg aria-hidden="true" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const CALENDAR_SVG = (
  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <rect x="3" y="4" width="18" height="18" rx="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);
const USER_SVG = (
  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);
const CLOCK_SVG = (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>
);
const RUPEE_SVG = (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M6 3h12"/><path d="M6 8h12"/><path d="m6 13 8.5 8"/><path d="M6 13h3"/><path d="M9 13c6.667 0 6.667-10 0-10"/>
  </svg>
);
const PIN_SVG = (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>
);
const CLOSE_SVG = (
  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const GCAL_SVG = (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <rect x="3" y="4" width="18" height="18" rx="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
    <line x1="12" y1="14" x2="12" y2="18"/>
    <line x1="10" y1="16" x2="14" y2="16"/>
  </svg>
);

// ── Source Chip ───────────────────────────────────────────────────────────────
function SourceChip({ value, sheetRow, onUpdate }) {
  const [showDd, setShowDd] = useState(false);
  const [ddPos,  setDdPos]  = useState({ top: 0, left: 0 });
  const chipRef = useRef(null);
  const ddRef   = useRef(null);
  const dispatch = useDispatch();
  const token    = useSelector(s => s.auth.token);

  const opt   = SOURCE_OPTIONS.find(o => o.value === value);
  const icon  = opt ? opt.icon : '·';
  const label = opt ? opt.value : (value || 'Source');

  useEffect(() => {
    if (!showDd) return;
    const handler = (e) => {
      if (!ddRef.current?.contains(e.target) && !chipRef.current?.contains(e.target)) {
        setShowDd(false);
      }
    };
    setTimeout(() => document.addEventListener('click', handler), 0);
    return () => document.removeEventListener('click', handler);
  }, [showDd]);

  const selectSource = async (newVal) => {
    setShowDd(false);
    onUpdate(C.SOURCE, newVal);
    if (DEV_MODE) return;
    dispatch(showLoader());
    try {
      await updateCell(SHEETS.TUTORS_APPLIED, sheetRow, C.SOURCE + 1, newVal, token);
      dispatch(hideLoader());
      dispatch(showToast(`Source updated to ${newVal}`));
    } catch (err) {
      dispatch(hideLoader());
      onUpdate(C.SOURCE, value); // revert
      dispatch(showToast({ message: 'Failed: ' + err.message, type: 'error' }));
    }
  };

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span
        ref={chipRef}
        className="source-chip"
        onClick={e => {
          e.stopPropagation();
          if (chipRef.current) {
            const r = chipRef.current.getBoundingClientRect();
            setDdPos({ top: r.bottom + 4, left: r.left });
          }
          setShowDd(v => !v);
        }}
        title="Change source"
      >
        {icon} {label}
      </span>
      {showDd && (
        <div ref={ddRef} className="source-dd" style={{ position: 'fixed', zIndex: 600, top: ddPos.top, left: ddPos.left }}>
          {SOURCE_OPTIONS.map(o => (
            <div
              key={o.value}
              className="source-dd-item"
              onClick={e => { e.stopPropagation(); selectSource(o.value); }}
            >
              {o.icon} {o.value}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

// ── Interview Section ─────────────────────────────────────────────────────────
function InterviewSection({ row, sheetRow, onUpdate }) {
  const dispatch = useDispatch();
  const token    = useSelector(s => s.auth.token);

  const status    = cellValue(row, C.INTERVIEW_STATUS);
  const ivAt      = cellValue(row, C.INTERVIEW_AT);
  const calId     = cellValue(row, C.CALENDAR_EVENT_ID);
  const rawParent = cellValue(row, C.SCHEDULED_PARENT);

  const openSchedule = (e) => {
    e.stopPropagation();
    dispatch(openScheduleModal({ sheetRow, uid: String(sheetRow), current: ivAt }));
  };

  const confirmCancel = (e) => {
    e.stopPropagation();
    setConfirmCallback(async () => {
      if (!DEV_MODE) {
        dispatch(showLoader());
        try {
          await Promise.all([
            updateCell(SHEETS.TUTORS_APPLIED, sheetRow, C.INTERVIEW_STATUS + 1, '', token),
            updateCell(SHEETS.TUTORS_APPLIED, sheetRow, C.INTERVIEW_AT + 1, '', token),
            updateCell(SHEETS.TUTORS_APPLIED, sheetRow, C.SCHEDULED_PARENT + 1, '', token),
            updateCell(SHEETS.TUTORS_APPLIED, sheetRow, C.CALENDAR_EVENT_ID + 1, '', token),
          ]);
        } catch {}
        dispatch(hideLoader());
      }
      onUpdate(C.INTERVIEW_STATUS, '');
      onUpdate(C.INTERVIEW_AT, '');
      onUpdate(C.SCHEDULED_PARENT, '');
      onUpdate(C.CALENDAR_EVENT_ID, '');
    });
    dispatch(openConfirmModal({ message: 'Cancel this scheduled visit?' }));
  };

  const markResult = async (result, e) => {
    e.stopPropagation();
    if (!DEV_MODE) {
      dispatch(showLoader());
      try {
        await updateCell(SHEETS.TUTORS_APPLIED, sheetRow, C.INTERVIEW_STATUS + 1, result, token);
      } catch { dispatch(hideLoader()); return; }
      dispatch(hideLoader());
    }
    onUpdate(C.INTERVIEW_STATUS, result);
    if (result === 'Cleared') {
      // Also update status to Onboarded
      if (!DEV_MODE) {
        try { await updateCell(SHEETS.TUTORS_APPLIED, sheetRow, C.STATUS + 1, 'Onboarded', token); } catch {}
      }
      onUpdate(C.STATUS, 'Onboarded');
    } else {
      dispatch(openPostRejectionModal({ sheetRow, uid: String(sheetRow) }));
    }
  };

  const header = (
    <div className="card-section-header">
      <span className="cs-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        {CALENDAR_SVG} Schedule
      </span>
    </div>
  );

  if (status === 'Cleared') {
    return (
      <div className="card-interview card-section">
        {header}
        <div className="card-section-body">
          <span className="iv-chip iv-cleared">Interview Cleared</span>
        </div>
      </div>
    );
  }

  if (status === 'Rejected') {
    return (
      <div className="card-interview card-section">
        {header}
        <div className="card-section-body">
          <span className="iv-chip iv-rejected">Interview Rejected</span>
        </div>
      </div>
    );
  }

  if (status === 'Scheduled' && ivAt) {
    const d    = (() => { try { return new Date(ivAt.replace(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/, '$3-$2-$1T$4:$5')); } catch { return new Date(); } })();
    const now  = new Date();
    const isPast = d < now;
    const dateLbl = formatDate(ivAt);
    const today = new Date(); today.setHours(0,0,0,0);
    const dDay  = new Date(d); dDay.setHours(0,0,0,0);
    const diff  = Math.round((dDay - today) / 86400000);
    const daysLbl = diff <= 0 ? '' : diff === 1 ? 'Tomorrow' : `in ${diff} days`;

    let parentData = null;
    if (rawParent) {
      const [pName, pPhone, pStudent, pAddress] = rawParent.split('|');
      if (pName) parentData = { name: pName, phone: pPhone || '', studentName: pStudent || '', address: pAddress || '' };
    }

    if (isPast) {
      return (
        <div className="card-interview card-section">
          <div className="iv-past-alert">
            <span className="iv-past-msg">Interview on {dateLbl} — cleared?</span>
            <div className="iv-past-actions">
              <button className="btn-iv-result yes" onClick={e => markResult('Cleared', e)}>Yes, Cleared</button>
              <button className="btn-iv-result no" onClick={e => markResult('Rejected', e)}>No, Rejected</button>
            </div>
          </div>
        </div>
      );
    }

    const openWA = (e) => {
      e.stopPropagation();
      const name = cellValue(row, C.NAME);
      const phone = normalizePhone(cellValue(row, C.PHONE));
      dispatch(openWAShareModal({
        tutorName: name, tutorPhone: phone, dateStr: ivAt,
        parentName: parentData?.name || '',
        parentPhone: parentData?.phone || '',
        studentName: parentData?.studentName || '',
        parentAddress: parentData?.address || '',
        sheetRow,
      }));
    };

    const openCal = (e) => {
      e.stopPropagation();
      dispatch(openCalPromptModal({
        sheetRow,
        tutorName: cellValue(row, C.NAME),
        tutorEmail: cellValue(row, C.EMAIL),
        dateStr: ivAt,
        studentName: parentData?.studentName || '',
        parentName: parentData?.name || '',
        parentAddress: parentData?.address || '',
      }));
    };

    return (
      <div className="card-interview card-section">
        {header}
        <div className="card-section-body">
          <div className="iv-date">
            <span>{dateLbl}</span>
            {daysLbl && <span className="iv-days-lbl">{daysLbl}</span>}
          </div>
          {parentData && (
            <div className="iv-parent-tag">
              With {parentData.name}{parentData.studentName ? ` & ${parentData.studentName}` : ''} · {parentData.phone}
            </div>
          )}
          <div className="iv-actions">
            <button className="btn-iv-action" onClick={openSchedule}>{PENCIL} Change</button>
            <button className="btn-iv-action" onClick={confirmCancel}>{CLOSE_SVG} Cancel</button>
            <button className="btn-iv-action btn-iv-wa" onClick={openWA}>{WA_SVG} Share</button>
            {calId
              ? <span className="iv-cal-blocked">{GCAL_SVG} Blocked in Calendar</span>
              : <button className="btn-iv-action" onClick={openCal}>{GCAL_SVG} Block Calendar</button>
            }
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card-interview card-section">
      {header}
      <div className="card-section-body">
        <button className="btn-inline-text" onClick={openSchedule}>+ Schedule a Visit</button>
      </div>
    </div>
  );
}

// ── Main TutorCard ─────────────────────────────────────────────────────────────
export default function TutorCard({ row: initialRow, cfg, expandedUid, onExpand, onReload }) {
  const dispatch     = useDispatch();
  const token        = useSelector(s => s.auth.token);
  const selectedUids = useSelector(s => s.ui.selectedUids);
  const [row, setRow] = useState(initialRow);

  useEffect(() => { setRow(initialRow); }, [initialRow]);

  const sheetRow = row[31];
  const uid      = String(sheetRow);
  const expanded = expandedUid === uid;
  const cardRef  = useRef(null);

  useEffect(() => {
    if (!expanded || !cardRef.current) return;
    const timer = setTimeout(() => {
      const headerOffset = (document.querySelector('.tab-bar')?.getBoundingClientRect().bottom ?? 130) + 16;
      const anchor = cardRef.current.querySelector('.btn-expand') ?? cardRef.current;
      const anchorTop = anchor.getBoundingClientRect().top + window.scrollY - headerOffset;
      window.scrollTo({ top: anchorTop, behavior: 'smooth' });
    }, 320);
    return () => clearTimeout(timer);
  }, [expanded]);
  const isSelected = selectedUids.includes(uid);

  const name      = cellValue(row, C.NAME)    || '(No name)';
  const phone     = cellValue(row, C.PHONE);
  const digits    = normalizePhone(phone);
  const email     = cellValue(row, C.EMAIL);
  const college   = cellValue(row, C.COLLEGE);
  const location  = cellValue(row, C.LOCATION);
  const status    = cellValue(row, C.STATUS);
  const appId     = cellValue(row, C.APP_ID);
  const submitted = cellValue(row, C.SUBMITTED);
  const contacted = cellValue(row, C.CONTACTED);
  const mailSent  = cellValue(row, C.MAIL_SENT);
  const notes     = cellValue(row, C.NOTES);
  const source    = cellValue(row, C.SOURCE);
  const subjects  = cellValue(row, C.SUBJECTS);
  const timings   = cellValue(row, C.TIMINGS);
  const pay       = cellValue(row, C.PAY);
  const travel    = cellValue(row, C.TRAVEL);
  const languages = cellValue(row, C.LANGUAGES);
  const extras    = cellValue(row, C.EXTRAS);
  const referral  = cellValue(row, C.REFERRAL);
  const open      = cellValue(row, C.OPEN);
  const workhours = cellValue(row, C.WORKHOURS);
  const classes   = cellValue(row, C.CLASSES);
  const student   = cellValue(row, C.STUDENT);

  const badgeClass = status === 'In-Loop' ? 'badge-inloop' : status === 'Onboarded' ? 'badge-onboarded' : 'badge-hidden';
  const waMsg  = `Hello ${name}, I'm contacting you regarding your submission for KidsBuddy home tuitions.`;
  const waHref = digits ? `https://wa.me/91${digits}?text=${encodeURIComponent(waMsg)}` : null;
  const callHref = digits ? `tel:+91${digits}` : null;
  const mailHref = email  ? `mailto:${email}`  : null;

  const updateLocal = (colIdx, value) => {
    const newRow = [...row]; newRow[colIdx] = value; newRow[31] = sheetRow;
    setRow(newRow);
    dispatch(updateRowInPlace({ sheetRow, colIdx, value }));
  };

  // ── Contact toggle (pill) ──────────────────────────────────────────────────
  const handleContactedToggle = async (e) => {
    e.stopPropagation();
    const next = contacted === 'Yes' ? 'No' : 'Yes';
    updateLocal(C.CONTACTED, next);
    if (!DEV_MODE) {
      try { await updateCell(SHEETS.TUTORS_APPLIED, sheetRow, C.CONTACTED + 1, next, token); }
      catch { updateLocal(C.CONTACTED, contacted); }
    }
  };

  // ── Mail sent toggle ───────────────────────────────────────────────────────
  const handleMailToggle = async (e) => {
    e.stopPropagation();
    const next = mailSent === 'Yes' ? 'No' : 'Yes';
    updateLocal(C.MAIL_SENT, next);
    if (!DEV_MODE) {
      try { await updateCell(SHEETS.TUTORS_APPLIED, sheetRow, C.MAIL_SENT + 1, next, token); }
      catch { updateLocal(C.MAIL_SENT, mailSent); }
    }
  };

  // ── handleCommunicationTap — auto-marks contacted + prompts In-Loop ────────
  const handleCommunicationTap = async () => {
    if (contacted !== 'Yes') {
      updateLocal(C.CONTACTED, 'Yes');
      if (!DEV_MODE) {
        try { await updateCell(SHEETS.TUTORS_APPLIED, sheetRow, C.CONTACTED + 1, 'Yes', token); }
        catch { updateLocal(C.CONTACTED, contacted); }
      }
    }
    if (status !== 'In-Loop') {
      dispatch(openInLoopModal({ sheetRow, uid, name }));
    }
  };

  // ── logCall ────────────────────────────────────────────────────────────────
  const logCall = async () => {
    const fmt = nowSheetFmt();
    updateLocal(C.LAST_CALLED, fmt);
    if (!DEV_MODE) {
      try { await updateCell(SHEETS.TUTORS_APPLIED, sheetRow, C.LAST_CALLED + 1, fmt, token); } catch {}
    }
  };

  // ── Copy phone ─────────────────────────────────────────────────────────────
  const copyPhone = (e) => {
    e.stopPropagation();
    if (!digits) return;
    navigator.clipboard.writeText(digits)
      .then(() => dispatch(showToast('Copied')));
  };

  // ── Trash ──────────────────────────────────────────────────────────────────
  const trashCard = (e) => {
    e.stopPropagation();
    setConfirmCallback(async () => {
      if (!DEV_MODE) {
        dispatch(showLoader());
        try {
          const rowCopy = row.slice(0, 31);
          rowCopy[C.DELETED_AT]   = nowSheetFmt();
          rowCopy[C.ORIGINAL_TAB] = cfg?.sheet || '';
          await appendRow(cfg?.binSheet || 'Tutors (Bin)', rowCopy, token);
          const idMap = await getSheetIds(token);
          const sId   = idMap[cfg?.sheet || 'Tutors (Applied)'];
          if (sId !== undefined) await deleteRow(sId, sheetRow, token);
        } catch (err) {
          dispatch(hideLoader());
          dispatch(showToast({ message: 'Delete failed: ' + err.message, type: 'error' }));
          return;
        }
        dispatch(hideLoader());
      }
      dispatch(removeRow(sheetRow));
      dispatch(incrementTabCount('bin'));
      dispatch(showToast(`Moved ${name} to Bin`));
    });
    dispatch(openConfirmModal({
      message: 'Move to bin?<br><span class="confirm-sub">Saved in Bin for 30 days, then permanently removed.</span>',
    }));
  };

  // ── Actions (hamburger) ────────────────────────────────────────────────────
  const openActions = (e) => {
    e.stopPropagation();
    dispatch(openActionsModal({
      sheetRow, uid, section: 'tutors',
      tabKey: cfg?.key || 'all',
    }));
  };

  const contactIcons = (
    <span className="contact-icons">
      {callHref && (
        <a className="icon-call" href={callHref} title="Call"
          onClick={e => { e.stopPropagation(); logCall(); handleCommunicationTap(); }}>
          {CALL_SVG}
        </a>
      )}
      {waHref && (
        <a className="icon-wa" href={waHref} target="_blank" rel="noopener noreferrer" title="WhatsApp"
          onClick={e => { e.stopPropagation(); handleCommunicationTap(); }}>
          {WA_SVG}
        </a>
      )}
      {mailHref && (
        <a className="icon-mail" href={mailHref} title="Email"
          onClick={e => { e.stopPropagation(); handleCommunicationTap(); }}>
          {MAIL_SVG}
        </a>
      )}
      {digits && (
        <button className="icon-copy" title="Copy number" onClick={copyPhone}>
          {COPY_SVG}
        </button>
      )}
    </span>
  );

  return (
    <>
      <tr ref={cardRef} className={`data-row${expanded ? ' expanded' : ''}`} onClick={() => onExpand(uid)}>
        {/* td-id */}
        <td className="td-id">{appId}</td>

        {/* td-name: date, status, name, source chip */}
        <td className="td-name">
          <span className="card-applied-at">{formatDate(submitted)}</span>
          <span className={`status-badge ${badgeClass}`} data-uid={uid}>{status}</span>
          {name}
          {' '}
          <SourceChip value={source} sheetRow={sheetRow} onUpdate={updateLocal} />
        </td>

        {/* td-phone (desktop, hidden on mobile) */}
        <td className="td-phone td-phone-desktop">
          <span className="phone-num">{phone}</span>
          {contactIcons}
        </td>

        {/* td-classes: info rows + Contact + Interview + Notes */}
        <td className="td-classes">
          <div className="info-flat-rows">
            {timings  && <span className="info-flat-row">{CLOCK_SVG}{timings}</span>}
            {pay      && <span className="info-flat-row">{RUPEE_SVG}{pay}</span>}
            {location && <span className="info-flat-row">{PIN_SVG}{location}</span>}
          </div>

          {/* Contact section */}
          <div className="card-section">
            <div className="card-section-header">
              <span className="cs-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {USER_SVG} Contact
              </span>
            </div>
            <div className="card-section-body">
              <div className="contact-phone-row">
                <span className="phone-num">{phone}</span>
                {contactIcons}
              </div>
              <button
                className={`pill-toggle ${contacted === 'Yes' ? 'yes' : 'no'}`}
                onClick={handleContactedToggle}
              >
                <span className="pt-yes">Contacted</span>
                <span className="pt-no">Not yet</span>
              </button>
            </div>
          </div>

          {/* Interview section */}
          <InterviewSection row={row} sheetRow={sheetRow} onUpdate={updateLocal} />

          {/* Notes section */}
          <NotesSection
            sheetRow={sheetRow}
            sheetName={cfg?.sheet || SHEETS.TUTORS_APPLIED}
            initialNotes={notes}
            colIdx={C.NOTES}
            onUpdate={updateLocal}
          />
        </td>

        {/* td-date */}
        <td className="td-date">{formatDate(submitted)}</td>

        {/* Actions column */}
        <td onClick={e => e.stopPropagation()}>
          <div className="card-top-actions">
            <button className="btn-card-move" title="Actions" onClick={openActions}>
              {HAMBURGER}
              <span className="card-action-label">Actions</span>
            </button>
            <label className="card-check-wrap" onClick={e => e.stopPropagation()}>
              <input
                type="checkbox"
                className="card-check"
                checked={isSelected}
                onChange={() => dispatch(toggleUidSelection(uid))}
              />
              <span className="card-check-box" />
              <span className="card-action-label">Select</span>
            </label>
            <button
              className="btn-card-edit"
              title="Edit"
              onClick={e => { e.stopPropagation(); dispatch(openEditCardModal({ sheetRow, uid, section: 'tutors' })); }}
            >
              {PENCIL}
              <span className="card-action-label">Edit</span>
            </button>
            <button className="btn-card-trash" title="Move to bin" onClick={trashCard}>
              {TRASH}
              <span className="card-action-label">Delete</span>
            </button>
          </div>
        </td>

        {/* Mail Sent */}
        <td className="td-mail-sent">
          <button
            className={`btn-toggle ${mailSent === 'Yes' ? 'yes' : 'no'}`}
            onClick={handleMailToggle}
          >
            {mailSent || 'No'}
          </button>
        </td>

        {/* Expand */}
        <td className="td-expand">
          <button
            className="btn-expand"
            onClick={e => { e.stopPropagation(); onExpand(uid); }}
          >
            <span className="btn-expand-label">{expanded ? 'Hide full information' : 'Show full information'}</span>
            <span className="expand-icon" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-flex' }}>
              {CHEVRON}
            </span>
          </button>
        </td>
      </tr>

      {/* Detail row */}
      {expanded && (
        <tr className="detail-row open" id={`detail-${uid}`}>
          <td colSpan="8">
            <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              {submitted && <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>Submitted</div><div style={{ fontSize: 13 }}>{formatDate(submitted)}</div></div>}
              {email     && <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>Email</div><div style={{ fontSize: 13 }}>{email}</div></div>}
              {student   && <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>Student / Working</div><div style={{ fontSize: 13 }}>{student}</div></div>}
              {college   && <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>College / Company</div><div style={{ fontSize: 13 }}>{college}</div></div>}
              {location  && <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>Stay Location</div><div style={{ fontSize: 13 }}>{location}</div></div>}
              {travel    && <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>Travel Mode</div><div style={{ fontSize: 13 }}>{travel}</div></div>}
              {subjects  && <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>Subjects</div><div style={{ fontSize: 13 }}>{subjects}</div></div>}
              {languages && <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>Languages</div><div style={{ fontSize: 13 }}>{languages}</div></div>}
              {extras    && <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>Extra Activities</div><div style={{ fontSize: 13 }}>{extras}</div></div>}
              {timings   && <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>Available Timings</div><div style={{ fontSize: 13 }}>{timings}</div></div>}
              {pay       && <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>Expected Pay / hr</div><div style={{ fontSize: 13 }}>₹{pay}</div></div>}
              {referral  && <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>Referral</div><div style={{ fontSize: 13 }}>{referral}</div></div>}
              {open      && <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>Open to Contact</div><div style={{ fontSize: 13 }}>{open}</div></div>}
              {workhours && <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>College / Work Timings</div><div style={{ fontSize: 13 }}>{workhours}</div></div>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

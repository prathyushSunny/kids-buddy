import React, { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { CP, SHEETS, DEV_MODE } from '../../constants';
import NotesSection from '../common/NotesSection';
import { cellValue, normalizePhone, updateCell, appendRow, deleteRow, getSheetIds } from '../../services/sheetsApi';
import { formatDate, nowSheetFmt } from '../../utils/dateUtils';
import { setConfirmCallback } from '../../utils/confirmService';
import {
  toggleUidSelection, showToast, showLoader, hideLoader,
  openConfirmModal, openActionsModal, openEditCardModal, openContactFollowUpModal,
  openShareToTutorModal,
} from '../../features/ui/uiSlice';
import { updateRowInPlace, removeRow, incrementTabCount } from '../../features/parents/parentsSlice';

// ── SVGs ──────────────────────────────────────────────────────────────────────
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
  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
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
const SAVE_CONTACT_SVG = (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <line x1="19" y1="8" x2="19" y2="14"/>
    <line x1="22" y1="11" x2="16" y2="11"/>
  </svg>
);
const USER_SVG = (
  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);
const PIN_SVG = (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>
);
const SUBJECTS_SVG = (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
  </svg>
);
const STUDENT_SVG = (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
    <path d="M6 12v5c3 3 9 3 12 0v-5"/>
  </svg>
);
const SHARE_SVG = (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>
);

// ── Main ParentCard ───────────────────────────────────────────────────────────
export default function ParentCard({ row: initialRow, cfg, expandedUid, onExpand }) {
  const dispatch     = useDispatch();
  const token        = useSelector(s => s.auth.token);
  const selectedUids = useSelector(s => s.ui.selectedUids);
  const [row, setRow] = useState(initialRow);

  useEffect(() => { setRow(initialRow); }, [initialRow]);

  const sheetRow   = row[31];
  const uid        = String(sheetRow);
  const expanded   = expandedUid === uid;
  const cardRef    = useRef(null);

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

  const name        = cellValue(row, CP.NAME)          || '(No name)';
  const phone       = cellValue(row, CP.PHONE);
  const digits      = normalizePhone(phone);
  const email       = cellValue(row, CP.EMAIL);
  const location    = cellValue(row, CP.LOCATION);
  const address     = cellValue(row, CP.ADDRESS);
  const studentName = cellValue(row, CP.STUDENT_NAME);
  const grade       = cellValue(row, CP.STUDENT_GRADE);
  const subjects    = cellValue(row, CP.SUBJECTS_NEEDED);
  const tutor       = cellValue(row, CP.ASSIGNED_TUTOR);
  const lastContact = cellValue(row, CP.LAST_CONTACTED);
  const onboardedOn = cellValue(row, CP.ONBOARDED_ON);
  const contacted   = cellValue(row, CP.CONTACTED);
  const status      = cellValue(row, CP.STATUS);
  const notes       = cellValue(row, CP.NOTES);
  const mapsLink    = cellValue(row, CP.MAPS_LINK);
  const area        = cellValue(row, CP.AREA);

  const badgeClass  = status === 'In-Loop' ? 'badge-inloop' : status === 'Onboarded' ? 'badge-onboarded' : 'badge-hidden';

  const waMsg  = `Hello ${name}, contacting you regarding home tuitions.`;
  const waNum  = digits ? (digits.length === 10 ? '91' + digits : digits) : null;
  const waHref = waNum ? `https://wa.me/${waNum}?text=${encodeURIComponent(waMsg)}` : null;
  const callHref = digits ? `tel:${digits}` : null;
  const mailHref = email  ? `mailto:${email}` : null;

  const updateLocal = (colIdx, value) => {
    const newRow = [...row]; newRow[colIdx] = value; newRow[31] = sheetRow;
    setRow(newRow);
    dispatch(updateRowInPlace({ sheetRow, colIdx, value }));
  };

  // ── logCall — records last-contacted timestamp on any contact action ──────────
  const logCall = async () => {
    const fmt = nowSheetFmt();
    updateLocal(CP.LAST_CONTACTED, fmt);
    if (!DEV_MODE) {
      try { await updateCell(cfg?.sheet || SHEETS.PARENTS_TO_CONTACT, sheetRow, CP.LAST_CONTACTED + 1, fmt, token); } catch {}
    }
  };

  // ── handleCommunicationTap — opens contact follow-up flow (only if not yet contacted) ──
  const handleCommunicationTap = () => {
    if (contacted === 'Yes') return;
    dispatch(openContactFollowUpModal({
      sheetRow, uid, name, section: 'parents',
      sheet: cfg?.sheet || SHEETS.PARENTS_TO_CONTACT,
    }));
  };

  // Contact pill toggle
  const handleContactedToggle = async (e) => {
    e.stopPropagation();
    const next = contacted === 'Yes' ? 'No' : 'Yes';
    updateLocal(CP.CONTACTED, next);
    if (!DEV_MODE) {
      try { await updateCell(cfg?.sheet || SHEETS.PARENTS_TO_CONTACT, sheetRow, CP.CONTACTED + 1, next, token); }
      catch { updateLocal(CP.CONTACTED, contacted); }
    }
  };

  // Copy phone
  const copyPhone = (e) => {
    e.stopPropagation();
    if (!digits) return;
    navigator.clipboard.writeText(digits).then(() => dispatch(showToast('Copied')));
  };

  // Save contact (vCard download)
  const saveContact = (e) => {
    e.stopPropagation();
    const email = cellValue(row, CP.EMAIL) || '';
    const vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${name}`,
      `TEL;TYPE=CELL:${digits ? `+91${digits}` : ''}`,
      email ? `EMAIL:${email}` : '',
      'END:VCARD',
    ].filter(Boolean).join('\r\n');
    const blob = new Blob([vcf], { type: 'text/vcard' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${name}.vcf`;
    a.click();
    URL.revokeObjectURL(url);
    dispatch(showToast(`${name} saved to contacts`));
  };

  // Trash
  const trashCard = (e) => {
    e.stopPropagation();
    setConfirmCallback(async () => {
      if (!DEV_MODE) {
        dispatch(showLoader());
        try {
          const rowCopy = row.slice(0, 31);
          rowCopy[CP.DELETED_AT]   = nowSheetFmt();
          rowCopy[CP.ORIGINAL_TAB] = cfg?.sheet || '';
          await appendRow(cfg?.binSheet || 'Parents (Bin)', rowCopy, token);
          const idMap = await getSheetIds(token);
          const sId   = idMap[cfg?.sheet || 'Parents (To-Contact)'];
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

  const openActions = (e) => {
    e.stopPropagation();
    dispatch(openActionsModal({ sheetRow, uid, section: 'parents', tabKey: cfg?.key || 'all' }));
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
          onClick={e => { e.stopPropagation(); logCall(); handleCommunicationTap(); }}>
          {WA_SVG}
        </a>
      )}
      {mailHref && (
        <a className="icon-mail" href={mailHref} title="Email"
          onClick={e => { e.stopPropagation(); logCall(); handleCommunicationTap(); }}>
          {MAIL_SVG}
        </a>
      )}
      {digits && (
        <button className="icon-copy" title="Copy number" onClick={copyPhone}>
          {COPY_SVG}
        </button>
      )}
      {digits && (
        <button className="icon-copy" title="Save contact" onClick={saveContact}>
          {SAVE_CONTACT_SVG}
        </button>
      )}
    </span>
  );

  return (
    <>
      <tr ref={cardRef} className={`data-row${expanded ? ' expanded' : ''}`}>
        {/* td-id */}
        <td className="td-id" />

        {/* td-name: date + name + share icon */}
        <td className="td-name">
          <span className="card-applied-at">{formatDate(onboardedOn)}</span>
          <span className={`status-badge ${badgeClass}`} data-uid={uid}>{status}</span>
          {name}
          <button
            className="btn-share-tutor"
            title="Share to Tutor"
            onClick={e => {
              e.stopPropagation();
              dispatch(openShareToTutorModal({ parentName: name, studentName, grade, subjects, area }));
            }}
          >
            {SHARE_SVG}
          </button>
        </td>

        {/* td-phone (desktop) */}
        <td className="td-phone td-phone-desktop">
          <span className="phone-num">{phone}</span>
          {contactIcons}
        </td>

        {/* td-classes: info rows + Contact + Notes (no interview section) */}
        <td className="td-classes">
          <div className="info-flat-rows">
            {subjects    && <span className="info-flat-row">{SUBJECTS_SVG}{subjects}</span>}
            {studentName && (
              <span className="info-flat-row">
                {STUDENT_SVG}{studentName}{grade ? ` · ${grade}` : ''}
              </span>
            )}
            {location    && <span className="info-flat-row">{PIN_SVG}{location}</span>}
          </div>

          <div className="card-section">
            <div className="card-section-body">
              <div className="contact-phone-row">
                <span className="phone-num">{phone}</span>
                {contactIcons}
              </div>
            </div>
            <div className="card-section-header">
              <button
                className={`pill-toggle ${contacted === 'Yes' ? 'yes' : 'no'}`}
                onClick={handleContactedToggle}
              >
                <span className="pt-yes">Contacted</span>
                <span className="pt-no">Not yet</span>
              </button>
            </div>
          </div>

          <NotesSection
            sheetRow={sheetRow}
            sheetName={cfg?.sheet || SHEETS.PARENTS_TO_CONTACT}
            initialNotes={notes}
            colIdx={CP.NOTES}
            onUpdate={updateLocal}
          />
        </td>

        {/* td-date */}
        <td className="td-date">{formatDate(onboardedOn)}</td>

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
              onClick={e => { e.stopPropagation(); dispatch(openEditCardModal({ sheetRow, uid, section: 'parents' })); }}
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

        {/* td-mail-sent — empty for parents */}
        <td className="td-mail-sent" />

        {/* Expand */}
        <td className="td-expand">
          <button
            className="btn-expand"
            onClick={e => { e.stopPropagation(); onExpand(uid); }}
          >
            <span className="btn-expand-label">
              {expanded ? 'Hide full information' : 'Show full information'}
            </span>
            <span style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-flex' }}>
              {CHEVRON}
            </span>
          </button>
        </td>
      </tr>

      {/* Detail row — always rendered, animated via max-height */}
      <tr className={`detail-row${expanded ? ' open' : ''}`}>
        <td colSpan="8">
          <div className="detail-body-wrap">
            <div className="detail-body-inner">
              <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                {onboardedOn && <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>Onboarded On</div><div style={{ fontSize: 13 }}>{formatDate(onboardedOn)}</div></div>}
                {email       && <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>Email</div><div style={{ fontSize: 13 }}>{email}</div></div>}
                {location    && <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>Location</div><div style={{ fontSize: 13 }}>{location}</div></div>}
                {address     && <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>Address</div><div style={{ fontSize: 13 }}>{address}</div></div>}
                {studentName && <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>Student Name</div><div style={{ fontSize: 13 }}>{studentName}</div></div>}
                {grade       && <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>Student Grade</div><div style={{ fontSize: 13 }}>{grade}</div></div>}
                {subjects    && <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>Subjects Needed</div><div style={{ fontSize: 13 }}>{subjects}</div></div>}
                {tutor       && <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>Assigned Tutor</div><div style={{ fontSize: 13 }}>{tutor}</div></div>}
                {lastContact && <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>Last Contacted</div><div style={{ fontSize: 13 }}>{lastContact}</div></div>}
                {mapsLink    && <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>Maps</div><div style={{ fontSize: 13 }}><a href={mapsLink} target="_blank" rel="noopener noreferrer" style={{ color: '#1d4ed8', textDecoration: 'underline' }} onClick={e => e.stopPropagation()}>Open in Maps ↗</a></div></div>}
              </div>
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}

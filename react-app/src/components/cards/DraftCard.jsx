import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { C, CP, SHEETS, DEV_MODE } from '../../constants';
import { cellValue, appendRow, deleteRow, getSheetIds } from '../../services/sheetsApi';
import { formatDate } from '../../utils/dateUtils';
import { showToast, showLoader, hideLoader } from '../../features/ui/uiSlice';
import { removeRow as removeTutorRow, decrementTabCount as decTutor } from '../../features/tutors/tutorsSlice';
import { removeRow as removeParentRow, decrementTabCount as decParent } from '../../features/parents/parentsSlice';

const RESTORE_SVG = (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/>
  </svg>
);

const CHEVRON_SVG = (
  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

function InfoField({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13 }}>{value}</div>
    </div>
  );
}

export default function DraftCard({ row, section = 'tutors' }) {
  const dispatch   = useDispatch();
  const token      = useSelector(s => s.auth.token);
  const [expanded, setExpanded] = useState(false);

  const isParents = section === 'parents';
  const sheetRow  = row[31];

  const name     = isParents ? cellValue(row, CP.NAME)     : cellValue(row, C.NAME);
  const phone    = isParents ? cellValue(row, CP.PHONE)    : cellValue(row, C.PHONE);
  const location = isParents ? cellValue(row, CP.LOCATION) : cellValue(row, C.LOCATION);
  const notes    = isParents ? cellValue(row, CP.NOTES)    : cellValue(row, C.NOTES);
  const dateVal  = isParents
    ? formatDate(cellValue(row, CP.ONBOARDED_ON))
    : formatDate(cellValue(row, C.SUBMITTED));

  const restore = async (e) => {
    e.stopPropagation();
    const removeFn = isParents ? removeParentRow : removeTutorRow;
    const decFn    = isParents ? decParent       : decTutor;

    if (DEV_MODE) {
      dispatch(removeFn(sheetRow));
      dispatch(decFn('draft'));
      dispatch(showToast(`${name} restored to All`));
      return;
    }
    dispatch(showLoader());
    try {
      if (isParents) {
        await appendRow(SHEETS.PARENTS_TO_CONTACT, row.slice(0, 31), token);
        const idMap   = await getSheetIds(token);
        const draftId = idMap[SHEETS.PARENTS_DRAFT];
        if (draftId !== undefined) await deleteRow(draftId, sheetRow, token);
      } else {
        await appendRow(SHEETS.TUTORS_APPLIED, row.slice(0, 31), token);
        const idMap   = await getSheetIds(token);
        const draftId = idMap[SHEETS.TUTORS_DRAFT];
        if (draftId !== undefined) await deleteRow(draftId, sheetRow, token);
      }
      dispatch(removeFn(sheetRow));
      dispatch(decFn('draft'));
      dispatch(hideLoader());
      dispatch(showToast(`${name} restored to All`));
    } catch (err) {
      dispatch(hideLoader());
      dispatch(showToast({ message: 'Restore failed: ' + err.message, type: 'error' }));
    }
  };

  const renderExpandedInfo = () => {
    if (!isParents) {
      return (
        <div className="bin-expanded-grid">
          <InfoField label="Email"             value={cellValue(row, C.EMAIL)} />
          <InfoField label="College / Company" value={cellValue(row, C.COLLEGE)} />
          <InfoField label="Stay Location"     value={cellValue(row, C.LOCATION)} />
          <InfoField label="Travel Mode"       value={cellValue(row, C.TRAVEL)} />
          <InfoField label="Student / Working" value={cellValue(row, C.STUDENT)} />
          <InfoField label="Subjects"          value={cellValue(row, C.SUBJECTS)} />
          <InfoField label="Languages"         value={cellValue(row, C.LANGUAGES)} />
          <InfoField label="Extra Activities"  value={cellValue(row, C.EXTRAS)} />
          <InfoField label="Available Timings" value={cellValue(row, C.TIMINGS)} />
          <InfoField label="Expected Pay / hr" value={cellValue(row, C.PAY) ? `₹${cellValue(row, C.PAY)}` : ''} />
          <InfoField label="Classes"           value={cellValue(row, C.CLASSES)} />
        </div>
      );
    }
    return (
      <div className="bin-expanded-grid">
        <InfoField label="Email"           value={cellValue(row, CP.EMAIL)} />
        <InfoField label="Location"        value={cellValue(row, CP.LOCATION)} />
        <InfoField label="Address"         value={cellValue(row, CP.ADDRESS)} />
        <InfoField label="Student Name"    value={cellValue(row, CP.STUDENT_NAME)} />
        <InfoField label="Student Grade"   value={cellValue(row, CP.STUDENT_GRADE)} />
        <InfoField label="Subjects Needed" value={cellValue(row, CP.SUBJECTS_NEEDED)} />
      </div>
    );
  };

  return (
    <>
      <tr className="bin-row">
        <td className="td-bin-info">
          <span className="bin-name">{name}</span>
          <span className="bin-meta">
            {phone}{location ? ` · ${location}` : ''}
          </span>
          <span className="bin-sub-date">{dateVal}</span>
          {notes && (
            <span className="bin-draft-notes">
              <span className="bin-draft-notes-label">Notes</span>
              {notes}
            </span>
          )}
        </td>
        <td className="td-bin-actions">
          <button
            className="btn-bin-expand"
            onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
            title={expanded ? 'Hide details' : 'Show details'}
          >
            <span style={{ transform: expanded ? 'rotate(180deg)' : 'none', display: 'inline-flex', transition: 'transform 0.2s' }}>
              {CHEVRON_SVG}
            </span>
          </button>
          <button className="btn-restore" title="Restore to All" onClick={restore}>
            {RESTORE_SVG} Restore
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bin-detail-row">
          <td colSpan="2">
            {renderExpandedInfo()}
          </td>
        </tr>
      )}
    </>
  );
}

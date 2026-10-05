import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { C, CP, SHEETS, DEV_MODE } from '../../constants';
import { cellValue, appendRow, deleteRow, getSheetIds } from '../../services/sheetsApi';
import { showToast, showLoader, hideLoader } from '../../features/ui/uiSlice';
import { removeRow as removeTutorRow, decrementTabCount as decrementTutorCount } from '../../features/tutors/tutorsSlice';
import { removeRow as removeParentRow, decrementTabCount as decrementParentCount } from '../../features/parents/parentsSlice';

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

export default function BinCard({ row, section }) {
  const dispatch   = useDispatch();
  const token      = useSelector(s => s.auth.token);
  const [expanded, setExpanded] = useState(false);

  const isTutor  = section === 'tutors';
  const sheetRow = row[31];

  const name    = isTutor ? cellValue(row, C.NAME)  : cellValue(row, CP.NAME);
  const phone   = isTutor ? cellValue(row, C.PHONE) : cellValue(row, CP.PHONE);
  const origTab = isTutor ? cellValue(row, C.ORIGINAL_TAB) : cellValue(row, CP.ORIGINAL_TAB);

  const origLabel = (() => {
    const m = (origTab || '').match(/\((.+)\)/);
    return m ? m[1] : origTab || '';
  })();

  const restore = async (e) => {
    e.stopPropagation();
    if (DEV_MODE) {
      dispatch(isTutor ? removeTutorRow(sheetRow) : removeParentRow(sheetRow));
      dispatch(isTutor ? decrementTutorCount('bin') : decrementParentCount('bin'));
      dispatch(showToast(`${name} restored`));
      return;
    }
    dispatch(showLoader());
    try {
      const destSheet = isTutor
        ? (origTab || SHEETS.TUTORS_APPLIED)
        : (origTab || SHEETS.PARENTS_TO_CONTACT);

      let rowCopy;
      if (isTutor) {
        rowCopy = row.slice(0, 28);
        rowCopy[28] = '';
        rowCopy[29] = '';
        rowCopy[30] = row[30] || '';
        rowCopy.length = 31;
      } else {
        rowCopy = row.slice(0, CP.DELETED_AT);
        rowCopy.length = CP.DELETED_AT;
      }

      await appendRow(destSheet, rowCopy, token);
      const idMap   = await getSheetIds(token);
      const binSheet = isTutor ? SHEETS.TUTORS_BIN : SHEETS.PARENTS_BIN;
      const binId   = idMap[binSheet];
      if (binId !== undefined) await deleteRow(binId, sheetRow, token);

      dispatch(isTutor ? removeTutorRow(sheetRow) : removeParentRow(sheetRow));
      dispatch(isTutor ? decrementTutorCount('bin') : decrementParentCount('bin'));
      dispatch(hideLoader());
      dispatch(showToast(`${name} restored`));
    } catch (err) {
      dispatch(hideLoader());
      dispatch(showToast({ message: 'Restore failed: ' + err.message, type: 'error' }));
    }
  };

  const renderExpandedInfo = () => {
    if (isTutor) {
      return (
        <div className="bin-expanded-grid">
          <InfoField label="Email"            value={cellValue(row, C.EMAIL)} />
          <InfoField label="College / Company" value={cellValue(row, C.COLLEGE)} />
          <InfoField label="Stay Location"    value={cellValue(row, C.LOCATION)} />
          <InfoField label="Travel Mode"      value={cellValue(row, C.TRAVEL)} />
          <InfoField label="Student / Working" value={cellValue(row, C.STUDENT)} />
          <InfoField label="Subjects"         value={cellValue(row, C.SUBJECTS)} />
          <InfoField label="Languages"        value={cellValue(row, C.LANGUAGES)} />
          <InfoField label="Extra Activities" value={cellValue(row, C.EXTRAS)} />
          <InfoField label="Available Timings" value={cellValue(row, C.TIMINGS)} />
          <InfoField label="Expected Pay / hr" value={cellValue(row, C.PAY) ? `₹${cellValue(row, C.PAY)}` : ''} />
          <InfoField label="Classes"          value={cellValue(row, C.CLASSES)} />
          <InfoField label="Notes"            value={cellValue(row, C.NOTES)} />
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
        <InfoField label="Notes"           value={cellValue(row, CP.NOTES)} />
      </div>
    );
  };

  return (
    <>
      <tr className="bin-row">
        <td className="td-bin-info">
          <span className="bin-name">{name}</span>
          <span className="bin-meta">
            {phone}{origLabel ? ` · from ${origLabel}` : ''}
          </span>
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
          <button className="btn-restore" title="Restore" onClick={restore}>
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

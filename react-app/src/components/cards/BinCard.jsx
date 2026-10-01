import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { C, CP, SHEETS, DEV_MODE } from '../../constants';
import { cellValue, appendRow, deleteRow, getSheetIds } from '../../services/sheetsApi';
import { daysLeft } from '../../utils/dateUtils';
import { showToast, showLoader, hideLoader } from '../../features/ui/uiSlice';
import { removeRow as removeTutorRow, decrementTabCount as decrementTutorCount } from '../../features/tutors/tutorsSlice';
import { removeRow as removeParentRow, decrementTabCount as decrementParentCount } from '../../features/parents/parentsSlice';

const RESTORE_SVG = (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/>
  </svg>
);

export default function BinCard({ row, section }) {
  const dispatch = useDispatch();
  const token    = useSelector(s => s.auth.token);

  const isTutor  = section === 'tutors';
  const sheetRow = row[31];

  const name      = isTutor ? cellValue(row, C.NAME)  : cellValue(row, CP.NAME);
  const phone     = isTutor ? cellValue(row, C.PHONE) : cellValue(row, CP.PHONE);
  const deletedAt = isTutor ? cellValue(row, C.DELETED_AT) : cellValue(row, CP.DELETED_AT);
  const origTab   = isTutor ? cellValue(row, C.ORIGINAL_TAB) : cellValue(row, CP.ORIGINAL_TAB);

  const left    = daysLeft(deletedAt);
  const leftCls = `days-left${left <= 7 ? ' danger' : ''}`;

  // Extract the label from e.g. "Tutors (Applied)" → "Applied"
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

  return (
    <tr className="bin-row">
      <td className="td-bin-info">
        <span className="bin-name">{name}</span>
        <span className="bin-meta">
          {phone}{origLabel ? ` · from ${origLabel}` : ''}
        </span>
        <span className={leftCls}>{left}d left</span>
      </td>
      <td className="td-bin-actions">
        <button className="btn-restore" title="Restore" onClick={restore}>
          {RESTORE_SVG} Restore
        </button>
      </td>
    </tr>
  );
}

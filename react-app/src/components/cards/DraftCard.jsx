import React from 'react';
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

export default function DraftCard({ row, section = 'tutors' }) {
  const dispatch = useDispatch();
  const token    = useSelector(s => s.auth.token);

  const isParents = section === 'parents';
  const sheetRow  = row[31];

  const name     = isParents ? cellValue(row, CP.NAME)     : cellValue(row, C.NAME);
  const phone    = isParents ? cellValue(row, CP.PHONE)    : cellValue(row, C.PHONE);
  const location = isParents ? cellValue(row, CP.LOCATION) : cellValue(row, C.LOCATION);
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

  return (
    <tr className="bin-row">
      <td className="td-bin-info">
        <span className="bin-name">{name}</span>
        <span className="bin-meta">
          {phone}{location ? ` · ${location}` : ''}
        </span>
        <span className="bin-sub-date">{dateVal}</span>
      </td>
      <td className="td-bin-actions">
        <button className="btn-restore" title="Restore to All" onClick={restore}>
          {RESTORE_SVG} Restore
        </button>
      </td>
    </tr>
  );
}

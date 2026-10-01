import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { C, CP, SHEETS, DEV_MODE } from '../../constants';
import { cellValue, updateCell, appendRow, deleteRow, getSheetIds } from '../../services/sheetsApi';
import { nowSheetFmt } from '../../utils/dateUtils';
import { setConfirmCallback } from '../../utils/confirmService';
import {
  clearSelection, showToast, showLoader, hideLoader, openConfirmModal,
  openActionsModal,
} from '../../features/ui/uiSlice';
import { removeRow as removeTutorRow, incrementTabCount as incTutor } from '../../features/tutors/tutorsSlice';
import { removeRow as removeParentRow, incrementTabCount as incParent } from '../../features/parents/parentsSlice';

const HAMBURGER = (
  <svg width="15" height="15" viewBox="0 0 18 18" fill="none" style={{ marginRight: 5 }}>
    <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5"/>
    <circle cx="5.5" cy="9" r="1.1" fill="currentColor"/>
    <circle cx="9" cy="9" r="1.1" fill="currentColor"/>
    <circle cx="12.5" cy="9" r="1.1" fill="currentColor"/>
  </svg>
);
const TRASH_SVG = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
  </svg>
);

export default function BulkBar({ section, cfg }) {
  const dispatch     = useDispatch();
  const token        = useSelector(s => s.auth.token);
  const selectedUids = useSelector(s => s.ui.selectedUids);
  const tutorRows    = useSelector(s => s.tutors.allRows);
  const parentRows   = useSelector(s => s.parents.allRows);

  const count = selectedUids.length;
  if (!count) return null;

  const isTutors = section !== 'parents';
  const label    = isTutors ? (count === 1 ? 'tutor' : 'tutors') : (count === 1 ? 'contact' : 'contacts');

  // Open bulk actions modal using the first selected row as reference
  const openBulkActions = () => {
    const allRows = isTutors ? tutorRows : parentRows;
    const firstRow = allRows.find(r => selectedUids.includes(String(r[31])));
    if (!firstRow) return;
    dispatch(openActionsModal({
      sheetRow: firstRow[31],
      uid:      String(firstRow[31]),
      section,
      tabKey:   cfg?.key || 'all',
    }));
  };

  const bulkDelete = () => {
    setConfirmCallback(async () => {
      const allRows = isTutors ? tutorRows : parentRows;
      const binSheetName = isTutors ? SHEETS.TUTORS_BIN : SHEETS.PARENTS_BIN;
      const srcSheetName = cfg?.sheet || (isTutors ? SHEETS.TUTORS_APPLIED : SHEETS.PARENTS_TO_CONTACT);
      const statusColIdx = isTutors ? C.STATUS    : CP.STATUS;
      const nameColIdx   = isTutors ? C.NAME      : CP.NAME;
      const delAtColIdx  = isTutors ? C.DELETED_AT  : CP.DELETED_AT;
      const origTabColIdx = isTutors ? C.ORIGINAL_TAB : CP.ORIGINAL_TAB;

      dispatch(showLoader());
      let moved = 0;

      const sorted = [...selectedUids]
        .map(uid => allRows.find(r => String(r[31]) === uid))
        .filter(Boolean)
        .sort((a, b) => b[31] - a[31]); // delete from bottom up

      let idMap = {};
      if (!DEV_MODE && sorted.length) {
        try { idMap = await getSheetIds(token); } catch {}
      }

      for (const row of sorted) {
        const sr = row[31];
        try {
          if (!DEV_MODE) {
            const rowCopy = row.slice(0, 31);
            rowCopy[delAtColIdx]  = nowSheetFmt();
            rowCopy[origTabColIdx] = srcSheetName;
            await appendRow(binSheetName, rowCopy, token);
            const srcId = idMap[srcSheetName];
            if (srcId !== undefined) await deleteRow(srcId, sr, token);
          }
          if (isTutors) dispatch(removeTutorRow(sr));
          else          dispatch(removeParentRow(sr));
          moved++;
        } catch {}
      }

      if (isTutors) dispatch(incTutor('bin'));
      else          dispatch(incParent('bin'));
      dispatch(hideLoader());
      dispatch(clearSelection());
      dispatch(showToast(`${moved} ${label} moved to Bin`));
    });
    dispatch(openConfirmModal({
      message: `Move ${count} ${label} to Bin?<br><span class="confirm-sub">They auto-purge after 30 days.</span>`,
    }));
  };

  return (
    <div className="bulk-bar">
      <span className="bulk-count">{count} selected</span>
      <div className="bulk-actions">
        <button className="btn-bulk-action" onClick={openBulkActions}>
          {HAMBURGER} Actions
        </button>
        <button className="btn-bulk-action btn-bulk-danger" onClick={bulkDelete}>
          {TRASH_SVG} Delete
        </button>
      </div>
      <button className="btn-bulk-cancel" onClick={() => dispatch(clearSelection())}>
        Cancel
      </button>
    </div>
  );
}

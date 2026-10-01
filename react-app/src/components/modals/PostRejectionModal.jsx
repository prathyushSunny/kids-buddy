import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { C, SHEETS, DEV_MODE } from '../../constants';
import { cellValue, updateCell, appendRow, deleteRow, getSheetIds } from '../../services/sheetsApi';
import { nowSheetFmt } from '../../utils/dateUtils';
import { setConfirmCallback } from '../../utils/confirmService';
import {
  closePostRejectionModal, showToast, showLoader, hideLoader, openConfirmModal,
} from '../../features/ui/uiSlice';
import { updateRowInPlace, removeRow, incrementTabCount } from '../../features/tutors/tutorsSlice';

export default function PostRejectionModal() {
  const dispatch  = useDispatch();
  const token     = useSelector(s => s.auth.token);
  const { open, sheetRow } = useSelector(s => s.ui.modals.postRejection);
  const tutorRows = useSelector(s => s.tutors.allRows);

  if (!open) return null;

  const close = () => dispatch(closePostRejectionModal());

  // Helper: reset interview fields + optionally update status
  const rejectionMove = async (targetStatus) => {
    close();
    if (!DEV_MODE) {
      dispatch(showLoader());
      try {
        await Promise.all([
          updateCell(SHEETS.TUTORS_APPLIED, sheetRow, C.INTERVIEW_STATUS + 1, '', token),
          updateCell(SHEETS.TUTORS_APPLIED, sheetRow, C.INTERVIEW_AT     + 1, '', token),
        ]);
      } catch { /* non-critical */ }
      if (targetStatus) {
        try { await updateCell(SHEETS.TUTORS_APPLIED, sheetRow, C.STATUS + 1, targetStatus, token); }
        catch { dispatch(hideLoader()); return; }
      }
      dispatch(hideLoader());
    }
    dispatch(updateRowInPlace({ sheetRow, colIdx: C.INTERVIEW_STATUS, value: '' }));
    dispatch(updateRowInPlace({ sheetRow, colIdx: C.INTERVIEW_AT,     value: '' }));
    if (targetStatus) {
      dispatch(updateRowInPlace({ sheetRow, colIdx: C.STATUS, value: targetStatus }));
      const row = tutorRows.find(r => r[31] === sheetRow);
      const name = row ? cellValue(row, C.NAME) : '';
      dispatch(showToast(`${name} added to ${targetStatus}`));
    }
  };

  const moveToBin = () => {
    close();
    const row  = tutorRows.find(r => r[31] === sheetRow);
    const name = row ? cellValue(row, C.NAME) : '';
    setConfirmCallback(async () => {
      if (!DEV_MODE) {
        dispatch(showLoader());
        try {
          const rowCopy = [...(row || [])];
          rowCopy[C.DELETED_AT]   = nowSheetFmt();
          rowCopy[C.ORIGINAL_TAB] = 'Tutors (Applied)';
          await appendRow('Tutors (Bin)', rowCopy, token);
          const idMap = await getSheetIds(token);
          const sId   = idMap['Tutors (Applied)'];
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
      message: 'Move to Bin?<br><span class="confirm-sub">Saved in Bin for 30 days, then permanently removed.</span>',
    }));
  };

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="move-sheet" onClick={e => e.stopPropagation()}>
        <div className="move-modal-header">
          <span className="move-sheet-title">Interview rejected — move tutor?</span>
          <button className="move-modal-close" onClick={close}>✕</button>
        </div>
        <div id="move-options">
          <button className="btn-move-opt" onClick={() => rejectionMove('')}>
            Keep in All
          </button>
          <button className="btn-move-opt" onClick={() => rejectionMove('In-Loop')}>
            Add to In-Loop
          </button>
          <button className="btn-move-opt btn-move-danger" onClick={moveToBin}>
            Move to Bin
          </button>
        </div>
      </div>
    </div>
  );
}

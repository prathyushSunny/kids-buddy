import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { C, CP, SHEETS, SECTION_TABS, DEV_MODE } from '../../constants';
import { cellValue, updateCell, appendRow, deleteRow, getSheetIds } from '../../services/sheetsApi';
import { nowSheetFmt } from '../../utils/dateUtils';
import {
  closeActionsModal, showToast, showLoader, hideLoader,
  openConfirmModal, clearSelection,
} from '../../features/ui/uiSlice';
import { setConfirmCallback } from '../../utils/confirmService';
import {
  updateRowInPlace as updateTutorRow,
  removeRow as removeTutorRow,
  incrementTabCount as incTutor,
} from '../../features/tutors/tutorsSlice';
import {
  updateRowInPlace as updateParentRow,
  removeRow as removeParentRow,
  incrementTabCount as incParent,
} from '../../features/parents/parentsSlice';

export default function ActionsModal() {
  const dispatch = useDispatch();
  const token    = useSelector(s => s.auth.token);
  const { open, sheetRow, uid, section, tabKey } = useSelector(s => s.ui.modals.actions);

  const tutorRows  = useSelector(s => s.tutors.allRows);
  const parentRows = useSelector(s => s.parents.allRows);
  const selectedUids = useSelector(s => s.ui.selectedUids);

  if (!open) return null;

  const isTutors = section !== 'parents';
  const allRows  = isTutors ? tutorRows : parentRows;
  const statusColIdx    = isTutors ? C.STATUS    : CP.STATUS;
  const contactedColIdx = isTutors ? C.CONTACTED : CP.CONTACTED;
  const nameColIdx      = isTutors ? C.NAME      : CP.NAME;

  // Find the one targeted row (from single-card action)
  const targetRow  = allRows.find(r => r[31] === sheetRow);
  const curStatus  = targetRow ? (cellValue(targetRow, statusColIdx) || '') : '';
  const isInLoop   = curStatus === 'In-Loop';

  const cfg    = SECTION_TABS[isTutors ? 'tutors' : 'parents']?.find(t => t.key === tabKey);
  const isDraft = cfg?.isDraft;
  const isBin   = cfg?.isBin;

  const close = () => dispatch(closeActionsModal());

  // ── Helpers ────────────────────────────────────────────────────────────────
  const sheetName = cfg?.sheet || (isTutors ? SHEETS.TUTORS_APPLIED : SHEETS.PARENTS_TO_CONTACT);

  // Resolve the full set of rows to act on (bulk-aware)
  const targetRows = selectedUids.length > 1
    ? selectedUids.map(uid => allRows.find(r => String(r[31]) === uid)).filter(Boolean)
    : allRows.filter(r => r[31] === sheetRow);

  const doStatusUpdate = async (newStatus) => {
    close();
    if (!targetRows.length) return;
    const updateFn = isTutors ? updateTutorRow : updateParentRow;
    if (!DEV_MODE) {
      dispatch(showLoader());
      try {
        await Promise.all(targetRows.map(r =>
          updateCell(sheetName, r[31], statusColIdx + 1, newStatus, token),
        ));
      } catch (err) {
        dispatch(hideLoader());
        dispatch(showToast({ message: 'Failed: ' + err.message, type: 'error' }));
        return;
      }
      dispatch(hideLoader());
    }
    targetRows.forEach(r => dispatch(updateFn({ sheetRow: r[31], colIdx: statusColIdx, value: newStatus })));
    const firstName = cellValue(targetRows[0], nameColIdx);
    const msg = targetRows.length > 1
      ? `${targetRows.length} items ${newStatus ? `added to ${newStatus}` : 'removed from In-Loop'}`
      : (newStatus ? `${firstName} added to ${newStatus}` : `${firstName} removed from In-Loop`);
    dispatch(showToast(msg));
    dispatch(clearSelection());
  };

  const doContactedUpdate = async (value) => {
    close();
    if (!targetRows.length) return;
    const updateFn = isTutors ? updateTutorRow : updateParentRow;
    if (!DEV_MODE) {
      dispatch(showLoader());
      try {
        await Promise.all(targetRows.map(r =>
          updateCell(sheetName, r[31], contactedColIdx + 1, value, token),
        ));
      } catch (err) {
        dispatch(hideLoader());
        dispatch(showToast({ message: 'Failed: ' + err.message, type: 'error' }));
        return;
      }
      dispatch(hideLoader());
    }
    targetRows.forEach(r => dispatch(updateFn({ sheetRow: r[31], colIdx: contactedColIdx, value })));
    const firstName = cellValue(targetRows[0], nameColIdx);
    const label = value === 'Yes' ? 'Contacted' : 'Not Contacted';
    dispatch(showToast(targetRows.length > 1 ? `${targetRows.length} marked ${label}` : `${firstName} marked ${label}`));
    dispatch(clearSelection());
  };

  const doMoveToDraft = () => {
    close();
    if (!targetRows.length) return;
    const personName = targetRows.length > 1
      ? `${targetRows.length} items`
      : cellValue(targetRows[0], nameColIdx);
    const draftSheet = isTutors ? SHEETS.TUTORS_DRAFT   : SHEETS.PARENTS_DRAFT;
    const removeFn   = isTutors ? removeTutorRow : removeParentRow;
    const incFn      = isTutors ? incTutor       : incParent;
    // Sort descending so deletes don't shift lower row indices
    const descRows   = [...targetRows].sort((a, b) => b[31] - a[31]);
    setConfirmCallback(async () => {
      if (!DEV_MODE) {
        dispatch(showLoader());
        try {
          const idMap = await getSheetIds(token);
          const srcId = idMap[sheetName];
          for (const r of descRows) {
            await appendRow(draftSheet, r.slice(0, 31), token);
          }
          if (srcId !== undefined) {
            for (const r of descRows) {
              await deleteRow(srcId, r[31], token);
            }
          }
        } catch (err) {
          dispatch(hideLoader());
          dispatch(showToast({ message: 'Move failed: ' + err.message, type: 'error' }));
          return;
        }
        dispatch(hideLoader());
      }
      // Dispatch removes descending so Redux index-shift stays correct
      descRows.forEach(r => {
        dispatch(removeFn(r[31]));
        dispatch(incFn('draft'));
      });
      dispatch(showToast(`${personName} moved to Draft`));
      dispatch(clearSelection());
    });
    dispatch(openConfirmModal({
      message: 'Move to Draft?<br><span class="confirm-sub">Saved permanently in Draft — no auto-purge.</span>',
    }));
  };

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="move-sheet" onClick={e => e.stopPropagation()}>
        <div className="move-modal-header">
          <span className="move-sheet-title">Actions</span>
          <button className="move-modal-close" onClick={close}>✕</button>
        </div>
        <div id="move-options">
          {!isInLoop && (
            <button className="btn-move-opt" onClick={() => doStatusUpdate('In-Loop')}>
              Add to In-Loop
            </button>
          )}
          {isInLoop && (
            <button className="btn-move-opt" onClick={() => doStatusUpdate('')}>
              Remove from In-Loop
            </button>
          )}
          <button className="btn-move-opt" onClick={() => doContactedUpdate('Yes')}>
            Mark Contacted
          </button>
          <button className="btn-move-opt" onClick={() => doContactedUpdate('No')}>
            Mark not Contacted
          </button>
          {!isDraft && !isBin && (
            <button className="btn-move-opt btn-move-draft" onClick={doMoveToDraft}>
              Move to Draft
            </button>
          )}
        </div>
        <button className="btn-move-cancel" onClick={close}>Cancel</button>
      </div>
    </div>
  );
}

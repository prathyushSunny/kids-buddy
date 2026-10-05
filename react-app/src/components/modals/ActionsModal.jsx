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
  moveRowStatus as moveTutorStatus,
  updateRowInPlace as updateTutorRow,
  removeRow as removeTutorRow,
  incrementTabCount as incTutor,
} from '../../features/tutors/tutorsSlice';
import {
  moveRowStatus as moveParentStatus,
  updateRowInPlace as updateParentRow,
  removeRow as removeParentRow,
  incrementTabCount as incParent,
} from '../../features/parents/parentsSlice';

export default function ActionsModal() {
  const dispatch = useDispatch();
  const token    = useSelector(s => s.auth.token);
  const { open, sheetRow, uid, section, tabKey } = useSelector(s => s.ui.modals.actions);

  const tutorRows    = useSelector(s => s.tutors.allRows);
  const parentRows   = useSelector(s => s.parents.allRows);
  const selectedUids = useSelector(s => s.ui.selectedUids);

  if (!open) return null;

  const isTutors        = section !== 'parents';
  const allRows         = isTutors ? tutorRows : parentRows;
  const statusColIdx    = isTutors ? C.STATUS    : CP.STATUS;
  const contactedColIdx = isTutors ? C.CONTACTED : CP.CONTACTED;
  const nameColIdx      = isTutors ? C.NAME      : CP.NAME;

  const targetRow    = allRows.find(r => r[31] === sheetRow);
  const curStatus   = targetRow ? (cellValue(targetRow, statusColIdx) || '') : '';
  const isInLoop    = curStatus === 'In-Loop';
  const isOnboarded  = curStatus === 'Onboarded';

  const cfg     = SECTION_TABS[isTutors ? 'tutors' : 'parents']?.find(t => t.key === tabKey);
  const isDraft = cfg?.isDraft;
  const isBin   = cfg?.isBin;

  const close = () => dispatch(closeActionsModal());

  const sheetName = cfg?.sheet || (isTutors ? SHEETS.TUTORS_APPLIED : SHEETS.PARENTS_TO_CONTACT);

  const targetRows = selectedUids.length > 1
    ? selectedUids.map(u => allRows.find(r => String(r[31]) === u)).filter(Boolean)
    : allRows.filter(r => r[31] === sheetRow);

  const firstName  = targetRows.length ? cellValue(targetRows[0], nameColIdx) : '';
  const subjectStr = targetRows.length > 1 ? `${targetRows.length} items` : firstName;

  // ── Wrap any async action with a confirm prompt ────────────────────────────
  const withConfirm = (message, action) => {
    close();
    setConfirmCallback(action);
    dispatch(openConfirmModal({ message }));
  };

  // ── Status move ────────────────────────────────────────────────────────────
  const doStatusUpdate = (newStatus, label) => {
    const msg = `${label} ${subjectStr}?`;
    withConfirm(msg, async () => {
      if (!targetRows.length) return;
      const moveFn = isTutors ? moveTutorStatus : moveParentStatus;
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
      targetRows.forEach(r => dispatch(moveFn({ sheetRow: r[31], newStatus })));
      dispatch(showToast(`${subjectStr} — ${label.toLowerCase()}`));
      dispatch(clearSelection());
    });
  };

  // ── Contacted update ───────────────────────────────────────────────────────
  const doContactedUpdate = (value, label) => {
    const msg = `${label} ${subjectStr}?`;
    withConfirm(msg, async () => {
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
      dispatch(showToast(`${subjectStr} — ${label.toLowerCase()}`));
      dispatch(clearSelection());
    });
  };

  // ── Move to Draft ──────────────────────────────────────────────────────────
  const doMoveToDraft = () => {
    const draftSheet = isTutors ? SHEETS.TUTORS_DRAFT : SHEETS.PARENTS_DRAFT;
    const removeFn   = isTutors ? removeTutorRow : removeParentRow;
    const incFn      = isTutors ? incTutor       : incParent;
    const descRows   = [...targetRows].sort((a, b) => b[31] - a[31]);
    withConfirm(
      `Move ${subjectStr} to Draft?<br><span class="confirm-sub">Saved permanently in Draft — no auto-purge.</span>`,
      async () => {
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
        descRows.forEach(r => {
          dispatch(removeFn(r[31]));
          dispatch(incFn('draft'));
        });
        dispatch(showToast(`${subjectStr} moved to Draft`));
        dispatch(clearSelection());
      },
    );
  };

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="move-sheet" onClick={e => e.stopPropagation()}>
        <div className="move-modal-header">
          <span className="move-sheet-title">Actions</span>
          <button className="move-modal-close" onClick={close}>✕</button>
        </div>
        <div id="move-options">

          {/* Status actions */}
          {!isInLoop && (
            <button className="btn-move-opt" onClick={() => doStatusUpdate('In-Loop', 'Move to In-Loop')}>
              Move to In-Loop
            </button>
          )}
          {isInLoop && (
            <button className="btn-move-opt" onClick={() => doStatusUpdate('', 'Remove from In-Loop')}>
              Remove from In-Loop
            </button>
          )}
          {isOnboarded && (
            <button className="btn-move-opt" onClick={() => doStatusUpdate('', 'Remove from Onboarded')}>
              Remove from Onboarded
            </button>
          )}
          {!isOnboarded && (tabKey === 'all' || tabKey === 'in_loop') && (
            <button className="btn-move-opt" onClick={() => doStatusUpdate('Onboarded', 'Add to Onboarded')}>
              Add to Onboarded
            </button>
          )}

          {/* Contacted actions */}
          <button className="btn-move-opt" onClick={() => doContactedUpdate('Yes', 'Mark Contacted')}>
            Mark Contacted
          </button>
          <button className="btn-move-opt" onClick={() => doContactedUpdate('No', 'Mark Not Contacted')}>
            Mark Not Contacted
          </button>

          {/* Draft */}
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

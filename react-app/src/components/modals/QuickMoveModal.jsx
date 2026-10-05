import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { CP, SHEETS, DEV_MODE } from '../../constants';
import { updateCell, appendRow, deleteRow, getSheetIds } from '../../services/sheetsApi';
import { nowSheetFmt } from '../../utils/dateUtils';
import { closeQuickMoveModal, showToast, showLoader, hideLoader } from '../../features/ui/uiSlice';
import { moveRowStatus, removeRow, incrementTabCount } from '../../features/parents/parentsSlice';

export default function QuickMoveModal() {
  const dispatch   = useDispatch();
  const token      = useSelector(s => s.auth.token);
  const { open, sheetRow, name, sheet } = useSelector(s => s.ui.modals.quickMove);
  const parentRows = useSelector(s => s.parents.allRows);

  if (!open) return null;

  const close = () => dispatch(closeQuickMoveModal());
  const row = parentRows.find(r => r[31] === sheetRow);
  const srcSheet = sheet || SHEETS.PARENTS_TO_CONTACT;

  const moveToInLoop = async () => {
    close();
    if (!DEV_MODE) {
      dispatch(showLoader());
      try {
        await updateCell(srcSheet, sheetRow, CP.STATUS + 1, 'In-Loop', token);
      } catch (err) {
        dispatch(hideLoader());
        dispatch(showToast({ message: 'Failed: ' + err.message, type: 'error' }));
        return;
      }
      dispatch(hideLoader());
    }
    dispatch(moveRowStatus({ sheetRow, newStatus: 'In-Loop' }));
    dispatch(showToast(`${name} added to In-Loop`));
  };

  const moveToDraft = async () => {
    close();
    if (!row) return;
    if (!DEV_MODE) {
      dispatch(showLoader());
      try {
        await appendRow(SHEETS.PARENTS_DRAFT, row.slice(0, 31), token);
        const idMap = await getSheetIds(token);
        const srcId = idMap[srcSheet];
        if (srcId !== undefined) await deleteRow(srcId, sheetRow, token);
      } catch (err) {
        dispatch(hideLoader());
        dispatch(showToast({ message: 'Move failed: ' + err.message, type: 'error' }));
        return;
      }
      dispatch(hideLoader());
    }
    dispatch(removeRow(sheetRow));
    dispatch(incrementTabCount('draft'));
    dispatch(showToast(`${name} moved to Draft`));
  };

  const moveToBin = async () => {
    close();
    if (!row) return;
    if (!DEV_MODE) {
      dispatch(showLoader());
      try {
        const rowCopy = row.slice(0, 31);
        rowCopy[CP.DELETED_AT]   = nowSheetFmt();
        rowCopy[CP.ORIGINAL_TAB] = srcSheet;
        await appendRow(SHEETS.PARENTS_BIN, rowCopy, token);
        const idMap = await getSheetIds(token);
        const srcId = idMap[srcSheet];
        if (srcId !== undefined) await deleteRow(srcId, sheetRow, token);
      } catch (err) {
        dispatch(hideLoader());
        dispatch(showToast({ message: 'Move failed: ' + err.message, type: 'error' }));
        return;
      }
      dispatch(hideLoader());
    }
    dispatch(removeRow(sheetRow));
    dispatch(incrementTabCount('bin'));
    dispatch(showToast(`${name} moved to Bin`));
  };

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="move-sheet" onClick={e => e.stopPropagation()}>
        <div className="move-modal-header">
          <span className="move-sheet-title">Move {name} to?</span>
          <button className="move-modal-close" onClick={close}>✕</button>
        </div>
        <div id="move-options">
          <button className="btn-move-opt" onClick={moveToInLoop}>In-Loop</button>
          <button className="btn-move-opt btn-move-draft" onClick={moveToDraft}>Draft</button>
          <button className="btn-move-opt btn-move-danger" onClick={moveToBin}>Bin</button>
        </div>
        <button className="btn-move-cancel" onClick={close}>Cancel</button>
      </div>
    </div>
  );
}

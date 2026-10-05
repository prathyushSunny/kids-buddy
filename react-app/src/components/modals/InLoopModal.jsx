import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { C, CP, SHEETS, DEV_MODE } from '../../constants';
import { cellValue, updateCell } from '../../services/sheetsApi';
import { closeInLoopModal, showToast, showLoader, hideLoader } from '../../features/ui/uiSlice';
import { moveRowStatus as moveTutorStatus } from '../../features/tutors/tutorsSlice';
import { moveRowStatus as moveParentStatus } from '../../features/parents/parentsSlice';

export default function InLoopModal() {
  const dispatch    = useDispatch();
  const token       = useSelector(s => s.auth.token);
  const { open, sheetRow, name, section, sheet } = useSelector(s => s.ui.modals.inLoop);
  const tutorRows   = useSelector(s => s.tutors.allRows);
  const parentRows  = useSelector(s => s.parents.allRows);

  if (!open) return null;

  const close = () => dispatch(closeInLoopModal());

  const isParent  = section === 'parents';
  const rows      = isParent ? parentRows : tutorRows;
  const statusCol = isParent ? CP.STATUS  : C.STATUS;
  const nameCol   = isParent ? CP.NAME    : C.NAME;
  const moveFn    = isParent ? moveParentStatus : moveTutorStatus;
  const sheetName = sheet || SHEETS.TUTORS_APPLIED;

  const confirm = async () => {
    close();
    const row = rows.find(r => r[31] === sheetRow);
    if (!row) return;
    const personName = name || cellValue(row, nameCol);
    if (!DEV_MODE) {
      dispatch(showLoader());
      try {
        await updateCell(sheetName, sheetRow, statusCol + 1, 'In-Loop', token);
      } catch (err) {
        dispatch(hideLoader());
        dispatch(showToast({ message: 'Failed to update status: ' + err.message, type: 'error' }));
        return;
      }
      dispatch(hideLoader());
    }
    dispatch(moveFn({ sheetRow, newStatus: 'In-Loop' }));
    dispatch(showToast(`${personName} added to In-Loop`));
  };

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="move-sheet-title">
          Add <strong>{name}</strong> to In-Loop?
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn-modal-cancel" onClick={close}>No</button>
          <button className="btn-schedule-save" onClick={confirm}>Yes</button>
        </div>
      </div>
    </div>
  );
}

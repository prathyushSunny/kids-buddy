import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { C, CP, SHEETS, DEV_MODE } from '../../constants';
import { cellValue, updateCell } from '../../services/sheetsApi';
import {
  closeContactFollowUpModal, openInterviewScheduleModal, openQuickMoveModal,
  showToast, showLoader, hideLoader,
} from '../../features/ui/uiSlice';
import { updateRowInPlace as updateTutorRow } from '../../features/tutors/tutorsSlice';
import { updateRowInPlace as updateParentRow } from '../../features/parents/parentsSlice';

export default function ContactFollowUpModal() {
  const dispatch    = useDispatch();
  const token       = useSelector(s => s.auth.token);
  const { open, sheetRow, uid, name, section, sheet } = useSelector(s => s.ui.modals.contactFollowUp);
  const tutorRows   = useSelector(s => s.tutors.allRows);
  const parentRows  = useSelector(s => s.parents.allRows);
  const [step, setStep] = useState(1);

  useEffect(() => { if (open) setStep(1); }, [open]);

  if (!open) return null;

  const isParent = section === 'parents';
  const close = () => dispatch(closeContactFollowUpModal());

  const handleMarkContacted = async () => {
    const col      = isParent ? CP.CONTACTED : C.CONTACTED;
    const updateFn = isParent ? updateParentRow : updateTutorRow;
    dispatch(updateFn({ sheetRow, colIdx: col, value: 'Yes' }));
    if (!DEV_MODE) {
      dispatch(showLoader());
      try {
        await updateCell(sheet, sheetRow, col + 1, 'Yes', token);
      } catch (err) {
        dispatch(showToast({ message: 'Failed to mark contacted: ' + err.message, type: 'error' }));
      }
      dispatch(hideLoader());
    }
    dispatch(showToast(`${name} marked as Contacted`));
    setStep(2);
  };

  const handleSchedule = () => {
    close();
    if (isParent) {
      dispatch(openQuickMoveModal({ sheetRow, uid, name, section: 'parents', sheet }));
    } else {
      const rows = tutorRows;
      const row  = rows.find(r => r[31] === sheetRow);
      const tutorEmail = row ? cellValue(row, C.EMAIL) : '';
      dispatch(openInterviewScheduleModal({ sheetRow, uid, tutorName: name, tutorEmail, scheduleId: null, current: '' }));
    }
  };

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal-card contact-followup-card" onClick={e => e.stopPropagation()}>
        {step === 1 ? (
          <>
            <div className="move-sheet-title">
              Mark <strong>{name}</strong> as Contacted?
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn-modal-cancel" onClick={close}>No</button>
              <button className="btn-schedule-save" onClick={handleMarkContacted}>Yes</button>
            </div>
          </>
        ) : (
          <>
            <div className="move-sheet-title">Schedule an Interview?</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn-modal-cancel" onClick={close}>Not now</button>
              <button className="btn-schedule-save" onClick={handleSchedule}>Schedule</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

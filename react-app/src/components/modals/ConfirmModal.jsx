import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { closeConfirmModal } from '../../features/ui/uiSlice';
import { fireConfirmCallback } from '../../utils/confirmService';

export default function ConfirmModal() {
  const dispatch = useDispatch();
  const { open, message } = useSelector(s => s.ui.modals.confirm);

  if (!open) return null;

  const handleOk = () => {
    dispatch(closeConfirmModal());
    fireConfirmCallback();
  };

  return (
    <div className="modal-backdrop" onClick={() => dispatch(closeConfirmModal())}>
      <div className="modal-card modal-card-sm" onClick={e => e.stopPropagation()}>
        <div className="confirm-msg" dangerouslySetInnerHTML={{ __html: message }} />
        <div className="modal-actions">
          <button className="btn-modal-cancel" onClick={() => dispatch(closeConfirmModal())}>No</button>
          <button className="btn-confirm-ok" onClick={handleOk}>Yes</button>
        </div>
      </div>
    </div>
  );
}

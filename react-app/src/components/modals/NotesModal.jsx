import React, { useEffect } from 'react';
import NotesPage from '../../pages/NotesPage';

export default function NotesModal({ onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop notes-modal-backdrop" onMouseDown={onClose}>
      <div className="notes-modal-sheet" onMouseDown={e => e.stopPropagation()}>
        <div className="notes-modal-hdr">
          <span className="notes-modal-title">Notes</span>
          <button className="notes-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="notes-modal-body">
          <NotesPage compact />
        </div>
      </div>
    </div>
  );
}

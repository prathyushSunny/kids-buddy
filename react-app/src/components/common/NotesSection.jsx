import React, { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { DEV_MODE } from '../../constants';
import { updateCell } from '../../services/sheetsApi';
import { setConfirmCallback } from '../../utils/confirmService';
import { showToast, showLoader, hideLoader, openConfirmModal } from '../../features/ui/uiSlice';
import useSpeechInput from '../../hooks/useSpeechInput';

const NOTE_SVG = (
  <svg aria-hidden="true" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

const MIC_SVG = (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <rect x="9" y="2" width="6" height="12" rx="3"/>
    <path d="M5 10a7 7 0 0 0 14 0"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
    <line x1="8" y1="22" x2="16" y2="22"/>
  </svg>
);

export default function NotesSection({ sheetRow, sheetName, initialNotes, colIdx, onUpdate }) {
  const [notes,   setNotes]   = useState(initialNotes || '');
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const dispatch = useDispatch();
  const token    = useSelector(s => s.auth.token);
  const taRef    = useRef(null);

  const { isListening, supported, toggle, stop, onPointerUp, reanchor } = useSpeechInput({
    taRef,
    onChange: setDraft,
  });

  useEffect(() => { setNotes(initialNotes || ''); }, [initialNotes]);

  // Focus textarea when editing opens; stop mic when editing closes
  useEffect(() => {
    if (editing) {
      taRef.current?.focus();
    } else {
      stop();
    }
  }, [editing, stop]);

  // Stop mic on unmount (e.g. card collapses while recording)
  useEffect(() => () => stop(), [stop]);

  const openEdit = () => { setDraft(notes); setEditing(true); };
  const cancel   = () => setEditing(false); // triggers editing=false → stop() via useEffect

  const save = async () => {
    stop();
    const val = draft.trim();
    setSaving(true);
    if (!DEV_MODE) {
      try {
        await updateCell(sheetName, sheetRow, colIdx + 1, val, token);
      } catch {
        setSaving(false);
        dispatch(showToast({ message: 'Notes save failed', type: 'error' }));
        return;
      }
    }
    setNotes(val);
    onUpdate(colIdx, val);
    setEditing(false);
    setSaving(false);
  };

  const remove = () => {
    setConfirmCallback(async () => {
      if (!DEV_MODE) {
        dispatch(showLoader());
        try {
          await updateCell(sheetName, sheetRow, colIdx + 1, '', token);
        } catch {
          dispatch(hideLoader());
          dispatch(showToast({ message: 'Remove failed', type: 'error' }));
          return;
        }
        dispatch(hideLoader());
      }
      setNotes('');
      onUpdate(colIdx, '');
    });
    dispatch(openConfirmModal({
      message: 'Remove this note?<br><span class="confirm-sub">This cannot be undone.</span>',
    }));
  };

  return (
    <div className="card-notes card-section">
      <div className="card-section-header">
        <span className="notes-header-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {NOTE_SVG} Notes
        </span>

        {!editing && notes && (
          <span className="notes-actions">
            <button className="btn-notes-remove" onClick={e => { e.stopPropagation(); remove(); }}>Remove</button>
            <span className="notes-action-sep">|</span>
            <button className="btn-notes-edit" onClick={e => { e.stopPropagation(); openEdit(); }}>Edit</button>
          </span>
        )}

        {editing && (
          <div className="notes-edit-actions">
            <button className="btn-notes-cancel" onClick={e => { e.stopPropagation(); cancel(); }}>Cancel</button>
            {supported && (
              <button
                type="button"
                className={`btn-mic${isListening ? ' active' : ''}`}
                title={isListening ? 'Tap to stop' : 'Voice input'}
                onClick={e => { e.stopPropagation(); toggle(); }}
                aria-label={isListening ? 'Stop recording' : 'Start voice input'}
              >
                {MIC_SVG}
              </button>
            )}
            <button className="btn-notes-save" disabled={saving} onClick={e => { e.stopPropagation(); save(); }}>Save</button>
          </div>
        )}
      </div>

      <div className="card-notes-body card-section-body">
        {editing ? (
          <textarea
            ref={taRef}
            className="card-notes-ta"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onClick={e => e.stopPropagation()}
            onPointerUp={e => { e.stopPropagation(); onPointerUp(); }}
            onKeyUp={e => { if (isListening) reanchor(); }}
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); cancel(); } }}
          />
        ) : notes ? (
          <span className="notes-text">{notes}</span>
        ) : (
          <button className="btn-inline-text btn-add-notes" onClick={e => { e.stopPropagation(); openEdit(); }}>
            + Add notes
          </button>
        )}
      </div>
    </div>
  );
}

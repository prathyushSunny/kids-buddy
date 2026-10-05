import React, { useState, useEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { showToast } from '../features/ui/uiSlice';
import { fetchNotes, createNote, saveNote } from '../services/sheetsApi';
import { DEV_MODE } from '../constants';

function nowIso() { return new Date().toISOString(); }

const MAIN_ID = 'NOTES-MAIN';

export default function NotesPage({ compact = false }) {
  const dispatch  = useDispatch();
  const token     = useSelector(s => s.auth.token);
  const userEmail = useSelector(s => s.auth.email);

  const [items,     setItems]     = useState([{ text: '', checked: false }]);
  const [isLoading, setIsLoading] = useState(true);
  const noteRowRef  = useRef(null);
  const loadedRef   = useRef(false); // true after first load completes
  const inputRefs   = useRef({});
  const saveTimer   = useRef(null);

  // Cancel pending save when navigating away — prevents stale createNote calls
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const load = useCallback(async () => {
    setIsLoading(true);
    loadedRef.current = false;
    try {
      const notes = DEV_MODE ? [] : await fetchNotes(token);
      const main  = notes.find(n => n.noteId === MAIN_ID);
      if (main) {
        noteRowRef.current = main._row;
        setItems(main.items?.length ? main.items : [{ text: '', checked: false }]);
      } else {
        noteRowRef.current = null;
        setItems([{ text: '', checked: false }]);
      }
    } catch {
      dispatch(showToast({ message: 'Failed to load notes', type: 'error' }));
    } finally {
      setIsLoading(false);
      loadedRef.current = true;
    }
  }, [token, dispatch]);

  useEffect(() => { load(); }, [load]);

  const persist = useCallback((nextItems) => {
    if (DEV_MODE) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (!loadedRef.current) return; // load still in flight — skip
      const note = {
        noteId: MAIN_ID, title: 'Notes',
        items: nextItems, pinned: false, status: 'open',
        author: userEmail || '', updatedAt: nowIso(),
      };
      try {
        if (noteRowRef.current) {
          await saveNote(noteRowRef.current, note, token);
        } else {
          // Safety check: re-fetch before creating to avoid duplicates
          const existing = await fetchNotes(token);
          const found    = existing.find(n => n.noteId === MAIN_ID);
          if (found) {
            noteRowRef.current = found._row;
            await saveNote(found._row, note, token);
          } else {
            await createNote({ ...note, createdAt: nowIso() }, token);
            const fresh   = await fetchNotes(token);
            const created = fresh.find(n => n.noteId === MAIN_ID);
            if (created) noteRowRef.current = created._row;
          }
        }
      } catch {
        dispatch(showToast({ message: 'Save failed', type: 'error' }));
      }
    }, 600);
  }, [token, userEmail, dispatch]);

  const update = useCallback((nextItems) => {
    setItems(nextItems);
    persist(nextItems);
  }, [persist]);

  const toggle = (idx) =>
    update(items.map((it, i) => i === idx ? { ...it, checked: !it.checked } : it));

  const changeText = (idx, val) =>
    update(items.map((it, i) => i === idx ? { ...it, text: val } : it));

  const addAfter = (idx, cursorPos) => {
    const text = items[idx].text;
    const before = cursorPos != null ? text.slice(0, cursorPos) : text;
    const after  = cursorPos != null ? text.slice(cursorPos)  : '';
    const next = items.map((it, i) => i === idx ? { ...it, text: before } : it);
    next.splice(idx + 1, 0, { text: after, checked: false });
    flushSync(() => setItems(next));
    persist(next);
    const newInput = inputRefs.current[idx + 1];
    if (newInput) { newInput.focus(); newInput.setSelectionRange(0, 0); }
  };

  const deleteAt = (idx) => {
    if (items.length === 1) {
      flushSync(() => setItems([{ text: '', checked: false }]));
      persist([{ text: '', checked: false }]);
      inputRefs.current[0]?.focus();
      return;
    }
    const next = items.filter((_, i) => i !== idx);
    flushSync(() => setItems(next));
    persist(next);
    inputRefs.current[Math.max(0, idx - 1)]?.focus();
  };

  const mergeToPrev = (idx) => {
    const prevText = items[idx - 1].text;
    const currText = items[idx].text;
    const next = items
      .map((it, i) => i === idx - 1 ? { ...it, text: prevText + currText } : it)
      .filter((_, i) => i !== idx);
    flushSync(() => setItems(next));
    persist(next);
    const prevInput = inputRefs.current[idx - 1];
    if (prevInput) {
      prevInput.focus();
      prevInput.setSelectionRange(prevText.length, prevText.length);
    }
  };

  const handleKeyDown = (e, idx) => {
    if (e.key === 'Enter') { e.preventDefault(); addAfter(idx, e.target.selectionStart); }
    if (e.key === 'Backspace') {
      if (items[idx].text === '') {
        e.preventDefault();
        deleteAt(idx);
      } else if (e.target.selectionStart === 0 && e.target.selectionEnd === 0 && idx > 0) {
        e.preventDefault();
        mergeToPrev(idx);
      }
    }
  };

  return (
    <div className={compact ? 'notes-page-compact' : 'notes-page'}>
      {!compact && (
        <div className="notes-topbar">
          <h2 className="notes-heading">Notes</h2>
          <button className="note-btn note-btn-ghost" onClick={load}>↻ Refresh</button>
        </div>
      )}

      {isLoading ? (
        <div className="state-msg">Loading…</div>
      ) : (
        <div className="notes-list">
          {items.map((item, idx) => (
            <div key={idx} className={`notes-item${item.checked ? ' notes-item-done' : ''}`}>
              <input
                type="checkbox"
                className="note-checkbox"
                checked={item.checked}
                onChange={() => toggle(idx)}
              />
              <textarea
                ref={el => {
                  inputRefs.current[idx] = el;
                  if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
                }}
                className="notes-item-input"
                value={item.text}
                placeholder="Add a pointer…"
                rows={1}
                onChange={e => {
                  changeText(idx, e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                onKeyDown={e => handleKeyDown(e, idx)}
              />
              <button
                className="notes-item-del"
                onClick={() => deleteAt(idx)}
                title="Delete"
              >×</button>
            </div>
          ))}
          <button className="notes-add-btn" onClick={() => addAfter(items.length - 1)}>
            + Add item
          </button>
        </div>
      )}
    </div>
  );
}

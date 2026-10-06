import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { C } from '../../constants';
import { cellValue, normalizePhone } from '../../services/sheetsApi';
import { closeShareToTutorModal } from '../../features/ui/uiSlice';

const CLOSE_SVG = (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const WA_SVG = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.556 4.116 1.526 5.842L.057 23.928a.5.5 0 0 0 .612.612l6.086-1.469A11.935 11.935 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.92 0-3.72-.52-5.27-1.424l-.378-.225-3.914.945.96-3.798-.246-.39A9.942 9.942 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
  </svg>
);

function buildMessage({ tutorName, grade, subjects, area }) {
  const lines = [`Hi ${tutorName}! We have a student looking for a home tutor.`];
  lines.push('');
  lines.push('Student details:');
  if (grade)    lines.push(`• Grade: ${grade}`);
  if (subjects) lines.push(`• Subjects: ${subjects}`);
  if (area)     lines.push(`• Location: ${area}`);
  lines.push('');
  lines.push('Are you available and interested? Let us know!');
  return lines.join('\n');
}

const PLACEHOLDER_NAME = '[Tutor Name]';

export default function ShareToTutorModal() {
  const dispatch  = useDispatch();
  const { open, studentName, grade, subjects, area } =
    useSelector(s => s.ui.modals.shareToTutor);
  const allTutors = useSelector(s => s.tutors.allRows);

  const [search,       setSearch]       = useState('');
  const [dropOpen,     setDropOpen]     = useState(false);
  const [selectedTutor, setSelectedTutor] = useState(null);
  const [message,      setMessage]      = useState('');
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setDropOpen(false);
    setSelectedTutor(null);
    setMessage(buildMessage({ tutorName: PLACEHOLDER_NAME, grade, subjects, area }));
  }, [open]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return [];
    return allTutors.filter(r => {
      const name  = (cellValue(r, C.NAME)  || '').toLowerCase();
      const phone = (cellValue(r, C.PHONE) || '').toLowerCase();
      return name.includes(q) || phone.includes(q);
    }).slice(0, 8);
  }, [allTutors, search]);

  if (!open) return null;

  const close = () => dispatch(closeShareToTutorModal());

  const selectTutor = (r) => {
    const name = cellValue(r, C.NAME) || 'there';
    setSelectedTutor(r);
    setSearch(name);
    setDropOpen(false);
    setMessage(buildMessage({ tutorName: name, grade, subjects, area }));
  };

  const share = () => {
    if (!selectedTutor) return;
    const phone = normalizePhone(cellValue(selectedTutor, C.PHONE) || '');
    if (!phone) return;
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const tutorPhone = selectedTutor ? normalizePhone(cellValue(selectedTutor, C.PHONE) || '') : '';

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal-card modal-tall" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Share to Tutor</span>
          <button className="modal-close" onClick={close}>{CLOSE_SVG}</button>
        </div>

        <div className="modal-scroll-body">
          {/* Student summary chips */}
          <div className="stt-summary">
            {grade    && <span className="stt-chip">{grade}</span>}
            {subjects && <span className="stt-chip">{subjects}</span>}
            {area     && <span className="stt-chip">{area}</span>}
          </div>

          {/* Tutor search */}
          <label className="modal-label">Search Tutor</label>
          <div ref={wrapRef} style={{ position: 'relative' }}>
            <input
              className="modal-input"
              type="text"
              placeholder="Type tutor name or phone…"
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setSelectedTutor(null);
                setDropOpen(true);
                setMessage(buildMessage({ tutorName: PLACEHOLDER_NAME, grade, subjects, area }));
              }}
              onFocus={() => { if (search.trim()) setDropOpen(true); }}
              autoComplete="off"
            />
            {dropOpen && filtered.length > 0 && (
              <div className="stt-drop">
                {filtered.map((r, i) => {
                  const tName  = cellValue(r, C.NAME)     || '—';
                  const tPhone = cellValue(r, C.PHONE)    || '';
                  const tLoc   = cellValue(r, C.LOCATION) || '';
                  return (
                    <div
                      key={i}
                      className="stt-drop-item"
                      onMouseDown={() => selectTutor(r)}
                    >
                      <span className="stt-drop-name">{tName}</span>
                      <span className="stt-drop-meta">{[tLoc, tPhone].filter(Boolean).join(' · ')}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Editable message */}
          <label className="modal-label" style={{ marginTop: 14 }}>WhatsApp Message</label>
          <textarea
            className="modal-input cal-desc-area"
            rows={8}
            value={message}
            onChange={e => setMessage(e.target.value)}
            style={{ fontFamily: 'inherit', fontSize: 13 }}
          />
          {!selectedTutor && (
            <p className="stt-hint">Select a tutor above to personalise the message.</p>
          )}
        </div>

        <div className="modal-footer-actions">
          <button className="btn-modal-cancel" onClick={close}>Cancel</button>
          <button
            className="stt-share-btn-footer"
            disabled={!selectedTutor || !tutorPhone}
            onClick={share}
          >
            <span style={{ width: 20, height: 20, flexShrink: 0 }}>{WA_SVG}</span> Share
          </button>
        </div>
      </div>
    </div>
  );
}

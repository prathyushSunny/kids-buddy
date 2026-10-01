import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { CP } from '../../constants';
import { normalizePhone } from '../../services/sheetsApi';
import { formatDate } from '../../utils/dateUtils';
import { closeWAShareModal, openCalPromptModal } from '../../features/ui/uiSlice';

const WA_SVG_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);
const WA_SEND_SVG = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

function buildTutorMsg(data) {
  const { tutorName, parentName, studentName, dateStr, parentAddress } = data;
  const date = formatDate(dateStr);
  const addrLine = (parentAddress || '').trim() ? `\n📍 Address: ${parentAddress.trim()}` : '';
  return `Hi ${tutorName}! 👋\n\n*KidsBuddy* has scheduled a home visit for you:\n\n📅 ${date}\n👨‍👩‍👧 Student: ${studentName || '—'}\n👤 Parent: ${parentName || '—'}${addrLine}\n\nPlease confirm your availability. Thank you!\n— KidsBuddy Team`;
}

function buildParentMsg(data) {
  const { tutorName, parentName, dateStr } = data;
  const date = formatDate(dateStr);
  return `Hi ${parentName}! 👋\n\n*KidsBuddy* has arranged a tutor visit at your home:\n\n📅 ${date}\n👩‍🏫 Tutor: ${tutorName || '—'}\n\nPlease ensure someone is available. Thank you!\n— KidsBuddy Team`;
}

function toWaNum(phone) {
  if (!phone) return null;
  let d = normalizePhone(phone);
  if (!d) return null;
  return d.length === 10 ? '91' + d : d;
}

export default function WAShareModal() {
  const dispatch = useDispatch();
  const { open, data } = useSelector(s => s.ui.modals.waShare);

  const [tutorMsg,  setTutorMsg]  = useState('');
  const [parentMsg, setParentMsg] = useState('');
  const [pQuery,    setPQuery]    = useState('');
  const [pMatches,  setPMatches]  = useState([]);
  const [chosenParent, setChosenParent] = useState(null);

  const parentRows  = useSelector(s => s.parents.allRows);
  const parentCache = useSelector(s => s.parents.cache);
  const pool = parentCache.length ? parentCache : parentRows;

  useEffect(() => {
    if (!open || !data) return;
    setTutorMsg(buildTutorMsg(data));
    setParentMsg(data.parentName ? buildParentMsg(data) : '');
    setPQuery('');
    setPMatches([]);
    setChosenParent(data.parentName ? {
      name:        data.parentName,
      phone:       data.parentPhone,
      studentName: data.studentName,
      address:     data.parentAddress || '',
    } : null);
  }, [open, data]);

  if (!open || !data) return null;

  const close = () => {
    dispatch(closeWAShareModal());
    // If there's pending calendar data (new schedule, no calId yet), prompt
    if (data.sheetRow && !data.existingCalId) {
      dispatch(openCalPromptModal({
        sheetRow:     data.sheetRow,
        tutorName:    data.tutorName,
        tutorEmail:   data.tutorEmail || '',
        dateStr:      data.dateStr,
        parentName:   data.parentName  || '',
        studentName:  data.studentName || '',
        parentAddress: data.parentAddress || '',
      }));
    }
  };

  const sendWA = (phone, msg) => {
    const num = toWaNum(phone);
    if (!num) return;
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  };

  const searchParents = (q) => {
    setPQuery(q);
    if (!q.trim()) { setPMatches([]); return; }
    const lq = q.toLowerCase();
    setPMatches(
      pool.filter(r =>
        [CP.NAME, CP.PHONE, CP.STUDENT_NAME].some(i =>
          (r[i] || '').toLowerCase().includes(lq),
        ),
      ).slice(0, 8),
    );
  };

  const pickParent = (r) => {
    const p = { name: r[CP.NAME] || '', phone: r[CP.PHONE] || '', studentName: r[CP.STUDENT_NAME] || '', address: r[CP.ADDRESS] || '' };
    setChosenParent(p);
    setPQuery('');
    setPMatches([]);
    const newData = { ...data, parentName: p.name, parentPhone: p.phone, studentName: p.studentName };
    setParentMsg(buildParentMsg(newData));
  };

  const activeParentPhone = chosenParent?.phone || data.parentPhone;

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal-card wa-share-card" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title wa-modal-title">
          {WA_SVG_ICON} Share on WhatsApp
        </h3>
        <div className="wa-date-chip">📅 {formatDate(data.dateStr)}</div>

        {/* Tutor section */}
        <div className="wa-section">
          <div className="wa-section-label">Tutor</div>
          <div className="wa-person-name">{data.tutorName}</div>
          {data.parentName && (
            <div className="wa-visit-with">
              Visit with — {data.parentName}{data.studentName ? ` & ${data.studentName}` : ''}
            </div>
          )}
          <textarea
            className="wa-msg-area"
            value={tutorMsg}
            onChange={e => setTutorMsg(e.target.value)}
            placeholder="Message to tutor…"
          />
          <button
            className="btn-wa-send"
            onClick={() => sendWA(data.tutorPhone, tutorMsg)}
            disabled={!data.tutorPhone}
          >
            {WA_SEND_SVG} To Tutor
          </button>
        </div>

        <div className="wa-divider" />

        {/* Parent section */}
        <div className="wa-section">
          <div className="wa-section-label">Parent / Student</div>

          {chosenParent ? (
            <div className="wa-person-name">
              {chosenParent.name}{chosenParent.studentName ? ` · ${chosenParent.studentName}` : ''}
            </div>
          ) : (
            <div className="wa-search-wrap">
              <input
                type="text"
                className="modal-input wa-search-input"
                placeholder="Search parent or student name…"
                value={pQuery}
                onChange={e => searchParents(e.target.value)}
                autoComplete="off"
              />
              {pMatches.length > 0 && (
                <div className="wa-dropdown" style={{ display: 'block' }}>
                  {pMatches.map((r, i) => (
                    <div key={i} className="modal-parent-dd-item" onClick={() => pickParent(r)}>
                      <span className="mpdd-name">{r[CP.NAME]}</span>
                      {r[CP.STUDENT_NAME] && <span className="mpdd-sub"> · {r[CP.STUDENT_NAME]}</span>}
                      {r[CP.PHONE]        && <span className="mpdd-phone"> {r[CP.PHONE]}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <textarea
            className="wa-msg-area"
            value={parentMsg}
            onChange={e => setParentMsg(e.target.value)}
            placeholder="Message to parent…"
          />
          <button
            className="btn-wa-send"
            onClick={() => sendWA(activeParentPhone, parentMsg)}
            disabled={!activeParentPhone || !parentMsg}
          >
            {WA_SEND_SVG} To Parent/Student
          </button>
        </div>

        <button className="wa-next-btn" onClick={close}>Done</button>
      </div>
    </div>
  );
}

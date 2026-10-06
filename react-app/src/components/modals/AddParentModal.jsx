import React, { useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { CP, SHEETS, DEV_MODE } from '../../constants';
import { appendRow } from '../../services/sheetsApi';
import { nowSheetFmt } from '../../utils/dateUtils';
import { closeAddParentModal, showToast, showLoader, hideLoader } from '../../features/ui/uiSlice';
import { addRow, loadParents } from '../../features/parents/parentsSlice';
import PlaceSearch from '../common/PlaceSearch';

const CLOSE_SVG = (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const GRADE_OPTS = [
  'Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6',
  'Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12',
];

const SUBJECT_OPTS = [
  'Maths', 'Science (bio,chem,phy)', 'Social', 'English', 'Hindi', 'Telugu', 'Computer', 'Other',
];

export default function AddParentModal() {
  const dispatch = useDispatch();
  const token    = useSelector(s => s.auth.token);
  const open     = useSelector(s => s.ui.modals.addParent.open);
  const allParents = useSelector(s => s.parents.allRows);
  const parentTabKey = useSelector(s => s.parents.currentTabKey);

  const [name,         setName]         = useState('');
  const [phone,        setPhone]        = useState('');
  const [email,        setEmail]        = useState('');
  const [location,     setLocation]     = useState('');
  const [address,      setAddress]      = useState('');
  const [mapsLink,     setMapsLink]     = useState('');
  const [student,      setStudent]      = useState('');
  const [grade,        setGrade]        = useState('');
  const [gradeOther,   setGradeOther]   = useState('');
  const [subChecked,   setSubChecked]   = useState(new Set());
  const [subOther,     setSubOther]     = useState('');
  const [notes,        setNotes]        = useState('');
  const [saving,       setSaving]       = useState(false);

  const backdropRef = useRef(null);

  const reset = () => {
    setName(''); setPhone(''); setEmail(''); setLocation(''); setAddress('');
    setMapsLink(''); setStudent(''); setGrade(''); setGradeOther('');
    setSubChecked(new Set()); setSubOther(''); setNotes('');
    setSaving(false);
  };

  const close = () => {
    reset();
    dispatch(closeAddParentModal());
  };

  const onBackdropMouseDown = e => {
    if (e.target === backdropRef.current) close();
  };

  const toggleSubject = (opt) => {
    setSubChecked(prev => {
      const next = new Set(prev);
      if (next.has(opt)) next.delete(opt); else next.add(opt);
      return next;
    });
  };

  const onSubOther = (text) => {
    setSubOther(text);
    if (text && !subChecked.has('Other')) {
      setSubChecked(prev => new Set([...prev, 'Other']));
    }
  };

  const getSubjectsValue = () => {
    const known = [...subChecked].filter(v => v !== 'Other');
    const otherVals = subOther ? subOther.split(',').map(s => s.trim()).filter(Boolean) : [];
    if (subChecked.has('Other') && otherVals.length > 0) return [...known, ...otherVals].join(', ');
    if (subChecked.has('Other')) return [...known, 'Other'].join(', ');
    return [...known, ...otherVals].join(', ');
  };

  const handleSave = async () => {
    if (!name.trim()) {
      dispatch(showToast({ message: 'Name is required', type: 'error' }));
      return;
    }

    setSaving(true);
    dispatch(showLoader());

    try {
      const maxId = allParents.reduce((max, r) => {
        const id  = String(r[CP.PARENT_ID] || '');
        const n   = parseInt((id.match(/(\d+)$/) || [])[1] || '0');
        return Math.max(max, n);
      }, 0);
      const parentId = `KB-P-${String(maxId + 1).padStart(4, '0')}`;

      const finalGrade = grade === 'Other' ? gradeOther.trim() : grade;

      const row = new Array(19).fill('');
      row[CP.PARENT_ID]       = parentId;
      row[CP.ONBOARDED_ON]    = nowSheetFmt();
      row[CP.NAME]            = name.trim();
      row[CP.PHONE]           = phone.trim();
      row[CP.EMAIL]           = email.trim();
      row[CP.LOCATION]        = location.trim();
      row[CP.ADDRESS]         = address.trim();
      row[CP.STUDENT_NAME]    = student.trim();
      row[CP.STUDENT_GRADE]   = finalGrade;
      row[CP.SUBJECTS_NEEDED] = getSubjectsValue();
      row[CP.ASSIGNED_TUTOR]  = '';
      row[CP.LAST_CONTACTED]  = '';
      row[CP.CONTACTED]       = 'No';
      row[CP.NOTES]           = notes.trim();
      row[CP.MAILED]          = 'No';
      row[CP.STATUS]          = '';
      row[CP.MAPS_LINK]       = mapsLink;

      if (!DEV_MODE) {
        await appendRow(SHEETS.PARENTS_TO_CONTACT, row, token);
      }

      dispatch(hideLoader());
      close();
      dispatch(showToast(`${name.trim()} added to Parents`));
      dispatch(loadParents({ tabKey: parentTabKey || 'all' }));
    } catch (err) {
      dispatch(hideLoader());
      setSaving(false);
      dispatch(showToast({ message: 'Failed to add: ' + err.message, type: 'error' }));
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" ref={backdropRef} onMouseDown={onBackdropMouseDown}>
      <div className="modal-card modal-tall" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Add a Parent/Student</span>
          <button className="modal-close" onClick={close}>{CLOSE_SVG}</button>
        </div>

        <div className="modal-scroll-body">
          <label className="modal-label">Full Name</label>
          <input className="modal-input" type="text" placeholder="Parent's full name" value={name}
            onChange={e => setName(e.target.value)} autoComplete="off" />

          <label className="modal-label">Phone</label>
          <input className="modal-input" type="tel" placeholder="10-digit mobile number" value={phone}
            onChange={e => setPhone(e.target.value)} autoComplete="off" />

          <label className="modal-label">Email</label>
          <input className="modal-input" type="email" placeholder="email@example.com" value={email}
            onChange={e => setEmail(e.target.value)} autoComplete="off" />

          <label className="modal-label">Location</label>
          <PlaceSearch
            value={location}
            onChange={setLocation}
            onSelect={(loc, placeId) => {
              setMapsLink(placeId ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}&query_place_id=${placeId}` : '');
              setAddress(prev => prev.trim() ? `${prev.trim()}\n${loc}` : loc);
            }}
            placeholder="Search area / locality…"
          />

          <label className="modal-label">Address</label>
          <textarea className="modal-input cal-desc-area" placeholder="Flat / house no., street, area…"
            rows="2" value={address} onChange={e => setAddress(e.target.value)} />

          <label className="modal-label">Student Name</label>
          <input className="modal-input" type="text" placeholder="Child's name" value={student}
            onChange={e => setStudent(e.target.value)} autoComplete="off" />

          <label className="modal-label">Student Grade</label>
          <select className="modal-input" value={grade} onChange={e => setGrade(e.target.value)}>
            <option value="">—</option>
            {GRADE_OPTS.map(g => <option key={g} value={g}>{g}</option>)}
            <option value="Other">Other</option>
          </select>
          {grade === 'Other' && (
            <input
              className="modal-input ec-other-input"
              type="text"
              placeholder="e.g. LKG, UKG, Nursery…"
              value={gradeOther}
              onChange={e => setGradeOther(e.target.value)}
              autoComplete="off"
            />
          )}

          <label className="modal-label">Subjects Needed</label>
          <div className="ec-check-group">
            {SUBJECT_OPTS.map(opt => (
              <label key={opt} className="ec-check-label">
                <input
                  type="checkbox"
                  checked={subChecked.has(opt)}
                  onChange={() => toggleSubject(opt)}
                />
                {' '}{opt}
              </label>
            ))}
          </div>
          <input
            className="modal-input ec-other-input"
            type="text"
            placeholder="Other (specify)"
            value={subOther}
            onChange={e => onSubOther(e.target.value)}
            autoComplete="off"
          />

          <label className="modal-label">Notes</label>
          <textarea className="modal-input cal-desc-area" placeholder="Any additional notes…"
            rows="2" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <div className="modal-footer-actions">
          <button className="btn-modal-cancel" onClick={close}>Cancel</button>
          <button className="btn-schedule-save" disabled={saving} onClick={handleSave}>Add</button>
        </div>
      </div>
    </div>
  );
}

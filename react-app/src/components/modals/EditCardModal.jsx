import React, { useState, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { C, CP, TUTOR_EDIT_FIELDS, PARENT_EDIT_FIELDS, SHEETS, DEV_MODE } from '../../constants';
import useSpeechInput from '../../hooks/useSpeechInput';
import { cellValue, updateCell, appendRow, fetchSheetRows } from '../../services/sheetsApi';
import PlaceSearch from '../common/PlaceSearch';
import { nowSheetFmt } from '../../utils/dateUtils';
import {
  closeEditCardModal, showToast, showLoader, hideLoader,
} from '../../features/ui/uiSlice';
import {
  updateRowInPlace as updateTutorRow,
  addRow as addTutorRow,
  loadTutors,
} from '../../features/tutors/tutorsSlice';
import {
  updateRowInPlace as updateParentRow,
} from '../../features/parents/parentsSlice';

const CLOSE_SVG = (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

// ── helpers ───────────────────────────────────────────────────────────────────

function getMultiValue({ checked, other }) {
  const known = [...checked].filter(v => v !== 'Other');
  const otherVals = other ? other.split(',').map(s => s.trim()).filter(Boolean) : [];
  if (checked.has('Other') && otherVals.length > 0) return [...known, ...otherVals].join(', ');
  if (checked.has('Other')) return [...known, 'Other'].join(', ');
  return [...known, ...otherVals].join(', ');
}

function buildInit(fields, schema, row) {
  const values = {};
  const multis = {};
  fields.forEach(f => {
    const val = row ? (cellValue(row, schema[f.col]) || '') : '';
    if (f.type === 'multicheck') {
      const selected = val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];
      const knownSet = new Set(f.opts);
      const checked  = new Set(selected.filter(s => knownSet.has(s)));
      const otherVals = selected.filter(s => !knownSet.has(s));
      multis[f.id] = { checked, other: otherVals.join(', ') };
    } else if (f.type === 'select' && f.opts?.includes('Other')) {
      const stdOpts = f.opts.filter(o => o !== 'Other');
      if (val && !stdOpts.includes(val)) {
        values[f.id] = 'Other';
        values[f.id + '-other'] = val;
      } else {
        values[f.id] = val;
        values[f.id + '-other'] = '';
      }
    } else {
      values[f.id] = val;
    }
  });
  return { values, multis };
}

// ── Field renderer ────────────────────────────────────────────────────────────

function Field({ f, val, otherVal, multi, onVal, onOtherVal, onCheck, onOther, onPlaceSelect }) {
  const id = f.id;

  if (f.type === 'hidden') return null;

  if (f.type === 'multicheck') {
    const { checked, other } = multi || { checked: new Set(), other: '' };
    const handleOther = (text) => {
      onOther(id, text);
      if (text && !checked.has('Other')) onCheck(id, 'Other');
    };
    return (
      <>
        <label className="modal-label">{f.label}</label>
        <div className="ec-check-group">
          {f.opts.map(opt => (
            <label key={opt} className="ec-check-label">
              <input
                type="checkbox"
                checked={checked.has(opt)}
                onChange={() => onCheck(id, opt)}
              />
              {' '}{opt}
            </label>
          ))}
        </div>
        <input
          className="modal-input ec-other-input"
          type="text"
          placeholder="Other (specify)"
          value={other}
          onChange={e => handleOther(e.target.value)}
          autoComplete="off"
        />
      </>
    );
  }

  if (f.type === 'radio') {
    return (
      <>
        <label className="modal-label">{f.label}</label>
        <div className="ec-check-group">
          {f.opts.map(opt => (
            <label key={opt} className="ec-check-label">
              <input
                type="radio"
                name={id}
                value={opt}
                checked={val === opt}
                onChange={() => onVal(id, opt)}
              />
              {' '}{opt}
            </label>
          ))}
        </div>
      </>
    );
  }

  if (f.type === 'select') {
    const hasOther = f.opts?.includes('Other');
    return (
      <>
        <label className="modal-label">{f.label}</label>
        <select className="modal-input" value={val} onChange={e => {
          onVal(id, e.target.value);
          if (e.target.value !== 'Other' && onOtherVal) onOtherVal(id, '');
        }}>
          <option value="">—</option>
          {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        {hasOther && val === 'Other' && (
          <input
            className="modal-input ec-other-input"
            type="text"
            placeholder="Specify…"
            value={otherVal || ''}
            onChange={e => onOtherVal && onOtherVal(id, e.target.value)}
            autoComplete="off"
          />
        )}
      </>
    );
  }

  if (f.type === 'place-search') {
    return (
      <>
        <label className="modal-label">{f.label}</label>
        <PlaceSearch
          value={val}
          onChange={v => onVal(id, v)}
          onSelect={onPlaceSelect}
          placeholder="Search area / locality…"
        />
      </>
    );
  }

  if (f.type === 'textarea' || f.type === 'mic-textarea') {
    return (
      <>
        <label className="modal-label">{f.label}</label>
        <textarea
          className="modal-input cal-desc-area"
          rows="2"
          value={val}
          onChange={e => onVal(id, e.target.value)}
        />
      </>
    );
  }

  // text / tel / email
  return (
    <>
      <label className="modal-label">
        {f.label}{f.hint && <span className="modal-hint"> — {f.hint}</span>}
      </label>
      <input
        className="modal-input"
        type={f.type}
        value={val}
        onChange={e => onVal(id, e.target.value)}
        autoComplete="off"
      />
    </>
  );
}

// ── MIC SVG ───────────────────────────────────────────────────────────────────
const MIC_SVG = (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <rect x="9" y="2" width="6" height="12" rx="3"/>
    <path d="M5 10a7 7 0 0 0 14 0"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
    <line x1="8" y1="22" x2="16" y2="22"/>
  </svg>
);

// ── Mic textarea field ────────────────────────────────────────────────────────
function MicTextareaField({ f, val, onVal }) {
  const taRef = useRef(null);
  const { isListening, supported, toggle, onPointerUp, reanchor } = useSpeechInput({
    taRef,
    onChange: (v) => onVal(f.id, v),
  });

  return (
    <>
      <label className="modal-label">{f.label}</label>
      <div style={{ position: 'relative' }}>
        <textarea
          ref={taRef}
          className="modal-input cal-desc-area"
          rows="2"
          value={val}
          onChange={e => onVal(f.id, e.target.value)}
          onPointerUp={onPointerUp}
          onKeyUp={reanchor}
          style={{ paddingRight: supported ? 36 : undefined }}
        />
        {supported && (
          <button
            className={`btn-mic${isListening ? ' active' : ''}`}
            style={{ position: 'absolute', right: 8, bottom: 8 }}
            onMouseDown={e => { e.preventDefault(); toggle(); }}
            aria-label={isListening ? 'Stop recording' : 'Start voice input'}
            type="button"
          >
            {MIC_SVG}
          </button>
        )}
      </div>
    </>
  );
}

// ── Tutor search autocomplete ─────────────────────────────────────────────────

function TutorSearchField({ f, val, onVal, tutorRows }) {
  const [query,    setQuery]    = useState(val);
  const [results,  setResults]  = useState([]);
  const [showDrop, setShowDrop] = useState(false);
  const blurTimer = useRef(null);

  // Keep query in sync when parent resets form
  useEffect(() => { setQuery(val); }, [val]);

  const handleInput = (e) => {
    const q = e.target.value;
    setQuery(q);
    onVal(f.id, q);
    if (q.trim().length < 1) { setResults([]); setShowDrop(false); return; }
    const lower = q.toLowerCase();
    const matches = tutorRows
      .filter(r => (r[C.NAME] || '').toLowerCase().includes(lower))
      .slice(0, 6);
    setResults(matches);
    setShowDrop(matches.length > 0);
  };

  const selectTutor = (name) => {
    setQuery(name);
    onVal(f.id, name);
    setResults([]);
    setShowDrop(false);
  };

  const onBlur = () => {
    blurTimer.current = setTimeout(() => setShowDrop(false), 150);
  };
  const onFocus = () => {
    clearTimeout(blurTimer.current);
    if (results.length > 0) setShowDrop(true);
  };

  return (
    <>
      <label className="modal-label">{f.label}</label>
      <div className="tutor-search-wrap">
        <input
          className="modal-input"
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder="Search tutor name…"
          autoComplete="off"
        />
        {showDrop && (
          <div className="tutor-search-drop">
            {results.map((r, i) => (
              <div
                key={i}
                className="tutor-search-item"
                onMouseDown={() => selectTutor(r[C.NAME] || '')}
              >
                <span className="tsi-name">{r[C.NAME]}</span>
                {r[C.PHONE] && <span className="tsi-phone">{r[C.PHONE]}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EditCardModal() {
  const dispatch = useDispatch();
  const token    = useSelector(s => s.auth.token);
  const { open, sheetRow, uid, isNew, section } = useSelector(s => s.ui.modals.editCard);
  const allTutors  = useSelector(s => s.tutors.allRows);
  const allParents = useSelector(s => s.parents.allRows);
  const tutorTabKey = useSelector(s => s.tutors.currentTabKey);

  const [values,  setValues]  = useState({});
  const [multis,  setMultis]  = useState({});
  const [saving,  setSaving]  = useState(false);
  const backdropRef = useRef(null);

  const fields    = section === 'parents' ? PARENT_EDIT_FIELDS : TUTOR_EDIT_FIELDS;
  const schema    = section === 'parents' ? CP : C;
  const sheetName = section === 'parents' ? SHEETS.PARENTS_TO_CONTACT : SHEETS.TUTORS_APPLIED;

  // Initialise form when modal opens
  useEffect(() => {
    if (!open) return;
    const f = section === 'parents' ? PARENT_EDIT_FIELDS : TUTOR_EDIT_FIELDS;
    const s = section === 'parents' ? CP : C;
    const row = isNew ? null : (section === 'parents'
      ? allParents.find(r => r[31] === sheetRow)
      : allTutors.find(r => r[31] === sheetRow));
    const init = buildInit(f, s, row);
    setValues(init.values);
    setMultis(init.multis);
    setSaving(false);
  }, [open]); // eslint-disable-line

  const close = () => dispatch(closeEditCardModal());

  const onBackdropMouseDown = e => {
    if (e.target === backdropRef.current) close();
  };

  const setVal   = (id, v) => setValues(p => ({ ...p, [id]: v }));
  const onCheck  = (id, opt) => setMultis(p => {
    const prev = p[id] || { checked: new Set(), other: '' };
    const next = new Set(prev.checked);
    if (next.has(opt)) next.delete(opt); else next.add(opt);
    return { ...p, [id]: { ...prev, checked: next } };
  });
  const onOther  = (id, v) => setMultis(p => ({
    ...p, [id]: { ...(p[id] || { checked: new Set(), other: '' }), other: v },
  }));

  const onOtherVal = (id, v) => setValues(p => ({ ...p, [id + '-other']: v }));

  const onPlaceSelect = (loc, placeId) => {
    const mapsUrl = placeId ? `https://www.google.com/maps/place/?q=place_id:${placeId}` : '';
    setValues(p => {
      const existing = (p['ec-address'] || '').trim();
      return {
        ...p,
        'ec-address': existing ? `${existing}\n${loc}` : loc,
        'ec-maps-link': mapsUrl,
      };
    });
  };

  const getVal = f => {
    if (f.type === 'multicheck') return getMultiValue(multis[f.id] || { checked: new Set(), other: '' });
    if (f.type === 'select' && f.opts?.includes('Other') && values[f.id] === 'Other') {
      return values[f.id + '-other'] || 'Other';
    }
    return values[f.id] || '';
  };

  const handleSave = async () => {
    const nameVal = (values['ec-name'] || '').trim();
    if (!nameVal) {
      dispatch(showToast({ message: 'Name is required', type: 'error' }));
      return;
    }

    setSaving(true);
    dispatch(showLoader());

    try {
      if (isNew) {
        // ── Add new tutor ────────────────────────────────────────────────────
        if (!DEV_MODE) {
          let appId;
          try {
            const res = await fetchSheetRows(SHEETS.TUTORS_APPLIED, 'A1', 'A', token);
            const n   = (res.values || []).length;
            appId = 'KB-' + String(Math.max(n, 1)).padStart(3, '0');
          } catch { appId = 'KB-' + Date.now(); }

          const newRow = new Array(31).fill('');
          newRow[C.APP_ID]    = appId;
          newRow[C.SUBMITTED] = nowSheetFmt();
          newRow[C.CONTACTED] = 'No';
          newRow[C.MAIL_SENT] = 'No';

          fields.forEach(f => { newRow[C[f.col]] = getVal(f); });

          await appendRow(SHEETS.TUTORS_APPLIED, newRow, token);
        }
        dispatch(hideLoader());
        setSaving(false);
        close();
        dispatch(showToast(`${nameVal} added`));
        // Reload tutor list to get the newly added row
        dispatch(loadTutors({ tabKey: tutorTabKey || 'all' }));

      } else {
        // ── Edit existing row ─────────────────────────────────────────────────
        const row = section === 'parents'
          ? allParents.find(r => r[31] === sheetRow)
          : allTutors.find(r => r[31] === sheetRow);

        const updates = [];
        fields.forEach(f => {
          const newVal = getVal(f);
          const oldVal = row ? cellValue(row, schema[f.col]) : '';
          if (newVal !== oldVal) updates.push({ col: schema[f.col], val: newVal });
        });

        if (!updates.length) {
          dispatch(hideLoader());
          setSaving(false);
          close();
          return;
        }

        if (!DEV_MODE) {
          await Promise.all(
            updates.map(u => updateCell(sheetName, sheetRow, u.col + 1, u.val, token)),
          );
        }

        const updateFn = section === 'parents' ? updateParentRow : updateTutorRow;
        updates.forEach(u => dispatch(updateFn({ sheetRow, colIdx: u.col, value: u.val })));

        dispatch(hideLoader());
        setSaving(false);
        close();
        dispatch(showToast('Changes saved'));
      }
    } catch (err) {
      dispatch(hideLoader());
      setSaving(false);
      dispatch(showToast({ message: 'Failed: ' + err.message, type: 'error' }));
    }
  };

  if (!open) return null;

  const title = isNew
    ? (section === 'parents' ? 'Add a Parent' : 'Add a Tutor')
    : (() => {
        const row = section === 'parents'
          ? allParents.find(r => r[31] === sheetRow)
          : allTutors.find(r => r[31] === sheetRow);
        return `Edit — ${row ? cellValue(row, schema.NAME) : ''}`;
      })();

  return (
    <div className="modal-backdrop" ref={backdropRef} onMouseDown={onBackdropMouseDown}>
      <div className="modal-card modal-tall" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={close}>{CLOSE_SVG}</button>
        </div>

        <div className="modal-scroll-body">
          {fields.map(f => {
            if (section === 'parents' && f.col === 'ASSIGNED_TUTOR') {
              return (
                <TutorSearchField
                  key={f.id}
                  f={f}
                  val={values[f.id] || ''}
                  onVal={setVal}
                  tutorRows={allTutors}
                />
              );
            }
            if (f.type === 'mic-textarea') {
              return (
                <MicTextareaField
                  key={f.id}
                  f={f}
                  val={values[f.id] || ''}
                  onVal={setVal}
                />
              );
            }
            return (
              <Field
                key={f.id}
                f={f}
                val={values[f.id] || ''}
                otherVal={values[f.id + '-other'] || ''}
                multi={multis[f.id]}
                onVal={setVal}
                onOtherVal={onOtherVal}
                onCheck={onCheck}
                onOther={onOther}
                onPlaceSelect={onPlaceSelect}
              />
            );
          })}
        </div>

        <div className="modal-footer-actions">
          <button className="btn-modal-cancel" onClick={close}>Cancel</button>
          <button className="btn-schedule-save" disabled={saving} onClick={handleSave}>
            {isNew ? 'Add' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

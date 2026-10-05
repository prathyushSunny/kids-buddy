import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { SECTION_TABS } from '../../constants';

export default function TabBar({ section, onSectionChange, subTab, onSubTabChange, onAddEntry }) {
  const dispatch = useDispatch();
  const tutorCounts  = useSelector(s => s.tutors.tabCounts);
  const parentCounts = useSelector(s => s.parents.tabCounts);

  const counts = section === 'tutors' ? tutorCounts : parentCounts;
  const tabs   = SECTION_TABS[section] || [];

  const totalFor = (c) => {
    const all   = c.all   ?? 0;
    const draft = c.draft ?? 0;
    const bin   = c.bin   ?? 0;
    return all + draft + bin;
  };

  const tutorTotal  = totalFor(tutorCounts);
  const parentTotal = totalFor(parentCounts);

  return (
    <div className="tab-bar">
      <div className="section-tab-row">
        <div className="section-tabs">
          <button
            className={`section-tab${section === 'tutors' ? ' active' : ''}`}
            onClick={() => onSectionChange('tutors')}
          >
            Tutors{tutorTotal > 0 ? <span className="section-tab-count">{tutorTotal}</span> : null}
          </button>
          <button
            className={`section-tab${section === 'parents' ? ' active' : ''}`}
            onClick={() => onSectionChange('parents')}
          >
            Parents{parentTotal > 0 ? <span className="section-tab-count">{parentTotal}</span> : null}
          </button>
        </div>
        <button className="btn-add-entry" onClick={onAddEntry}>
          + Add a {section === 'tutors' ? 'Tutor' : 'Parent/Student'}
        </button>
      </div>

      <div className="sub-tabs">
        {tabs.map(t => {
          const count = counts[t.key];
          const label = count !== undefined ? `${t.label} (${count})` : t.label;
          return (
            <button
              key={t.key}
              className={`sub-tab${t.isDraft ? ' draft-tab' : ''}${t.isBin ? ' bin-tab' : ''}${subTab === t.key ? ' active' : ''}`}
              onClick={() => onSubTabChange(t.key)}
            >{label}</button>
          );
        })}
      </div>
    </div>
  );
}

import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  closeScheduleTypeModal,
  openScheduleModal,
  openInterviewScheduleModal,
} from '../../features/ui/uiSlice';

const BRIEFCASE_SVG = (
  <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <rect x="2" y="7" width="20" height="14" rx="2"/>
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
    <line x1="12" y1="12" x2="12" y2="12.01"/>
    <path d="M2 12h20"/>
  </svg>
);

const HOME_SVG = (
  <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

export default function ScheduleTypeModal() {
  const dispatch = useDispatch();
  const { open, sheetRow, uid, tutorName, tutorEmail } = useSelector(s => s.ui.modals.scheduleType);

  if (!open) return null;

  const close = () => dispatch(closeScheduleTypeModal());

  const pickInterview = () => {
    close();
    dispatch(openInterviewScheduleModal({ sheetRow, uid, tutorName, tutorEmail, scheduleId: null, current: '' }));
  };

  const pickVisit = () => {
    close();
    dispatch(openScheduleModal({ sheetRow, uid, current: '', scheduleId: null }));
  };

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal-card sched-type-card" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">What would you like to schedule?</h3>
        <div className="sched-type-options">
          <button className="sched-type-btn" onClick={pickInterview}>
            <span className="sched-type-icon">{BRIEFCASE_SVG}</span>
            <span className="sched-type-label">Schedule Interview</span>
            <span className="sched-type-desc">Video call with tutor via Google Meet. Calendar invite sent automatically.</span>
          </button>
          <button className="sched-type-btn" onClick={pickVisit}>
            <span className="sched-type-icon">{HOME_SVG}</span>
            <span className="sched-type-label">Student Visit</span>
            <span className="sched-type-desc">In-person visit to the student's home. Notify via WhatsApp.</span>
          </button>
        </div>
        <button className="btn-modal-cancel" style={{ marginTop: 8 }} onClick={close}>Cancel</button>
      </div>
    </div>
  );
}

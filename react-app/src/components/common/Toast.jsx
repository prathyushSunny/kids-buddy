import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { dismissToast } from '../../features/ui/uiSlice';

export default function Toast() {
  const toasts = useSelector(s => s.ui.toasts);
  const dispatch = useDispatch();

  useEffect(() => {
    if (!toasts.length) return;
    const timer = setTimeout(() => dispatch(dismissToast(toasts[0].id)), 3000);
    return () => clearTimeout(timer);
  }, [toasts, dispatch]);

  if (!toasts.length) return null;

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast${t.type === 'error' ? ' toast-error' : ''}`}>
          {t.message}
          <button
            onClick={() => dispatch(dismissToast(t.id))}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', marginLeft: 6, fontSize: 16 }}
          >×</button>
        </div>
      ))}
    </div>
  );
}

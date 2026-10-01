import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import LandingPage from './pages/LandingPage';
import SignIn from './pages/SignIn';
import Dashboard from './pages/Dashboard';
import Toast from './components/common/Toast';
import Loader from './components/common/Loader';
import ConfirmModal from './components/modals/ConfirmModal';
import ActionsModal from './components/modals/ActionsModal';
import InLoopModal from './components/modals/InLoopModal';
import ScheduleModal from './components/modals/ScheduleModal';
import WAShareModal from './components/modals/WAShareModal';
import CalendarPromptModal from './components/modals/CalendarPromptModal';
import PostRejectionModal from './components/modals/PostRejectionModal';
import EditCardModal from './components/modals/EditCardModal';
import AddParentModal from './components/modals/AddParentModal';
import QuickMoveModal from './components/modals/QuickMoveModal';

// CMS shell — auth-gated SignIn / Dashboard
function CMSRoot() {
  const isAuthenticated = useSelector(s => s.auth.isAuthenticated);
  const isLoading       = useSelector(s => s.ui.loader);
  return (
    <>
      {isAuthenticated ? <Dashboard /> : <SignIn />}
      <Toast />
      {isLoading && <Loader />}
      <ConfirmModal />
      <ActionsModal />
      <InLoopModal />
      <ScheduleModal />
      <WAShareModal />
      <CalendarPromptModal />
      <PostRejectionModal />
      <EditCardModal />
      <AddParentModal />
      <QuickMoveModal />
    </>
  );
}

const isCMSDomain = typeof window !== 'undefined' &&
  window.location.hostname.startsWith('cms.');

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* On cms.kidsbuddy.online, redirect root straight to /cms */}
        <Route
          path="/"
          element={isCMSDomain ? <Navigate to="/cms" replace /> : <LandingPage />}
        />
        <Route path="/cms" element={<CMSRoot />} />
        {/* Catch-all: unknown paths go home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

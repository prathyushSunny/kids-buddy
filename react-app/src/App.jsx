import React from 'react';
import { useSelector } from 'react-redux';
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

export default function App() {
  const isAuthenticated = useSelector(s => s.auth.isAuthenticated);
  const isLoading       = useSelector(s => s.ui.loader);

  return (
    <>
      {isAuthenticated ? <Dashboard /> : <SignIn />}

      {/* Global UI */}
      <Toast />
      {isLoading && <Loader />}

      {/* Modals — always mounted, render nothing when closed */}
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

import { createSlice } from '@reduxjs/toolkit';

let toastId = 0;

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    toasts:       [],
    loader:       false,
    selectedUids: [],
    modals: {
      actions: {
        open: false, sheetRow: null, uid: null,
        section: 'tutors', tabKey: 'all',
      },
      editCard: {
        open: false, sheetRow: null, uid: null, isNew: false, section: 'tutors',
      },
      confirm: {
        open: false, message: '', onConfirmKey: null,
      },
      waShare: {
        open: false, data: null,
      },
      scheduleType: {
        open: false, sheetRow: null, uid: null, tutorName: '', tutorEmail: '',
      },
      schedule: {
        open: false, sheetRow: null, uid: null, current: '', scheduleId: null,
      },
      interviewSchedule: {
        open: false, sheetRow: null, uid: null,
        tutorName: '', tutorEmail: '', scheduleId: null, current: '',
      },
      addParent: { open: false },
      inLoop: {
        open: false, sheetRow: null, uid: null, name: '', section: 'tutors', sheet: '',
      },
      calPrompt: {
        open: false, sheetRow: null, tutorName: '', tutorEmail: '', dateStr: '', calDesc: '', eventName: '', parentMapsLink: '', scheduleId: null,
      },
      postRejection: {
        open: false, sheetRow: null, uid: null,
      },
      quickMove: {
        open: false, sheetRow: null, uid: null, name: '', section: 'parents', sheet: '',
      },
      contactFollowUp: {
        open: false, sheetRow: null, uid: null, name: '', section: 'tutors', sheet: '',
      },
    },
  },
  reducers: {
    showToast(state, { payload }) {
      const { message, type = 'default' } = typeof payload === 'string'
        ? { message: payload } : payload;
      state.toasts.push({ id: ++toastId, message, type });
    },
    dismissToast(state, { payload }) {
      state.toasts = state.toasts.filter(t => t.id !== payload);
    },

    showLoader(state) { state.loader = true; },
    hideLoader(state) { state.loader = false; },

    toggleUidSelection(state, { payload }) {
      const i = state.selectedUids.indexOf(payload);
      if (i === -1) state.selectedUids.push(payload);
      else          state.selectedUids.splice(i, 1);
    },
    selectSingleUid(state, { payload }) {
      state.selectedUids = [payload];
    },
    clearSelection(state) {
      state.selectedUids = [];
    },

    openActionsModal(state, { payload = {} }) {
      state.modals.actions = { open: true, ...payload };
    },
    closeActionsModal(state) {
      state.modals.actions.open = false;
    },

    openEditCardModal(state, { payload }) {
      state.modals.editCard = { open: true, ...payload };
    },
    closeEditCardModal(state) {
      state.modals.editCard.open = false;
    },

    openConfirmModal(state, { payload }) {
      state.modals.confirm = { open: true, message: payload.message, onConfirmKey: payload.onConfirmKey || null };
    },
    closeConfirmModal(state) {
      state.modals.confirm.open = false;
    },

    openWAShareModal(state, { payload = {} }) {
      state.modals.waShare = { open: true, data: payload };
    },
    closeWAShareModal(state) {
      state.modals.waShare.open = false;
    },

    openScheduleTypeModal(state, { payload }) {
      state.modals.scheduleType = { open: true, ...payload };
    },
    closeScheduleTypeModal(state) {
      state.modals.scheduleType.open = false;
    },

    openScheduleModal(state, { payload }) {
      state.modals.schedule = { open: true, ...payload };
    },
    closeScheduleModal(state) {
      state.modals.schedule.open = false;
    },

    openInterviewScheduleModal(state, { payload }) {
      state.modals.interviewSchedule = { open: true, ...payload };
    },
    closeInterviewScheduleModal(state) {
      state.modals.interviewSchedule.open = false;
    },

    openAddParentModal(state) {
      state.modals.addParent.open = true;
    },
    closeAddParentModal(state) {
      state.modals.addParent.open = false;
    },

    openInLoopModal(state, { payload }) {
      state.modals.inLoop = { open: true, ...payload };
    },
    closeInLoopModal(state) {
      state.modals.inLoop.open = false;
    },

    openCalPromptModal(state, { payload }) {
      state.modals.calPrompt = { open: true, ...payload };
    },
    closeCalPromptModal(state) {
      state.modals.calPrompt.open = false;
    },

    openPostRejectionModal(state, { payload }) {
      state.modals.postRejection = { open: true, ...payload };
    },
    closePostRejectionModal(state) {
      state.modals.postRejection.open = false;
    },

    openQuickMoveModal(state, { payload }) {
      state.modals.quickMove = { open: true, ...payload };
    },
    closeQuickMoveModal(state) {
      state.modals.quickMove.open = false;
    },

    openContactFollowUpModal(state, { payload }) {
      state.modals.contactFollowUp = { open: true, ...payload };
    },
    closeContactFollowUpModal(state) {
      state.modals.contactFollowUp.open = false;
    },
  },
});

export const {
  showToast, dismissToast,
  showLoader, hideLoader,
  toggleUidSelection, selectSingleUid, clearSelection,
  openActionsModal, closeActionsModal,
  openEditCardModal, closeEditCardModal,
  openConfirmModal, closeConfirmModal,
  openWAShareModal, closeWAShareModal,
  openScheduleTypeModal, closeScheduleTypeModal,
  openScheduleModal, closeScheduleModal,
  openInterviewScheduleModal, closeInterviewScheduleModal,
  openAddParentModal, closeAddParentModal,
  openInLoopModal, closeInLoopModal,
  openCalPromptModal, closeCalPromptModal,
  openPostRejectionModal, closePostRejectionModal,
  openQuickMoveModal, closeQuickMoveModal,
  openContactFollowUpModal, closeContactFollowUpModal,
} = uiSlice.actions;

export default uiSlice.reducer;

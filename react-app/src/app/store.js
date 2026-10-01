import { configureStore } from '@reduxjs/toolkit';
import authReducer    from '../features/auth/authSlice';
import uiReducer      from '../features/ui/uiSlice';
import tutorsReducer  from '../features/tutors/tutorsSlice';
import parentsReducer from '../features/parents/parentsSlice';

const store = configureStore({
  reducer: {
    auth:    authReducer,
    ui:      uiReducer,
    tutors:  tutorsReducer,
    parents: parentsReducer,
  },
  middleware: getDefault =>
    getDefault({ serializableCheck: false }),
});

export default store;

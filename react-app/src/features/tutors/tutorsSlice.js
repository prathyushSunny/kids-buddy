import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { SECTION_TABS, SHEETS, C, DEV_MODE, SOURCE_LOCATIONS } from '../../constants';
import { fetchSheetRows, fetchRowCount, cellValue } from '../../services/sheetsApi';
import { MOCK_TUTOR_ROWS } from '../../utils/mockData';
import { parseDate } from '../../utils/dateUtils';

// ── THUNKS ────────────────────────────────────────────────────────────────────
export const loadTutors = createAsyncThunk(
  'tutors/load',
  async ({ tabKey }, { getState, rejectWithValue }) => {
    const { auth: { token } } = getState();
    const cfg = SECTION_TABS.tutors.find(t => t.key === tabKey) || SECTION_TABS.tutors[0];

    // DEV_MODE: use mock rows, sort by SUBMITTED descending
    if (DEV_MODE) {
      let rows = MOCK_TUTOR_ROWS.map((r, i) => { const c = [...r]; c[31] = i + 2; return c; });
      rows.sort((a, b) => parseDate(b[C.SUBMITTED]) - parseDate(a[C.SUBMITTED]));
      if (cfg.statusFilter) rows = rows.filter(r => (r[C.STATUS] || '') === cfg.statusFilter);
      return { rows, tabKey };
    }

    try {
      if (cfg.isBin) {
        const res = await fetchSheetRows(SHEETS.TUTORS_BIN, 'A2', 'AG', token);
        const rows = (res.values || []).filter(r => r.length > 0);
        rows.forEach((r, i) => { r[31] = i + 2; });
        rows.sort((a, b) => parseDate(b[C.DELETED_AT] || '') - parseDate(a[C.DELETED_AT] || ''));
        return { rows, tabKey };
      }

      if (cfg.isDraft) {
        const res = await fetchSheetRows(SHEETS.TUTORS_DRAFT, 'A1', 'AG', token);
        let rows = (res.values || []);
        let offset = 2;
        if (rows.length > 0 && rows[0][0] === 'App ID') { rows = rows.slice(1); }
        else { offset = 1; }
        rows = rows.filter(r => r.length > 0);
        rows.forEach((r, i) => { r[31] = offset + i; });
        return { rows, tabKey };
      }

      // Applied sheet (All / In-Loop / Onboarded) — sort newest-first in thunk (plain JS, no Immer)
      const res = await fetchSheetRows(cfg.sheet, 'A2', 'AG', token);
      let rows = (res.values || []).filter(r => r.length > 0);
      rows.forEach((r, i) => { r[31] = i + 2; });
      rows.sort((a, b) => parseDate(b[C.SUBMITTED] || '') - parseDate(a[C.SUBMITTED] || ''));

      if (cfg.statusFilter) {
        rows = rows.filter(r => (r[C.STATUS] || '') === cfg.statusFilter);
      }

      return { rows, tabKey };
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

export const fetchTabCounts = createAsyncThunk(
  'tutors/fetchTabCounts',
  async (_, { getState, rejectWithValue }) => {
    if (DEV_MODE) return { draft: 0, bin: 0 };
    const { auth: { token } } = getState();
    try {
      const [draftRes, binRes] = await Promise.all([
        fetchSheetRows(SHEETS.TUTORS_DRAFT, 'A1', 'D', token),
        fetchSheetRows(SHEETS.TUTORS_BIN,   'A2', 'AG', token),
      ]);
      let draftRows = (draftRes.values || []);
      if (draftRows.length > 0 && draftRows[0][0] === 'App ID') draftRows = draftRows.slice(1);
      const draftCount = draftRows.filter(r => r.length > 0).length;
      const binCount   = (binRes.values || []).filter(r => r.length > 0).length;
      return { draft: draftCount, bin: binCount };
    } catch {
      return rejectWithValue('count fetch failed');
    }
  },
);

// ── SLICE ─────────────────────────────────────────────────────────────────────
const tutorsSlice = createSlice({
  name: 'tutors',
  initialState: {
    allRows:      [],
    filteredRows: [],
    currentTabKey: 'all',
    tabCounts:    {},     // { all, in_loop, onboarded, draft, bin }
    isLoading:    false,
    error:        null,
    searchQuery:  '',
    filterContacted: 'all',
    filterLocs:    [],
    filterSubjs:   [],
    filterTimings: [],
    sheetIdMap:    {},
  },
  reducers: {
    setTabKey(state, { payload }) {
      state.currentTabKey = payload;
    },
    setSearchQuery(state, { payload }) {
      state.searchQuery = payload;
      tutorsSlice.caseReducers._applyFilter(state);
    },
    setFilterContacted(state, { payload }) {
      state.filterContacted = payload;
      tutorsSlice.caseReducers._applyFilter(state);
    },
    setFilterLocs(state, { payload }) {
      state.filterLocs = payload;
      tutorsSlice.caseReducers._applyFilter(state);
    },
    setFilterSubjs(state, { payload }) {
      state.filterSubjs = payload;
      tutorsSlice.caseReducers._applyFilter(state);
    },
    setFilterTimings(state, { payload }) {
      state.filterTimings = payload;
      tutorsSlice.caseReducers._applyFilter(state);
    },
    clearChipFilters(state) {
      state.filterLocs     = [];
      state.filterSubjs    = [];
      state.filterTimings  = [];
      tutorsSlice.caseReducers._applyFilter(state);
    },
    _applyFilter(state) {
      const q = state.searchQuery.toLowerCase().trim();
      let rows = state.allRows;

      // When on a status-filtered tab (In-Loop / Onboarded), keep only matching rows
      // so that client-side status changes remove cards from the list immediately.
      const currentCfg = SECTION_TABS.tutors.find(t => t.key === state.currentTabKey);
      if (currentCfg?.statusFilter) {
        rows = rows.filter(r => (r[C.STATUS] || '') === currentCfg.statusFilter);
      }

      if (state.filterContacted !== 'all') {
        const want = state.filterContacted === 'yes' ? 'Yes' : 'No';
        rows = rows.filter(r => (r[C.CONTACTED] || 'No') === want);
      }

      if (state.filterLocs.length) {
        const hasOther    = state.filterLocs.includes('__other__');
        const srcLocs     = state.filterLocs.filter(l => l !== '__other__');
        rows = rows.filter(r => {
          const loc = cellValue(r, C.LOCATION) || '';
          const isSource = SOURCE_LOCATIONS.some(s => loc.toLowerCase().includes(s.toLowerCase()));
          return srcLocs.some(s => loc.toLowerCase().includes(s.toLowerCase()))
            || (hasOther && !isSource);
        });
      }

      if (state.filterSubjs.length) {
        rows = rows.filter(r =>
          state.filterSubjs.some(s => (cellValue(r, C.SUBJECTS) || '').includes(s)),
        );
      }

      if (state.filterTimings.length) {
        rows = rows.filter(r =>
          state.filterTimings.some(t => (cellValue(r, C.TIMINGS) || '').includes(t)),
        );
      }

      if (q) {
        rows = rows.filter(r =>
          [C.NAME, C.PHONE, C.EMAIL, C.COLLEGE, C.APP_ID, C.NOTES].some(i =>
            cellValue(r, i).toLowerCase().includes(q),
          ),
        );
      }

      // In-Loop tab: scheduled first (earliest date asc), then rest by submitted asc
      if (state.currentTabKey === 'in_loop') {
        rows = [...rows].sort((a, b) => {
          const aScheduled = cellValue(a, C.INTERVIEW_STATUS) === 'Scheduled' && cellValue(a, C.INTERVIEW_AT);
          const bScheduled = cellValue(b, C.INTERVIEW_STATUS) === 'Scheduled' && cellValue(b, C.INTERVIEW_AT);
          if (aScheduled && bScheduled) return parseDate(cellValue(a, C.INTERVIEW_AT)) - parseDate(cellValue(b, C.INTERVIEW_AT));
          if (aScheduled) return -1;
          if (bScheduled) return 1;
          return parseDate(cellValue(a, C.SUBMITTED)) - parseDate(cellValue(b, C.SUBMITTED));
        });
      }

      state.filteredRows = rows;

      // Only recompute status-based counts when allRows contains the full applied sheet.
      // Bin/Draft/In-Loop tabs overwrite allRows with their own subset, so recomputing
      // here would corrupt the All/In-Loop/Onboarded counts.
      if (state.currentTabKey === 'all') {
        SECTION_TABS.tutors.forEach(t => {
          if (t.statusFilter) {
            state.tabCounts[t.key] = state.allRows.filter(r => (r[C.STATUS] || '') === t.statusFilter).length;
          } else if (!t.isBin && !t.isDraft) {
            state.tabCounts[t.key] = state.allRows.length;
          }
        });
      }
    },
    moveRowStatus(state, { payload: { sheetRow, newStatus } }) {
      const row = state.allRows.find(r => r[31] === sheetRow);
      if (!row) return;
      const prevStatus = row[C.STATUS] || '';
      row[C.STATUS] = newStatus;
      SECTION_TABS.tutors.forEach(t => {
        if (!t.statusFilter) return;
        if (prevStatus === t.statusFilter && state.tabCounts[t.key] !== undefined) {
          state.tabCounts[t.key] = Math.max(0, (state.tabCounts[t.key] || 1) - 1);
        }
        if (newStatus === t.statusFilter && state.tabCounts[t.key] !== undefined) {
          state.tabCounts[t.key] = (state.tabCounts[t.key] || 0) + 1;
        }
      });
      tutorsSlice.caseReducers._applyFilter(state);
    },
    updateRowInPlace(state, { payload }) {
      // payload: { sheetRow, colIdx, value }
      const { sheetRow, colIdx, value } = payload;
      const row = state.allRows.find(r => r[31] === sheetRow);
      if (row) row[colIdx] = value;
      tutorsSlice.caseReducers._applyFilter(state);
    },
    removeRow(state, { payload: sheetRow }) {
      const removed = state.allRows.find(r => r[31] === sheetRow);
      state.allRows = state.allRows.filter(r => r[31] !== sheetRow);
      state.allRows.forEach(r => { if (r[31] > sheetRow) r[31]--; });
      // Always decrement 'all' count regardless of which tab is active
      if (state.tabCounts.all !== undefined) {
        state.tabCounts.all = Math.max(0, (state.tabCounts.all || 1) - 1);
      }
      // Decrement the matching status-tab count (e.g. in_loop, onboarded)
      if (removed) {
        const removedStatus = cellValue(removed, C.STATUS) || '';
        const matchTab = SECTION_TABS.tutors.find(t => t.statusFilter === removedStatus);
        if (matchTab && state.tabCounts[matchTab.key] !== undefined) {
          state.tabCounts[matchTab.key] = Math.max(0, (state.tabCounts[matchTab.key] || 1) - 1);
        }
      }
      tutorsSlice.caseReducers._applyFilter(state);
    },
    addRow(state, { payload: row }) {
      state.allRows.push(row);
      tutorsSlice.caseReducers._applyFilter(state);
    },
    incrementTabCount(state, { payload: key }) {
      state.tabCounts[key] = (state.tabCounts[key] || 0) + 1;
    },
    decrementTabCount(state, { payload: key }) {
      state.tabCounts[key] = Math.max(0, (state.tabCounts[key] || 1) - 1);
    },
    setSheetIdMap(state, { payload }) {
      state.sheetIdMap = payload;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(loadTutors.pending, state => {
        state.isLoading = true;
        state.error     = null;
      })
      .addCase(loadTutors.fulfilled, (state, { payload }) => {
        state.isLoading    = false;
        state.allRows      = payload.rows;
        state.searchQuery  = '';
        state.filterContacted = 'all';

        // Recompute in-memory tab counts for the All-tab rows
        const cfg = SECTION_TABS.tutors.find(t => t.key === payload.tabKey);
        if (cfg && !cfg.statusFilter && !cfg.isBin && !cfg.isDraft) {
          const prevBin   = state.tabCounts.bin;
          const prevDraft = state.tabCounts.draft;
          state.tabCounts = {};
          if (prevBin   !== undefined) state.tabCounts.bin   = prevBin;
          if (prevDraft !== undefined) state.tabCounts.draft = prevDraft;
          SECTION_TABS.tutors.forEach(t => {
            if (t.statusFilter) {
              state.tabCounts[t.key] = payload.rows.filter(r => (r[C.STATUS] || '') === t.statusFilter).length;
            } else if (!t.isBin && !t.isDraft) {
              state.tabCounts[t.key] = payload.rows.length;
            }
          });
        } else if (cfg) {
          state.tabCounts[cfg.key] = payload.rows.length;
        }

        state.filterLocs     = [];
        state.filterSubjs    = [];
        state.filterTimings  = [];
        tutorsSlice.caseReducers._applyFilter(state);
      })
      .addCase(loadTutors.rejected, (state, { payload }) => {
        state.isLoading = false;
        state.error     = payload;
      })
      .addCase(fetchTabCounts.fulfilled, (state, { payload }) => {
        state.tabCounts.draft = payload.draft;
        state.tabCounts.bin   = payload.bin;
      });
  },
});

export const {
  setTabKey, setSearchQuery, setFilterContacted,
  setFilterLocs, setFilterSubjs, setFilterTimings, clearChipFilters,
  moveRowStatus, updateRowInPlace, removeRow, addRow,
  incrementTabCount, decrementTabCount,
  setSheetIdMap,
} = tutorsSlice.actions;

export default tutorsSlice.reducer;

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { SECTION_TABS, SHEETS, CP, DEV_MODE } from '../../constants';
import { fetchSheetRows, fetchRowCount, cellValue } from '../../services/sheetsApi';
import { MOCK_PARENT_ROWS } from '../../utils/mockData';
import { parseDate } from '../../utils/dateUtils';

export const loadParents = createAsyncThunk(
  'parents/load',
  async ({ tabKey }, { getState, rejectWithValue }) => {
    const { auth: { token } } = getState();
    const cfg = SECTION_TABS.parents.find(t => t.key === tabKey) || SECTION_TABS.parents[0];

    if (DEV_MODE) {
      let rows = MOCK_PARENT_ROWS.map((r, i) => { const c = [...r]; c[31] = i + 2; return c; });
      if (cfg.statusFilter) rows = rows.filter(r => (r[CP.STATUS] || '') === cfg.statusFilter);
      if (cfg.isDraft) rows = [];
      return { rows, tabKey };
    }

    try {
      if (cfg.isBin) {
        const res = await fetchSheetRows(SHEETS.PARENTS_BIN, 'A2', 'S', token);
        const rows = (res.values || []).filter(r => r.length > 0);
        rows.forEach((r, i) => { r[31] = i + 2; });
        rows.sort((a, b) => parseDate(b[CP.DELETED_AT] || '') - parseDate(a[CP.DELETED_AT] || ''));
        return { rows, tabKey };
      }

      if (cfg.isDraft) {
        const res = await fetchSheetRows(SHEETS.PARENTS_DRAFT, 'A1', 'S', token);
        let rows = res.values || [];
        let offset = 2;
        if (rows.length > 0 && (rows[0][0] === 'P' || rows[0][CP.NAME] === 'Customer Full Name' || rows[0][0] === 'Parent ID')) {
          rows = rows.slice(1);
        } else { offset = 1; }
        rows = rows.filter(r => r.length > 0);
        rows.forEach((r, i) => { r[31] = offset + i; });
        return { rows, tabKey };
      }

      // Sort newest-first in thunk (plain JS, no Immer) — CP.ONBOARDED_ON = index 1
      const res = await fetchSheetRows(cfg.sheet, 'A2', 'S', token);
      let rows = (res.values || []).filter(r => r.length > 0);
      rows.forEach((r, i) => { r[31] = i + 2; });
      rows.sort((a, b) => parseDate(b[CP.ONBOARDED_ON] || '') - parseDate(a[CP.ONBOARDED_ON] || ''));

      if (cfg.statusFilter) {
        rows = rows.filter(r => (r[CP.STATUS] || '') === cfg.statusFilter);
      }

      return { rows, tabKey };
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

export const fetchParentTabCounts = createAsyncThunk(
  'parents/fetchTabCounts',
  async (_, { getState, rejectWithValue }) => {
    if (DEV_MODE) return { bin: 0, draft: 0, all: 0 };
    const { auth: { token } } = getState();
    try {
      const [binRes, draftRes, allCount] = await Promise.all([
        fetchSheetRows(SHEETS.PARENTS_BIN,   'A2', 'D', token),
        fetchSheetRows(SHEETS.PARENTS_DRAFT, 'A1', 'D', token),
        fetchRowCount(SHEETS.PARENTS_TO_CONTACT, token),
      ]);
      const binCount = (binRes.values || []).filter(r => r.length > 0).length;
      let draftRows = (draftRes.values || []);
      if (draftRows.length > 0 && draftRows[0][0] === 'Parent ID') draftRows = draftRows.slice(1);
      const draftCount = draftRows.filter(r => r.length > 0).length;
      return { bin: binCount, draft: draftCount, all: allCount };
    } catch {
      return rejectWithValue('count fetch failed');
    }
  },
);

const parentsSlice = createSlice({
  name: 'parents',
  initialState: {
    allRows:      [],
    filteredRows: [],
    currentTabKey: 'all',
    tabCounts:    {},
    isLoading:    false,
    error:        null,
    searchQuery:  '',
    filterContacted: 'all',
    filterLocs:   [],
    cache:        [],   // full to-contact list for WA/schedule parent search
  },
  reducers: {
    setTabKey(state, { payload }) {
      state.currentTabKey = payload;
    },
    setSearchQuery(state, { payload }) {
      state.searchQuery = payload;
      parentsSlice.caseReducers._applyFilter(state);
    },
    setFilterContacted(state, { payload }) {
      state.filterContacted = payload;
      parentsSlice.caseReducers._applyFilter(state);
    },
    setFilterLocs(state, { payload }) {
      state.filterLocs = payload;
      parentsSlice.caseReducers._applyFilter(state);
    },
    clearChipFilters(state) {
      state.filterLocs = [];
      parentsSlice.caseReducers._applyFilter(state);
    },
    _applyFilter(state) {
      const q = state.searchQuery.toLowerCase().trim();
      let rows = state.allRows;

      // When on a status-filtered tab (In-Loop / Onboarded), keep only matching rows
      // so that client-side status changes remove cards from the list immediately.
      const currentCfg = SECTION_TABS.parents.find(t => t.key === state.currentTabKey);
      if (currentCfg?.statusFilter) {
        rows = rows.filter(r => (r[CP.STATUS] || '') === currentCfg.statusFilter);
      }

      if (state.filterContacted !== 'all') {
        const want = state.filterContacted === 'yes' ? 'Yes' : 'No';
        rows = rows.filter(r => (r[CP.CONTACTED] || 'No') === want);
      }

      if (state.filterLocs.length) {
        rows = rows.filter(r => state.filterLocs.includes(cellValue(r, CP.LOCATION)));
      }

      if (q) {
        rows = rows.filter(r =>
          [CP.NAME, CP.PHONE, CP.EMAIL, CP.LOCATION, CP.STUDENT_NAME, CP.NOTES].some(i =>
            cellValue(r, i).toLowerCase().includes(q),
          ),
        );
      }

      state.filteredRows = rows;

      // Only recompute from allRows when on 'all' tab — status-filtered tabs (in_loop,
      // onboarded) and bin/draft tabs load a subset into allRows, so counts can't be
      // derived from it there. moveRowStatus adjusts counts directly on those tabs.
      if (state.currentTabKey === 'all') {
        SECTION_TABS.parents.forEach(t => {
          if (t.statusFilter) {
            state.tabCounts[t.key] = state.allRows.filter(r => (r[CP.STATUS] || '') === t.statusFilter).length;
          } else if (!t.isBin && !t.isDraft) {
            state.tabCounts[t.key] = state.allRows.length;
          }
        });
      }
    },
    moveRowStatus(state, { payload: { sheetRow, newStatus } }) {
      const row = state.allRows.find(r => r[31] === sheetRow);
      if (!row) return;
      const prevStatus = row[CP.STATUS] || '';
      row[CP.STATUS] = newStatus;
      SECTION_TABS.parents.forEach(t => {
        if (!t.statusFilter) return;
        if (prevStatus === t.statusFilter && state.tabCounts[t.key] !== undefined) {
          state.tabCounts[t.key] = Math.max(0, (state.tabCounts[t.key] || 1) - 1);
        }
        if (newStatus === t.statusFilter && state.tabCounts[t.key] !== undefined) {
          state.tabCounts[t.key] = (state.tabCounts[t.key] || 0) + 1;
        }
      });
      parentsSlice.caseReducers._applyFilter(state);
    },
    updateRowInPlace(state, { payload }) {
      const { sheetRow, colIdx, value } = payload;
      const row = state.allRows.find(r => r[31] === sheetRow);
      if (row) row[colIdx] = value;
      parentsSlice.caseReducers._applyFilter(state);
    },
    removeRow(state, { payload: sheetRow }) {
      state.allRows = state.allRows.filter(r => r[31] !== sheetRow);
      state.allRows.forEach(r => { if (r[31] > sheetRow) r[31]--; });
      parentsSlice.caseReducers._applyFilter(state);
    },
    addRow(state, { payload: row }) {
      state.allRows.push(row);
      parentsSlice.caseReducers._applyFilter(state);
    },
    setCache(state, { payload }) {
      state.cache = payload;
    },
    incrementTabCount(state, { payload: key }) {
      state.tabCounts[key] = (state.tabCounts[key] || 0) + 1;
    },
    decrementTabCount(state, { payload: key }) {
      state.tabCounts[key] = Math.max(0, (state.tabCounts[key] || 1) - 1);
    },
  },
  extraReducers: builder => {
    builder
      .addCase(loadParents.pending, state => {
        state.isLoading = true;
        state.error     = null;
      })
      .addCase(loadParents.fulfilled, (state, { payload }) => {
        state.isLoading    = false;
        state.allRows      = payload.rows;
        state.searchQuery  = '';
        state.filterContacted = 'all';

        const cfg = SECTION_TABS.parents.find(t => t.key === payload.tabKey);
        if (cfg && !cfg.statusFilter && !cfg.isBin && !cfg.isDraft) {
          const prevBin   = state.tabCounts.bin;
          const prevDraft = state.tabCounts.draft;
          state.tabCounts = {};
          if (prevBin   !== undefined) state.tabCounts.bin   = prevBin;
          if (prevDraft !== undefined) state.tabCounts.draft = prevDraft;
          SECTION_TABS.parents.forEach(t => {
            if (t.statusFilter) {
              state.tabCounts[t.key] = payload.rows.filter(r => (r[CP.STATUS] || '') === t.statusFilter).length;
            } else if (!t.isBin && !t.isDraft) {
              state.tabCounts[t.key] = payload.rows.length;
            }
          });
        } else if (cfg) {
          state.tabCounts[cfg.key] = payload.rows.length;
        }

        state.filterLocs = [];
        parentsSlice.caseReducers._applyFilter(state);
      })
      .addCase(loadParents.rejected, (state, { payload }) => {
        state.isLoading = false;
        state.error     = payload;
      })
      .addCase(fetchParentTabCounts.fulfilled, (state, { payload }) => {
        state.tabCounts.bin   = payload.bin;
        state.tabCounts.draft = payload.draft;
        if (state.tabCounts.all === undefined) state.tabCounts.all = payload.all;
      });
  },
});

export const {
  setTabKey, setSearchQuery, setFilterContacted,
  setFilterLocs, clearChipFilters,
  moveRowStatus, updateRowInPlace, removeRow, addRow, setCache,
  incrementTabCount, decrementTabCount,
} = parentsSlice.actions;

export default parentsSlice.reducer;

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import TopBar from '../components/layout/TopBar';
import TabBar from '../components/layout/TabBar';
import TutorCard from '../components/cards/TutorCard';
import ParentCard from '../components/cards/ParentCard';
import BinCard from '../components/cards/BinCard';
import DraftCard from '../components/cards/DraftCard';
import BulkBar from '../components/layout/BulkBar';
import { loadTutors, fetchTabCounts, setTabKey as setTutorTabKey, setSearchQuery as setTutorSearch, setFilterLocs as setTutorLocs, setFilterSubjs as setTutorSubjs, clearChipFilters as clearTutorChips } from '../features/tutors/tutorsSlice';
import { loadParents, fetchParentTabCounts, setTabKey as setParentTabKey, setSearchQuery as setParentSearch, setFilterLocs as setParentLocs, setFilterContacted as setParentContacted, clearChipFilters as clearParentChips } from '../features/parents/parentsSlice';
import { setFilterContacted as setTutorContacted } from '../features/tutors/tutorsSlice';
import { clearSelection, openAddParentModal, openEditCardModal, showLoader, hideLoader } from '../features/ui/uiSlice';
import { SECTION_TABS, C, CP } from '../constants';
import { cellValue } from '../services/sheetsApi';

export default function Dashboard() {
  const dispatch = useDispatch();
  const [section,      setSection]      = useState('tutors');
  const [subTab,       setSubTab]        = useState('all');
  const [search,       setSearch]        = useState('');
  const [filterOpen,   setFilterOpen]    = useState(false);
  const [activeLocs,      setActiveLocs]      = useState([]);
  const [activeSubjs,     setActiveSubjs]     = useState([]);
  const [activeContacted, setActiveContacted] = useState('all'); // 'all' | 'yes' | 'no'
  const [expandedUid,  setExpandedUid]   = useState(null);
  const [displayCount, setDisplayCount]  = useState(25);
  const sentinelRef  = useRef(null);
  const searchTimer  = useRef(null);

  const tutors  = useSelector(s => s.tutors);
  const parents = useSelector(s => s.parents);
  const selectedUids = useSelector(s => s.ui.selectedUids);

  const isLoading = section === 'tutors' ? tutors.isLoading : parents.isLoading;
  const rows      = section === 'tutors' ? tutors.filteredRows : parents.filteredRows;
  const allRows   = section === 'tutors' ? tutors.allRows    : parents.allRows;
  const currentCfg = SECTION_TABS[section]?.find(t => t.key === subTab) || {};

  const contactedCol = section === 'parents' ? CP.CONTACTED : C.CONTACTED;
  const contactedCount    = allRows.filter(r => (r[contactedCol] || '') === 'Yes').length;
  const notContactedCount = allRows.length - contactedCount;

  const loadData = useCallback((sec, tab) => {
    if (sec === 'tutors') {
      dispatch(loadTutors({ tabKey: tab }));
    } else {
      dispatch(loadParents({ tabKey: tab }));
    }
  }, [dispatch]);

  useEffect(() => {
    dispatch(setTutorTabKey('all'));
    loadData(section, subTab);
    dispatch(fetchTabCounts());
    dispatch(fetchParentTabCounts());
  }, []); // eslint-disable-line

  // Reset display count when rows change (tab/filter switch)
  useEffect(() => {
    setDisplayCount(25);
    setExpandedUid(null);
  }, [rows]);

  // Branded loader overlay mirrors isLoading state
  useEffect(() => {
    if (isLoading) dispatch(showLoader());
    else dispatch(hideLoader());
  }, [isLoading, dispatch]);

  // Infinite scroll sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        setDisplayCount(c => Math.min(c + 25, rows.length));
      }
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [rows]);

  const handleSectionChange = (sec) => {
    setSection(sec);
    const firstTab = SECTION_TABS[sec][0].key;
    setSubTab(firstTab);
    setSearch('');
    setFilterOpen(false);
    setActiveLocs([]);
    setActiveSubjs([]);
    setActiveContacted('all');
    if (sec === 'tutors') { dispatch(setTutorTabKey(firstTab)); dispatch(clearTutorChips()); dispatch(setTutorContacted('all')); }
    else                   { dispatch(setParentTabKey(firstTab)); dispatch(clearParentChips()); dispatch(setParentContacted('all')); }
    dispatch(clearSelection());
    loadData(sec, firstTab);
  };

  const handleSubTabChange = (tab) => {
    setSubTab(tab);
    setSearch('');
    setFilterOpen(false);
    setActiveLocs([]);
    setActiveSubjs([]);
    setActiveContacted('all');
    if (section === 'tutors') { dispatch(setTutorTabKey(tab)); dispatch(clearTutorChips()); dispatch(setTutorContacted('all')); }
    else                       { dispatch(setParentTabKey(tab)); dispatch(clearParentChips()); dispatch(setParentContacted('all')); }
    dispatch(clearSelection());
    loadData(section, tab);
  };

  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      if (section === 'tutors') dispatch(setTutorSearch(val));
      else dispatch(setParentSearch(val));
    }, 300);
  };

  const toggleLocChip = (loc) => {
    const next = activeLocs.includes(loc)
      ? activeLocs.filter(l => l !== loc)
      : [...activeLocs, loc];
    setActiveLocs(next);
    if (section === 'tutors') dispatch(setTutorLocs(next));
    else                       dispatch(setParentLocs(next));
  };

  const toggleSubjChip = (subj) => {
    const next = activeSubjs.includes(subj)
      ? activeSubjs.filter(s => s !== subj)
      : [...activeSubjs, subj];
    setActiveSubjs(next);
    dispatch(setTutorSubjs(next));
  };

  const toggleContactedChip = (val) => {
    const next = activeContacted === val ? 'all' : val;
    setActiveContacted(next);
    if (section === 'tutors') dispatch(setTutorContacted(next));
    else                       dispatch(setParentContacted(next));
  };

  const clearFilters = () => {
    setActiveLocs([]);
    setActiveSubjs([]);
    setActiveContacted('all');
    if (section === 'tutors') { dispatch(clearTutorChips()); dispatch(setTutorContacted('all')); }
    else                       { dispatch(clearParentChips()); dispatch(setParentContacted('all')); }
  };

  const handleAddEntry = () => {
    if (section === 'parents') {
      dispatch(openAddParentModal());
    } else {
      // Add tutor: open EditCard in new mode
      dispatch(openEditCardModal({ sheetRow: null, uid: null, section: 'tutors', isNew: true }));
    }
  };

  const isBin   = currentCfg.isBin;
  const isDraft = currentCfg.isDraft;

  const handleToggleExpand = useCallback((uid) => {
    setExpandedUid(prev => prev === uid ? null : uid);
  }, []);

  const renderRow = (row, idx) => {
    const key = row[31] || idx;
    const uid = String(row[31] || idx);
    if (isBin) {
      return <BinCard key={key} row={row} section={section} />;
    }
    if (isDraft) {
      return <DraftCard key={key} row={row} section={section} />;
    }
    if (section === 'parents') {
      return <ParentCard key={key} row={row} cfg={currentCfg} expandedUid={expandedUid} onExpand={handleToggleExpand} />;
    }
    return <TutorCard key={key} row={row} cfg={currentCfg} expandedUid={expandedUid} onExpand={handleToggleExpand} />;
  };

  // Result count label
  const label = section === 'parents' ? 'contacts' : (isBin ? 'in bin' : isDraft ? 'drafts' : 'applications');
  const hasChipFilters = activeLocs.length > 0 || activeSubjs.length > 0 || activeContacted !== 'all';
  const locCol = section === 'parents' ? CP.LOCATION : C.LOCATION;
  const locationOpts = [...new Set(allRows.map(r => cellValue(r, locCol)).filter(Boolean))].sort();
  const SUBJECT_CHIPS = ['Maths', 'Science', 'Social', 'Other'];

  return (
    <div>
      <TopBar />
      <TabBar
        section={section}
        onSectionChange={handleSectionChange}
        subTab={subTab}
        onSubTabChange={handleSubTabChange}
        onAddEntry={handleAddEntry}
      />

      <div className="main">
        {!isBin && !isDraft && (
          <div className="stats">
            <div className="stat-card">
              <div className="stat-label">Contacted</div>
              <div className="stat-value">{isLoading ? '—' : contactedCount}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Not Contacted</div>
              <div className="stat-value">{isLoading ? '—' : notContactedCount}</div>
            </div>
          </div>
        )}

        <div className="controls">
          <input
            className="search-input"
            type="text"
            placeholder={section === 'parents' ? 'Search name, phone, location…' : 'Search name, phone, email, college…'}
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
          <div className="controls-row2">
            {!isBin && !isDraft && (
              <button
                className={`btn btn-ghost btn-filter${hasChipFilters ? ' has-filters' : ''}`}
                onClick={() => setFilterOpen(v => !v)}
              >⚙ Filters</button>
            )}
            <button className="btn btn-ghost" onClick={() => loadData(section, subTab)}>↻ Refresh</button>
          </div>
        </div>

        {!isBin && !isDraft && filterOpen && (
          <div className="filter-panel">
            <div className="filter-section">
              <div className="filter-label">Contacted</div>
              <div className="filter-opts">
                {[{ val: 'yes', label: 'Contacted' }, { val: 'no', label: 'Not yet' }].map(({ val, label }) => (
                  <label key={val} className="filter-chip">
                    <input
                      type="checkbox"
                      checked={activeContacted === val}
                      onChange={() => toggleContactedChip(val)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
            </div>
            </div>
            {locationOpts.length > 0 && (
              <div className="filter-section">
                <div className="filter-label">Location</div>
                <div className="filter-opts">
                  {locationOpts.map(loc => (
                    <label key={loc} className="filter-chip">
                      <input
                        type="checkbox"
                        checked={activeLocs.includes(loc)}
                        onChange={() => toggleLocChip(loc)}
                      />
                      <span>{loc}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {section === 'tutors' && (
              <div className="filter-section">
                <div className="filter-label">Subject</div>
                <div className="filter-opts">
                  {SUBJECT_CHIPS.map(subj => (
                    <label key={subj} className="filter-chip">
                      <input
                        type="checkbox"
                        checked={activeSubjs.includes(subj)}
                        onChange={() => toggleSubjChip(subj)}
                      />
                      <span>{subj}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {hasChipFilters && (
              <button className="btn-filter-clear" onClick={clearFilters}>
                Clear all filters
              </button>
            )}
          </div>
        )}

        {isLoading && <div className="state-msg">Loading…</div>}

        {!isLoading && rows.length === 0 && (
          <p className="state-msg">No {section} found</p>
        )}

        {!isLoading && rows.length > 0 && (
          <div className="result-count" id="result-count">
            <span>
              {rows.length !== allRows.length
                ? `${rows.length} of ${allRows.length} ${label}`
                : `${rows.length} ${label}`
              }
            </span>
            {!isBin && !isDraft && (
              <label className="not-contacted-toggle">
                <input
                  type="checkbox"
                  checked={activeContacted === 'no'}
                  onChange={() => toggleContactedChip('no')}
                />
                <span>Not-contacted only</span>
              </label>
            )}
          </div>
        )}

        <div className="table-wrap">
          <table>
            <tbody>
              {!isLoading && rows.slice(0, displayCount).map(renderRow)}
            </tbody>
          </table>
          {!isLoading && displayCount < rows.length && (
            <div ref={sentinelRef} style={{ height: 1, marginTop: 4 }} />
          )}
        </div>
      </div>

      {selectedUids.length > 0 && !isBin && !isDraft && (
        <BulkBar section={section} cfg={currentCfg} onReload={() => loadData(section, subTab)} />
      )}
    </div>
  );
}

// constants.js loaded before this file — CLIENT_ID, SPREADSHEET_ID, SHEETS, C, PAGE_SIZE, ALLOWED_EMAILS

// ── DEV MODE ──────────────────────────────────────────────────────────────────
const DEV_MODE = new URLSearchParams(location.search).has('dev');

// ── STATE ─────────────────────────────────────────────────────────────────────
let tokenClient;
let accessToken    = null;
let allRows        = [];
let filteredRows   = [];
let renderedCount  = 0;
let scrollObserver = null;

let currentSection = 'tutors';   // 'tutors' | 'parents'
let currentTabKey  = 'all';      // key into SECTION_TABS[currentSection]
let sheetIdMap      = {};         // sheet name → numeric sheetId (lazy-loaded)
let _searchDebounce = null;
let _parentCache      = [];   // cached parent rows for WA search
let _waParentMatches  = [];   // last WA search results (for selection by index)
let _waShareData      = {};   // { tutorName, tutorPhone, tutorRow, dateStr, parentName, parentPhone, studentName }
let _scheduleParent   = null; // { name, phone, studentName, address } selected in schedule modal
let _scheduleParentMatches = []; // last schedule modal parent search results
let _pendingCalData   = null; // set after scheduling; consumed by calendar prompt after WA modal closes

// Bulk select
let selectedUids = new Set();

const SECTION_TABS = {
  tutors: [
    { key: 'all',        label: 'All',        sheet: SHEETS.TUTORS_APPLIED },
    { key: 'in_loop',    label: 'In-Loop',    sheet: SHEETS.TUTORS_APPLIED,  statusFilter: 'In-Loop' },
    { key: 'onboarded',  label: 'Onboarded',  sheet: SHEETS.TUTORS_APPLIED,  statusFilter: 'Onboarded' },
    { key: 'draft',      label: 'Draft',      sheet: SHEETS.TUTORS_DRAFT,    isDraft: true },
    { key: 'bin',        label: 'Bin',        sheet: SHEETS.TUTORS_BIN,      isBin: true },
  ],
  parents: [
    { key: 'all',        label: 'All',        sheet: SHEETS.PARENTS_TO_CONTACT },
    { key: 'in_loop',    label: 'In-Loop',    sheet: SHEETS.PARENTS_TO_CONTACT, statusFilter: 'In-Loop' },
    { key: 'onboarded',  label: 'Onboarded',  sheet: SHEETS.PARENTS_TO_CONTACT, statusFilter: 'Onboarded' },
    { key: 'bin',        label: 'Bin',        sheet: SHEETS.PARENTS_BIN,        isBin: true },
  ],
};

const SOURCE_OPTIONS = [
  { value: 'Cold calling', icon: '📞' },
  { value: 'Facebook',     icon: '📘' },
  { value: 'Instagram',    icon: '📸' },
  { value: 'Poster',       icon: '🗞️' },
  { value: 'Referral',     icon: '👥' },
  { value: 'Website',      icon: '🌐' },
  { value: 'WhatsApp',     icon: '💬' },
];

function currentTabConfig() {
  return SECTION_TABS[currentSection].find(t => t.key === currentTabKey)
      || SECTION_TABS[currentSection][0];
}

function switchSection(section) {
  currentSection = section;
  currentTabKey  = 'all';
  renderTabUI();
  loadApplications();
}

function switchTab(key) {
  currentTabKey = key;
  renderTabUI();
  loadApplications();
}

function renderTabUI() {
  // Section segmented buttons
  document.querySelectorAll('.section-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === currentSection);
  });
  // Sub-tabs — rebuild
  const tabs = SECTION_TABS[currentSection];
  document.getElementById('sub-tabs').innerHTML = tabs.map(t => {
    const cnt = _tabCounts[t.key];
    const label = cnt !== undefined ? `${t.label} (${cnt})` : t.label;
    return `<button class="sub-tab${t.key === currentTabKey ? ' active' : ''}${t.isBin ? ' bin-tab' : ''}${t.isDraft ? ' draft-tab' : ''}"
      data-tab-key="${t.key}" onclick="switchTab('${t.key}')">${label}</button>`;
  }).join('');
  // Search placeholder
  const ph = currentSection === 'parents'
    ? 'Search name, phone, location…'
    : 'Search name, phone, email, college…';
  document.getElementById('search').placeholder = ph;
  const addTutorBtn   = document.getElementById('btn-add-tutor');
  const addStudentBtn = document.getElementById('btn-add-student');
  if (addTutorBtn)   addTutorBtn.style.display   = currentSection === 'tutors'   ? '' : 'none';
  if (addStudentBtn) addStudentBtn.style.display  = currentSection === 'parents'  ? '' : 'none';
}

// ── SESSION STORAGE ───────────────────────────────────────────────────────────
// Token + expiry stored for up to 1h (Google's hard limit).
// On load we use the stored token directly — no Google request needed.
const SK = { token: 'kb_token', expiry: 'kb_expiry', email: 'kb_email' };

function saveSession(token, expiresIn, email) {
  localStorage.setItem(SK.token,  token);
  localStorage.setItem(SK.expiry, Date.now() + (expiresIn * 1000));
  localStorage.setItem(SK.email,  email);
}

function loadSession() {
  const token  = localStorage.getItem(SK.token);
  const expiry = parseInt(localStorage.getItem(SK.expiry) || '0');
  const email  = localStorage.getItem(SK.email);
  // Require at least 2 minutes remaining so mid-session calls don't fail
  if (token && email && expiry > Date.now() + 120000) return { token, email };
  return null;
}

function clearSession() {
  Object.values(SK).forEach(k => localStorage.removeItem(k));
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
// ── GOOGLE MAPS PLACES ───────────────────────────────────────────────────────
let _mapsAPILoaded    = false;
let _mapsAutocomplete = null;

function _loadMapsAPI() {
  if (!MAPS_API_KEY || _mapsAPILoaded || document.getElementById('maps-api-script')) return;
  window._onMapsReady = () => { _mapsAPILoaded = true; };
  const s = document.createElement('script');
  s.id    = 'maps-api-script';
  s.src   = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&libraries=places&callback=_onMapsReady`;
  s.async = s.defer = true;
  document.head.appendChild(s);
}

function _initAddressAutocomplete(inputId) {
  if (!_mapsAPILoaded || !window.google?.maps?.places) return;
  const input = document.getElementById(inputId);
  if (!input) return;
  _mapsAutocomplete = new google.maps.places.Autocomplete(input, {
    componentRestrictions: { country: 'in' },
    fields: ['formatted_address', 'name', 'address_components'],
  });
  _mapsAutocomplete.addListener('place_changed', () => {
    const place = _mapsAutocomplete.getPlace();
    if (!place) return;
    // Full formatted address → address textarea
    if (place.formatted_address) {
      const addrEl = document.getElementById('ap-address');
      if (addrEl) addrEl.value = place.formatted_address;
    }
    // Locality / sublocality → location field (short area name)
    const locality = place.address_components?.find(c =>
      c.types.some(t => ['sublocality_level_1', 'sublocality', 'locality'].includes(t))
    );
    if (locality) input.value = locality.long_name;
  });
}

window.onload = () => {
  // window.__kbSession was set synchronously by the inline script in index.html
  // before first paint, so the correct screen is already visible by now.
  const stored = window.__kbSession || loadSession();

  if (stored) {
    accessToken = stored.token;
    document.getElementById('user-email').textContent = stored.email;
    document.getElementById('signin-screen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    renderTabUI();
    loadApplications();
  }

  _loadMapsAPI();

  // Init token client regardless (needed for sign-in button and sign-out)
  const ready = setInterval(() => {
    if (!window.google) return;
    clearInterval(ready);

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/calendar.events'
      ].join(' '),
      callback: handleToken
    });
  }, 100);
};

function startSignIn() {
  tokenClient.requestAccessToken({ prompt: 'select_account' });
}

async function handleToken(resp) {
  if (resp.error) {
    showError('Sign-in failed: ' + resp.error);
    return;
  }

  // Google's granular-permissions UI unchecks scopes by default on first
  // encounter. If Sheets was unchecked the token arrives without it.
  // Auto-retry immediately with prompt:'consent' — Google will show the
  // scope screen again with the checkbox pre-checked (Screen 2 the user sees).
  const granted = (resp.scope || '').split(' ');
  if (!granted.includes('https://www.googleapis.com/auth/spreadsheets')) {
    showError('Almost there — please check the "Google Sheets" checkbox on the next screen and click Continue.');
    tokenClient.requestAccessToken({ prompt: 'consent' });
    return;
  }

  accessToken = resp.access_token;

  try {
    const info  = await apiFetch('https://www.googleapis.com/oauth2/v3/userinfo');
    const email = (info.email || '').toLowerCase();

    if (!ALLOWED_EMAILS.map(e => e.toLowerCase()).includes(email)) {
      accessToken = null;
      showError('Access denied — this dashboard is for Authorized team members only.');
      return;
    }

    saveSession(resp.access_token, resp.expires_in || 3600, email);
    // Reload so the inline FOUC script shows the dashboard instantly
    // and window.onload loads data via the same reliable path used on every refresh.
    window.location.reload();
  } catch (err) {
    showError('Could not verify your account: ' + err.message);
  }
}

function signOut() {
  if (accessToken) google.accounts.oauth2.revoke(accessToken, () => {});
  accessToken = null;
  allRows = [];
  clearSession();
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('signin-screen').style.display = 'flex';
  document.getElementById('error-banner').style.display = 'none';
}

// ── MOCK DATA (DEV MODE) ──────────────────────────────────────────────────────
function _mr(fields) {
  const r = new Array(29).fill('');
  Object.entries(fields).forEach(([k, v]) => { if (C[k] !== undefined) r[C[k]] = v; });
  return r;
}
function _mp(fields) {
  const r = new Array(18).fill('');
  Object.entries(fields).forEach(([k, v]) => { if (CP[k] !== undefined) r[CP[k]] = v; });
  return r;
}
const MOCK_TUTOR_ROWS = [
  _mr({APP_ID:'KB-001',SUBMITTED:'29/09/2026 09:15:00',EMAIL:'rahul.sharma@gmail.com',NAME:'Rahul Sharma',PHONE:'9876543210',STUDENT:'Working',COLLEGE:'Tech Mahindra, Hyd',LOCATION:'Gachibowli',TRAVEL:'Bike',CLASSES:'0-5, 6-8',SUBJECTS:'Maths, Science (bio,chem,phy)',LANGUAGES:'English, Telugu',EXTRAS:'Computer basics',TIMINGS:'Between 5am to 10am',PAY:'500-1000',REFERRAL:'No',OPEN:'Yes',WORKHOURS:'9:00-6:00',CONTACTED:'No',MAIL_SENT:'No',INTERVIEW_STATUS:'',RATING:''}),
  _mr({APP_ID:'KB-002',SUBMITTED:'28/09/2026 14:30:00',EMAIL:'priya.kumari@gmail.com',NAME:'Priya Kumari',PHONE:'8374644508',STUDENT:'Student',COLLEGE:'Osmania University',LOCATION:'Chaitanyapuri',TRAVEL:'Bus',CLASSES:'0-5, 6-8',SUBJECTS:'Maths, Science (bio,chem,phy)',LANGUAGES:'Hindi, English, Telugu',EXTRAS:'Communication skills, Computer basics',TIMINGS:'Between 5am to 10am',PAY:'400-800',REFERRAL:'No',OPEN:'Yes',WORKHOURS:'9:00-4:00',CONTACTED:'Yes',NOTES:'Very enthusiastic, follow up this week',MAIL_SENT:'Yes',INTERVIEW_STATUS:'Scheduled',INTERVIEW_AT:'05/10/2026 11:00:00'}),
  _mr({APP_ID:'KB-003',SUBMITTED:'27/09/2026 11:20:00',EMAIL:'arun.nair@gmail.com',NAME:'Arun Nair',PHONE:'9988776655',STUDENT:'Working',COLLEGE:'Infosys, Hyderabad',LOCATION:'HITEC City',TRAVEL:'Own vehicle',CLASSES:'6-8, 8-10',SUBJECTS:'Maths, Social',LANGUAGES:'English, Malayalam, Telugu',EXTRAS:'Abacus',TIMINGS:'Between 6pm to 9pm',PAY:'600-1200',REFERRAL:'Nikhil Kumar',OPEN:'No',WORKHOURS:'9:00-5:00',CONTACTED:'No',MAIL_SENT:'No',INTERVIEW_STATUS:''}),
  _mr({APP_ID:'KB-004',SUBMITTED:'26/09/2026 16:45:00',EMAIL:'sunita.reddy@gmail.com',NAME:'Sunita Reddy',PHONE:'7654321098',STUDENT:'Student',COLLEGE:'JNTU Hyderabad',LOCATION:'Kukatpally',TRAVEL:'Public transport',CLASSES:'0-5',SUBJECTS:'Science (bio,chem,phy), Social',LANGUAGES:'Telugu, English',EXTRAS:'Drawing, Craft',TIMINGS:'Between 4pm to 8pm',PAY:'300-600',REFERRAL:'No',OPEN:'Yes',WORKHOURS:'',CONTACTED:'Yes',NOTES:'Prefers morning slots only',MAIL_SENT:'No',INTERVIEW_STATUS:'Cleared'}),
  _mr({APP_ID:'KB-005',SUBMITTED:'25/09/2026 08:00:00',EMAIL:'vikram.patel@gmail.com',NAME:'Vikram Patel',PHONE:'9123456780',STUDENT:'Working',COLLEGE:'TCS, Hyderabad',LOCATION:'Secunderabad',TRAVEL:'Bike',CLASSES:'8-10, 10-12',SUBJECTS:'Maths',LANGUAGES:'Hindi, English, Marathi',EXTRAS:'Vedic Maths',TIMINGS:'Between 6am to 9am',PAY:'800-1500',REFERRAL:'No',OPEN:'Yes',WORKHOURS:'9:30-6:30',CONTACTED:'No',MAIL_SENT:'No',INTERVIEW_STATUS:''}),
  _mr({APP_ID:'KB-006',SUBMITTED:'24/09/2026 13:10:00',EMAIL:'deepa.v@gmail.com',NAME:'Deepa V',PHONE:'8765432109',STUDENT:'Student',COLLEGE:'University of Hyderabad',LOCATION:'Gachibowli',TRAVEL:'Public transport',CLASSES:'0-5, 6-8',SUBJECTS:'Maths, Science (bio,chem,phy), Social',LANGUAGES:'Telugu, English, Kannada',EXTRAS:'Yoga, Music',TIMINGS:'Between 3pm to 7pm',PAY:'350-700',REFERRAL:'Priya Kumari',OPEN:'Yes',WORKHOURS:'',CONTACTED:'Yes',MAIL_SENT:'Yes',LAST_CALLED:'28/09/2026 10:30:00',INTERVIEW_STATUS:'Rejected'}),
  _mr({APP_ID:'KB-007',SUBMITTED:'23/09/2026 10:55:00',EMAIL:'arjun.mehta@gmail.com',NAME:'Arjun Mehta',PHONE:'9012345678',STUDENT:'Working',COLLEGE:'Wipro, Hyderabad',LOCATION:'Madhapur',TRAVEL:'Own vehicle',CLASSES:'6-8, 8-10',SUBJECTS:'Maths, Science (bio,chem,phy)',LANGUAGES:'Hindi, English, Gujarati',EXTRAS:'Coding, Robotics',TIMINGS:'Between 7am to 10am',PAY:'700-1300',REFERRAL:'No',OPEN:'Yes',WORKHOURS:'10:00-7:00',CONTACTED:'No',MAIL_SENT:'No',INTERVIEW_STATUS:''}),
  _mr({APP_ID:'KB-008',SUBMITTED:'22/09/2026 17:30:00',EMAIL:'ananya.singh@gmail.com',NAME:'Ananya Singh',PHONE:'8901234567',STUDENT:'Student',COLLEGE:'Hyderabad Central University',LOCATION:'Tarnaka',TRAVEL:'Bus',CLASSES:'0-5',SUBJECTS:'Science (bio,chem,phy), Social, Other',LANGUAGES:'Hindi, English, Bengali',EXTRAS:'Dance, Art',TIMINGS:'Between 4pm to 9pm',PAY:'300-500',REFERRAL:'No',OPEN:'Yes',WORKHOURS:'',CONTACTED:'No',MAIL_SENT:'No',INTERVIEW_STATUS:''}),
  _mr({APP_ID:'KB-009',SUBMITTED:'21/09/2026 09:45:00',EMAIL:'karthik.m@gmail.com',NAME:'Karthik M',PHONE:'7890123456',STUDENT:'Working',COLLEGE:'Accenture, Hyderabad',LOCATION:'Banjara Hills',TRAVEL:'Bike',CLASSES:'8-10, 10-12',SUBJECTS:'Maths, Science (bio,chem,phy)',LANGUAGES:'Tamil, English, Telugu',EXTRAS:'Chess, Rubiks cube',TIMINGS:'Between 5am to 9am',PAY:'900-1600',REFERRAL:'No',OPEN:'No',WORKHOURS:'9:00-6:00',CONTACTED:'Yes',NOTES:'Only available on weekends',MAIL_SENT:'Yes',LAST_CALLED:'25/09/2026 14:00:00',INTERVIEW_STATUS:'Scheduled',INTERVIEW_AT:'07/10/2026 09:00:00'}),
  _mr({APP_ID:'KB-010',SUBMITTED:'20/09/2026 12:20:00',EMAIL:'divya.krishna@gmail.com',NAME:'Divya Krishna',PHONE:'6789012345',STUDENT:'Student',COLLEGE:'BITS Pilani (Hyd campus)',LOCATION:'Shameerpet',TRAVEL:'Own vehicle',CLASSES:'6-8, 8-10, 10-12',SUBJECTS:'Maths',LANGUAGES:'Telugu, English, Tamil',EXTRAS:'IIT coaching experience',TIMINGS:'Between 5pm to 9pm',PAY:'1000-2000',REFERRAL:'Karthik M',OPEN:'Yes',WORKHOURS:'',CONTACTED:'No',MAIL_SENT:'No',INTERVIEW_STATUS:''}),
  _mr({APP_ID:'KB-011',SUBMITTED:'19/09/2026 15:00:00',EMAIL:'rohit.jain@gmail.com',NAME:'Rohit Jain',PHONE:'5678901234',STUDENT:'Working',COLLEGE:'HCL Technologies',LOCATION:'Kondapur',TRAVEL:'Bike',CLASSES:'0-5, 6-8',SUBJECTS:'Maths, Other',LANGUAGES:'Hindi, English, Rajasthani',EXTRAS:'Abacus, Mental maths',TIMINGS:'Between 6am to 9am, 6pm to 9pm',PAY:'500-900',REFERRAL:'No',OPEN:'Yes',WORKHOURS:'9:00-5:30',CONTACTED:'No',MAIL_SENT:'No',INTERVIEW_STATUS:''}),
  _mr({APP_ID:'KB-012',SUBMITTED:'18/09/2026 07:30:00',EMAIL:'meera.nambiar@gmail.com',NAME:'Meera Nambiar',PHONE:'4567890123',STUDENT:'Student',COLLEGE:'St Francis College',LOCATION:'Begumpet',TRAVEL:'Public transport',CLASSES:'0-5',SUBJECTS:'Science (bio,chem,phy), Social',LANGUAGES:'Malayalam, English, Hindi',EXTRAS:'Story telling, Phonics',TIMINGS:'Between 3pm to 7pm',PAY:'250-500',REFERRAL:'No',OPEN:'Yes',WORKHOURS:'',CONTACTED:'Yes',MAIL_SENT:'No',INTERVIEW_STATUS:''}),
];
const MOCK_PARENT_ROWS = [
  _mp({PARENT_ID:'P-001',ONBOARDED_ON:'29/09/2026 08:00:00',NAME:'Ramesh Gupta',PHONE:'9111222333',EMAIL:'ramesh.gupta@gmail.com',LOCATION:'Gachibowli',ADDRESS:'Flat 4B, Srinivas Apt, Gachibowli',STUDENT_NAME:'Riya Gupta',STUDENT_GRADE:'Grade 5',SUBJECTS_NEEDED:'Maths, Science (bio,chem,phy)',ASSIGNED_TUTOR:'',CONTACTED:'No',NOTES:'',MAILED:'No'}),
  _mp({PARENT_ID:'P-002',ONBOARDED_ON:'28/09/2026 10:30:00',NAME:'Lakshmi Devi',PHONE:'9222333444',EMAIL:'lakshmi.devi@gmail.com',LOCATION:'Chaitanyapuri',ADDRESS:'House 12, MIG Colony, Chaitanyapuri',STUDENT_NAME:'Aditya Kumar',STUDENT_GRADE:'Grade 8',SUBJECTS_NEEDED:'Maths, Social',ASSIGNED_TUTOR:'Priya Kumari',LAST_CONTACTED:'29/09/2026 14:00:00',CONTACTED:'Yes',NOTES:'Prefers female tutor',MAILED:'Yes'}),
  _mp({PARENT_ID:'P-003',ONBOARDED_ON:'27/09/2026 16:00:00',NAME:'Suresh Rao',PHONE:'9333444555',EMAIL:'suresh.rao@gmail.com',LOCATION:'HITEC City',ADDRESS:'102 Skyline Towers, HITEC City',STUDENT_NAME:'Pooja Rao',STUDENT_GRADE:'Grade 3',SUBJECTS_NEEDED:'Maths, Science (bio,chem,phy), Social',ASSIGNED_TUTOR:'',CONTACTED:'No',NOTES:'',MAILED:'No'}),
  _mp({PARENT_ID:'P-004',ONBOARDED_ON:'26/09/2026 09:15:00',NAME:'Anjali Sharma',PHONE:'9444555666',EMAIL:'anjali.sharma@gmail.com',LOCATION:'Kukatpally',ADDRESS:'3-45, KPHB Phase 3, Kukatpally',STUDENT_NAME:'Dev Sharma',STUDENT_GRADE:'Grade 10',SUBJECTS_NEEDED:'Maths',ASSIGNED_TUTOR:'',CONTACTED:'No',NOTES:'Urgent — board exams in April',MAILED:'No'}),
  _mp({PARENT_ID:'P-005',ONBOARDED_ON:'25/09/2026 11:45:00',NAME:'Venkat Reddy',PHONE:'9555666777',EMAIL:'venkat.reddy@gmail.com',LOCATION:'Banjara Hills',ADDRESS:'Plot 7, Road No 10, Banjara Hills',STUDENT_NAME:'Arjun Reddy',STUDENT_GRADE:'Grade 7',SUBJECTS_NEEDED:'Science (bio,chem,phy), Other',ASSIGNED_TUTOR:'Karthik M',LAST_CONTACTED:'27/09/2026 10:00:00',CONTACTED:'Yes',NOTES:'',MAILED:'Yes'}),
  _mp({PARENT_ID:'P-006',ONBOARDED_ON:'24/09/2026 14:20:00',NAME:'Sujatha Iyer',PHONE:'9666777888',EMAIL:'sujatha.iyer@gmail.com',LOCATION:'Madhapur',ADDRESS:'Flat 201, Prestige Apts, Madhapur',STUDENT_NAME:'Kavya Iyer',STUDENT_GRADE:'Grade 6',SUBJECTS_NEEDED:'Maths, Social',ASSIGNED_TUTOR:'',CONTACTED:'No',NOTES:'',MAILED:'No'}),
  _mp({PARENT_ID:'P-007',ONBOARDED_ON:'23/09/2026 07:30:00',NAME:'Praveen Kumar',PHONE:'9777888999',EMAIL:'praveen.k@gmail.com',LOCATION:'Secunderabad',ADDRESS:'HIG 34, Defence Colony, Secunderabad',STUDENT_NAME:'Manya Kumar',STUDENT_GRADE:'Grade 4',SUBJECTS_NEEDED:'Maths, Science (bio,chem,phy), Social',ASSIGNED_TUTOR:'',CONTACTED:'No',NOTES:'',MAILED:'No'}),
  _mp({PARENT_ID:'P-008',ONBOARDED_ON:'22/09/2026 17:00:00',NAME:'Meghana Pillai',PHONE:'9888999000',EMAIL:'meghana.p@gmail.com',LOCATION:'Tarnaka',ADDRESS:'Flat 5C, Nakshatra Apts, Tarnaka',STUDENT_NAME:'Sai Pillai',STUDENT_GRADE:'Grade 9',SUBJECTS_NEEDED:'Maths, Other',ASSIGNED_TUTOR:'',CONTACTED:'No',NOTES:'Wants tutor with IIT experience',MAILED:'No'}),
];

// ── DATA ──────────────────────────────────────────────────────────────────────
let _parentSheetOffset = 2;   // next sheet row to load (server-side pagination)
let _parentHasMore     = true;
let _parentLoading     = false;

async function loadApplications() {
  document.getElementById('table-body').innerHTML = '';
  showLoader();
  hideError();
  clearSelection();

  if (DEV_MODE) {
    const dateCol = currentSection === 'parents' ? CP.ONBOARDED_ON : C.SUBMITTED;
    allRows = currentSection === 'parents'
      ? MOCK_PARENT_ROWS.map((r, i) => { const c = [...r]; c._sheetRow = i + 2; return c; })
      : MOCK_TUTOR_ROWS.map((r, i) => { const c = [...r]; c._sheetRow = i + 2; return c; });
    allRows.sort((a, b) => parseDate(cell(b, dateCol)) - parseDate(cell(a, dateCol)));
    populateFilterOptions();
    applyFilters();
    return;
  }

  const config  = currentTabConfig();
  const dateCol = currentSection === 'parents' ? CP.ONBOARDED_ON : C.SUBMITTED;

  if (currentSection === 'parents') {
    if (config.statusFilter) {
      // Sub-tabs: full fetch filtered by STATUS (no pagination needed — small subset)
      const colEnd = 'S';
      try {
        const range  = encodeURIComponent(`${config.sheet}!A2:${colEnd}`);
        const result = await apiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`);
        allRows = (result.values || []).filter(r => r.length > 0 && (r[CP.STATUS] || '') === config.statusFilter);
        allRows.forEach((row, i) => { row._sheetRow = i + 2; });
        allRows.sort((a, b) => parseDate(cell(b, dateCol)) - parseDate(cell(a, dateCol)));
        populateFilterOptions();
        applyFilters();
      } catch (err) {
        showError('Failed to load data: ' + err.message);
        setTableMsg('Could not load.');
      }
    } else {
      _parentSheetOffset = 2;
      _parentHasMore     = true;
      _parentLoading     = false;
      allRows = [];
      await _loadMoreParents(config, dateCol);
    }
    return;
  }

  const colEnd = 'AE';
  try {
    // Draft sheets may lack a header row (prod Draft is often empty, so staging never gets one).
    // Fetch from A1 and detect/skip the header to find data wherever it actually lives.
    const fetchFrom = config.isDraft ? 'A1' : 'A2';
    const range  = encodeURIComponent(`${config.sheet}!${fetchFrom}:${colEnd}`);
    const url    = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`;
    const result = await apiFetch(url);

    let rows = result.values || [];
    let sheetRowOffset = 2;
    if (config.isDraft) {
      if (rows.length > 0 && rows[0][0] === 'App ID') {
        rows = rows.slice(1); // header present — skip it, data starts at sheet row 2
        sheetRowOffset = 2;
      } else {
        sheetRowOffset = 1; // no header — data starts at sheet row 1
      }
    }

    allRows = rows.filter(r => r.length > 0);
    allRows.forEach((row, i) => { row._sheetRow = sheetRowOffset + i; });
    if (config.statusFilter) {
      allRows = allRows.filter(r => (r[currentSection === 'tutors' ? C.STATUS : CP.STATUS] || '') === config.statusFilter);
    }
    allRows.sort((a, b) => parseDate(cell(b, dateCol)) - parseDate(cell(a, dateCol)));
    populateFilterOptions();
    applyFilters();
    // After loading All tab, prefetch Bin and Draft counts in background
    if (!config.statusFilter && !config.isBin && !config.isDraft) {
      _prefetchSideCounts();
    }
  } catch (err) {
    showError('Failed to load data: ' + err.message);
    setTableMsg('Could not load.');
  }
}

async function _prefetchSideCounts() {
  const tabs = SECTION_TABS[currentSection];
  const binTab   = tabs.find(t => t.isBin);
  const draftTab = tabs.find(t => t.isDraft);
  const fetches = [];
  if (binTab   && _tabCounts['bin']   === undefined) fetches.push(_fetchSheetRowCount(binTab.sheet,   'bin'));
  if (draftTab && _tabCounts['draft'] === undefined) fetches.push(_fetchSheetRowCount(draftTab.sheet, 'draft'));
  if (fetches.length) await Promise.all(fetches);
}

async function _fetchSheetRowCount(sheetName, tabKey) {
  try {
    const range  = encodeURIComponent(`${sheetName}!A:A`);
    const result = await apiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`);
    const rows   = (result.values || []).slice(1); // skip header row
    _tabCounts[tabKey] = rows.filter(r => r.length > 0 && r[0]).length;
    updateTabCountLabels();
  } catch (_) { /* best-effort */ }
}

async function _loadMoreParents(config, dateCol) {
  if (_parentLoading || !_parentHasMore) return;
  _parentLoading = true;
  const start  = _parentSheetOffset;
  const end    = start + PAGE_SIZE - 1;
  const colEnd = 'S'; // covers through ORIGINAL_TAB (col 17 = R) + 1 extra
  try {
    const range  = encodeURIComponent(`${config.sheet}!A${start}:${colEnd}${end}`);
    const url    = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`;
    const result = await apiFetch(url);
    const newRows = (result.values || []).filter(r => r.length > 0);
    newRows.forEach((row, i) => { row._sheetRow = start + i; });
    allRows.push(...newRows);
    _parentSheetOffset = start + PAGE_SIZE;
    if (newRows.length < PAGE_SIZE) _parentHasMore = false;
    if (allRows.length <= PAGE_SIZE) {
      allRows.sort((a, b) => parseDate(cell(b, dateCol)) - parseDate(cell(a, dateCol)));
      populateFilterOptions();
      applyFilters();
    } else {
      renderTable(allRows);
    }
  } catch (err) {
    showError('Failed to load parents: ' + err.message);
    if (allRows.length === 0) setTableMsg('Could not load.');
  } finally {
    _parentLoading = false;
  }
}

function applyFilters() {
  clearTimeout(_searchDebounce);
  _searchDebounce = setTimeout(_doFilter, 300);
}

function populateFilterOptions() {
  const isTutor  = currentSection === 'tutors';
  const locCol   = isTutor ? C.LOCATION : CP.LOCATION;
  const wrap     = document.getElementById('filter-location-opts');
  if (!wrap) return;
  const locs = [...new Set(allRows.map(r => cell(r, locCol)).filter(Boolean))].sort();
  wrap.innerHTML = locs.map(loc =>
    `<label class="filter-chip"><input type="checkbox" value="${esc(loc)}" onchange="applyFilters()"><span>${esc(loc)}</span></label>`
  ).join('');
  // Show/hide subjects section based on section
  const subjSec = document.getElementById('filter-subj-section');
  if (subjSec) subjSec.style.display = isTutor ? '' : '';
}

function toggleFilterPanel() {
  const panel = document.getElementById('filter-panel');
  if (!panel) return;
  const open = panel.style.display !== 'none';
  panel.style.display = open ? 'none' : 'block';
  document.getElementById('btn-filter-toggle')?.classList.toggle('active', !open);
}

function clearFilters() {
  document.querySelectorAll('#filter-panel input[type="checkbox"]').forEach(c => c.checked = false);
  applyFilters();
}

function _getActiveFilters() {
  const locs  = [...document.querySelectorAll('#filter-location-opts input:checked')].map(i => i.value);
  const subjs = [...document.querySelectorAll('#filter-subj-opts input:checked')].map(i => i.value);
  return { locs, subjs };
}

function _doFilter() {
  const q       = document.getElementById('search').value.toLowerCase().trim();
  const isTutor = currentSection === 'tutors';
  const { locs, subjs } = _getActiveFilters();

  const searchCols = isTutor
    ? [C.NAME, C.PHONE, C.EMAIL, C.COLLEGE, C.APP_ID]
    : [CP.NAME, CP.PHONE, CP.EMAIL, CP.STUDENT_NAME, CP.LOCATION];
  const locCol  = isTutor ? C.LOCATION  : CP.LOCATION;
  const subjCol = isTutor ? C.SUBJECTS  : CP.SUBJECTS_NEEDED;

  const filtered = allRows.filter(r => {
    if (q && !searchCols.map(i => cell(r, i)).join(' ').toLowerCase().includes(q)) return false;
    if (locs.length  && !locs.includes(cell(r, locCol))) return false;
    if (subjs.length && !subjs.some(s => (cell(r, subjCol) || '').includes(s))) return false;
    return true;
  });

  // Sort In-Loop: scheduled first (earliest first), then rest by applied date
  if (currentTabConfig().statusFilter === 'In-Loop' && currentSection === 'tutors') {
    filtered.sort((a, b) => {
      const aAt = cell(a, C.INTERVIEW_STATUS) === 'Scheduled' && cell(a, C.INTERVIEW_AT);
      const bAt = cell(b, C.INTERVIEW_STATUS) === 'Scheduled' && cell(b, C.INTERVIEW_AT);
      if (aAt && bAt) return parseDate(cell(a, C.INTERVIEW_AT)) - parseDate(cell(b, C.INTERVIEW_AT));
      if (aAt) return -1;
      if (bAt) return 1;
      return parseDate(cell(a, C.SUBMITTED)) - parseDate(cell(b, C.SUBMITTED));
    });
  }

  // Update filter chip visibility
  const total = locs.length + subjs.length;
  const filterToggle = document.getElementById('btn-filter-toggle');
  if (filterToggle) filterToggle.classList.toggle('has-filters', total > 0);

  updateStats();
  renderTable(filtered);

  const label = currentSection === 'parents' ? 'contacts' : 'applications';
  const rc = document.getElementById('result-count');
  rc.textContent = filtered.length === allRows.length
    ? `${allRows.length} ${label}`
    : `${filtered.length} of ${allRows.length} ${label}`;
}

// ── STATS ─────────────────────────────────────────────────────────────────────
let _tabCounts = {};

function updateStats() {
  const contactedCol = currentSection === 'parents' ? CP.CONTACTED : C.CONTACTED;
  const total     = allRows.length;
  const contacted = allRows.filter(r => cell(r, contactedCol) === 'Yes').length;
  document.getElementById('stat-contacted').textContent = contacted;
  document.getElementById('stat-pending').textContent   = total - contacted;

  // Update tab count badges
  const cfg = currentTabConfig();
  if (!cfg.statusFilter && !cfg.isBin && !cfg.isDraft) {
    // On "All" tab — compute counts for all status-filter tabs from allRows
    const statusCol = currentSection === 'parents' ? CP.STATUS : C.STATUS;
    const _prevBin   = _tabCounts['bin'];
    const _prevDraft = _tabCounts['draft'];
    _tabCounts = {};
    if (_prevBin   !== undefined) _tabCounts['bin']   = _prevBin;
    if (_prevDraft !== undefined) _tabCounts['draft']  = _prevDraft;
    SECTION_TABS[currentSection].forEach(t => {
      if (t.statusFilter) {
        _tabCounts[t.key] = allRows.filter(r => (r[statusCol] || '') === t.statusFilter).length;
      } else if (!t.isBin && !t.isDraft) {
        _tabCounts[t.key] = allRows.length;
      }
    });
  } else {
    _tabCounts[cfg.key] = allRows.length;
  }
  updateTabCountLabels();
}

function updateTabCountLabels() {
  document.querySelectorAll('.sub-tab').forEach(btn => {
    const key = btn.getAttribute('data-tab-key');
    if (key && _tabCounts[key] !== undefined) {
      const tab = SECTION_TABS[currentSection].find(t => t.key === key);
      btn.textContent = `${tab.label} (${_tabCounts[key]})`;
    }
  });
}

// ── TABLE ─────────────────────────────────────────────────────────────────────
const CALENDAR_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
const PENCIL_SVG  = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
const CLOSE_SVG   = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const SHARE_SVG   = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;
const TRASH_SVG   = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>`;
const RESTORE_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;
const NOTE_SVG  = `<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const WA_SVG   = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;
const MAIL_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg>`;
const CALL_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.01 1.18 2 2 0 012 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14.92z"/></svg>`;
const COPY_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const GCAL_SVG    = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/></svg>`;
const CHEVRON_SVG = `<svg class="expand-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
const USER_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
const INFO_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`;
const CLASSES_SVG  = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;
const STUDENT_SVG  = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
const MOVE_SVG       = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const HAMBURGER_SVG  = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="9" r="8" stroke="currentColor" stroke-width="1.5"/><circle cx="5.5" cy="9" r="1.1" fill="currentColor"/><circle cx="9" cy="9" r="1.1" fill="currentColor"/><circle cx="12.5" cy="9" r="1.1" fill="currentColor"/></svg>`;
const SUBJECTS_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`;
const PIN_SVG      = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
const RUPEE_SVG    = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12"/><path d="M6 8h12"/><path d="m6 13 8.5 8"/><path d="M6 13h3"/><path d="M9 13c6.667 0 6.667-10 0-10"/></svg>`;
const CLOCK_SVG    = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
const DRAFT_SVG    = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`;
const ADD_SVG      = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

function renderTable(filtered) {
  filteredRows  = filtered;
  renderedCount = 0;
  hideLoader();

  if (scrollObserver) { scrollObserver.disconnect(); scrollObserver = null; }

  const tbody = document.getElementById('table-body');
  tbody.innerHTML = '';

  if (!filtered.length) {
    setTableMsg(allRows.length ? 'No applications match the current filters.' : 'No applications yet.');
    return;
  }

  appendRows();
}

function appendRows() {
  if (currentTabConfig().isBin)   return appendBinRows();
  if (currentTabConfig().isDraft) return appendDraftRows();
  if (currentSection === 'parents') return appendParentRows();
  if (renderedCount >= filteredRows.length) return;

  const tbody = document.getElementById('table-body');

  const old = document.getElementById('scroll-sentinel');
  if (old) old.remove();

  const batch = filteredRows.slice(renderedCount, renderedCount + PAGE_SIZE);
  batch.forEach((row, bi) => {
    const fi       = renderedCount + bi;
    const sheetRow = row._sheetRow;
    const uid      = `r${fi}`;

    const name        = cell(row, C.NAME)             || '—';
    const phone       = cell(row, C.PHONE)            || '—';
    const email       = cell(row, C.EMAIL);
    const contacted   = cell(row, C.CONTACTED)        || 'No';
    const mailSent    = cell(row, C.MAIL_SENT)        || 'No';
    const notes       = cell(row, C.NOTES);
    const ivStatus    = cell(row, C.INTERVIEW_STATUS);
    const ivAt        = cell(row, C.INTERVIEW_AT);

    let digits = phone.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    const waNum  = digits.length === 10 ? '91' + digits : digits;
    const waHref = digits
      ? `https://wa.me/${waNum}?text=${encodeURIComponent('Hello ' + name + ', I\'m contacting you regarding your submission for KidsBuddy home tuitions.')}`
      : null;

    const submittedFmt = formatDate(cell(row, C.SUBMITTED));
    const tutorStatus  = cell(row, C.STATUS) || '';
    const statusBadgeHTML = tutorStatus
      ? `<span class="status-badge badge-${tutorStatus === 'In-Loop' ? 'inloop' : 'onboarded'}" data-uid="${uid}">${esc(tutorStatus)}</span>`
      : `<span class="status-badge badge-hidden" data-uid="${uid}"></span>`;

    const tr = document.createElement('tr');
    tr.className = 'data-row';
    tr.dataset.uid = uid;
    tr.dataset.sheetRow = sheetRow;
    tr.innerHTML = `
      <td class="td-id">${esc(cell(row, C.APP_ID))}</td>
      <td class="td-name">
        <span class="card-applied-at">${esc(submittedFmt)}</span>
        ${statusBadgeHTML}
        ${esc(name)}
        ${sourceChipHTML(cell(row, C.SOURCE), sheetRow)}
      </td>
      <td class="td-phone td-phone-desktop">
        <span class="phone-num">${esc(phone)}</span>
        <span class="contact-icons">
          ${digits ? `<a class="icon-call" href="tel:${digits}" onclick="event.stopPropagation();logCall(${sheetRow});handleCallTap(${sheetRow},'${uid}')" title="Call">${CALL_SVG}</a>` : ''}
          ${waHref ? `<a class="icon-wa" href="${waHref}" target="_blank" rel="noopener" onclick="event.stopPropagation();handleCommunicationTap(${sheetRow},'${uid}')" title="WhatsApp">${WA_SVG}</a>` : ''}
          ${email  ? `<a class="icon-mail" href="mailto:${email}" onclick="event.stopPropagation();handleCommunicationTap(${sheetRow},'${uid}')" title="Email">${MAIL_SVG}</a>` : ''}
          ${digits ? `<button class="icon-copy" onclick="event.stopPropagation();copyPhone('${digits}')" title="Copy number">${COPY_SVG}</button>` : ''}
        </span>
      </td>
      <td class="td-classes">
        <div class="info-flat-rows">
          ${cell(row, C.TIMINGS)  ? `<span class="info-flat-row">${CLOCK_SVG}${esc(cell(row, C.TIMINGS))}</span>`   : ''}
          ${cell(row, C.PAY)      ? `<span class="info-flat-row">${RUPEE_SVG}${esc(cell(row, C.PAY))}</span>`       : ''}
          ${cell(row, C.LOCATION) ? `<span class="info-flat-row">${PIN_SVG}${esc(cell(row, C.LOCATION))}</span>`    : ''}
        </div>
        <div class="card-section">
          <div class="card-section-header"><span class="cs-label">${USER_SVG} Contact</span></div>
          <div class="card-section-body">
            <div class="contact-phone-row">
              <span class="phone-num">${esc(phone)}</span>
              <span class="contact-icons">
                ${digits ? `<a class="icon-call" href="tel:${digits}" onclick="event.stopPropagation();logCall(${sheetRow});handleCallTap(${sheetRow},'${uid}')" title="Call">${CALL_SVG}</a>` : ''}
                ${waHref ? `<a class="icon-wa" href="${waHref}" target="_blank" rel="noopener" onclick="event.stopPropagation();handleCommunicationTap(${sheetRow},'${uid}')" title="WhatsApp">${WA_SVG}</a>` : ''}
                ${email  ? `<a class="icon-mail" href="mailto:${email}" onclick="event.stopPropagation();handleCommunicationTap(${sheetRow},'${uid}')" title="Email">${MAIL_SVG}</a>` : ''}
                ${digits ? `<button class="icon-copy" onclick="event.stopPropagation();copyPhone('${digits}')" title="Copy number">${COPY_SVG}</button>` : ''}
              </span>
            </div>
            <button class="pill-toggle ${contacted === 'Yes' ? 'yes' : 'no'}"
              data-sheet-row="${sheetRow}"
              data-col="${C.CONTACTED + 1}"
              data-current="${esc(contacted)}"
              onclick="event.stopPropagation(); handleToggle(this)">
<span class="pt-yes">Contacted</span>
<span class="pt-no">Not yet</span>
            </button>
          </div>
        </div>
        <div class="card-interview card-section" data-sheet-row="${sheetRow}" data-iv-status="${esc(ivStatus)}" data-iv-at="${esc(ivAt)}">
          ${interviewStatusHTML(ivStatus, ivAt, sheetRow)}
        </div>
        <div class="card-notes card-section" data-sheet-row="${sheetRow}" data-notes="${esc(notes)}">
          ${notesInlineHTML(notes)}
        </div>
      </td>
      <td class="td-date">${esc(submittedFmt)}</td>
      <td>
        <div class="card-top-actions">
          <button class="btn-card-move" onclick="event.stopPropagation();openCardActions(${sheetRow},'${uid}')" title="Actions">${HAMBURGER_SVG}<span class="card-action-label">Actions</span></button>
          <label class="card-check-wrap" onclick="event.stopPropagation()"><input type="checkbox" class="card-check" data-uid="${uid}" data-sheet-row="${sheetRow}" onchange="handleCardCheck(this)"><span class="card-check-box"></span><span class="card-action-label">Select</span></label>
          <button class="btn-card-edit" onclick="event.stopPropagation();openEditCardModal(${sheetRow},'${uid}')" title="Edit">${PENCIL_SVG}<span class="card-action-label">Edit</span></button>
          <button class="btn-card-trash" onclick="event.stopPropagation();trashCard(${sheetRow},'${uid}')" title="Move to bin">${TRASH_SVG}<span class="card-action-label">Delete</span></button>
        </div>
      </td>
      <td class="td-mail-sent">
        <button class="btn-toggle ${mailSent === 'Yes' ? 'yes' : 'no'}"
          data-sheet-row="${sheetRow}"
          data-col="${C.MAIL_SENT + 1}"
          data-current="${esc(mailSent)}"
          onclick="event.stopPropagation(); handleToggle(this)">
          ${mailSent}
        </button>
      </td>
      <td class="td-expand">
        <button class="btn-expand" data-uid="${uid}" onclick="event.stopPropagation(); handleExpand(this)">
          <span class="btn-expand-label">Show full information</span>${CHEVRON_SVG}
        </button>
      </td>`;
    tbody.appendChild(tr);

    const dr = document.createElement('tr');
    dr.className = 'detail-row';
    dr.id = `detail-${uid}`;
    dr.innerHTML = `
      <td colspan="8">
        <div class="detail-grid">
          ${df('Submitted',              formatDate(cell(row, C.SUBMITTED)))}
          ${df('Email',                  cell(row, C.EMAIL))}
          ${df('Student / Working',      cell(row, C.STUDENT))}
          ${df('College / Company',      cell(row, C.COLLEGE))}
          ${df('Stay Location',          cell(row, C.LOCATION))}
          ${df('Travel Mode',            cell(row, C.TRAVEL))}
          ${df('Subjects',               cell(row, C.SUBJECTS))}
          ${df('Languages',              cell(row, C.LANGUAGES))}
          ${df('Extra Activities',       cell(row, C.EXTRAS))}
          ${df('Available Timings',      cell(row, C.TIMINGS))}
          ${df('Expected Pay / hr',      cell(row, C.PAY))}
          ${df('Referral',               cell(row, C.REFERRAL))}
          ${df('Open to Contact',        cell(row, C.OPEN))}
          ${df('College / Work Timings', cell(row, C.WORKHOURS))}
        </div>
      </td>`;
    tbody.appendChild(dr);
  });

  renderedCount += batch.length;

  if (renderedCount < filteredRows.length) {
    const sentinel = document.createElement('tr');
    sentinel.id = 'scroll-sentinel';
    sentinel.innerHTML = '<td colspan="8" style="padding:0;height:1px"></td>';
    tbody.appendChild(sentinel);

    if (!scrollObserver) {
      scrollObserver = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) appendRows();
      }, { rootMargin: '300px' });
    }
    scrollObserver.observe(sentinel);
  } else if (scrollObserver) {
    scrollObserver.disconnect();
    scrollObserver = null;
  }
}

// ── PARENT CARD RENDERER ──────────────────────────────────────────────────────
function appendParentRows() {
  if (renderedCount >= filteredRows.length) return;

  const tbody = document.getElementById('table-body');
  const old = document.getElementById('scroll-sentinel');
  if (old) old.remove();

  const batch = filteredRows.slice(renderedCount, renderedCount + PAGE_SIZE);
  batch.forEach((row, bi) => {
    const fi       = renderedCount + bi;
    const sheetRow = row._sheetRow;
    const uid      = `p${fi}`;

    const name      = cell(row, CP.NAME)      || '—';
    const phone     = cell(row, CP.PHONE)     || '—';
    const email     = cell(row, CP.EMAIL);
    const contacted = cell(row, CP.CONTACTED) || 'No';
    const notes     = cell(row, CP.NOTES);
    const location  = cell(row, CP.LOCATION);
    const student   = cell(row, CP.STUDENT_NAME);
    const grade     = cell(row, CP.STUDENT_GRADE);
    const subjects  = cell(row, CP.SUBJECTS_NEEDED);
    const dateFmt   = formatDate(cell(row, CP.ONBOARDED_ON));

    let digits = phone.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    const waNum  = digits.length === 10 ? '91' + digits : digits;
    const waHref = digits
      ? `https://wa.me/${waNum}?text=${encodeURIComponent('Hello ' + name + ', contacting you regarding home tuitions.')}`
      : null;

    const tr = document.createElement('tr');
    tr.className = 'data-row';
    tr.dataset.uid = uid;
    tr.innerHTML = `
      <td class="td-id"></td>
      <td class="td-name">
        <span class="card-applied-at">${esc(dateFmt)}</span>
        ${esc(name)}
      </td>
      <td class="td-phone td-phone-desktop">
        <span class="phone-num">${esc(phone)}</span>
        <span class="contact-icons">
          ${digits ? `<a class="icon-call" href="tel:${digits}" onclick="event.stopPropagation()" title="Call">${CALL_SVG}</a>` : ''}
          ${waHref ? `<a class="icon-wa" href="${waHref}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="WhatsApp">${WA_SVG}</a>` : ''}
          ${email  ? `<a class="icon-mail" href="mailto:${email}" onclick="event.stopPropagation()" title="Email">${MAIL_SVG}</a>` : ''}
          ${digits ? `<button class="icon-copy" onclick="event.stopPropagation();copyPhone('${digits}')" title="Copy number">${COPY_SVG}</button>` : ''}
        </span>
      </td>
      <td class="td-classes">
        <div class="info-flat-rows">
          ${subjects ? `<span class="info-flat-row">${SUBJECTS_SVG}${esc(subjects)}</span>` : ''}
          ${student  ? `<span class="info-flat-row">${STUDENT_SVG}${esc(student)}${grade ? ` · Grade ${esc(grade)}` : ''}</span>` : ''}
          ${location ? `<span class="info-flat-row">${PIN_SVG}${esc(location)}</span>` : ''}
        </div>
        <div class="card-section">
          <div class="card-section-header"><span class="cs-label">${USER_SVG} Contact</span></div>
          <div class="card-section-body">
            <div class="contact-phone-row">
              <span class="phone-num">${esc(phone)}</span>
              <span class="contact-icons">
                ${digits ? `<a class="icon-call" href="tel:${digits}" onclick="event.stopPropagation()" title="Call">${CALL_SVG}</a>` : ''}
                ${waHref ? `<a class="icon-wa" href="${waHref}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="WhatsApp">${WA_SVG}</a>` : ''}
                ${email  ? `<a class="icon-mail" href="mailto:${email}" onclick="event.stopPropagation()" title="Email">${MAIL_SVG}</a>` : ''}
                ${digits ? `<button class="icon-copy" onclick="event.stopPropagation();copyPhone('${digits}')" title="Copy number">${COPY_SVG}</button>` : ''}
              </span>
            </div>
            <button class="pill-toggle ${contacted === 'Yes' ? 'yes' : 'no'}"
              data-sheet-row="${sheetRow}"
              data-col="${CP.CONTACTED + 1}"
              data-current="${esc(contacted)}"
              onclick="event.stopPropagation(); handleToggle(this)">
<span class="pt-yes">Contacted</span>
<span class="pt-no">Not yet</span>
            </button>
          </div>
        </div>
        <div class="card-notes card-section" data-sheet-row="${sheetRow}" data-notes="${esc(notes)}">
          ${notesInlineHTML(notes)}
        </div>
      </td>
      <td class="td-date">${esc(dateFmt)}</td>
      <td>
        <div class="card-top-actions">
          <button class="btn-card-move" onclick="event.stopPropagation();openCardActions(${sheetRow},'${uid}')" title="Actions">${HAMBURGER_SVG}<span class="card-action-label">Actions</span></button>
          <label class="card-check-wrap" onclick="event.stopPropagation()"><input type="checkbox" class="card-check" data-uid="${uid}" data-sheet-row="${sheetRow}" onchange="handleCardCheck(this)"><span class="card-check-box"></span><span class="card-action-label">Select</span></label>
          <button class="btn-card-edit" onclick="event.stopPropagation();openEditCardModal(${sheetRow},'${uid}')" title="Edit">${PENCIL_SVG}<span class="card-action-label">Edit</span></button>
          <button class="btn-card-trash" onclick="event.stopPropagation();trashCard(${sheetRow},'${uid}')" title="Move to bin">${TRASH_SVG}<span class="card-action-label">Delete</span></button>
        </div>
      </td>
      <td class="td-mail-sent"></td>
      <td class="td-expand">
        <button class="btn-expand" data-uid="${uid}" onclick="event.stopPropagation(); handleExpand(this)">
          <span class="btn-expand-label">Show full information</span>${CHEVRON_SVG}
        </button>
      </td>`;
    tbody.appendChild(tr);

    const dr = document.createElement('tr');
    dr.className = 'detail-row';
    dr.id = `detail-${uid}`;
    dr.innerHTML = `
      <td colspan="8">
        <div class="detail-grid">
          ${df('Onboarded On',   cell(row, CP.ONBOARDED_ON))}
          ${df('Email',          email)}
          ${df('Location',       location)}
          ${df('Address',        cell(row, CP.ADDRESS))}
          ${df('Student Name',   student)}
          ${df('Student Grade',  grade)}
          ${df('Subjects Needed', subjects)}
          ${df('Assigned Tutor', cell(row, CP.ASSIGNED_TUTOR))}
          ${df('Last Contacted', cell(row, CP.LAST_CONTACTED))}
        </div>
      </td>`;
    tbody.appendChild(dr);
  });

  renderedCount += batch.length;

  if (renderedCount < filteredRows.length) {
    const sentinel = document.createElement('tr');
    sentinel.id = 'scroll-sentinel';
    sentinel.innerHTML = '<td colspan="8" style="padding:0;height:1px"></td>';
    tbody.appendChild(sentinel);

    if (!scrollObserver) {
      scrollObserver = new IntersectionObserver(entries => {
        if (!entries[0].isIntersecting) return;
        if (renderedCount < filteredRows.length) {
          appendParentRows();
        } else if (currentSection === 'parents' && _parentHasMore && !DEV_MODE) {
          const cfg     = currentTabConfig();
          const dateCol = CP.ONBOARDED_ON;
          _loadMoreParents(cfg, dateCol);
        }
      }, { rootMargin: '300px' });
    }
    scrollObserver.observe(sentinel);
  } else if (scrollObserver) {
    scrollObserver.disconnect();
    scrollObserver = null;
  }
}

function df(label, value) {
  return `<div class="detail-field"><label>${label}</label><span>${esc(value || '—')}</span></div>`;
}

let _openDetailUid = null;

function _collapseDetail(uid, onDone) {
  const dr  = document.getElementById(`detail-${uid}`);
  const tr  = document.querySelector(`tr.data-row[data-uid="${uid}"]`);
  const btn = tr?.querySelector('.btn-expand');
  if (!dr || !dr.classList.contains('open')) { onDone?.(); return; }

  const td = dr.querySelector('td');
  td.style.maxHeight  = td.scrollHeight + 'px';
  td.style.overflow   = 'hidden';
  td.style.transition = 'max-height 0.28s ease';

  requestAnimationFrame(() => {
    td.style.maxHeight = '0';
    tr?.classList.remove('expanded');
    const icon = btn?.querySelector('.expand-icon');
    if (icon) icon.style.transform = '';
    const lbl = btn?.querySelector('.btn-expand-label');
    if (lbl) lbl.textContent = 'Show full information';
  });

  const done = () => {
    dr.classList.remove('open');
    td.style.cssText = '';
    dr.removeEventListener('transitionend', done);
    onDone?.();
  };
  dr.addEventListener('transitionend', done);
}

function _expandDetail(uid) {
  const dr  = document.getElementById(`detail-${uid}`);
  const tr  = document.querySelector(`tr.data-row[data-uid="${uid}"]`);
  const btn = tr?.querySelector('.btn-expand');
  if (!dr || !tr) return;

  dr.classList.add('open');
  tr.classList.add('expanded');
  const icon = btn?.querySelector('.expand-icon');
  if (icon) icon.style.transform = 'rotate(180deg)';
  const lbl = btn?.querySelector('.btn-expand-label');
  if (lbl) lbl.textContent = 'Hide full information';

  const td = dr.querySelector('td');
  td.style.maxHeight  = '0';
  td.style.overflow   = 'hidden';
  td.style.transition = 'max-height 0.35s ease';

  requestAnimationFrame(() => requestAnimationFrame(() => {
    td.style.maxHeight = td.scrollHeight + 'px';
  }));

  const done = () => {
    td.style.cssText = '';
    dr.removeEventListener('transitionend', done);
    // Scroll so card is ~60px from viewport top
    const headerOffset = (document.querySelector('.tab-bar')?.getBoundingClientRect().bottom ?? 130) + 16;
    const anchor = btn ?? dr;
    const anchorTop = anchor.getBoundingClientRect().top + window.scrollY - headerOffset;
    window.scrollTo({ top: anchorTop, behavior: 'smooth' });
  };
  dr.addEventListener('transitionend', done);
  _openDetailUid = uid;
}

function toggleDetail(uid) {
  if (_openDetailUid === uid) {
    // Close the open one
    _collapseDetail(uid);
    _openDetailUid = null;
    return;
  }
  if (_openDetailUid) {
    // Collapse current, then open new
    const prev = _openDetailUid;
    _openDetailUid = null;
    _collapseDetail(prev, () => _expandDetail(uid));
  } else {
    _expandDetail(uid);
  }
}

function handleExpand(btn) {
  toggleDetail(btn.dataset.uid);
}

// ── INLINE EDITS ──────────────────────────────────────────────────────────────
async function handleToggle(btn) {
  const sheetRow = parseInt(btn.dataset.sheetRow);
  const colNum   = parseInt(btn.dataset.col);
  const current  = btn.dataset.current;
  const next     = current === 'Yes' ? 'No' : 'Yes';

  btn.disabled = true;
  showLoader();
  try {
    await updateCell(sheetRow, colNum, next);
    if (btn.classList.contains('pill-toggle')) {
      btn.className = `pill-toggle ${next === 'Yes' ? 'yes' : 'no'}`;
    } else {
      btn.textContent = next;
      btn.className   = `btn-toggle ${next === 'Yes' ? 'yes' : 'no'}`;
    }
    btn.dataset.current = next;

    const ri = allRows.findIndex(r => r._sheetRow === sheetRow);
    if (ri !== -1) {
      if (currentSection === 'parents') {
        if (colNum === CP.CONTACTED + 1) allRows[ri][CP.CONTACTED] = next;
      } else {
        if (colNum === C.CONTACTED + 1) {
          allRows[ri][C.CONTACTED] = next;
        }
        if (colNum === C.MAIL_SENT + 1) allRows[ri][C.MAIL_SENT] = next;
      }
    }
    updateStats();
    hideLoader();
  } catch (err) {
    hideLoader();
    showError('Update failed: ' + err.message);
  }
  btn.disabled = false;
}

// ── INLINE NOTES ─────────────────────────────────────────────────────────────
function notesInlineHTML(notes) {
  return `
    <div class="card-section-header">
      <span class="notes-header-label">${NOTE_SVG} Notes</span>
      ${notes ? `<span class="notes-actions">
        <button class="btn-notes-remove" onclick="event.stopPropagation();removeCardNotes(this.closest('.card-notes'))">Remove</button>
        <span class="notes-action-sep">|</span>
        <button class="btn-notes-edit" onclick="event.stopPropagation();openCardNotes(this.closest('.card-notes'))">Edit</button>
      </span>` : ''}
    </div>
    <div class="card-notes-body card-section-body">
      ${notes
        ? `<span class="notes-text">${esc(notes)}</span>`
        : `<button class="btn-inline-text btn-add-notes" onclick="event.stopPropagation();openCardNotes(this.closest('.card-notes'))">+ Add notes</button>`
      }
    </div>`;
}

function openCardNotes(container) {
  const current = container.dataset.notes || '';
  container.querySelector('.card-section-header').innerHTML = `
    <span class="notes-header-label">${NOTE_SVG} Notes</span>
    <div class="notes-edit-actions">
      <button class="btn-notes-cancel" onclick="event.stopPropagation();cancelCardNotes(this.closest('.card-notes'))">Cancel</button>
      <button class="btn-notes-save"   onclick="event.stopPropagation();saveCardNotes(this.closest('.card-notes'))">Save</button>
    </div>`;
  const body = container.querySelector('.card-notes-body');
  body.innerHTML = `<textarea class="card-notes-ta" onclick="event.stopPropagation()"
    onkeydown="if(event.key==='Escape'){event.stopPropagation();cancelCardNotes(this.closest('.card-notes'))}"
  >${esc(current)}</textarea>`;
  body.querySelector('.card-notes-ta').focus();
}

function cancelCardNotes(container) {
  container.innerHTML = notesInlineHTML(container.dataset.notes || '');
}

function removeCardNotes(container) {
  showConfirm('Remove this note?<br><span class="confirm-sub">This cannot be undone.</span>', async () => {
    const sheetRow = parseInt(container.dataset.sheetRow);
    showLoader();
    try {
      await updateCell(sheetRow, C.NOTES + 1, '');
      const ri = allRows.findIndex(r => r._sheetRow === sheetRow);
      if (ri !== -1) allRows[ri][C.NOTES] = '';
      container.dataset.notes = '';
      container.innerHTML = notesInlineHTML('');
      hideLoader();
    } catch (err) {
      hideLoader();
      showError('Notes remove failed: ' + err.message);
    }
  });
}

async function saveCardNotes(container) {
  const sheetRow = parseInt(container.dataset.sheetRow);
  const value    = container.querySelector('.card-notes-ta').value.trim();

  container.querySelector('.btn-notes-save').disabled = true;
  showLoader();
  try {
    await updateCell(sheetRow, C.NOTES + 1, value);
    const ri = allRows.findIndex(r => r._sheetRow === sheetRow);
    if (ri !== -1) allRows[ri][C.NOTES] = value;
    container.dataset.notes = value;
    container.innerHTML = notesInlineHTML(value);
    hideLoader();
  } catch (err) {
    hideLoader();
    showError('Notes save failed: ' + err.message);
    cancelCardNotes(container);
  }
}

// ── INTERVIEW STATUS ──────────────────────────────────────────────────────────
function interviewStatusHTML(status, scheduledAt, sheetRow) {
  if (status === 'Cleared') {
    return `
      <div class="card-section-header"><span class="cs-label">${CALENDAR_SVG} Schedule</span></div>
      <div class="card-section-body"><span class="iv-chip iv-cleared">Interview Cleared</span></div>`;
  }
  if (status === 'Rejected') {
    return `
      <div class="card-section-header"><span class="cs-label">${CALENDAR_SVG} Schedule</span></div>
      <div class="card-section-body"><span class="iv-chip iv-rejected">Interview Rejected</span></div>`;
  }
  if (status === 'Scheduled' && scheduledAt) {
    const d       = parseDate(scheduledAt);
    const isPast  = d < new Date();
    const dateLbl = formatDate(scheduledAt);
    const _now    = new Date(); _now.setHours(0,0,0,0);
    const _day    = new Date(d); _day.setHours(0,0,0,0);
    const _diff   = Math.round((_day - _now) / 86400000);
    const daysLbl = _diff <= 0 ? '' : _diff === 1 ? 'Tomorrow' : `in ${_diff} days`;
    // Read parent data from allRows
    let parentData = null;
    const ri = allRows.findIndex(r => r._sheetRow === sheetRow);
    if (ri !== -1) {
      const raw = (allRows[ri][C.SCHEDULED_PARENT] || '').trim();
      if (raw) {
        const [pName, pPhone, pStudent] = raw.split('|');
        if (pName) parentData = { name: pName, phone: pPhone || '', studentName: pStudent || '' };
      }
    }
    const parentLine = parentData
      ? `<div class="iv-parent-tag">With ${esc(parentData.name)}${parentData.studentName ? ' &amp; ' + esc(parentData.studentName) : ''} · ${esc(parentData.phone)}</div>`
      : '';
    const calId = ri !== -1 ? (allRows[ri][C.CALENDAR_EVENT_ID] || '').trim() : '';
    const calBtn = calId
      ? `<span class="iv-cal-blocked">${GCAL_SVG} Blocked in Calendar</span>`
      : `<button class="btn-iv-action" onclick="event.stopPropagation();openCalendarPromptFromCard(${sheetRow})">${GCAL_SVG} Block Calendar</button>`;
    if (isPast) {
      return `
        <div class="iv-past-alert">
          <span class="iv-past-msg">Interview on ${esc(dateLbl)} — cleared?</span>
          <div class="iv-past-actions">
            <button class="btn-iv-result yes" onclick="event.stopPropagation();markInterview(${sheetRow},'Cleared')">Yes, Cleared</button>
            <button class="btn-iv-result no"  onclick="event.stopPropagation();markInterview(${sheetRow},'Rejected')">No, Rejected</button>
          </div>
        </div>`;
    }
    return `
      <div class="card-section-header"><span class="cs-label">${CALENDAR_SVG} Schedule</span></div>
      <div class="card-section-body">
        <div class="iv-date"><span>${esc(dateLbl)}</span>${daysLbl ? `<span class="iv-days-lbl">${daysLbl}</span>` : ''}</div>
        ${parentLine}
        <div class="iv-actions">
          <button class="btn-iv-action" onclick="event.stopPropagation();openScheduleModal(${sheetRow},'${esc(scheduledAt)}')">${PENCIL_SVG} Change</button>
          <button class="btn-iv-action" onclick="event.stopPropagation();confirmCancelSchedule(${sheetRow})">${CLOSE_SVG} Cancel</button>
          <button class="btn-iv-action btn-iv-wa" onclick="event.stopPropagation();openWAShareFromCard(${sheetRow})">${WA_SVG} Share</button>
          ${calBtn}
        </div>
      </div>`;
  }
  return `
    <div class="card-section-header"><span class="cs-label">${CALENDAR_SVG} Schedule</span></div>
    <div class="card-section-body">
      <button class="btn-inline-text" onclick="event.stopPropagation();openScheduleModal(${sheetRow},'')">+ Schedule a Visit</button>
    </div>`;
}

let _schedulePicker = null;

function initTimeDrum(defHour, defMin, defAmpm) {
  const ITEM_H = 48;
  const hours   = Array.from({length:12}, (_,i) => String(i+1).padStart(2,'0'));
  const minutes = Array.from({length:60}, (_,i) => String(i).padStart(2,'0'));

  function buildCol(id, items, selIdx) {
    const col = document.getElementById(id);
    col.innerHTML = '';
    // 2 pad items top/bottom so first/last item can scroll to center
    [1,2].forEach(() => col.appendChild(Object.assign(document.createElement('div'),{className:'drum-item drum-pad'})));
    items.forEach(v => {
      const el = document.createElement('div');
      el.className = 'drum-item';
      el.textContent = v;
      col.appendChild(el);
    });
    [1,2].forEach(() => col.appendChild(Object.assign(document.createElement('div'),{className:'drum-item drum-pad'})));
    // +1 because 1 pad item sits above the highlight band at scrollTop=0
    col.scrollTop = (selIdx + 1) * ITEM_H;
  }

  buildCol('drum-hour',   hours,   defHour - 1);
  buildCol('drum-minute', minutes, defMin);

  // AM/PM: simple tap toggle instead of drum (binary choice, no scroll needed)
  const ampmEl = document.getElementById('drum-ampm');
  ampmEl.innerHTML = `
    <button class="ampm-btn${defAmpm !== 'PM' ? ' active' : ''}" data-val="AM"
      onclick="this.classList.add('active');this.nextElementSibling.classList.remove('active')">AM</button>
    <button class="ampm-btn${defAmpm === 'PM' ? ' active' : ''}" data-val="PM"
      onclick="this.classList.add('active');this.previousElementSibling.classList.remove('active')">PM</button>`;
}

function getDrumTime() {
  const ITEM_H = 48;
  function readIdx(id, len) {
    const col = document.getElementById(id);
    // subtract 1 pad item offset to get 0-based item index
    return Math.max(0, Math.min(Math.round(col.scrollTop / ITEM_H) - 1, len - 1));
  }
  const h  = readIdx('drum-hour',   12) + 1;  // 1–12
  const m  = readIdx('drum-minute', 60);       // 0–59
  const activeAmpm = document.querySelector('#drum-ampm .ampm-btn.active');
  const ap = activeAmpm ? activeAmpm.dataset.val : 'AM';
  return { h, m, ap };
}

function openScheduleModal(sheetRow, current) {
  const modal = document.getElementById('schedule-modal');
  modal.dataset.sheetRow = sheetRow;

  if (_schedulePicker) _schedulePicker.destroy();
  _schedulePicker = flatpickr('#schedule-date-input', {
    dateFormat: 'd/m/Y',
    minDate: 'today',
    defaultDate: current ? parseDate(current) : null,
    disableMobile: true,
    static: true,
  });

  let dh = 9, dm = 0, dap = 'AM';
  if (current) {
    const d = parseDate(current);
    const raw = d.getHours();
    dap = raw >= 12 ? 'PM' : 'AM';
    dh  = raw % 12 || 12;
    dm  = d.getMinutes();
  }

  // Init parent field — pre-fill if already assigned
  _scheduleParent = null;
  const ri = allRows.findIndex(r => r._sheetRow === sheetRow);
  if (ri !== -1) {
    const raw = (allRows[ri][C.SCHEDULED_PARENT] || '').trim();
    if (raw) {
      const [pName, pPhone, pStudent, pAddress] = raw.split('|');
      _scheduleParent = { name: pName || '', phone: pPhone || '', studentName: pStudent || '', address: pAddress || '' };
    }
  }
  _renderModalParent();
  document.getElementById('schedule-parent-input').value = '';
  document.getElementById('schedule-parent-dropdown').style.display = 'none';

  document.getElementById('schedule-date-err').style.display   = 'none';
  document.getElementById('schedule-parent-err').style.display = 'none';
  modal.style.display = 'flex';
  requestAnimationFrame(() => initTimeDrum(dh, dm, dap));
  ensureParentCache();
}

function closeScheduleModal() {
  document.getElementById('schedule-modal').style.display = 'none';
  if (_schedulePicker) { _schedulePicker.destroy(); _schedulePicker = null; }
}

function _renderModalParent() {
  const chip = document.getElementById('schedule-parent-chip');
  if (_scheduleParent) {
    chip.style.display = 'flex';
    chip.querySelector('.mpchip-name').textContent = _scheduleParent.name;
    chip.querySelector('.mpchip-sub').textContent =
      (_scheduleParent.studentName ? '& ' + _scheduleParent.studentName + ' · ' : '') + (_scheduleParent.phone || '');
  } else {
    chip.style.display = 'none';
  }
}

function searchModalParent(q) {
  const dd = document.getElementById('schedule-parent-dropdown');
  if (!q.trim()) { dd.innerHTML = ''; dd.style.display = 'none'; return; }
  ensureParentCache().then(() => {
    _scheduleParentMatches = _parentCache.filter(r =>
      [cell(r, CP.NAME), cell(r, CP.PHONE), cell(r, CP.STUDENT_NAME)]
        .join(' ').toLowerCase().includes(q.toLowerCase())
    ).slice(0, 6);
    if (!_scheduleParentMatches.length) {
      dd.innerHTML = `<div class="mpdd-empty">No parents found</div>`;
    } else {
      dd.innerHTML = _scheduleParentMatches.map((r, i) => `
        <div class="mpdd-item" onclick="selectModalParent(${i})">
          <div class="mpdd-name">${esc(cell(r, CP.NAME))}</div>
          <div class="mpdd-sub">${cell(r, CP.PHONE) ? esc(cell(r, CP.PHONE)) : ''}${cell(r, CP.STUDENT_NAME) ? ' · ' + esc(cell(r, CP.STUDENT_NAME)) : ''}</div>
        </div>`).join('');
    }
    dd.style.display = 'block';
  });
}

function selectModalParent(idx) {
  const r = _scheduleParentMatches[idx];
  if (!r) return;
  _scheduleParent = { name: cell(r, CP.NAME), phone: cell(r, CP.PHONE), studentName: cell(r, CP.STUDENT_NAME), address: cell(r, CP.ADDRESS) || cell(r, CP.LOCATION) || '' };
  document.getElementById('schedule-parent-input').value = '';
  document.getElementById('schedule-parent-dropdown').style.display = 'none';
  _renderModalParent();
}

function clearModalParent() {
  _scheduleParent = null;
  _renderModalParent();
}

function showConfirm(message, onOk) {
  const modal = document.getElementById('confirm-modal');
  document.getElementById('confirm-msg').innerHTML = message;
  const btn = document.getElementById('confirm-ok-btn');
  btn.onclick = () => { closeConfirmModal(); onOk(); };
  modal.style.display = 'flex';
}
function closeConfirmModal() {
  document.getElementById('confirm-modal').style.display = 'none';
}

async function confirmCancelSchedule(sheetRow) {
  showConfirm('Cancel this scheduled visit?', async () => {
    showLoader();
    try {
      const ri    = allRows.findIndex(r => r._sheetRow === sheetRow);
      const calId = ri !== -1 ? (allRows[ri][C.CALENDAR_EVENT_ID] || '').trim() : '';

      await updateCell(sheetRow, C.INTERVIEW_STATUS    + 1, '');
      await updateCell(sheetRow, C.INTERVIEW_AT        + 1, '');
      await updateCell(sheetRow, C.SCHEDULED_PARENT    + 1, '');
      await updateCell(sheetRow, C.CALENDAR_EVENT_ID   + 1, '');

      if (ri !== -1) {
        allRows[ri][C.INTERVIEW_STATUS]  = '';
        allRows[ri][C.INTERVIEW_AT]      = '';
        allRows[ri][C.SCHEDULED_PARENT]  = '';
        allRows[ri][C.CALENDAR_EVENT_ID] = '';
      }

      // Delete calendar event (fire-and-forget — don't block on failure)
      if (calId) {
        _deleteCalendarEvent(calId)
          .catch(err => console.warn('[Calendar delete]', err.message));
      }

      const container = document.querySelector(`.card-interview[data-sheet-row="${sheetRow}"]`);
      if (container) {
        container.dataset.ivStatus = '';
        container.dataset.ivAt     = '';
        container.innerHTML = interviewStatusHTML('', '', sheetRow);
      }
      hideLoader();
    } catch (err) {
      hideLoader();
      showError('Failed to cancel visit: ' + err.message);
    }
  });
}

// ── WA SHARE ──────────────────────────────────────────────────────────────────
async function ensureParentCache() {
  if (_parentCache.length) return;
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(SHEETS.PARENTS_TO_CONTACT)}!A:Q`;
    const res = await apiFetch(url);
    _parentCache = (res.values || []).slice(1).filter(r => r.length > 0);
  } catch { _parentCache = []; }
}

function openWAShareModal(tutorName, tutorPhone, dateStr, parentName = '', parentPhone = '', studentName = '', parentAddress = '') {
  _waShareData = { tutorName, tutorPhone, dateStr, parentName, parentPhone, studentName, parentAddress };
  _waParentMatches = [];

  document.getElementById('wa-date-chip').textContent = '📅 ' + formatDate(dateStr);
  document.getElementById('wa-tutor-name').textContent = tutorName;

  const visitWith = document.getElementById('wa-visit-with');
  if (parentName) {
    visitWith.textContent = 'Visit with — ' + parentName + (studentName ? ' & ' + studentName : '');
    visitWith.style.display = 'block';
  } else {
    visitWith.style.display = 'none';
  }

  const parentNameEl = document.getElementById('wa-parent-name');
  const searchWrap   = document.getElementById('wa-parent-search-wrap');
  if (parentName) {
    parentNameEl.textContent = parentName + (studentName ? ' · ' + studentName : '');
    parentNameEl.style.display = 'block';
    searchWrap.style.display = 'none';
    document.getElementById('btn-send-parent').disabled = false;
  } else {
    parentNameEl.style.display = 'none';
    searchWrap.style.display = 'block';
    document.getElementById('wa-parent-search').value = '';
    document.getElementById('wa-parent-dropdown').style.display = 'none';
    document.getElementById('btn-send-parent').disabled = true;
  }

  document.getElementById('wa-share-modal').style.display = 'flex';
  document.getElementById('wa-tutor-msg').value = buildWAMessage('tutor');
  document.getElementById('wa-parent-msg').value = parentName ? buildWAMessage('parent') : '';
  ensureParentCache();
}

function openWAShareFromCard(sheetRow) {
  const ri = allRows.findIndex(r => r._sheetRow === sheetRow);
  if (ri === -1) return;
  const row = allRows[ri];
  const name    = cell(row, C.NAME);
  const phone   = cell(row, C.PHONE);
  const dateStr = cell(row, C.INTERVIEW_AT);
  const raw     = (row[C.SCHEDULED_PARENT] || '').trim();

  if (!raw) {
    // 2-step: no parent assigned — re-open schedule modal so user can add one
    showError('No parent assigned. Open the schedule to add a parent first, then share.');
    openScheduleModal(sheetRow, dateStr);
    return;
  }

  const [pName, pPhone, pStudent, pAddress] = raw.split('|');
  openWAShareModal(name, phone, dateStr, pName || '', pPhone || '', pStudent || '', pAddress || '');
}

function closeWAShareModal() {
  document.getElementById('wa-share-modal').style.display = 'none';
  if (_pendingCalData) {
    const d = _pendingCalData;
    _pendingCalData = null;
    openCalendarPromptModal(d);
  }
}

function openCalendarPromptModal(d) {
  // Timing chip: "30 Sep 2026 · 9:00 AM – 10:00 AM"
  const start = parseDate(d.dateStr);
  const end   = new Date(start.getTime() + 60 * 60 * 1000);
  document.getElementById('cp-time-chip').textContent =
    `${formatDate(d.dateStr).replace(/:00$/, '')} – ${formatTime(end)}`;

  document.getElementById('cp-tutor-name').textContent  = d.tutorName;
  document.getElementById('cp-tutor-email').textContent = d.tutorEmail || '(no email on file)';

  // Default editable event name
  const _defTitle = d.studentName
    ? `Invitation: KidsBuddy Tutor <> ${d.studentName}`
    : 'Invitation: KidsBuddy Tutor <> Student Visit';
  document.getElementById('cp-event-name').value = _defTitle;

  // Default editable description
  const lines = [`KidsBuddy Visit — ${d.tutorName}`];
  if (d.parentName)    lines.push(`Parent: ${d.parentName}`);
  if (d.studentName)   lines.push(`Student: ${d.studentName}`);
  if (d.parentAddress) lines.push(`Address: ${d.parentAddress}`);
  document.getElementById('cp-event-desc').value = lines.join('\n');

  const btn = document.getElementById('btn-cp-yes');
  btn.disabled       = !d.tutorEmail;
  btn.textContent    = 'Yes, Block';
  btn.dataset.calSheetRow  = d.sheetRow;
  btn.dataset.calTutorName = d.tutorName;
  btn.dataset.calEmail     = d.tutorEmail || '';
  btn.dataset.calDateStr   = d.dateStr;

  document.getElementById('cal-prompt-modal').style.display = 'flex';
}

function closeCalendarPromptModal() {
  document.getElementById('cal-prompt-modal').style.display = 'none';
}

function openCalendarPromptFromCard(sheetRow) {
  const ri = allRows.findIndex(r => r._sheetRow === sheetRow);
  if (ri === -1) return;
  const pRaw = (allRows[ri][C.SCHEDULED_PARENT] || '').trim();
  const [pName, pPhone, pStudent, pAddress] = pRaw ? pRaw.split('|') : [];
  openCalendarPromptModal({
    sheetRow,
    tutorName:     cell(allRows[ri], C.NAME),
    tutorEmail:    cell(allRows[ri], C.EMAIL),
    dateStr:       cell(allRows[ri], C.INTERVIEW_AT),
    parentName:    pName    || '',
    parentPhone:   pPhone   || '',
    studentName:   pStudent || '',
    parentAddress: pAddress || '',
  });
}

// TODO: Remove this restriction once calendar flow is fully tested in production
const _CAL_ALLOWED_EMAILS = ['s.kumari.shirisha@gmail.com', 'prathyushsunny@gmail.com'];

async function addCalendarFor(role) {
  if (role !== 'tutor') return;
  const btn      = document.getElementById('btn-cp-yes');
  const sheetRow = parseInt(btn.dataset.calSheetRow);
  const name     = btn.dataset.calTutorName;
  const email    = btn.dataset.calEmail;
  const dateStr  = btn.dataset.calDateStr;
  const desc      = document.getElementById('cp-event-desc').value.trim();
  const eventName = document.getElementById('cp-event-name').value.trim();

  // Dev restriction: only send invites to whitelisted accounts
  if (!_CAL_ALLOWED_EMAILS.includes((email || '').toLowerCase())) {
    console.warn('[Calendar] Blocked — not in allowed list:', email);
    closeCalendarPromptModal();
    showError('Calendar invite restricted to test accounts during dev. No invite sent.');
    return;
  }

  btn.disabled    = true;
  btn.textContent = '…';
  showLoader();
  try {
    await _syncCalendarEvent(sheetRow, name, email, dateStr, desc, eventName);
    closeCalendarPromptModal();
    hideLoader();
    // Re-render the card's schedule section to show "Blocked in Calendar"
    const ri = allRows.findIndex(r => r._sheetRow === sheetRow);
    if (ri !== -1) {
      const container = document.querySelector(`.card-interview[data-sheet-row="${sheetRow}"]`);
      if (container) {
        container.innerHTML = interviewStatusHTML(
          cell(allRows[ri], C.INTERVIEW_STATUS),
          cell(allRows[ri], C.INTERVIEW_AT),
          sheetRow
        );
      }
    }
  } catch (err) {
    hideLoader();
    btn.disabled    = false;
    btn.textContent = 'Yes, Block';
    if (err.message.includes('403')) {
      showError('Calendar access not granted. Sign out and sign back in to allow Calendar access.');
    } else {
      showError('Calendar error: ' + err.message);
    }
  }
}

// ── Google Calendar ───────────────────────────────────────────────────────────
function _buildCalendarBody(tutorName, tutorEmail, storedDateStr, description = '', eventName = '') {
  const d    = parseDate(storedDateStr);
  const end  = new Date(d.getTime() + 60 * 60 * 1000);
  const iso  = dt => `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}T${pad2(dt.getHours())}:${pad2(dt.getMinutes())}:00`;
  const _sName = description.match(/Student:\s*(.+)/)?.[1]?.trim();
  const _defaultTitle = _sName
    ? `Invitation: KidsBuddy Tutor <> ${_sName}`
    : 'Invitation: KidsBuddy Tutor <> Student Visit';
  const body = {
    summary: eventName || _defaultTitle,
    start:   { dateTime: iso(d),   timeZone: 'Asia/Kolkata' },
    end:     { dateTime: iso(end), timeZone: 'Asia/Kolkata' },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 60 },
        { method: 'email', minutes: 60 },
      ],
    },
  };
  if (description)  body.description = description;
  if (tutorEmail)   body.attendees   = [{ email: tutorEmail }];
  return body;
}

async function _deleteCalendarEvent(eventId) {
  const url  = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`;
  const resp = await fetch(url, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!resp.ok && resp.status !== 410) { // 410 = already deleted
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Calendar DELETE: ${resp.status} — ${err?.error?.message || 'unknown'}`);
  }
}

async function _syncCalendarEvent(sheetRow, tutorName, tutorEmail, storedDateStr, description = '', eventName = '') {
  const ri         = allRows.findIndex(r => r._sheetRow === sheetRow);
  const existingId = ri !== -1 ? (allRows[ri][C.CALENDAR_EVENT_ID] || '').trim() : '';
  const method  = existingId ? 'PATCH' : 'POST';
  const baseUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
  const url     = existingId
    ? `${baseUrl}/${existingId}?sendUpdates=all`
    : `${baseUrl}?sendUpdates=all`;

  const resp = await fetch(url, {
    method,
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(_buildCalendarBody(tutorName, tutorEmail, storedDateStr, description, eventName)),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Calendar ${method}: ${resp.status} — ${err?.error?.message || 'unknown'}`);
  }
  const data = await resp.json();
  if (data.id && ri !== -1) {
    allRows[ri][C.CALENDAR_EVENT_ID] = data.id;
    await updateCell(sheetRow, C.CALENDAR_EVENT_ID + 1, data.id);
  }
}

function searchParentsForWA(q) {
  const dd = document.getElementById('wa-parent-dropdown');
  if (!q.trim()) { dd.innerHTML = ''; dd.style.display = 'none'; return; }

  _waParentMatches = _parentCache.filter(r => {
    return [cell(r, CP.NAME), cell(r, CP.PHONE), cell(r, CP.STUDENT_NAME)]
      .join(' ').toLowerCase().includes(q.toLowerCase());
  }).slice(0, 6);

  if (!_waParentMatches.length) {
    dd.innerHTML = `<div class="wa-dd-empty">No parents found</div>`;
    dd.style.display = 'block';
    return;
  }
  dd.innerHTML = _waParentMatches.map((r, i) => `
    <div class="wa-dd-item" onclick="selectWAParent(${i})">
      <span class="wa-dd-name">${esc(cell(r, CP.NAME))}</span>
      <span class="wa-dd-sub">${esc(cell(r, CP.STUDENT_NAME) || '')}${cell(r, CP.PHONE) ? ' · ' + esc(cell(r, CP.PHONE)) : ''}</span>
    </div>`).join('');
  dd.style.display = 'block';
}

function selectWAParent(idx) {
  const r = _waParentMatches[idx];
  if (!r) return;
  _waShareData.parentName    = cell(r, CP.NAME);
  _waShareData.parentPhone   = cell(r, CP.PHONE);
  _waShareData.studentName   = cell(r, CP.STUDENT_NAME);
  _waShareData.parentAddress = cell(r, CP.ADDRESS) || cell(r, CP.LOCATION) || '';

  const parentNameEl = document.getElementById('wa-parent-name');
  parentNameEl.textContent = _waShareData.parentName + (_waShareData.studentName ? ' · ' + _waShareData.studentName : '');
  parentNameEl.style.display = 'block';
  document.getElementById('wa-parent-search-wrap').style.display = 'none';

  const visitWith = document.getElementById('wa-visit-with');
  visitWith.textContent = 'Visit with — ' + _waShareData.parentName + (_waShareData.studentName ? ' & ' + _waShareData.studentName : '');
  visitWith.style.display = 'block';

  document.getElementById('btn-send-parent').disabled = false;
  document.getElementById('wa-parent-msg').value = buildWAMessage('parent');
}

function buildWAMessage(role) {
  const { tutorName, parentName, studentName, dateStr, parentAddress } = _waShareData;
  const date = formatDate(dateStr);
  if (role === 'tutor') {
    const addrLine = parentAddress ? `\n📍 Address: ${parentAddress}` : '';
    return `Hi ${tutorName}! 👋\n\n*KidsBuddy* has scheduled a home visit for you:\n\n📅 ${date}\n👨‍👩‍👧 Student: ${studentName || '—'}\n👤 Parent: ${parentName || '—'}${addrLine}\n\nPlease confirm your availability. Thank you!\n— KidsBuddy Team`;
  }
  return `Hi ${parentName}! 👋\n\n*KidsBuddy* has arranged a tutor visit at your home:\n\n📅 ${date}\n👩‍🏫 Tutor: ${tutorName || '—'}\n\nPlease ensure someone is available. Thank you!\n— KidsBuddy Team`;
}

function sendWATo(role) {
  const phone = role === 'tutor' ? _waShareData.tutorPhone : _waShareData.parentPhone;
  if (!phone) return;
  let digits = phone.replace(/\D/g,'');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  const num    = digits.length === 10 ? '91' + digits : digits;
  const msgEl  = document.getElementById(role === 'tutor' ? 'wa-tutor-msg' : 'wa-parent-msg');
  const msg    = encodeURIComponent(msgEl ? msgEl.value : buildWAMessage(role));
  window.open(`https://wa.me/${num}?text=${msg}`, '_blank', 'noopener');
  // modal stays open intentionally
}

async function saveInterviewSchedule() {
  const modal    = document.getElementById('schedule-modal');
  const sheetRow = parseInt(modal.dataset.sheetRow);
  const dateOnly = _schedulePicker && _schedulePicker.selectedDates[0];

  const dateErr   = document.getElementById('schedule-date-err');
  const parentErr = document.getElementById('schedule-parent-err');
  dateErr.style.display   = dateOnly   ? 'none' : 'block';
  parentErr.style.display = _scheduleParent ? 'none' : 'block';
  if (!dateOnly || !_scheduleParent) return;

  const { h, m, ap } = getDrumTime();
  const hours24 = (h % 12) + (ap === 'PM' ? 12 : 0);
  const d = new Date(dateOnly);
  d.setHours(hours24, m, 0, 0);

  const btn = modal.querySelector('.btn-schedule-save');
  btn.disabled = true;
  showLoader();
  try {
    const fmt = `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`;
    const parentStr = _scheduleParent
      ? [_scheduleParent.name, _scheduleParent.phone, _scheduleParent.studentName, _scheduleParent.address || ''].join('|')
      : '';
    await updateCell(sheetRow, C.INTERVIEW_STATUS   + 1, 'Scheduled');
    await updateCell(sheetRow, C.INTERVIEW_AT        + 1, fmt);
    await updateCell(sheetRow, C.SCHEDULED_PARENT    + 1, parentStr);
    const ri = allRows.findIndex(r => r._sheetRow === sheetRow);
    if (ri !== -1) {
      allRows[ri][C.INTERVIEW_STATUS]  = 'Scheduled';
      allRows[ri][C.INTERVIEW_AT]      = fmt;
      allRows[ri][C.SCHEDULED_PARENT]  = parentStr;
    }
    const container = document.querySelector(`.card-interview[data-sheet-row="${sheetRow}"]`);
    if (container) {
      container.dataset.ivStatus = 'Scheduled';
      container.dataset.ivAt     = fmt;
      container.innerHTML = interviewStatusHTML('Scheduled', fmt, sheetRow);
    }

    // Auto-set Contacted = Yes
    const ri2 = allRows.findIndex(r => r._sheetRow === sheetRow);
    if (ri2 !== -1 && allRows[ri2][C.CONTACTED] !== 'Yes') {
      updateCell(sheetRow, C.CONTACTED + 1, 'Yes');
      allRows[ri2][C.CONTACTED] = 'Yes';
      const pill = document.querySelector(`.pill-toggle[data-sheet-row="${sheetRow}"][data-col="${C.CONTACTED + 1}"]`);
      if (pill) { pill.className = 'pill-toggle yes'; pill.dataset.current = 'Yes'; }
      updateStats();
    }

    // Calendar: auto-sync if already blocked (reschedule), else prompt after WA share
    const riCal = allRows.findIndex(r => r._sheetRow === sheetRow);
    if (riCal !== -1) {
      const existingCalId = (allRows[riCal][C.CALENDAR_EVENT_ID] || '').trim();
      if (existingCalId) {
        _syncCalendarEvent(sheetRow, cell(allRows[riCal], C.NAME), cell(allRows[riCal], C.EMAIL), fmt)
          .catch(err => console.warn('[Calendar reschedule]', err.message));
      } else {
        const pRaw = (allRows[riCal][C.SCHEDULED_PARENT] || '').trim();
        const [pName, pPhone, pStudent] = pRaw ? pRaw.split('|') : [];
        _pendingCalData = {
          sheetRow,
          tutorName:   cell(allRows[riCal], C.NAME),
          tutorEmail:  cell(allRows[riCal], C.EMAIL),
          dateStr:     fmt,
          parentName:  pName   || '',
          parentPhone: pPhone  || '',
          studentName: pStudent || '',
        };
      }
    }

    closeScheduleModal();

    // WA callback — pre-fill parent if assigned
    const ri3 = allRows.findIndex(r => r._sheetRow === sheetRow);
    const waFn = ri3 !== -1
      ? () => {
          const p = _scheduleParent;
          openWAShareModal(
            cell(allRows[ri3], C.NAME), cell(allRows[ri3], C.PHONE), fmt,
            p?.name || '', p?.phone || '', p?.studentName || '', p?.address || ''
          );
        }
      : null;
    // Auto-set Contacted=Yes and In-Loop (scheduling = first contact signal)
    if (ri3 !== -1) {
      if (allRows[ri3][C.CONTACTED] !== 'Yes') {
        updateCell(sheetRow, C.CONTACTED + 1, 'Yes').catch(() => {});
        allRows[ri3][C.CONTACTED] = 'Yes';
        const pill = document.querySelector(`.pill-toggle[data-sheet-row="${sheetRow}"][data-col="${C.CONTACTED + 1}"]`);
        if (pill) { pill.className = 'pill-toggle yes'; pill.dataset.current = 'Yes'; }
      }
      if (!allRows[ri3][C.STATUS]) {
        updateCell(sheetRow, C.STATUS + 1, 'In-Loop').catch(() => {});
        allRows[ri3][C.STATUS] = 'In-Loop';
        const badge = document.querySelector(`.card-interview[data-sheet-row="${sheetRow}"]`)
          ?.closest('tr.data-row')?.querySelector('.status-badge');
        if (badge) { badge.textContent = 'In-Loop'; badge.className = 'status-badge badge-inloop'; }
      }
    }
    hideLoader();
    waFn?.();
  } catch (err) {
    hideLoader();
    showError('Failed to save interview date: ' + err.message);
  }
  btn.disabled = false;
}

async function markInterview(sheetRow, result) {
  showLoader();
  try {
    await updateCell(sheetRow, C.INTERVIEW_STATUS + 1, result);
    const ri = allRows.findIndex(r => r._sheetRow === sheetRow);
    if (ri !== -1) allRows[ri][C.INTERVIEW_STATUS] = result;
    const container = document.querySelector(`.card-interview[data-sheet-row="${sheetRow}"]`);
    if (container) {
      container.dataset.ivStatus = result;
      container.innerHTML = interviewStatusHTML(result, '', sheetRow);
    }
    const fi  = filteredRows.findIndex(r => r._sheetRow === sheetRow);
    const uid = fi !== -1 ? `r${fi}` : null;
    if (result === 'Cleared') {
      if (uid) await updateStatus(sheetRow, uid, 'Onboarded');
    } else if (result === 'Rejected') {
      if (uid) showPostRejectionMoveModal(sheetRow, uid);
    }
    hideLoader();
  } catch (err) {
    hideLoader();
    showError('Failed to update interview status: ' + err.message);
  }
}

function showPostRejectionMoveModal(sheetRow, uid) {
  const modal = document.getElementById('move-modal');
  modal.querySelector('.move-sheet-title').textContent = 'Interview rejected — move tutor?';
  document.getElementById('move-options').innerHTML =
    `<button class="btn-move-opt" onclick="closeMoveModal();_rejectionMove(${sheetRow},'${uid}','')">Keep in All</button>` +
    `<button class="btn-move-opt" onclick="closeMoveModal();_rejectionMove(${sheetRow},'${uid}','In-Loop')">Add to In-Loop</button>` +
    `<button class="btn-move-opt btn-move-danger" id="_rejection-bin-btn">Move to Bin</button>`;
  document.getElementById('_rejection-bin-btn').onclick = () => {
    closeMoveModal();
    showConfirm('Move to Bin?<br><span class="confirm-sub">Saved in Bin for 30 days, then permanently removed.</span>', () => _doTrashCard(sheetRow, uid));
  };
  const cancelBtn = modal.querySelector('.btn-move-cancel');
  cancelBtn.onclick = closeMoveModal;
  modal.onclick = e => { if (e.target === modal) closeMoveModal(); };
  modal.style.display = 'flex';
}

async function _rejectionMove(sheetRow, uid, targetStatus) {
  showLoader();
  // Reset interview state
  try {
    await Promise.all([
      updateCell(sheetRow, C.INTERVIEW_STATUS + 1, ''),
      updateCell(sheetRow, C.INTERVIEW_AT     + 1, ''),
    ]);
    const ri = allRows.findIndex(r => r._sheetRow === sheetRow);
    if (ri !== -1) {
      allRows[ri][C.INTERVIEW_STATUS] = '';
      allRows[ri][C.INTERVIEW_AT]     = '';
    }
  } catch (e) { /* non-critical */ }

  // Reset interview UI in place
  const container = document.querySelector(`.card-interview[data-sheet-row="${sheetRow}"]`);
  if (container) {
    container.dataset.ivStatus = '';
    container.innerHTML = interviewStatusHTML('', '', sheetRow);
  }

  // Update status (adds to sub-tab or clears)
  if (targetStatus !== '') {
    await updateStatus(sheetRow, uid, targetStatus);
  }
  hideLoader();
}

function copyPhone(digits) {
  navigator.clipboard.writeText(digits).then(() => showToast('Copied'));
}

async function logCall(sheetRow) {
  try {
    const now = new Date();
    const fmt = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:00`;
    await updateCell(sheetRow, C.LAST_CALLED + 1, fmt);
    const ri = allRows.findIndex(r => r._sheetRow === sheetRow);
    if (ri !== -1) allRows[ri][C.LAST_CALLED] = fmt;
  } catch (err) {
    // silent — call still proceeds even if log fails
  }
}

// ── BULK SELECT ───────────────────────────────────────────────────────────────
function handleCardCheck(cb) {
  if (cb.checked) selectedUids.add(cb.dataset.uid);
  else selectedUids.delete(cb.dataset.uid);
  updateBulkBar();
}

function handleSelectAll(cb) {
  document.querySelectorAll('.card-check').forEach(c => {
    c.checked = cb.checked;
    if (cb.checked) selectedUids.add(c.dataset.uid);
    else selectedUids.delete(c.dataset.uid);
  });
  updateBulkBar();
}

function updateBulkBar() {
  const bar   = document.getElementById('bulk-bar');
  const count = selectedUids.size;
  bar.style.display = count > 0 ? 'flex' : 'none';
  document.getElementById('bulk-count').textContent = `${count} selected`;
  const allChecked = count > 0 && count === document.querySelectorAll('.card-check').length;
  const sa = document.getElementById('select-all-check');
  if (sa) { sa.checked = allChecked; sa.indeterminate = count > 0 && !allChecked; }

}

function clearSelection() {
  document.querySelectorAll('.card-check:checked').forEach(c => c.checked = false);
  selectedUids.clear();
  const bar = document.getElementById('bulk-bar');
  if (bar) bar.style.display = 'none';
  const sa = document.getElementById('select-all-check');
  if (sa) { sa.checked = false; sa.indeterminate = false; }
}

function openCardActions(sheetRow, uid) {
  selectedUids.clear();
  selectedUids.add(uid);
  openBulkMoveModal();
}

function openBulkMoveModal() {
  if (!selectedUids.size) return;
  const cfg   = currentTabConfig();
  if (cfg.isBin) return;

  const modal = document.getElementById('move-modal');
  const cancelBtn = modal.querySelector('.btn-move-cancel');
  if (cancelBtn) cancelBtn.onclick = closeMoveModal;
  modal.onclick = e => { if (e.target === modal) closeMoveModal(); };

  const statusCol    = currentSection === 'parents' ? CP.STATUS    : C.STATUS;
  const contactedCol = currentSection === 'parents' ? CP.CONTACTED : C.CONTACTED;

  const hasInLoop = [...selectedUids].some(uid => {
    const el = document.querySelector(`tr.data-row[data-uid="${uid}"]`);
    if (!el) return false;
    const ri = allRows.findIndex(r => r._sheetRow === parseInt(el.dataset.sheetRow));
    return ri !== -1 && (allRows[ri][statusCol] || '') === 'In-Loop';
  });

  let optsHTML =
    `<button class="btn-move-opt" onclick="closeMoveModal();bulkUpdateStatus('In-Loop')">Add to In-Loop</button>`;
  if (hasInLoop) {
    optsHTML += `<button class="btn-move-opt" onclick="closeMoveModal();bulkRemoveFromInLoop()">Remove from In-Loop</button>`;
  }
  optsHTML +=
    `<button class="btn-move-opt" onclick="closeMoveModal();bulkMarkContacted('Yes')">Mark Contacted</button>` +
    `<button class="btn-move-opt" onclick="closeMoveModal();bulkMarkContacted('No')">Mark not Contacted</button>`;

  if (currentSection === 'tutors' && !cfg.isDraft) {
    optsHTML += `<button class="btn-move-opt btn-move-draft" onclick="closeMoveModal();bulkMoveToDraft()">Move to Draft</button>`;
  }

  modal.querySelector('.move-sheet-title').textContent = 'Actions';
  document.getElementById('move-options').innerHTML = optsHTML;
  modal.style.display = 'flex';
}

async function bulkUpdateStatus(status) {
  showLoader();
  const uids = [...selectedUids];
  let count = 0;
  for (const uid of uids) {
    const el = document.querySelector(`tr.data-row[data-uid="${uid}"]`);
    if (!el) continue;
    await updateStatus(parseInt(el.dataset.sheetRow), uid, status, { suppressToast: true });
    count++;
  }
  clearSelection();
  hideLoader();
  if (count) showToast(`${count} ${count === 1 ? 'tutor' : 'tutors'} added to ${status}`);
}

async function bulkRemoveFromInLoop() {
  const statusCol = currentSection === 'parents' ? CP.STATUS : C.STATUS;
  showLoader();
  const uids = [...selectedUids];
  let count = 0;
  for (const uid of uids) {
    const el = document.querySelector(`tr.data-row[data-uid="${uid}"]`);
    if (!el) continue;
    const sr = parseInt(el.dataset.sheetRow);
    const ri = allRows.findIndex(r => r._sheetRow === sr);
    if (ri === -1 || (allRows[ri][statusCol] || '') !== 'In-Loop') continue;
    await updateStatus(sr, uid, '', { suppressToast: true });
    count++;
  }
  clearSelection();
  hideLoader();
  if (count) showToast(`${count} ${count === 1 ? 'tutor' : 'tutors'} removed from In-Loop`);
}

async function bulkMarkContacted(value) {
  const col = currentSection === 'parents' ? CP.CONTACTED : C.CONTACTED;
  showLoader();
  const uids = [...selectedUids];
  let count = 0;
  for (const uid of uids) {
    const el = document.querySelector(`tr.data-row[data-uid="${uid}"]`);
    if (!el) continue;
    const sr = parseInt(el.dataset.sheetRow);
    const ri = allRows.findIndex(r => r._sheetRow === sr);
    if (ri === -1 || (allRows[ri][col] || '') === value) continue;
    allRows[ri][col] = value;
    const pill = document.querySelector(`.pill-toggle[data-sheet-row="${sr}"][data-col="${col + 1}"]`);
    if (pill) { pill.className = `pill-toggle ${value === 'Yes' ? 'yes' : 'no'}`; pill.dataset.current = value; }
    await updateCell(sr, col + 1, value);
    count++;
  }
  clearSelection();
  updateStats();
  hideLoader();
  if (count) showToast(`${count} ${count === 1 ? 'tutor' : 'tutors'} marked ${value === 'Yes' ? 'Contacted' : 'Not Contacted'}`);
}

function bulkDelete() {
  const count = selectedUids.size;
  if (!count) return;
  const label = currentSection === 'parents' ? 'contact' : 'tutor';
  showConfirm(
    `Move ${count} ${count === 1 ? label : label + 's'} to Bin?<br><span class="confirm-sub">They auto-purge after 30 days.</span>`,
    async () => {
      const uids = [...selectedUids];
      for (const uid of uids) {
        const cb = document.querySelector(`.card-check[data-uid="${uid}"]`);
        if (!cb) continue;
        const sheetRow = parseInt(cb.dataset.sheetRow);
        await _doTrashCard(sheetRow, uid);
      }
      clearSelection();
    }
  );
}

async function bulkMoveToDraft() {
  const count = selectedUids.size;
  if (!count) return;
  showConfirm(
    `Move ${count} ${count === 1 ? 'tutor' : 'tutors'} to Draft?<br><span class="confirm-sub">Saved permanently — no auto-purge.</span>`,
    async () => {
      showLoader();
      const uids = [...selectedUids];
      let moved = 0;
      for (const uid of uids) {
        const el = document.querySelector(`tr.data-row[data-uid="${uid}"]`);
        if (!el) continue;
        await _doMoveToDraft(parseInt(el.dataset.sheetRow), uid, true);
        moved++;
      }
      clearSelection();
      hideLoader();
      if (moved) showToast(`${moved} ${moved === 1 ? 'tutor' : 'tutors'} moved to Draft`);
    }
  );
}

// ── TRASH / BIN ───────────────────────────────────────────────────────────────
async function ensureSheetIds() {
  if (Object.keys(sheetIdMap).length) return;
  const meta = await apiFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties`
  );
  (meta.sheets || []).forEach(s => {
    sheetIdMap[s.properties.title] = s.properties.sheetId;
  });
}

function pad2(n) { return String(n).padStart(2, '0'); }
function nowSheetFmt() {
  const d = new Date();
  return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`;
}

// ── SOURCE CHIP ───────────────────────────────────────────────────────────────

function sourceChipHTML(value, sheetRow) {
  const opt = SOURCE_OPTIONS.find(o => o.value === value);
  const icon  = opt ? opt.icon : '·';
  const label = opt ? opt.value : (value || 'Source');
  return `<span class="source-chip" onclick="event.stopPropagation();openSourceDropdown(this,${sheetRow})" title="Change source">${icon} ${esc(label)}</span>`;
}

function openSourceDropdown(chip, sheetRow) {
  document.querySelectorAll('.source-dd').forEach(d => d.remove());
  const rect = chip.getBoundingClientRect();
  const dd = document.createElement('div');
  dd.className = 'source-dd';
  dd.style.top  = `${rect.bottom + window.scrollY + 4}px`;
  dd.style.left = `${rect.left + window.scrollX}px`;
  dd.innerHTML = SOURCE_OPTIONS.map(o =>
    `<div class="source-dd-item" onclick="event.stopPropagation();selectSource(this,${sheetRow},'${o.value}')">${o.icon} ${esc(o.value)}</div>`
  ).join('');
  document.body.appendChild(dd);
  const close = e => { if (!dd.contains(e.target)) dd.remove(); };
  setTimeout(() => document.addEventListener('click', close, { once: true }), 0);
}

async function selectSource(item, sheetRow, value) {
  item.closest('.source-dd')?.remove();
  const ri = allRows.findIndex(r => r._sheetRow === sheetRow);
  if (ri === -1) return;
  allRows[ri][C.SOURCE] = value;

  const chip = document.querySelector(`[data-sheet-row="${sheetRow}"] .source-chip`)
    || document.querySelector(`.data-row .source-chip`);
  const opt   = SOURCE_OPTIONS.find(o => o.value === value);
  if (chip) chip.innerHTML = `${opt?.icon || '·'} ${esc(value)}`;

  showLoader();
  try {
    await updateCell(sheetRow, C.SOURCE + 1, value);
    hideLoader();
    showToast(`Source updated to ${value}`);
  } catch (err) {
    hideLoader();
    allRows[ri][C.SOURCE] = '';
    showToast('Failed to update source: ' + err.message, 'error');
  }
}

// ── DRAFT TAB ─────────────────────────────────────────────────────────────────

async function moveToDraft(sheetRow, uid) {
  showConfirm('Move to Draft?<br><span class="confirm-sub">Saved permanently in Draft — no auto-purge.</span>', () => _doMoveToDraft(sheetRow, uid));
}

async function _doMoveToDraft(sheetRow, uid, suppressToast = false) {
  const cfg = currentTabConfig();
  const ri  = allRows.findIndex(r => r._sheetRow === sheetRow);
  if (ri === -1) return;
  const row  = allRows[ri];
  const name = cell(row, C.NAME);

  showLoader();
  try {
    await ensureSheetIds();
    await apiFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(SHEETS.TUTORS_DRAFT)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values: [[...row]] }) }
    );
    const srcId = sheetIdMap[cfg.sheet];
    await apiFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
      { method: 'POST', body: JSON.stringify({ requests: [{ deleteDimension: { range: {
        sheetId: srcId, dimension: 'ROWS',
        startIndex: sheetRow - 1, endIndex: sheetRow
      }}}]})}
    );
    allRows.splice(ri, 1);
    allRows.forEach(r => { if (r._sheetRow > sheetRow) r._sheetRow--; });
    document.querySelectorAll('[data-sheet-row]').forEach(el => {
      const sr = parseInt(el.dataset.sheetRow);
      if (sr > sheetRow) el.dataset.sheetRow = sr - 1;
    });
    document.querySelector(`tr.data-row[data-uid="${uid}"]`)?.remove();
    document.querySelector(`tr.detail-row[data-uid="${uid}"]`)?.remove();
    _tabCounts['draft'] = (_tabCounts['draft'] || 0) + 1;
    updateStats();
    const rc = document.getElementById('result-count');
    rc.textContent = `${allRows.length} applications`;
    hideLoader();
    if (!suppressToast) showToast(`${name} moved to Draft`);
  } catch (err) {
    hideLoader();
    showToast('Failed to move to draft: ' + err.message, 'error');
  }
}

async function restoreFromDraft(sheetRow, uid) {
  const ri = allRows.findIndex(r => r._sheetRow === sheetRow);
  if (ri === -1) return;
  const row  = allRows[ri];
  const name = cell(row, C.NAME);

  showLoader();
  try {
    await ensureSheetIds();
    await apiFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(SHEETS.TUTORS_APPLIED)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values: [[...row]] }) }
    );
    const draftId = sheetIdMap[SHEETS.TUTORS_DRAFT];
    await apiFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
      { method: 'POST', body: JSON.stringify({ requests: [{ deleteDimension: { range: {
        sheetId: draftId, dimension: 'ROWS',
        startIndex: sheetRow - 1, endIndex: sheetRow
      }}}]})}
    );
    allRows.splice(ri, 1);
    allRows.forEach(r => { if (r._sheetRow > sheetRow) r._sheetRow--; });
    document.querySelector(`tr[data-uid="${uid}"]`)?.remove();
    if (typeof _tabCounts['draft'] === 'number') _tabCounts['draft'] = Math.max(0, _tabCounts['draft'] - 1);
    updateStats();
    document.getElementById('result-count').textContent = `${allRows.length} applications`;
    hideLoader();
    showToast(`${name} restored to All`);
  } catch (err) {
    hideLoader();
    showToast('Failed to restore from draft: ' + err.message, 'error');
  }
}

function appendDraftRows() {
  if (renderedCount >= filteredRows.length) return;
  const tbody = document.getElementById('table-body');
  const old = document.getElementById('scroll-sentinel');
  if (old) old.remove();

  const batch = filteredRows.slice(renderedCount, renderedCount + PAGE_SIZE);
  batch.forEach((row, bi) => {
    const fi       = renderedCount + bi;
    const sheetRow = row._sheetRow;
    const uid      = `d${fi}`;
    const name     = cell(row, C.NAME);
    const phone    = cell(row, C.PHONE);
    const location = cell(row, C.LOCATION);
    const submitted = formatDate(cell(row, C.SUBMITTED));

    const tr = document.createElement('tr');
    tr.className = 'bin-row';
    tr.dataset.uid = uid;
    tr.innerHTML = `
      <td class="td-bin-info">
        <span class="bin-name">${esc(name)}</span>
        <span class="bin-meta">${esc(phone)}${location ? ` · ${esc(location)}` : ''}</span>
        <span class="bin-sub-date">${esc(submitted)}</span>
      </td>
      <td class="td-bin-actions">
        <button class="btn-restore" onclick="event.stopPropagation();restoreFromDraft(${sheetRow},'${uid}')" title="Restore to All">
          ${RESTORE_SVG} Restore
        </button>
      </td>`;
    tbody.appendChild(tr);
  });

  renderedCount += batch.length;

  if (renderedCount < filteredRows.length) {
    const sentinel = document.createElement('tr');
    sentinel.id = 'scroll-sentinel';
    tbody.appendChild(sentinel);
    if (scrollObserver) scrollObserver.observe(sentinel);
  }
}

// ── ADD PARENT ────────────────────────────────────────────────────────────────

function openAddParentModal() {
  const m = document.getElementById('add-parent-modal');
  if (!m) return;
  m.querySelectorAll('input, textarea, select').forEach(el => { el.value = ''; });
  document.getElementById('ap-status').value = '';
  _mapsAutocomplete = null; // reset so a fresh autocomplete binds each time
  m.style.display = 'flex';
  // Defer so the input is visible when Autocomplete attaches
  setTimeout(() => _initAddressAutocomplete('ap-location'), 50);
}

function closeAddParentModal() {
  document.getElementById('add-parent-modal').style.display = 'none';
}

async function saveNewParent() {
  const get = id => (document.getElementById(id)?.value || '').trim();
  const name     = get('ap-name');
  const phone    = get('ap-phone');
  const email    = get('ap-email');
  const location = get('ap-location');
  const address  = get('ap-address');
  const student  = get('ap-student-name');
  const grade    = get('ap-student-grade');
  const subjects = get('ap-subjects');
  const notes    = get('ap-notes');
  const status   = get('ap-status');

  if (!name) { showToast('Name is required', 'error'); return; }

  const today = (() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:00`;
  })();

  // Generate parent ID
  const maxId = allRows.reduce((max, r) => {
    const id = cell(r, CP.PARENT_ID);
    const n  = parseInt((id.match(/(\d+)$/) || [])[1] || '0');
    return Math.max(max, n);
  }, 0);
  const parentId = `KB-P-${String(maxId + 1).padStart(4, '0')}`;

  // Build row matching CP schema
  const row = [];
  row[CP.PARENT_ID]       = parentId;
  row[CP.ONBOARDED_ON]    = today;
  row[CP.NAME]            = name;
  row[CP.PHONE]           = phone;
  row[CP.EMAIL]           = email;
  row[CP.LOCATION]        = location;
  row[CP.ADDRESS]         = address;
  row[CP.STUDENT_NAME]    = student;
  row[CP.STUDENT_GRADE]   = grade;
  row[CP.SUBJECTS_NEEDED] = subjects;
  row[CP.ASSIGNED_TUTOR]  = '';
  row[CP.LAST_CONTACTED]  = '';
  row[CP.CONTACTED]       = 'No';
  row[CP.NOTES]           = notes;
  row[CP.MAILED]          = 'No';
  row[CP.STATUS]          = status;

  const targetSheet = status === 'In-Loop'
    ? SHEETS.PARENTS_TO_CONTACT
    : SHEETS.PARENTS_TO_CONTACT;

  showLoader();
  try {
    await apiFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(targetSheet)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values: [row] }) }
    );
    hideLoader();
    closeAddParentModal();
    showToast(`${name} added to Parents`);
    if (currentSection === 'parents') loadApplications();
  } catch (err) {
    hideLoader();
    showToast('Failed to add parent: ' + err.message, 'error');
  }
}

// ── EDIT CARD MODAL ───────────────────────────────────────────────────────────

let _editCardSheetRow = null;
let _editCardSection  = null;
let _editCardRI       = null;
let _editCardIsNew    = false;

const TUTOR_EDIT_FIELDS = [
  { id: 'ec-name',      label: 'Name',              col: 'NAME',      type: 'text' },
  { id: 'ec-phone',     label: 'Phone',             col: 'PHONE',     type: 'tel' },
  { id: 'ec-email',     label: 'Email',             col: 'EMAIL',     type: 'email' },
  { id: 'ec-college',   label: 'College / Company', col: 'COLLEGE',   type: 'text' },
  { id: 'ec-location',  label: 'Stay Location',     col: 'LOCATION',  type: 'text' },
  { id: 'ec-student',   label: 'Student or Working',col: 'STUDENT',   type: 'select',
    opts: ['Student', 'Working'] },
  { id: 'ec-travel',    label: 'Travel Mode',       col: 'TRAVEL',    type: 'select',
    opts: ['Bike', 'Bus', 'Own vehicle', 'Public transport', 'Walk'] },
  { id: 'ec-classes',   label: 'Classes',           col: 'CLASSES',   type: 'multicheck',
    opts: ['0-5', '6-8', '8-10', 'Other'] },
  { id: 'ec-subjects',  label: 'Subjects',          col: 'SUBJECTS',  type: 'multicheck',
    opts: ['Maths', 'Science (bio,chem,phy)', 'Social', 'Other'] },
  { id: 'ec-languages', label: 'Languages',         col: 'LANGUAGES', type: 'multicheck',
    opts: ['Hindi', 'English', 'Telugu', 'French', 'German', 'Spanish', 'Other'] },
  { id: 'ec-extras',    label: 'Extra Activities',  col: 'EXTRAS',    type: 'multicheck',
    opts: ['Communication skills', 'Computer languages', 'Computer basics', 'Singing vocal', 'Dance', 'Musical instruments', 'Bhagavad gita', 'Other'] },
  { id: 'ec-timings',   label: 'Available Timings', col: 'TIMINGS',   type: 'multicheck',
    opts: ['Between 5am to 10am', 'Between 10am to 4pm', 'Between 4pm to 9pm', 'Other'] },
  { id: 'ec-pay',       label: 'Expected Pay / hr', col: 'PAY',       type: 'text', hint: 'e.g. 500-1000' },
  { id: 'ec-workhours', label: 'College / Work Timings', col: 'WORKHOURS', type: 'text' },
  { id: 'ec-open',      label: 'Open to Contact',   col: 'OPEN',      type: 'select',
    opts: ['Yes', 'No'] },
  { id: 'ec-source',    label: 'Source',            col: 'SOURCE',    type: 'radio',
    opts: ['Facebook', 'Instagram', 'Referral', 'Poster', 'Website', 'WhatsApp', 'Cold calling'] },
];

const PARENT_EDIT_FIELDS = [
  { id: 'ec-name',     label: 'Full Name',      col: 'NAME',            type: 'text' },
  { id: 'ec-phone',    label: 'Phone',          col: 'PHONE',           type: 'tel' },
  { id: 'ec-email',    label: 'Email',          col: 'EMAIL',           type: 'email' },
  { id: 'ec-location', label: 'Location',       col: 'LOCATION',        type: 'text' },
  { id: 'ec-address',  label: 'Address',        col: 'ADDRESS',         type: 'textarea' },
  { id: 'ec-student',  label: 'Student Name',   col: 'STUDENT_NAME',    type: 'text' },
  { id: 'ec-grade',    label: 'Student Grade',  col: 'STUDENT_GRADE',   type: 'select',
    opts: ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6',
           'Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12'] },
  { id: 'ec-subjects', label: 'Subjects Needed',col: 'SUBJECTS_NEEDED', type: 'text' },
  { id: 'ec-tutor',    label: 'Assigned Tutor', col: 'ASSIGNED_TUTOR',  type: 'text' },
  { id: 'ec-notes',    label: 'Notes',          col: 'NOTES',           type: 'textarea' },
];

async function _generateNextTutorId() {
  try {
    const range  = encodeURIComponent(`${SHEETS.TUTORS_APPLIED}!A:A`);
    const result = await apiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`);
    const n = (result.values || []).length; // includes header row
    return 'KB-' + String(Math.max(n, 1)).padStart(3, '0');
  } catch (_) {
    return 'KB-' + Date.now();
  }
}

function openAddTutorModal() {
  _editCardIsNew    = true;
  _editCardSection  = 'tutors';
  _editCardSheetRow = null;
  _editCardRI       = null;

  document.getElementById('edit-card-title').textContent = 'Add a Tutor';
  document.getElementById('edit-card-modal').dataset.sheetRow = '';
  document.getElementById('edit-card-modal').dataset.uid      = '';

  const body = document.getElementById('edit-card-body');
  body.innerHTML = TUTOR_EDIT_FIELDS.map(f => {
    if (f.type === 'select') {
      const opts = ['', ...f.opts].map(o =>
        `<option value="${esc(o)}">${esc(o) || '—'}</option>`
      ).join('');
      return `<label class="modal-label">${f.label}</label><select id="${f.id}" class="modal-input">${opts}</select>`;
    }
    if (f.type === 'textarea') {
      return `<label class="modal-label">${f.label}</label><textarea id="${f.id}" class="cal-desc-area" rows="2"></textarea>`;
    }
    if (f.type === 'multicheck') {
      const checkboxes = f.opts.map(o =>
        `<label class="ec-check-label"><input type="checkbox" class="ec-checkbox" data-group="${f.id}" value="${esc(o)}"> ${esc(o)}</label>`
      ).join('');
      const otherInput = `<input type="text" id="${f.id}-other" class="modal-input ec-other-input" placeholder="Other (specify)" autocomplete="off">`;
      return `<label class="modal-label">${f.label}</label><div class="ec-check-group" id="${f.id}">${checkboxes}</div>${otherInput}`;
    }
    if (f.type === 'radio') {
      const radios = f.opts.map(o =>
        `<label class="ec-check-label"><input type="radio" name="${f.id}" value="${esc(o)}"${o === 'Poster' ? ' checked' : ''}> ${esc(o)}</label>`
      ).join('');
      return `<label class="modal-label">${f.label}</label><div class="ec-check-group" id="${f.id}">${radios}</div>`;
    }
    return `<label class="modal-label">${f.label}${f.hint ? `<span class="modal-hint"> — ${f.hint}</span>` : ''}</label><input id="${f.id}" class="modal-input" type="${f.type}" value="" autocomplete="off">`;
  }).join('');

  document.getElementById('edit-card-modal').style.display = 'flex';
}

function openEditCardModal(sheetRow, uid) {
  const ri = allRows.findIndex(r => r._sheetRow === sheetRow);
  if (ri === -1) return;
  const row    = allRows[ri];
  const isTutor = currentSection === 'tutors';
  const fields  = isTutor ? TUTOR_EDIT_FIELDS : PARENT_EDIT_FIELDS;
  const schema  = isTutor ? C : CP;
  const name    = isTutor ? cell(row, C.NAME) : cell(row, CP.NAME);

  _editCardIsNew    = false;
  _editCardSheetRow = sheetRow;
  _editCardSection  = currentSection;
  _editCardRI       = ri;

  document.getElementById('edit-card-title').textContent = `Edit — ${name}`;
  document.getElementById('edit-card-modal').dataset.sheetRow = sheetRow;
  document.getElementById('edit-card-modal').dataset.uid      = uid;

  const body = document.getElementById('edit-card-body');
  body.innerHTML = fields.map(f => {
    const val = cell(row, schema[f.col]) || '';
    if (f.type === 'select') {
      const opts = ['', ...f.opts].map(o =>
        `<option value="${esc(o)}"${o === val ? ' selected' : ''}>${esc(o) || '—'}</option>`
      ).join('');
      return `<label class="modal-label">${f.label}</label><select id="${f.id}" class="modal-input">${opts}</select>`;
    }
    if (f.type === 'textarea') {
      return `<label class="modal-label">${f.label}</label><textarea id="${f.id}" class="cal-desc-area" rows="2">${esc(val)}</textarea>`;
    }
    if (f.type === 'multicheck') {
      const selected = val.split(',').map(s => s.trim()).filter(Boolean);
      const knownOpts = new Set(f.opts);
      const otherVals = selected.filter(s => !knownOpts.has(s));
      const checkboxes = f.opts.map(o =>
        `<label class="ec-check-label"><input type="checkbox" class="ec-checkbox" data-group="${f.id}" value="${esc(o)}"${selected.includes(o) ? ' checked' : ''}> ${esc(o)}</label>`
      ).join('');
      const otherInput = `<input type="text" id="${f.id}-other" class="modal-input ec-other-input" placeholder="Other (specify)" value="${esc(otherVals.join(', '))}" autocomplete="off">`;
      return `<label class="modal-label">${f.label}</label><div class="ec-check-group" id="${f.id}">${checkboxes}</div>${otherInput}`;
    }
    if (f.type === 'radio') {
      const radios = f.opts.map(o =>
        `<label class="ec-check-label"><input type="radio" name="${f.id}" value="${esc(o)}"${o === val ? ' checked' : ''}> ${esc(o)}</label>`
      ).join('');
      return `<label class="modal-label">${f.label}</label><div class="ec-check-group" id="${f.id}">${radios}</div>`;
    }
    return `<label class="modal-label">${f.label}${f.hint ? `<span class="modal-hint"> — ${f.hint}</span>` : ''}</label><input id="${f.id}" class="modal-input" type="${f.type}" value="${esc(val)}" autocomplete="off">`;
  }).join('');

  document.getElementById('edit-card-modal').style.display = 'flex';
}

function closeEditCardModal() {
  document.getElementById('edit-card-modal').style.display = 'none';
}

async function _saveNewTutor() {
  const nameVal = (document.getElementById('ec-name')?.value || '').trim();
  if (!nameVal) { showToast('Name is required', 'error'); return; }

  showLoader();
  try {
    const appId = await _generateNextTutorId();
    const submitted = nowSheetFmt();

    // Build a 31-element row (indices 0-30 matching C constants)
    const newRow = new Array(31).fill('');
    newRow[C.APP_ID]    = appId;
    newRow[C.SUBMITTED] = submitted;
    newRow[C.CONTACTED] = 'No';
    newRow[C.MAIL_SENT] = 'No';

    TUTOR_EDIT_FIELDS.forEach(f => {
      let val;
      if (f.type === 'multicheck') {
        const checked = [...document.querySelectorAll(`.ec-checkbox[data-group="${f.id}"]:checked`)].map(cb => cb.value);
        const otherEl = document.getElementById(`${f.id}-other`);
        const otherRaw = otherEl ? otherEl.value.trim() : '';
        const otherVals = otherRaw ? otherRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
        val = [...checked.filter(v => v !== 'Other'), ...otherVals].join(', ');
        if (checked.includes('Other') && otherVals.length === 0) val = [...checked].join(', ');
      } else if (f.type === 'radio') {
        const checked = document.querySelector(`input[name="${f.id}"]:checked`);
        val = checked ? checked.value : '';
      } else {
        const el = document.getElementById(f.id);
        if (!el) return;
        val = el.value.trim ? el.value.trim() : el.value;
      }
      newRow[C[f.col]] = val || '';
    });

    const sheet = encodeURIComponent(`${SHEETS.TUTORS_APPLIED}!A1`);
    await apiFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${sheet}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values: [newRow] }) }
    );

    hideLoader();
    closeEditCardModal();
    showToast(`${nameVal} added`);
    // Reload to get correct sheetRow + fresh data
    loadApplications();
  } catch (err) {
    hideLoader();
    showToast('Failed to add: ' + err.message, 'error');
  }
}

async function saveEditCard() {
  if (_editCardIsNew) { await _saveNewTutor(); return; }
  const ri = _editCardRI;
  if (ri === null || ri === -1) return;
  const isTutor = _editCardSection === 'tutors';
  const fields  = isTutor ? TUTOR_EDIT_FIELDS : PARENT_EDIT_FIELDS;
  const schema  = isTutor ? C : CP;
  const row     = allRows[ri];

  const updates = [];
  fields.forEach(f => {
    let newVal;
    if (f.type === 'multicheck') {
      const checked = [...document.querySelectorAll(`.ec-checkbox[data-group="${f.id}"]:checked`)].map(cb => cb.value);
      const otherEl = document.getElementById(`${f.id}-other`);
      const otherRaw = otherEl ? otherEl.value.trim() : '';
      const otherVals = otherRaw ? otherRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
      newVal = [...checked.filter(v => v !== 'Other'), ...otherVals].join(', ');
      if (checked.includes('Other') && otherVals.length === 0) newVal = [...checked].join(', ');
    } else if (f.type === 'radio') {
      const checked = document.querySelector(`input[name="${f.id}"]:checked`);
      newVal = checked ? checked.value : '';
    } else {
      const el = document.getElementById(f.id);
      if (!el) return;
      newVal = (f.type === 'select' || f.type === 'textarea') ? el.value : el.value.trim();
    }
    const oldVal = cell(row, schema[f.col]) || '';
    if (newVal !== oldVal) updates.push({ col: schema[f.col], val: newVal });
  });

  if (!updates.length) { closeEditCardModal(); return; }

  showLoader();
  try {
    await Promise.all(updates.map(u => updateCell(_editCardSheetRow, u.col + 1, u.val)));
    updates.forEach(u => { allRows[ri][u.col] = u.val; });
    hideLoader();
    closeEditCardModal();
    showToast('Changes saved');
    // Re-render the row by refreshing filters
    applyFilters();
  } catch (err) {
    hideLoader();
    showToast('Failed to save: ' + err.message, 'error');
  }
}

async function trashCard(sheetRow, uid) {
  showConfirm('Move to bin?<br><span class="confirm-sub">Saved in Bin for 30 days, then permanently removed.</span>', () => _doTrashCard(sheetRow, uid));
}
async function _doTrashCard(sheetRow, uid) {
  const cfg = currentTabConfig();
  const ri  = allRows.findIndex(r => r._sheetRow === sheetRow);
  if (ri === -1) return;
  const row = allRows[ri];

  const rowCopy = [...row];
  const deletedAt = nowSheetFmt();
  if (currentSection === 'tutors') {
    rowCopy[C.DELETED_AT]    = deletedAt;
    rowCopy[C.ORIGINAL_TAB]  = cfg.sheet;
  } else {
    rowCopy[CP.DELETED_AT]   = deletedAt;
    rowCopy[CP.ORIGINAL_TAB] = cfg.sheet;
  }

  const binSheet = currentSection === 'tutors' ? SHEETS.TUTORS_BIN : SHEETS.PARENTS_BIN;
  const _trashName = currentSection === 'tutors' ? cell(row, C.NAME) : cell(row, CP.NAME);

  showLoader();
  try {
    await ensureSheetIds();
    await apiFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(binSheet)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values: [rowCopy] }) }
    );
    const srcId = sheetIdMap[cfg.sheet];
    await apiFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
      { method: 'POST', body: JSON.stringify({ requests: [{ deleteDimension: { range: {
        sheetId: srcId, dimension: 'ROWS',
        startIndex: sheetRow - 1, endIndex: sheetRow
      }}}]})}
    );
    allRows.splice(ri, 1);
    allRows.forEach(r => { if (r._sheetRow > sheetRow) r._sheetRow--; });
    document.querySelectorAll('[data-sheet-row]').forEach(el => {
      const sr = parseInt(el.dataset.sheetRow);
      if (sr > sheetRow) el.dataset.sheetRow = sr - 1;
    });
    document.querySelector(`tr.data-row[data-uid="${uid}"]`)?.remove();
    document.querySelector(`tr.detail-row[data-uid="${uid}"]`)?.remove();
    if (typeof _tabCounts['bin'] === 'number') _tabCounts['bin']++;
    updateStats();
    const rc = document.getElementById('result-count');
    const label = currentSection === 'parents' ? 'contacts' : 'applications';
    rc.textContent = `${allRows.length} ${label}`;
    hideLoader();
    showToast(`Moved ${_trashName} to Bin`);
  } catch (err) {
    hideLoader();
    showToast('Failed to move to bin: ' + err.message, 'error');
  }
}

async function restoreCard(sheetRow, uid) {
  const ri = allRows.findIndex(r => r._sheetRow === sheetRow);
  if (ri === -1) return;
  const row = allRows[ri];

  const destSheet = currentSection === 'tutors'
    ? (cell(row, C.ORIGINAL_TAB)  || SHEETS.TUTORS_APPLIED)
    : (cell(row, CP.ORIGINAL_TAB) || SHEETS.PARENTS_TO_CONTACT);

  // Bin and Applied have different column layouts at indices 28-29.
  // Applied: ..., SCHEDULED_PARENT(28), _UNUSED(29), SOURCE(30)
  // Bin:     ..., DELETED_AT(28),       ORIGINAL_TAB(29), SOURCE(30)
  // _doTrashCard overwrites 28+29 with DELETED_AT/ORIGINAL_TAB; SOURCE stays at 30 in both.
  let rowCopy;
  if (currentSection === 'tutors') {
    rowCopy = row.slice(0, 28);                  // cols 0-27 identical in both sheets
    rowCopy[28] = '';                            // SCHEDULED_PARENT: lost when trashed, restore empty
    rowCopy[29] = '';                            // unused col: restore empty
    rowCopy[30] = row[30] || '';                 // SOURCE: same index 30 in both Bin and Applied
    rowCopy.length = 31;                         // Applied row is 31 columns (0-30)
  } else {
    rowCopy = row.slice(0, CP.DELETED_AT);       // cols 0-15 identical
    rowCopy.length = CP.DELETED_AT;              // hard-cap to parents column count
  }

  showLoader();
  try {
    await ensureSheetIds();
    await apiFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(destSheet)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values: [rowCopy] }) }
    );
    const binSheet = currentSection === 'tutors' ? SHEETS.TUTORS_BIN : SHEETS.PARENTS_BIN;
    const binId = sheetIdMap[binSheet];
    await apiFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
      { method: 'POST', body: JSON.stringify({ requests: [{ deleteDimension: { range: {
        sheetId: binId, dimension: 'ROWS',
        startIndex: sheetRow - 1, endIndex: sheetRow
      }}}]})}
    );
    allRows.splice(ri, 1);
    allRows.forEach(r => { if (r._sheetRow > sheetRow) r._sheetRow--; });
    document.querySelector(`tr[data-uid="${uid}"]`)?.remove();
    if (typeof _tabCounts['bin'] === 'number') _tabCounts['bin'] = Math.max(0, _tabCounts['bin'] - 1);
    updateStats();
    const label = currentSection === 'parents' ? 'contacts' : 'applications';
    document.getElementById('result-count').textContent = `${allRows.length} ${label}`;
    const _restoreName = currentSection === 'tutors' ? cell(row, C.NAME) : cell(row, CP.NAME);
    showToast(`${_restoreName} restored`);
    hideLoader();
  } catch (err) {
    hideLoader();
    showError('Failed to restore: ' + err.message);
  }
}

// ── MOVE BETWEEN TABS ─────────────────────────────────────────────────────────
async function moveCard(sheetRow, uid, destSheetName) {
  const cfg = currentTabConfig();
  const ri  = allRows.findIndex(r => r._sheetRow === sheetRow);
  if (ri === -1) return;
  const rowCopy = [...allRows[ri]];
  showLoader();
  try {
    await ensureSheetIds();
    await apiFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(destSheetName)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values: [rowCopy] }) }
    );
    const srcId = sheetIdMap[cfg.sheet];
    await apiFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
      { method: 'POST', body: JSON.stringify({ requests: [{ deleteDimension: { range: {
        sheetId: srcId, dimension: 'ROWS',
        startIndex: sheetRow - 1, endIndex: sheetRow
      }}}]})}
    );
    allRows.splice(ri, 1);
    allRows.forEach(r => { if (r._sheetRow > sheetRow) r._sheetRow--; });
    document.querySelector(`tr.data-row[data-uid="${uid}"]`)?.remove();
    document.querySelector(`tr.detail-row[data-uid="${uid}"]`)?.remove();
    updateStats();
    const rc = document.getElementById('result-count');
    const label = currentSection === 'parents' ? 'contacts' : 'applications';
    rc.textContent = `${allRows.length} ${label}`;
    hideLoader();
  } catch (err) {
    hideLoader();
    showError('Failed to move: ' + err.message);
  }
}

let _postScheduleWAFn = null;
function _firePostScheduleWA() {
  const fn = _postScheduleWAFn;
  _postScheduleWAFn = null;
  fn?.();
}

function showPostScheduleMoveModal(sheetRow, uid, waFn) {
  // Sub-tabs (In-Loop, Onboarded) and Bin: skip the prompt, go straight to WA share
  if (currentTabKey !== 'all') {
    waFn?.();
    return;
  }

  // All tab: simple Yes/No — "Add to In-Loop?"
  _postScheduleWAFn = waFn;
  const modal = document.getElementById('move-modal');
  modal.querySelector('.move-sheet-title').innerHTML = 'Mark as Contacted and Add to <strong style="white-space:nowrap">In-Loop?</strong>';
  document.getElementById('move-options').innerHTML =
    `<button class="btn-move-opt" onclick="closeMoveModal();updateStatus(${sheetRow},'${uid}','In-Loop');_firePostScheduleWA()">Yes, add to In-Loop</button>` +
    `<button class="btn-move-opt btn-move-keep" onclick="closeMoveModal();_firePostScheduleWA()">No, stay in All</button>`;
  const cancelBtn = modal.querySelector('.btn-move-cancel');
  cancelBtn.onclick = () => { closeMoveModal(); _firePostScheduleWA(); };
  modal.onclick = e => { if (e.target === modal) { closeMoveModal(); _firePostScheduleWA(); } };
  modal.style.display = 'flex';
}

async function updateStatus(sheetRow, uid, status, { suppressToast = false } = {}) {
  const ri  = allRows.findIndex(r => r._sheetRow === sheetRow);
  if (ri === -1) return;
  const col = currentSection === 'tutors' ? C.STATUS : CP.STATUS;
  showLoader();
  try {
    await updateCell(sheetRow, col + 1, status);
    allRows[ri][col] = status;

    const nameCol = currentSection === 'tutors' ? C.NAME : CP.NAME;
    const personName = cell(allRows[ri], nameCol);
    const cfg = currentTabConfig();
    if (cfg.statusFilter) {
      // On a sub-tab: card no longer matches — remove from view
      allRows.splice(ri, 1);
      document.querySelector(`tr.data-row[data-uid="${uid}"]`)?.remove();
      document.querySelector(`tr.detail-row[data-uid="${uid}"]`)?.remove();
      updateStats();
      const label = currentSection === 'parents' ? 'contacts' : 'applications';
      document.getElementById('result-count').textContent = `${allRows.length} ${label}`;
      if (!suppressToast) {
        const toastMsg = status
          ? `${personName} moved to ${status}`
          : `${personName} taken out of ${cfg.label}`;
        showToast(toastMsg);
      }
    } else {
      // On All tab: re-render the status badge in this card
      const badge = document.querySelector(`.status-badge[data-uid="${uid}"]`);
      if (badge) {
        badge.textContent = status;
        badge.className   = `status-badge${status ? ` badge-${status.toLowerCase().replace('-','').replace(' ','_')}` : ' badge-hidden'}`;
      }
      if (!suppressToast && status) showToast(`${personName} added to ${status}`);
    }
    hideLoader();
  } catch (err) {
    hideLoader();
    showError('Failed to update status: ' + err.message);
  }
}

function showMoveModal(sheetRow, uid) {
  _postScheduleWAFn = null;
  const cfg   = currentTabConfig();
  const modal = document.getElementById('move-modal');
  const cancelBtn = modal.querySelector('.btn-move-cancel');
  cancelBtn.onclick = closeMoveModal;
  modal.onclick = e => { if (e.target === modal) closeMoveModal(); };

  let title, optsHTML;
  if (cfg.statusFilter) {
    // In-Loop or Onboarded tab — offer removal only
    title = `Remove from ${cfg.label}`;
    optsHTML = `<button class="btn-move-opt" onclick="closeMoveModal();updateStatus(${sheetRow},'${uid}','')">Remove from ${cfg.label}</button>`;
  } else if (!cfg.isBin && !cfg.isDraft) {
    // All tab — offer "Add to" sub-tabs + Draft (tutors only)
    title = 'Add to…';
    const subTabs = SECTION_TABS[currentSection].filter(t => t.statusFilter);
    optsHTML = subTabs.map(t =>
      `<button class="btn-move-opt" onclick="closeMoveModal();updateStatus(${sheetRow},'${uid}','${t.statusFilter}')">${t.label}</button>`
    ).join('');
    if (currentSection === 'tutors') {
      optsHTML += `<button class="btn-move-opt btn-move-draft" onclick="closeMoveModal();moveToDraft(${sheetRow},'${uid}')">Draft</button>`;
    }
  } else {
    // Bin — no move-modal (handled elsewhere)
    return;
  }

  modal.querySelector('.move-sheet-title').textContent = title;
  document.getElementById('move-options').innerHTML = optsHTML;
  modal.style.display = 'flex';
}

function closeMoveModal() {
  document.getElementById('move-modal').style.display = 'none';
}

// ── COMMUNICATION TAP → CONTACTED + IN-LOOP PROMPT ────────────────────────────
let _inLoopTargetRow = null;
let _inLoopTargetUid = null;

function showInLoopModal(sheetRow, uid, name) {
  _inLoopTargetRow = sheetRow;
  _inLoopTargetUid = uid;
  document.getElementById('inloop-modal-name').textContent = name;
  document.getElementById('inloop-modal').style.display = 'flex';
}

function closeInLoopModal() {
  document.getElementById('inloop-modal').style.display = 'none';
  _inLoopTargetRow = null;
  _inLoopTargetUid = null;
}

async function confirmInLoop() {
  const sheetRow = _inLoopTargetRow;
  const uid      = _inLoopTargetUid;
  closeInLoopModal();
  if (sheetRow == null) return;

  const ri = allRows.findIndex(r => r._sheetRow === sheetRow);
  if (ri === -1) return;

  allRows[ri][C.STATUS] = 'In-Loop';
  const badge = document.querySelector(`tr.data-row[data-uid="${uid}"] .status-badge`);
  if (badge) { badge.textContent = 'In-Loop'; badge.className = 'status-badge badge-inloop'; }
  updateStats();

  try {
    await updateCell(sheetRow, C.STATUS + 1, 'In-Loop');
    showToast(`${allRows[ri][C.NAME] || ''} added to In-Loop`);
  } catch (err) {
    allRows[ri][C.STATUS] = '';
    if (badge) { badge.textContent = ''; badge.className = 'status-badge badge-hidden'; }
    showToast('Failed to update status: ' + err.message, 'error');
  }
}

async function handleCommunicationTap(sheetRow, uid) {
  const ri = allRows.findIndex(r => r._sheetRow === sheetRow);
  if (ri === -1) return;

  const name        = cell(allRows[ri], C.NAME);
  const alreadyLoop = (cell(allRows[ri], C.STATUS) || '') === 'In-Loop';

  // Mark Contacted = Yes if not already
  if (cell(allRows[ri], C.CONTACTED) !== 'Yes') {
    allRows[ri][C.CONTACTED] = 'Yes';
    const pill = document.querySelector(`.pill-toggle[data-sheet-row="${sheetRow}"][data-col="${C.CONTACTED + 1}"]`);
    if (pill) { pill.className = 'pill-toggle yes'; pill.dataset.current = 'Yes'; }
    updateCell(sheetRow, C.CONTACTED + 1, 'Yes').catch(err => {
      allRows[ri][C.CONTACTED] = 'No';
      if (pill) { pill.className = 'pill-toggle no'; pill.dataset.current = 'No'; }
      showToast('Failed to mark contacted: ' + err.message, 'error');
    });
  }

  if (!alreadyLoop) showInLoopModal(sheetRow, uid, name);
}

function handleCallTap(sheetRow, uid) {
  handleCommunicationTap(sheetRow, uid);
}

function daysLeft(deletedAtStr) {
  const d    = parseDate(deletedAtStr);
  if (!d.getTime()) return 30;
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  return Math.max(0, 30 - diff);
}

function appendBinRows() {
  if (renderedCount >= filteredRows.length) return;
  const tbody = document.getElementById('table-body');
  const old = document.getElementById('scroll-sentinel');
  if (old) old.remove();

  const batch = filteredRows.slice(renderedCount, renderedCount + PAGE_SIZE);
  batch.forEach((row, bi) => {
    const fi       = renderedCount + bi;
    const sheetRow = row._sheetRow;
    const uid      = `r${fi}`;
    const isTutor  = currentSection === 'tutors';
    const name     = isTutor ? cell(row, C.NAME)  : cell(row, CP.NAME);
    const phone    = isTutor ? cell(row, C.PHONE) : cell(row, CP.PHONE);
    const deletedAt = isTutor ? cell(row, C.DELETED_AT) : cell(row, CP.DELETED_AT);
    const origTab   = isTutor ? cell(row, C.ORIGINAL_TAB) : cell(row, CP.ORIGINAL_TAB);
    const left     = daysLeft(deletedAt);
    const leftCls  = left <= 7 ? 'days-left danger' : 'days-left';

    const tr = document.createElement('tr');
    tr.className = 'bin-row';
    tr.dataset.uid = uid;
    tr.innerHTML = `
      <td class="td-bin-info">
        <span class="bin-name">${esc(name)}</span>
        <span class="bin-meta">${esc(phone)}${origTab ? ` · from ${esc((origTab.match(/\((.+)\)/) || ['',''])[1] || origTab)}` : ''}</span>
        <span class="${leftCls}">${left}d left</span>
      </td>
      <td class="td-bin-actions">
        <button class="btn-restore" onclick="event.stopPropagation();restoreCard(${sheetRow},'${uid}')" title="Restore">
          ${RESTORE_SVG} Restore
        </button>
      </td>`;
    tbody.appendChild(tr);
  });

  renderedCount += batch.length;

  if (renderedCount < filteredRows.length) {
    const sentinel = document.createElement('tr');
    sentinel.id = 'scroll-sentinel';
    tbody.appendChild(sentinel);
    if (scrollObserver) scrollObserver.observe(sentinel);
  }
}

// ── API HELPERS ───────────────────────────────────────────────────────────────
async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type':  'application/json',
      ...(opts.headers || {})
    }
  });
  if (!res.ok) {
    const text = await res.text();
    // Stored session token may lack the Sheets scope (user unchecked it during
    // a previous login). Clear the session so the next sign-in re-requests it.
    if (res.status === 403 && text.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
      clearSession();
      showError(
        'This session is missing Sheets permission. ' +
        'Please sign in again and check the "Google Sheets" checkbox.'
      );
      setTimeout(signOut, 1500);
      throw new Error('Insufficient scope');
    }
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function updateCell(sheetRow, colNum, value) {
  if (DEV_MODE) return; // no real sheet writes in dev
  const col   = numToCol(colNum - 1);
  const sheet = currentTabConfig().sheet;
  const range = encodeURIComponent(`${sheet}!${col}${sheetRow}`);
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?valueInputOption=RAW`;
  await apiFetch(url, { method: 'PUT', body: JSON.stringify({ values: [[value]] }) });
}

function numToCol(n) {
  n++;
  let s = '';
  while (n > 0) {
    s = String.fromCharCode(64 + ((n - 1) % 26 + 1)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// ── UTILS ─────────────────────────────────────────────────────────────────────
function cell(row, idx) {
  const v = String(row[idx] || '').trim();
  return /^#[A-Z\/0-9]+[!?]$/.test(v) ? '' : v;
}

// Parse "DD/MM/YYYY HH:MM:SS" (Google Sheets locale) → Date object
function parseDate(str) {
  if (!str) return new Date(0);
  // "DD/MM/YYYY HH:MM:SS" — Google Sheets locale
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1], +(m[4]||0), +(m[5]||0), +(m[6]||0));
  const d = new Date(str);
  return isNaN(d) ? new Date(0) : d;
}

function formatTime(d) {
  let h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')}${ampm}`;
}

function formatDate(str) {
  if (!str) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = parseDate(str);
  if (!d.getTime()) return str;

  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day   = new Date(d.getFullYear(),   d.getMonth(),   d.getDate());
  const diff  = today - day;
  const time  = formatTime(d);

  if (diff === 0)        return `Today, ${time}`;
  if (diff === 86400000) return `Yesterday, ${time}`;
  return `${d.getDate()} ${months[d.getMonth()]}, ${d.getFullYear()}, ${time}`;
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let _loaderDepth = 0;
function showLoader() {
  if (++_loaderDepth === 1) document.getElementById('page-loader').classList.add('visible');
}
function hideLoader() {
  if (--_loaderDepth <= 0) {
    _loaderDepth = 0;
    document.getElementById('page-loader').classList.remove('visible');
  }
}

function setTableMsg(msg) {
  hideLoader();
  document.getElementById('table-body').innerHTML =
    `<tr><td colspan="8" class="state-msg">${msg}</td></tr>`;
}

function showToast(message, type = 'default', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast' + (type === 'error' ? ' toast-error' : '');
  toast.innerHTML = `<span class="toast-msg">${esc(message)}</span><button class="toast-close" aria-label="Close">&#x2715;</button>`;
  container.appendChild(toast);
  let timer = setTimeout(() => {
    toast.classList.add('toast-fade');
    setTimeout(() => toast.remove(), 350);
  }, duration);
  toast.querySelector('.toast-close').onclick = () => {
    clearTimeout(timer);
    toast.remove();
  };
}

function showError(msg) {
  showToast(msg, 'error');
}

function hideError() {}

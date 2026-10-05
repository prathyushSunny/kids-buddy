// ── AUTH ──────────────────────────────────────────────────────────────────────
export const CLIENT_ID = '993142394562-4lrr9i1rvgu0d9kpou03tu6h6pm3jlhm.apps.googleusercontent.com';

export const ALLOWED_EMAILS = [
  'kids.buddy.hometution@gmail.com',
  's.kumari.shirisha@gmail.com',
  'prathyushsunny@gmail.com',
];

export const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

// ── SPREADSHEET ───────────────────────────────────────────────────────────────
const _IDS = {
  STAGING: '1vnQWp10y3hzudckvRPGYVpnr6TS0rnXE6ytunrNI9-U',
  PROD:    '1geFgIn4mAlObjLG0GJhuZZdmrNVD4AZP32ccCYVuZOA',
};
export const SPREADSHEET_ID = _IDS.PROD; // <<ENV>>

export const SHEETS = {
  TUTORS_APPLIED:     'Tutors (Applied)',
  TUTORS_IN_LOOP:     'Tutors (In-Loop)',
  TUTORS_ONBOARDED:   'Tutors (Onboarded)',
  TUTORS_DRAFT:       'Tutors (Draft)',
  TUTORS_BIN:         'Tutors (Bin)',
  PARENTS_TO_CONTACT: 'Parents (To-Contact)',
  PARENTS_IN_LOOP:    'Parents (In-Loop)',
  PARENTS_ONBOARDED:  'Parents (Onboarded)',
  PARENTS_DRAFT:      'Parents (Draft)',
  PARENTS_BIN:        'Parents (Bin)',
  NOTES:              'Notes',
};

// Canonical tutor location options (used in filter + form dropdown)
export const SOURCE_LOCATIONS = [
  'Financial District',
  'Gachibowli',
  'Gandipet',
  'Gowlidoddy',
  'Kokapet',
  'Manikonda',
  'Nallagandla',
  'Nanakramguda',
  'Narsingi',
  'Tellapur',
];

// 0-based column indices — Notes
export const CN = {
  NOTE_ID: 0, CREATED_AT: 1, UPDATED_AT: 2, AUTHOR: 3,
  TITLE: 4, ITEMS: 5, PINNED: 6, STATUS: 7,
};

// 0-based column indices — Tutors
export const C = {
  APP_ID:0, SUBMITTED:1, EMAIL:2, NAME:3, PHONE:4,
  STUDENT:5, COLLEGE:6, LOCATION:7, TRAVEL:8,
  CLASSES:9, SUBJECTS:10, LANGUAGES:11, EXTRAS:12,
  TIMINGS:13, PAY:14, REFERRAL:15, OPEN:16, WORKHOURS:17,
  CONTACTED:18, NOTES:19, MAIL_SENT:20,
  LAST_CALLED:21, INTERVIEW_STATUS:22, INTERVIEW_AT:23,
  CURRENT_STUDENTS:24, RATING:25,
  CALENDAR_EVENT_ID:26,
  STATUS:27,
  SCHEDULED_PARENT:28,
  MEET_LINK:29,
  SOURCE:30,
  // index 31 is synthetic (sheet row number, set in thunk)
  SCHEDULES:32,  // column AG — JSON array of all schedule entries
  DELETED_AT:28, ORIGINAL_TAB:29,
};

// 0-based column indices — Parents
export const CP = {
  PARENT_ID:0, ONBOARDED_ON:1, NAME:2, PHONE:3, EMAIL:4,
  LOCATION:5, ADDRESS:6, STUDENT_NAME:7, STUDENT_GRADE:8,
  SUBJECTS_NEEDED:9, ASSIGNED_TUTOR:10, LAST_CONTACTED:11,
  CONTACTED:12, NOTES:13, MAILED:14,
  STATUS:15,
  DELETED_AT:16, ORIGINAL_TAB:17,
};

export const MAPS_API_KEY = ''; // <<MAPS_API_KEY>>

export const PAGE_SIZE = 25;

// ── SECTION TABS ──────────────────────────────────────────────────────────────
export const SECTION_TABS = {
  tutors: [
    { key: 'all',       label: 'All',       sheet: SHEETS.TUTORS_APPLIED },
    { key: 'in_loop',   label: 'In-Loop',   sheet: SHEETS.TUTORS_APPLIED, statusFilter: 'In-Loop' },
    { key: 'onboarded', label: 'Onboarded', sheet: SHEETS.TUTORS_APPLIED, statusFilter: 'Onboarded' },
    { key: 'draft',     label: 'Draft',     sheet: SHEETS.TUTORS_DRAFT,   isDraft: true },
    { key: 'bin',       label: 'Bin',       sheet: SHEETS.TUTORS_BIN,     isBin: true },
  ],
  parents: [
    { key: 'all',       label: 'All',       sheet: SHEETS.PARENTS_TO_CONTACT },
    { key: 'in_loop',   label: 'In-Loop',   sheet: SHEETS.PARENTS_TO_CONTACT, statusFilter: 'In-Loop' },
    { key: 'onboarded', label: 'Onboarded', sheet: SHEETS.PARENTS_TO_CONTACT, statusFilter: 'Onboarded' },
    { key: 'draft',     label: 'Draft',     sheet: SHEETS.PARENTS_DRAFT,      isDraft: true },
    { key: 'bin',       label: 'Bin',       sheet: SHEETS.PARENTS_BIN,        isBin: true },
  ],
};

export const SOURCE_OPTIONS = [
  { value: 'Cold calling', icon: '📞' },
  { value: 'Facebook',     icon: '📘' },
  { value: 'Instagram',    icon: '📸' },
  { value: 'Poster',       icon: '🗞️' },
  { value: 'Referral',     icon: '👥' },
  { value: 'Website',      icon: '🌐' },
  { value: 'WhatsApp',     icon: '💬' },
];

export const TUTOR_EDIT_FIELDS = [
  { id: 'ec-name',      label: 'Name',                   col: 'NAME',      type: 'text' },
  { id: 'ec-phone',     label: 'Phone',                  col: 'PHONE',     type: 'tel' },
  { id: 'ec-email',     label: 'Email',                  col: 'EMAIL',     type: 'email' },
  { id: 'ec-college',   label: 'College / Company',      col: 'COLLEGE',   type: 'text' },
  { id: 'ec-location',  label: 'Stay Location',          col: 'LOCATION',  type: 'select', opts: SOURCE_LOCATIONS },
  { id: 'ec-student',   label: 'Student or Working',     col: 'STUDENT',   type: 'select', opts: ['Student', 'Working'] },
  { id: 'ec-travel',    label: 'Travel Mode',            col: 'TRAVEL',    type: 'select', opts: ['Bike', 'Bus', 'Own vehicle', 'Public transport', 'Walk'] },
  { id: 'ec-classes',   label: 'Classes',                col: 'CLASSES',   type: 'multicheck', opts: ['0-5', '6-8', '8-10', 'Other'] },
  { id: 'ec-subjects',  label: 'Subjects',               col: 'SUBJECTS',  type: 'multicheck', opts: ['Maths', 'Science (bio,chem,phy)', 'Social', 'Other'] },
  { id: 'ec-languages', label: 'Languages',              col: 'LANGUAGES', type: 'multicheck', opts: ['Hindi', 'English', 'Telugu', 'French', 'German', 'Spanish', 'Other'] },
  { id: 'ec-extras',    label: 'Extra Activities',       col: 'EXTRAS',    type: 'multicheck', opts: ['Communication skills', 'Computer languages', 'Computer basics', 'Singing vocal', 'Dance', 'Musical instruments', 'Bhagavad gita', 'Other'] },
  { id: 'ec-timings',   label: 'Available Timings',      col: 'TIMINGS',   type: 'multicheck', opts: ['Between 5am to 10am', 'Between 10am to 4pm', 'Between 4pm to 9pm', 'Other'] },
  { id: 'ec-pay',       label: 'Expected Pay / hr',      col: 'PAY',       type: 'text', hint: 'e.g. 500-1000' },
  { id: 'ec-workhours', label: 'College / Work Timings', col: 'WORKHOURS', type: 'text' },
  { id: 'ec-open',      label: 'Open to Contact',        col: 'OPEN',      type: 'select', opts: ['Yes', 'No'] },
  { id: 'ec-source',    label: 'Source',                 col: 'SOURCE',    type: 'radio', opts: ['Facebook', 'Instagram', 'Referral', 'Poster', 'Website', 'WhatsApp', 'Cold calling'] },
];

export const PARENT_EDIT_FIELDS = [
  { id: 'ec-name',     label: 'Full Name',       col: 'NAME',            type: 'text' },
  { id: 'ec-phone',    label: 'Phone',           col: 'PHONE',           type: 'tel' },
  { id: 'ec-email',    label: 'Email',           col: 'EMAIL',           type: 'email' },
  { id: 'ec-subjects', label: 'Subjects Needed', col: 'SUBJECTS_NEEDED', type: 'multicheck', opts: ['Maths', 'Science (bio,chem,phy)', 'Social', 'English', 'Hindi', 'Telugu', 'Computer', 'Other'] },
  { id: 'ec-grade',    label: 'Student Grade',   col: 'STUDENT_GRADE',   type: 'select', opts: ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12'] },
  { id: 'ec-student',  label: 'Student Name',    col: 'STUDENT_NAME',    type: 'text' },
  { id: 'ec-location', label: 'Location',        col: 'LOCATION',        type: 'text' },
  { id: 'ec-address',  label: 'Address',         col: 'ADDRESS',         type: 'textarea' },
  { id: 'ec-tutor',    label: 'Assigned Tutor',  col: 'ASSIGNED_TUTOR',  type: 'text' },
  { id: 'ec-notes',    label: 'Notes',           col: 'NOTES',           type: 'mic-textarea' },
];

// DEV_MODE — activate with ?dev in URL (no real sheet writes)
export const DEV_MODE = new URLSearchParams(
  typeof location !== 'undefined' ? location.search : ''
).has('dev');

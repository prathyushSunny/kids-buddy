// ── AUTH ──────────────────────────────────────────────────────────────────────
const CLIENT_ID = '993142394562-4lrr9i1rvgu0d9kpou03tu6h6pm3jlhm.apps.googleusercontent.com';

const ALLOWED_EMAILS = [
  'kids.buddy.hometution@gmail.com',
  's.kumari.shirisha@gmail.com'
];

// ── SPREADSHEET ───────────────────────────────────────────────────────────────
const SPREADSHEET_ID = '1geFgIn4mAlObjLG0GJhuZZdmrNVD4AZP32ccCYVuZOA';

const SHEETS = {
  TUTORS_APPLIED:     'Tutors (Applied)',
  TUTORS_IN_LOOP:     'Tutors (In-Loop)',
  TUTORS_ONBOARDED:   'Tutors (Onboarded)',
  TUTORS_BIN:         'Tutors (Bin)',
  PARENTS_TO_CONTACT: 'Parents (To-Contact)',
  PARENTS_IN_LOOP:    'Parents (In-Loop)',
  PARENTS_ONBOARDED:  'Parents (Onboarded)',
  PARENTS_BIN:        'Parents (Bin)',
};

// 0-based column indices — Tutors tabs (Applied / In-Loop / Onboarded)
const C = {
  APP_ID:0, SUBMITTED:1, EMAIL:2, NAME:3, PHONE:4,
  STUDENT:5, COLLEGE:6, LOCATION:7, TRAVEL:8,
  CLASSES:9, SUBJECTS:10, LANGUAGES:11, EXTRAS:12,
  TIMINGS:13, PAY:14, REFERRAL:15, OPEN:16, WORKHOURS:17,
  CONTACTED:18, NOTES:19, MAIL_SENT:20,
  LAST_CALLED:21, INTERVIEW_STATUS:22, INTERVIEW_AT:23,
  CURRENT_STUDENTS:24, RATING:25,
  // Bin-only columns
  DELETED_AT:26, ORIGINAL_TAB:27
};

// 0-based column indices — Parents tabs (To-Contact / In-Loop / Onboarded)
const CP = {
  PARENT_ID:0, ONBOARDED_ON:1, NAME:2, PHONE:3, EMAIL:4,
  LOCATION:5, ADDRESS:6, STUDENT_NAME:7, STUDENT_GRADE:8,
  SUBJECTS_NEEDED:9, ASSIGNED_TUTOR:10, LAST_CONTACTED:11,
  CONTACTED:12, NOTES:13, MAILED:14,
  // Bin-only columns
  DELETED_AT:15, ORIGINAL_TAB:16
};

// ── PAGINATION ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 25;

// ── AUTH ──────────────────────────────────────────────────────────────────────
const CLIENT_ID = '993142394562-4lrr9i1rvgu0d9kpou03tu6h6pm3jlhm.apps.googleusercontent.com';

const ALLOWED_EMAILS = [
  'kids.buddy.hometution@gmail.com',
  's.kumari.shirisha@gmail.com'
];

// ── SPREADSHEET ───────────────────────────────────────────────────────────────
const SPREADSHEET_ID = '1geFgIn4mAlObjLG0GJhuZZdmrNVD4AZP32ccCYVuZOA';

const SHEETS = {
  TUTORS_APPLIED:    'Tutors (Applied)',
  TUTORS_IN_LOOP:    'Tutors (In-Loop)',
  TUTORS_ONBOARDED:  'Tutors (Onboarded)',
  TUTORS_BIN:        'Tutors (Bin)',
  PARENTS_IN_LOOP:   'Parents (In-Loop)',
  PARENTS_ONBOARDED: 'Parents (Onboarded)',
};

// 0-based column indices for the Tutors sheets
const C = {
  APP_ID:0, SUBMITTED:1, EMAIL:2, NAME:3, PHONE:4,
  STUDENT:5, COLLEGE:6, LOCATION:7, TRAVEL:8,
  CLASSES:9, SUBJECTS:10, LANGUAGES:11, EXTRAS:12,
  TIMINGS:13, PAY:14, REFERRAL:15, OPEN:16, WORKHOURS:17,
  CONTACTED:18, NOTES:19, MAIL_SENT:20
};

// ── PAGINATION ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 25;

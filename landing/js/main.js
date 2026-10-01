const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1555335398174232647/VV3wuAeA0-1X-umA9dbsid7SerMalmxImUfZZ5D9tHYQHVwbxc9tB1RNvkIhc9utdVhu';

/* ── NAVBAR: scroll class ─────────────────────────────────────────────────── */
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 24);
}, { passive: true });

/* ── MOBILE MENU ──────────────────────────────────────────────────────────── */
const hamburger   = document.getElementById('hamburger');
const mobileMenu  = document.getElementById('mobile-menu');

hamburger.addEventListener('click', () => {
  const isOpen = !mobileMenu.hidden;
  mobileMenu.hidden = isOpen;
  hamburger.setAttribute('aria-expanded', String(!isOpen));
});

mobileMenu.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    mobileMenu.hidden = true;
    hamburger.setAttribute('aria-expanded', 'false');
  });
});

document.addEventListener('click', e => {
  if (!navbar.contains(e.target)) {
    mobileMenu.hidden = true;
    hamburger.setAttribute('aria-expanded', 'false');
  }
});

/* ── CALLBACK MODAL ───────────────────────────────────────────────────────── */
const modal         = document.getElementById('callbackModal');
const modalBox      = document.getElementById('modalBox');
const openBtn       = document.getElementById('callbackBtn');
const closeBtn      = document.getElementById('modalCloseBtn');
const form          = document.getElementById('callbackForm');
const submitBtn     = document.getElementById('cbSubmitBtn');
const btnText       = document.getElementById('cbBtnText');
const spinner       = document.getElementById('cbSpinner');
const nameInput     = document.getElementById('cb-name');
const phoneInput    = document.getElementById('cb-phone');
const nameError     = document.getElementById('name-error');
const phoneError    = document.getElementById('phone-error');
const roleError     = document.getElementById('role-error');
const defaultView   = document.getElementById('modalDefault');
const successView   = document.getElementById('modalSuccess');
const errorView     = document.getElementById('modalError');

function openModal() {
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  // Reset to default state
  defaultView.hidden = false;
  successView.hidden = true;
  errorView.hidden   = true;
  form.reset();
  clearErrors();
  setTimeout(() => nameInput.focus(), 50);
}

function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = '';
  openBtn.focus();
}

function clearErrors() {
  nameError.hidden  = true;
  phoneError.hidden = true;
  roleError.hidden  = true;
  nameInput.classList.remove('invalid');
  phoneInput.classList.remove('invalid');
}

function normalizePhone(raw) {
  let p = raw.trim().replace(/[\s\-]/g, '');
  if (p.startsWith('+91')) p = p.slice(3);
  else if (/^91[6-9]/.test(p) && p.length === 12) p = p.slice(2);
  return p;
}

function validate() {
  clearErrors();
  let ok = true;
  const role = form.querySelector('input[name="role"]:checked');
  if (!role) {
    roleError.hidden = false;
    ok = false;
  }
  if (!nameInput.value.trim() || nameInput.value.trim().length < 2) {
    nameError.hidden = false;
    nameInput.classList.add('invalid');
    ok = false;
  }
  const phonePattern = /^[6-9][0-9]{9}$/;
  if (!phonePattern.test(normalizePhone(phoneInput.value))) {
    phoneError.hidden = false;
    phoneInput.classList.add('invalid');
    ok = false;
  }
  return ok;
}

async function sendToDiscord(name, phone, role) {
  const roleEmoji = { Parent: '👨‍👩‍👧', Student: '🎒', Teacher: '📚' }[role] || '❓';
  const payload = {
    embeds: [{
      title: '📞 New Callback Request — KiDS Buddy',
      color: 0x2563EB,
      description: `${roleEmoji} **${role}** · ${name}\n📱 \`${phone}\``,
      footer: { text: 'KiDS Buddy Landing · kidsbuddy.online' },
      timestamp: new Date().toISOString(),
    }],
  };
  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Webhook error ${res.status}`);
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  if (!validate()) return;

  const name  = nameInput.value.trim();
  const phone = normalizePhone(phoneInput.value);
  const role  = form.querySelector('input[name="role"]:checked')?.value || '';

  // Loading state
  submitBtn.disabled = true;
  btnText.hidden     = true;
  spinner.hidden     = false;

  try {
    await sendToDiscord(name, phone, role);
    defaultView.hidden = true;
    successView.hidden = false;
  } catch {
    defaultView.hidden = true;
    errorView.hidden   = false;
  } finally {
    submitBtn.disabled = false;
    btnText.hidden     = false;
    spinner.hidden     = true;
  }
});

openBtn.addEventListener('click', openModal);
closeBtn.addEventListener('click', closeModal);

// Close on backdrop click
modal.addEventListener('click', e => {
  if (e.target === modal) closeModal();
});

// Close on Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !modal.hidden) closeModal();
});

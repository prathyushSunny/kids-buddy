import React from 'react';

export default function LandingPage() {
  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <span style={styles.logo}>🎒 KidsBuddy</span>
        <a href="https://cms.kidsbuddy.online/cms" style={styles.navLink}>CMS Login →</a>
      </nav>

      <section style={styles.hero}>
        <div style={styles.badge}>Home Tuition Platform</div>
        <h1 style={styles.h1}>
          Learning at home,<br />done right.
        </h1>
        <p style={styles.sub}>
          KidsBuddy connects families with trusted home tutors across Hyderabad.
          Personalised, affordable, and at your doorstep.
        </p>
        <div style={styles.ctaRow}>
          <a href="https://wa.me/919999999999" style={styles.btnPrimary}>
            Get Started on WhatsApp
          </a>
          <a href="mailto:kids.buddy.hometution@gmail.com" style={styles.btnGhost}>
            Contact Us
          </a>
        </div>
      </section>

      <section style={styles.features}>
        {[
          { icon: '🏠', title: 'At-Home Tuitions', desc: 'Tutors come to you — no commute, no stress.' },
          { icon: '📚', title: 'All Subjects', desc: 'Maths, Science, English, Telugu and more, Grade 1–12.' },
          { icon: '✅', title: 'Vetted Tutors', desc: 'Every tutor is background-checked and interview-screened.' },
        ].map(f => (
          <div key={f.title} style={styles.card}>
            <div style={styles.cardIcon}>{f.icon}</div>
            <h3 style={styles.cardTitle}>{f.title}</h3>
            <p style={styles.cardDesc}>{f.desc}</p>
          </div>
        ))}
      </section>

      <footer style={styles.footer}>
        © {new Date().getFullYear()} KidsBuddy · Hyderabad
      </footer>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    background: '#f8fafc',
    color: '#0f172a',
    margin: 0,
  },
  nav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '18px 24px',
    background: '#fff',
    borderBottom: '1px solid #e2e8f0',
  },
  logo: {
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: '-0.02em',
  },
  navLink: {
    fontSize: 14,
    fontWeight: 600,
    color: '#4f8ef7',
    textDecoration: 'none',
  },
  hero: {
    maxWidth: 600,
    margin: '0 auto',
    padding: '72px 24px 56px',
    textAlign: 'center',
  },
  badge: {
    display: 'inline-block',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#4f8ef7',
    background: '#eff6ff',
    borderRadius: 20,
    padding: '4px 14px',
    marginBottom: 20,
  },
  h1: {
    fontSize: 'clamp(32px, 6vw, 52px)',
    fontWeight: 800,
    lineHeight: 1.15,
    letterSpacing: '-0.03em',
    margin: '0 0 20px',
  },
  sub: {
    fontSize: 17,
    lineHeight: 1.65,
    color: '#64748b',
    margin: '0 0 36px',
  },
  ctaRow: {
    display: 'flex',
    gap: 12,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  btnPrimary: {
    display: 'inline-block',
    background: '#4f8ef7',
    color: '#fff',
    fontWeight: 700,
    fontSize: 15,
    padding: '13px 24px',
    borderRadius: 10,
    textDecoration: 'none',
  },
  btnGhost: {
    display: 'inline-block',
    background: '#fff',
    color: '#0f172a',
    fontWeight: 600,
    fontSize: 15,
    padding: '13px 24px',
    borderRadius: 10,
    textDecoration: 'none',
    border: '1.5px solid #e2e8f0',
  },
  features: {
    display: 'flex',
    gap: 16,
    justifyContent: 'center',
    flexWrap: 'wrap',
    padding: '0 24px 72px',
    maxWidth: 900,
    margin: '0 auto',
  },
  card: {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 14,
    padding: '28px 24px',
    flex: '1 1 220px',
    maxWidth: 260,
    textAlign: 'center',
  },
  cardIcon: { fontSize: 28, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: 700, margin: '0 0 8px' },
  cardDesc: { fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: 0 },
  footer: {
    textAlign: 'center',
    padding: '20px',
    fontSize: 13,
    color: '#94a3b8',
    borderTop: '1px solid #e2e8f0',
    background: '#fff',
  },
};

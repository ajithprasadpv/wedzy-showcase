// Mobile menu
const burger = document.getElementById('burger');
const links = document.getElementById('nav-links');
if (burger && links) {
  burger.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    burger.setAttribute('aria-expanded', open);
  });
  links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));
}

// Reveal sections as they scroll into view
const io = 'IntersectionObserver' in window
  ? new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' })
  : null;
document.querySelectorAll('.reveal').forEach(el => io ? io.observe(el) : el.classList.add('in'));

// Fit the phone mockup (and its floating cards) to the window, so the hero never gets cut off
const stage = document.getElementById('stage');
if (stage) {
  const PHONE_H = 640;
  const fit = () => {
    const w = window.innerWidth, h = window.innerHeight;
    let z;
    if (w > 1060) z = Math.min(0.9, (h - 150) / PHONE_H);   // side by side: fit the height
    else if (w > 560) z = 0.82;                             // stacked on tablets
    else z = Math.min(0.86, (w - 40) / 330);                // phones: fit the width
    stage.style.setProperty('--pz', Math.max(0.6, z).toFixed(3));
  };
  fit();
  window.addEventListener('resize', fit);
}

// Live countdown in the phone mockup: always ~107 days ahead, like a real couple's Home screen
const cd = document.getElementById('m-count');
if (cd) {
  const target = new Date();
  target.setDate(target.getDate() + 107);
  target.setHours(10, 30, 0, 0);
  const pad = n => String(n).padStart(2, '0');
  const dateLabel = document.getElementById('m-date');
  if (dateLabel) {
    dateLabel.textContent = target.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  const left = document.getElementById('m-left');
  const [d, h, m, s] = cd.querySelectorAll('b');
  const tick = () => {
    const diff = Math.max(0, target - Date.now());
    d.textContent = pad(Math.floor(diff / 864e5));
    h.textContent = pad(Math.floor(diff % 864e5 / 36e5));
    m.textContent = pad(Math.floor(diff % 36e5 / 6e4));
    s.textContent = pad(Math.floor(diff % 6e4 / 1e3));
    if (left) left.textContent = `${Math.floor(diff / 864e5)} days to go`;
  };
  tick();
  setInterval(tick, 1000);
}

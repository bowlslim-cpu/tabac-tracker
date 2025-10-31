/* TabacTracker – app.js (drop-in stable)
 * - Bouton +1/Annuler OK
 * - Timer en direct
 * - Graphique hebdo (ne bloque jamais si Chart.js n’est pas chargé)
 * - Historique + suppression
 * - Stockage sûr (même si localStorage est limité)
 * - PWA install prompt (facultatif)
 * - Réglages / PIN / Notifs : ignorés s’ils n’existent pas dans ton HTML
 */

/* =========================
   0) Safe storage wrapper
   ========================= */
const storage = (() => {
  try {
    const k = '__t';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    // Fallback mémoire (évite un crash en mode privé / quota plein)
    let mem = {};
    return {
      getItem: (k) => (k in mem ? mem[k] : null),
      setItem: (k, v) => { mem[k] = String(v); },
      removeItem: (k) => { delete mem[k]; }
    };
  }
})();

/* =========================
   1) Données & Préférences
   ========================= */
const KEY = 'tabac:entries';
const PREF = 'tabac:prefs'; // objectifs, notifs, PIN (si présents)

const getEntries = () =>
  JSON.parse(storage.getItem(KEY) || '[]').map(Number).sort((a, b) => a - b);

const saveEntries = (arr) => storage.setItem(KEY, JSON.stringify(arr));

const defaultPrefs = {
  dailyGoal: 10,
  weeklyGoal: 70,
  shortIntervalMin: 30, // minutes
  baselinePerDay: null,
  notifications: false,
  pinEnabled: false,
  pinHash: null,
  pinSalt: null
};

let prefs = Object.assign({}, defaultPrefs, JSON.parse(storage.getItem(PREF) || '{}'));
const savePrefs = (p) => storage.setItem(PREF, JSON.stringify(p));

/* =========================
   2) Utilitaires
   ========================= */
function sameDay(a, b) {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() &&
         da.getMonth() === db.getMonth() &&
         da.getDate() === db.getDate();
}
function startOfWeek(ts) {
  // Semaine Lundi-Dimanche
  const d = new Date(ts);
  const day = (d.getDay() + 6) % 7; // 0 = Lundi
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.getTime();
}
function bucketWeeks(entries, weeks) {
  const now = Date.now();
  const end = startOfWeek(now);
  const labels = [];
  const data = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = end - i * 7 * 24 * 3600 * 1000;
    const endw  = start + 7 * 24 * 3600 * 1000;
    const count = entries.filter(t => t >= start && t < endw).length;
    const s = new Date(start), e = new Date(endw - 1);
    const fmt = (d) => d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
    labels.push(`${fmt(s)}–${fmt(e)}`);
    data.push(count);
  }
  return { labels, data };
}
function formatDuration(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2,'0')} min ${String(sec).padStart(2,'0')} s`;
  if (m > 0) return `${m} min ${String(sec).padStart(2,'0')} s`;
  return `${sec} s`;
}

/* =========================
   3) Sélecteurs (tous optionnels)
   ========================= */
const el = {
  timer: document.getElementById('timer'),
  addBtn: document.getElementById('addBtn'),
  undoBtn: document.getElementById('undoBtn'),
  today: document.getElementById('todayCount'),
  week: document.getElementById('weekCount'),
  total: document.getElementById('totalCount'),
  history: document.getElementById('history'),
  weeksInput: document.getElementById('weeksInput'),
  exportBtn: document.getElementById('exportBtn'),
  importInput: document.getElementById('importInput'),
  installBtn: document.getElementById('installBtn'),
  coach: document.getElementById('coachMsg'),
  todayBar: document.getElementById('todayBar'),
  weekBar: document.getElementById('weekBar'),
  todayGoalTxt: document.getElementById('todayGoalTxt'),
  weekGoalTxt: document.getElementById('weekGoalTxt'),
  savedCigs: document.getElementById('savedCigs'),
  // Réglages (si présents dans ton HTML)
  settingsBtn: document.getElementById('settingsBtn'),
  settingsDialog: document.getElementById('settingsDialog'),
  dailyGoalInput: document.getElementById('dailyGoalInput'),
  weeklyGoalInput: document.getElementById('weeklyGoalInput'),
  shortIntervalInput: document.getElementById('shortIntervalInput'),
  baselineInput: document.getElementById('baselineInput'),
  notifToggle: document.getElementById('notifToggle'),
  pinToggle: document.getElementById('pinToggle'),
  pinSetup: document.getElementById('pinSetup'),
  pinNew: document.getElementById('pinNew'),
  pinNew2: document.getElementById('pinNew2'),
  settingsSave: document.getElementById('settingsSave'),
  pinDialog: document.getElementById('pinDialog'),
  pinInput: document.getElementById('pinInput'),
  pinSubmit: document.getElementById('pinSubmit'),
  pinError: document.getElementById('pinError')
};

/* =========================
   4) PIN (optionnel, si présent)
   ========================= */
function genSalt(bytes = 16) {
  const a = new Uint8Array(bytes);
  if (crypto?.getRandomValues) crypto.getRandomValues(a);
  else for (let i=0;i<a.length;i++) a[i] = Math.floor(Math.random()*256);
  return btoa(String.fromCharCode(...a));
}
async function hashWithSalt(text, salt) {
  if (!crypto?.subtle?.digest) return text; // fallback (faible)
  const enc = new TextEncoder().encode(salt + '::' + text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function ensureUnlocked() {
  // Si le dialogue/les champs n'existent pas ou si PIN désactivé → OK direct
  if (!el.pinDialog || !prefs.pinEnabled || !prefs.pinHash || !prefs.pinSalt) return true;
  el.pinError && (el.pinError.hidden = true);
  if (el.pinInput) el.pinInput.value = '';
  el.pinDialog.showModal();
  return new Promise((resolve) => {
    if (!el.pinSubmit) return resolve(true);
    el.pinSubmit.onclick = async (e) => {
      e.preventDefault();
      const candidate = await hashWithSalt(el.pinInput?.value || '', prefs.pinSalt);
      const ok = candidate === prefs.pinHash;
      if (ok) { el.pinDialog.close(); resolve(true); }
      else if (el.pinError) { el.pinError.hidden = false; }
    };
  });
}

/* =========================
   5) Notifs (douces) — optionnel
   ========================= */
function notify(title, body) {
  if (!prefs.notifications) return;
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    if (navigator.serviceWorker?.ready) {
      navigator.serviceWorker.ready
        .then(reg => reg.showNotification(title, { body, icon: './icons/icon-192.png' }))
        .catch(()=>{});
    } else {
      new Notification(title, { body });
    }
  }
}
function requestNotifPermissionIfNeeded() {
  if (!prefs.notifications) return;
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(()=>{});
  }
}

/* =========================
   6) PWA install prompt
   ========================= */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (el.installBtn) el.installBtn.hidden = false;
});
el.installBtn?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  el.installBtn.hidden = true;
});

/* =========================
   7) Rendu / Actions
   ========================= */
let chart; // Chart.js instance (si chargé)

function renderTimer() {
  const arr = getEntries();
  const last = arr[arr.length - 1];
  if (!el.timer) return;
  if (!last) { el.timer.textContent = '—'; return; }
  el.timer.textContent = formatDuration(Date.now() - last);
}

function counts() {
  const arr = getEntries();
  const today = arr.filter(t => sameDay(t, Date.now())).length;
  const week = arr.filter(t => t >= startOfWeek(Date.now())).length;
  return { today, week, total: arr.length };
}

function renderCounts() {
  const c = counts();
  if (el.today) el.today.textContent = c.today;
  if (el.week)  el.week.textContent  = c.week;
  if (el.total) el.total.textContent = c.total;

  // jauges (si présentes)
  function updateBar(value, goal, barEl, txtEl) {
    if (!barEl || !txtEl) return;
    if (!goal || goal <= 0) { barEl.style.width = '0%'; txtEl.textContent = ''; barEl.classList?.remove('bad'); return; }
    const ratio = Math.min(1.5, value / goal);
    barEl.style.width = Math.min(100, ratio * 100) + '%';
    barEl.classList?.toggle('bad', ratio > 1);
    txtEl.textContent = ` / ${goal}`;
  }
  updateBar(c.today, prefs.dailyGoal, el.todayBar, el.todayGoalTxt);
  updateBar(c.week,  prefs.weeklyGoal, el.weekBar,  el.weekGoalTxt);

  // santé : cigarettes évitées (si baseline renseignée)
  if (el.savedCigs) {
    if (prefs.baselinePerDay) {
      const arr = getEntries();
      const first = arr[0];
      const days = first ? Math.max(1, Math.ceil((Date.now() - first) / (24 * 3600 * 1000))) : 0;
      const expected = days * prefs.baselinePerDay;
      const avoided = Math.max(0, Math.round(expected - c.total));
      el.savedCigs.textContent = `Cigarettes évitées : ${avoided}`;
    } else {
      el.savedCigs.textContent = `Cigarettes évitées : 0`;
    }
  }
}

function renderHistory() {
  if (!el.history) return;
  const arr = getEntries();
  el.history.innerHTML = '';
  arr.slice().reverse().forEach((t, idx) => {
    const li = document.createElement('li');
    const d = new Date(t);
    const left = document.createElement('div');
    left.innerHTML = `<strong>${d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</strong> <small>${d.toLocaleDateString()}</small>`;
    const del = document.createElement('button');
    del.className = 'ghost';
    del.textContent = 'Supprimer';
    del.addEventListener('click', () => {
      const orig = getEntries();
      const originalIndex = orig.length - 1 - idx;
      orig.splice(originalIndex, 1);
      saveEntries(orig);
      renderAll();
    });
    li.appendChild(left);
    li.appendChild(del);
    el.history.appendChild(li);
  });
}

function renderChart() {
  const canvas = document.getElementById('chart');
  if (typeof Chart === 'undefined' || !canvas) return; // garde-fou
  const arr = getEntries();
  const weeks = Math.max(4, Math.min(52, parseInt(el.weeksInput?.value || '12', 10)));
  const { labels, data } = bucketWeeks(arr, weeks);
  if (chart) chart.destroy();
  chart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Cigarettes', data }] },
    options: { scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { display: false } } }
  });
}

function coach() {
  if (!el.coach) return;
  const arr = getEntries();
  const last = arr[arr.length - 1];
  if (!last) { el.coach.textContent = 'Bienvenue ! Fixe un objectif dans ⚙️ Réglages.'; return; }
  const diffMin = Math.floor((Date.now() - last) / 60000);
  const target = prefs.shortIntervalMin || 0;
  if (target && diffMin < target) el.coach.textContent = `Respire : seulement ${diffMin} min. Essaie d’atteindre ${target} min.`;
  else el.coach.textContent = `Bien ! ${diffMin} min depuis la dernière.`;
}

/* =========================
   8) Actions utilisateur
   ========================= */
function addEntry() {
  const arr = getEntries();
  const last = arr[arr.length - 1];
  const diffMin = last ? Math.floor((Date.now() - last) / 60000) : Infinity;

  arr.push(Date.now());
  saveEntries(arr);

  // Notifications douces (si activées et si éléments réglages existent)
  const c = counts();
  if (prefs.dailyGoal) {
    if (c.today === prefs.dailyGoal - 1) notify('Presque à l’objectif du jour', 'Plus qu’une cigarette avant l’objectif.');
    if (c.today === prefs.dailyGoal) notify('Objectif du jour atteint', 'Bravo ! Essaie de ne pas dépasser.');
    if (c.today >  prefs.dailyGoal) notify('Au-delà de l’objectif du jour', 'Courage, tu peux te reprendre.');
  }
  if (prefs.weeklyGoal) {
    if (c.week === prefs.weeklyGoal - 1) notify('Presque à l’objectif hebdo', 'Plus qu’une avant la limite hebdo.');
    if (c.week === prefs.weeklyGoal) notify('Objectif hebdo atteint', 'Super ! Reste en dessous si possible.');
    if (c.week >  prefs.weeklyGoal) notify('Au-delà de l’hebdo', 'Repars sur de bonnes bases demain.');
  }
  if (prefs.shortIntervalMin && diffMin < prefs.shortIntervalMin) {
    notify('Cigarette rapprochée', `Seulement ${diffMin} min depuis la dernière. Essaie d’attendre ${prefs.shortIntervalMin} min.`);
  }

  renderAll();
}

function undoLast() {
  const arr = getEntries();
  arr.pop();
  saveEntries(arr);
  renderAll();
}

/* =========================
   9) Export / Import (optionnels)
   ========================= */
function exportJSON() {
  const blob = new Blob([JSON.stringify(getEntries())], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'tabactracker-entries.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed)) throw new Error('Format invalide');
      const clean = parsed.map(Number).filter(n => Number.isFinite(n));
      saveEntries(clean);
      renderAll();
      alert('Import réussi.');
    } catch { alert('Import invalide.'); }
  };
  reader.readAsText(file);
}

/* =========================
   10) Réglages (optionnels)
   ========================= */
function openSettings() {
  if (!el.settingsDialog) return;
  if (el.dailyGoalInput)     el.dailyGoalInput.value     = prefs.dailyGoal ?? '';
  if (el.weeklyGoalInput)    el.weeklyGoalInput.value    = prefs.weeklyGoal ?? '';
  if (el.shortIntervalInput) el.shortIntervalInput.value = prefs.shortIntervalMin ?? '';
  if (el.baselineInput)      el.baselineInput.value      = prefs.baselinePerDay ?? '';
  if (el.notifToggle)        el.notifToggle.checked      = !!prefs.notifications;
  if (el.pinToggle)          el.pinToggle.checked        = !!prefs.pinEnabled;
  if (el.pinSetup)           el.pinSetup.hidden          = !prefs.pinEnabled;
  el.settingsDialog.showModal();
}

/* =========================
   11) Listeners
   ========================= */
el.addBtn?.addEventListener('click', addEntry);
el.undoBtn?.addEventListener('click', undoLast);
el.weeksInput?.addEventListener('change', renderChart);
el.exportBtn?.addEventListener('click', exportJSON);
el.importInput?.addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (f) importJSON(f);
});

// Réglages (si présents)
el.settingsBtn?.addEventListener('click', openSettings);
el.pinToggle?.addEventListener('change', () => { if (el.pinSetup) el.pinSetup.hidden = !el.pinToggle.checked; });
el.settingsSave?.addEventListener('click', async (e) => {
  if (!el.settingsDialog) return;
  e.preventDefault();
  prefs.dailyGoal        = el.dailyGoalInput     ? (parseInt(el.dailyGoalInput.value||'0',10) || 0) : prefs.dailyGoal;
  prefs.weeklyGoal       = el.weeklyGoalInput    ? (parseInt(el.weeklyGoalInput.value||'0',10) || 0) : prefs.weeklyGoal;
  prefs.shortIntervalMin = el.shortIntervalInput ? (parseInt(el.shortIntervalInput.value||'0',10) || 0) : prefs.shortIntervalMin;
  prefs.baselinePerDay   = el.baselineInput      ? (parseInt(el.baselineInput.value||'0',10) || null) : prefs.baselinePerDay;
  prefs.notifications    = el.notifToggle        ? !!el.notifToggle.checked : prefs.notifications;
  const wantPin          = el.pinToggle          ? !!el.pinToggle.checked   : false;
  if (wantPin) {
    const p1 = el.pinNew?.value || '';
    const p2 = el.pinNew2?.value || '';
    if (p1 && p1 === p2) {
      prefs.pinSalt = genSalt();
      prefs.pinHash = await hashWithSalt(p1, prefs.pinSalt);
      prefs.pinEnabled = true;
    }
  } else {
    prefs.pinEnabled = false;
    prefs.pinHash = null;
    prefs.pinSalt = null;
  }
  savePrefs(prefs);
  el.settingsDialog.close();
  requestNotifPermissionIfNeeded();
  renderAll();
});

/* =========================
   12) Boucles et boot
   ========================= */
function renderAll() {
  try {
    renderCounts();
    renderHistory();
    renderChart();
    renderTimer();
    coach();
  } catch (e) {
    console.error('renderAll error:', e);
  }
}

// Timer & coach en continu
setInterval(() => { renderTimer(); coach(); }, 1000);

// Démarrage
(async function init() {
  prefs = Object.assign({}, defaultPrefs, JSON.parse(storage.getItem(PREF) || '{}'));
  await ensureUnlocked();               // OK si pas de PIN
  requestNotifPermissionIfNeeded();     // si activé
  renderAll();
  console.log('TabacTracker ready');
})();

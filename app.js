// Stockage local
const KEY = "clopes:data";

function loadData() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return { total: 0, daily: {}, lastSmoke: null };
  return JSON.parse(raw);
}

function saveData(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// Formatage du minuteur
function formatDuration(ms) {
  if (ms <= 0) return "—";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} h ${m} min ${sec} s`;
  if (m > 0) return `${m} min ${sec} s`;
  return `${sec} s`;
}

function render() {
  const todayKey = getTodayKey();
  const data = loadData();
  const todayCount = data.daily[todayKey] || 0;
  document.getElementById("todayCount").textContent = todayCount;
  document.getElementById("totalCount").textContent = data.total;

  // Minuteur depuis la dernière cigarette
  const timerEl = document.getElementById("timer");
  if (!data.lastSmoke) {
    timerEl.textContent = "—";
  } else {
    const diff = Date.now() - data.lastSmoke;
    timerEl.textContent = formatDuration(diff);
  }
}

// Ajouter une cigarette
document.getElementById("addBtn").addEventListener("click", () => {
  const todayKey = getTodayKey();
  const data = loadData();
  data.total++;
  data.daily[todayKey] = (data.daily[todayKey] || 0) + 1;
  data.lastSmoke = Date.now(); // ⏱️ dernière cigarette
  saveData(data);
  render();
});

// Réinitialiser le jour
document.getElementById("resetDay").addEventListener("click", () => {
  if (!confirm("Réinitialiser le compteur du jour ?")) return;
  const todayKey = getTodayKey();
  const data = loadData();
  data.total -= data.daily[todayKey] || 0;
  delete data.daily[todayKey];
  if (data.total < 0) data.total = 0;
  saveData(data);
  render();
});

// Réinitialiser tout
document.getElementById("resetAll").addEventListener("click", () => {
  if (!confirm("Réinitialiser complètement le compteur ?")) return;
  localStorage.removeItem(KEY);
  render();
});

// Mise à jour du minuteur chaque seconde
setInterval(() => {
  const data = loadData();
  if (data.lastSmoke) {
    const diff = Date.now() - data.lastSmoke;
    document.getElementById("timer").textContent = formatDuration(diff);
  }
}, 1000);

// Afficher dès le chargement
render();

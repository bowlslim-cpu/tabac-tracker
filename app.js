// Stockage local
const KEY = "clopes:data";

function loadData() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return { total: 0, daily: {} };
  return JSON.parse(raw);
}

function saveData(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function render() {
  const todayKey = getTodayKey();
  const data = loadData();
  const todayCount = data.daily[todayKey] || 0;
  document.getElementById("todayCount").textContent = todayCount;
  document.getElementById("totalCount").textContent = data.total;
}

// Ajouter une cigarette
document.getElementById("addBtn").addEventListener("click", () => {
  const todayKey = getTodayKey();
  const data = loadData();
  data.total++;
  data.daily[todayKey] = (data.daily[todayKey] || 0) + 1;
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

// Afficher dès le chargement
render();

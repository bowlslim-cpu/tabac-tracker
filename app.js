// --- Storage helpers (localStorage) ---
left.innerHTML = `<strong>${d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</strong> <small>${d.toLocaleDateString()}</small>`;
const del = document.createElement('button');
del.className = 'ghost';
del.textContent = 'Supprimer';
del.addEventListener('click', () => {
const arr = getEntries();
// index in original order:
const originalIndex = arr.length-1-idx;
arr.splice(originalIndex,1);
saveEntries(arr);
renderAll();
});
li.appendChild(left); li.appendChild(del); historyEl.appendChild(li);
});
}


function renderChart(){
const entries = getEntries();
const weeks = Math.max(4, Math.min(52, parseInt(weeksInput.value||'12',10)));
const {labels, data} = bucketWeeks(entries, weeks);
const ctx = document.getElementById('chart');
if (chart) chart.destroy();
chart = new Chart(ctx, {
type: 'bar',
data: { labels, datasets: [{ label: 'Cigarettes', data }] },
options: {
scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
plugins: { legend: { display: false } },
}
});
}


function renderAll(){
renderCounts();
renderHistory();
renderChart();
renderTimer();
}


// Export / Import
function exportJSON(){
const blob = new Blob([JSON.stringify(getEntries())], {type:'application/json'});
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url; a.download = 'tabactracker-entries.json'; a.click();
setTimeout(()=>URL.revokeObjectURL(url), 1000);
}
function importJSON(file){
const reader = new FileReader();
reader.onload = () => {
try {
const parsed = JSON.parse(reader.result);
if (!Array.isArray(parsed)) throw new Error('Format invalide');
const clean = parsed.map(Number).filter(n=>Number.isFinite(n));
saveEntries(clean); renderAll();
alert('Import réussi.');
} catch(e){ alert('Import invalide.'); }
};
reader.readAsText(file);
}


// Events
addBtn.addEventListener('click', addEntry);
undoBtn.addEventListener('click', undoLast);
weeksInput.addEventListener('change', renderChart);
exportBtn.addEventListener('click', exportJSON);
importInput.addEventListener('change', (e)=>{
const f = e.target.files?.[0]; if (f) importJSON(f);
});


// Timer tick
setInterval(renderTimer, 1000);


// First paint
renderAll();
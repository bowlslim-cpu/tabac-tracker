/* ===== TabacTracker – app.js (Stats & Motivations) ===== */
function genSalt(bytes=16){ const a=new Uint8Array(bytes); (crypto.getRandomValues||((x)=>{for(let i=0;i<x.length;i++)x[i]=Math.floor(Math.random()*256);}))(a); return btoa(String.fromCharCode(...a)); }
async function hashWithSalt(text,salt){ if(!crypto?.subtle?.digest) return text; const enc=new TextEncoder().encode(salt+'::'+text); const buf=await crypto.subtle.digest('SHA-256', enc); return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join(''); }
async function ensureUnlocked(){ if(!el.pinDialog||!prefs.pinEnabled||!prefs.pinHash||!prefs.pinSalt) return true; el.pinError&&(el.pinError.hidden=true); if(el.pinInput) el.pinInput.value=''; el.pinDialog.showModal(); return new Promise((resolve)=>{ if(!el.pinSubmit) return resolve(true); el.pinSubmit.onclick=async(e)=>{ e.preventDefault(); const ok=(await hashWithSalt(el.pinInput?.value||'', prefs.pinSalt))===prefs.pinHash; if(ok){ el.pinDialog.close(); resolve(true);} else if(el.pinError){ el.pinError.hidden=false; } }; }); }


// 5) Notifs & motivations
function notify(title, body){ if(!prefs.notifications||!('Notification'in window)) return; if(Notification.permission==='granted'){ if(navigator.serviceWorker?.ready){ navigator.serviceWorker.ready.then(reg=>reg.showNotification(title,{ body, icon:'./icons/icon-192.png'})).catch(()=>{}); } else { new Notification(title,{body}); } } }
function requestNotifPermissionIfNeeded(){ if(!prefs.notifications||!('Notification'in window)) return; if(Notification.permission==='default'){ Notification.requestPermission().catch(()=>{}); } }
const MESSAGES={ short:["Respire, marche 1 min.","Un verre d’eau, puis on avise.","Décale-toi 5 min, tu peux le faire."], good:["Nickel, tu tiens bien.","Solide, continue comme ça.","Beau tempo !"], milestone:["1h sans clope 👏","2h, énorme 💪","3h, tu gères !"] };
function coach(){ if(!el.coach) return; const arr=getEntries(); const last=arr[arr.length-1]; if(!last){ el.coach.textContent='Bienvenue ! Fixe un objectif dans ⚙️ Réglages.'; return; } const diffMin=Math.floor((Date.now()-last)/60000); const target=prefs.shortIntervalMin||0; if(target&&diffMin<target){ el.coach.textContent = `${MESSAGES.short[Math.floor(Math.random()*MESSAGES.short.length)]} (${diffMin} min)`; } else { el.coach.textContent = `${MESSAGES.good[Math.floor(Math.random()*MESSAGES.good.length)]} (${diffMin} min)`; } // milestones
[60,120,180,240].forEach(m=>{ if(diffMin===m) notify('Cap passé', `${m} minutes sans fumer. 👏`); }); }


// 6) PWA prompt
let deferredPrompt=null; window.addEventListener('beforeinstallprompt',(e)=>{ e.preventDefault(); deferredPrompt=e; el.installBtn&&(el.installBtn.hidden=false); }); el.installBtn?.addEventListener('click', async()=>{ if(!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; el.installBtn.hidden=true; });


// 7) Rendering
let chartWeekly, chartMoving;
function counts(){ const arr=getEntries(); const today=arr.filter(t=>sameDay(t,Date.now())).length; const week=arr.filter(t=>t>=startOfWeek(Date.now())).length; return {today, week, total:arr.length}; }
function renderTimer(){ const arr=getEntries(); const last=arr[arr.length-1]; if(!el.timer) return; if(!last){ el.timer.textContent='—'; return; } el.timer.textContent=formatDuration(Date.now()-last); }
function renderCounts(){ const c=counts(); if(el.today) el.today.textContent=c.today; if(el.week) el.week.textContent=c.week; if(el.total) el.total.textContent=c.total; function upd(v,g,bar,txt){ if(!bar||!txt) return; if(!g||g<=0){ bar.style.width='0%'; txt.textContent=''; bar.classList?.remove('bad'); return;} const r=Math.min(1.5, v/g); bar.style.width=Math.min(100,r*100)+'%'; bar.classList?.toggle('bad', r>1); txt.textContent=` / ${g}`; } upd(c.today,prefs.dailyGoal,el.todayBar,el.todayGoalTxt); upd(c.week,prefs.weeklyGoal,el.weekBar,el.weekGoalTxt);
if(el.savedCigs){ if(prefs.baselinePerDay){ const arr=getEntries(); const first=arr[0]; const days=first? Math.max(1, Math.ceil((Date.now()-first)/(24*3600*1000))):0; const expected=days*prefs.baselinePerDay; const avoided=Math.max(0, Math.round(expected-c.total)); el.savedCigs.textContent=`Cigarettes évitées : ${avoided}`; } else { el.savedCigs.textContent=`Cigarettes évitées : 0`; } } }


// Weekly bar (comme avant, sur #chartWeekly)
function renderWeeklyChart(){ const canvas=document.getElementById('chartWeekly'); if(typeof Chart==='undefined'||!canvas) return; const entries=getEntries(); const weeks=Math.max(4, Math.min(52, parseInt(el.weeksInput?.value||'12',10))); const nowEnd=startOfWeek(Date.now()); const labels=[]; const data=[]; for(let i=weeks-1;i>=0;i--){ const start=nowEnd - i*7*24*3600*1000; const end=start+7*24*3600*1000; const count=entries.filter(t=>t>=start&&t<end).length; const s=new Date(start), e=new Date(end-1); const fmt=(d)=>d.toLocaleDateString(undefined,{day:'2-digit', month:'short'}); labels.push(`${fmt(s)}–${fmt(e)}`); data.push(count); }
if(chartWeekly) chartWeekly.destroy(); chartWeekly=new Chart(canvas,{ type:'bar', data:{ labels, datasets:[{ label:'/semaine', data }] }, options:{ scales:{ y:{ beginAtZero:true, ticks:{precision:0}} }, plugins:{ legend:{display:false}} } }); }


// Moving average 7j sur 30j (line)
function renderMovingChart(){ const canvas=document.getElementById('chartMoving'); if(typeof Chart==='undefined'||!canvas) return; const entries=getEntries(); const days=rangeDays(30); const perDay=groupByDay(entries, days).map(x=>x.count); const ma7=movingAverage(perDay,7); const labels=days.map(d=> new Date(d).toLocaleDateString(undefined,{day:'2-digit', month:'short'})); if(chartMoving) chartMoving.destroy(); chartMoving=new Chart(canvas,{ type:'line', data:{ labels, datasets:[{ label:'Moy. mobile 7j', data: ma7, tension: .3, fill:false }] }, options:{ scales:{ y:{ beginAtZero:true, ticks:{precision:0}} }, plugins:{ legend:{display:false}} } }); }


// Stats avancées
function computeStats(){ const arr=getEntries(); const d7=rangeDays(7); const d30=rangeDays(30); const g7=groupByDay(arr,d7).map(x=>x.count); const g30=groupByDay(arr,d30).map(x=>x.count); const avg7 = g7.reduce((a,b)=>a+b,0)/g7.length; const avg30= g30.reduce((a,b)=>a+b,0)/g30.length; // weekly avg (12 sem)
const endW=startOfWeek(Date.now()); const weeks=12; const wCounts=[]; for(let i=weeks-1;i>=0;i--){ const start=endW - i*7*24*3600*1000; const end=start+7*24*3600*1000; wCounts.push(arr.filter(t=>t>=start&&t<end).length); } const avgWeek12=wCounts.reduce((a,b)=>a+b,0)/weeks; const streak=longestStreak(arr); return { avg7, avg30, avgWeek12, streak }; }
function renderStats(){ const {avg7, avg30, avgWeek12, streak}=computeStats(); if(el.avgDay7) el.avgDay7.textContent = (isFinite(avg7)? avg7.toFixed(1):'0'); if(el.avgDay30) el.avgDay30.textContent = (isFinite(avg30)? avg30.toFixed(1):'0'); if(el.avgWeek12) el.avgWeek12.textContent= (isFinite(avgWeek12)? avgWeek12.toFixed(1):'0'); if(el.bestStreak) el.bestStreak.textContent = streak? formatDuration(streak): '—'; }


function renderHistory(range='30d'){ if(!el.history) return; const arr=getEntries(); let from=0; let label=''; const now=Date.now(); if(range==='today'){ from=startOfDay(now); label='Aujourd\'hui'; } else if(range==='7d'){ from=now-7*24*3600*1000; label='7 jours'; } else if(range==='30d'){ from=now-30*24*3600*1000; label='30 jours'; } else { from=0; label='Tout'; }
if(el.rangeSummary) el.rangeSummary.textContent = `Période : ${label}`;
el.history.innerHTML=''; const filtered=arr.filter(t=>t>=from).slice().reverse(); filtered.forEach((t, idx)=>{ const li=document.createElement('li'); const d=new Date(t); const left=document.createElement('div'); left.innerHTML=`<strong>${d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</strong> <small>${d.toLocaleDateString()}</small>`; const del=document.createElement('button'); del.className='ghost'; del.textContent='Supprimer'; del.addEventListener('click',()=>{ const orig=getEntries(); const originalIndex=orig.lastIndexOf(t); if(originalIndex>-1){ orig.splice(originalIndex,1); saveEntries(orig); renderAll(); } }); li.appendChild(left); li.appendChild(del); el.history.appendChild(li); }); }


function renderAll(){ try{ renderCounts(); renderStats(); renderWeeklyChart(); renderMovingChart(); renderTimer(); coach(); renderHistory(el.historyRange?.value||'30d'); } catch(e){ console.error('renderAll error:', e); } }


// 8) Actions
function addEntry(){ const a=getEntries(); const last=a[a.length-1]; const diffMin= last? Math.floor((Date.now()-last)/60000):Infinity; a.push(Date.now()); saveEntries(a); const c=counts(); if(prefs.dailyGoal){ if(c.today===prefs.dailyGoal-1) notify('Presque à l\'objectif du jour','Plus qu\'une.'); if(c.today===prefs.dailyGoal) notify('Objectif du jour atteint','Bravo !'); if(c.today>prefs.dailyGoal) notify('Au‑delà de l\'objectif','Courage.'); } if(prefs.weeklyGoal){ if(c.week===prefs.weeklyGoal-1) notify('Presque à l\'hebdo','Plus qu\'une.'); if(c.week===prefs.weeklyGoal) notify('Objectif hebdo atteint','Super !'); if(c.week>prefs.weeklyGoal) notify('Au‑delà de l\'hebdo','Repars demain.'); } if(prefs.shortIntervalMin && diffMin<prefs.shortIntervalMin) notify('Cigarette rapprochée',`Seulement ${diffMin} min.`); renderAll(); }
function undoLast(){ const a=getEntries(); a.pop(); saveEntries(a); renderAll(); }
function exportJSON(){ const blob=new Blob([JSON.stringify(getEntries())],{type:'application/json'}); const url=URL.createObjectURL(blob); const link=document.createElement('a'); link.href=url; link.download='tabactracker-entries.json'; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
function importJSON(file){ const r=new FileReader(); r.onload=()=>{ try{ const p=JSON.parse(r.result); if(!Array.isArray(p)) throw new Error('bad'); const clean=p.map(Number).filter(n=>Number.isFinite(n)); saveEntries(clean); renderAll(); alert('Import réussi.'); } catch{ alert('Import invalide.'); } }; r.readAsText(file); }


// 9) Listeners
el.addBtn?.addEventListener('click', addEntry);
el.undoBtn?.addEventListener('click', undoLast);
el.weeksInput?.addEventListener('change', ()=>{ renderWeeklyChart(); });
el.exportBtn?.addEventListener('click', exportJSON);
el.importInput?.addEventListener('change', (e)=>{ const f=e.target.files?.[0]; if(f) importJSON(f); });
el.historyRange?.addEventListener('change', ()=> renderHistory(el.historyRange.value));


// Réglages
el.settingsBtn?.addEventListener('click', ()=>{ if(!el.settingsDialog) return; el.dailyGoalInput&&(el.dailyGoalInput.value=prefs.dailyGoal??''); el.weeklyGoalInput&&(el.weeklyGoalInput.value=prefs.weeklyGoal??''); el.shortIntervalInput&&(el.shortIntervalInput.value=prefs.shortIntervalMin??''); el.baselineInput&&(el.baselineInput.value=prefs.baselinePerDay??''); el.notifToggle&&(el.notifToggle.checked=!!prefs.notifications); el.pinToggle&&(el.pinToggle.checked=!!prefs.pinEnabled); el.pinSetup&&(el.pinSetup.hidden=!prefs.pinEnabled); el.settingsDialog.showModal(); });
el.pinToggle?.addEventListener('change', ()=>{ if(el.pinSetup) el.pinSetup.hidden=!el.pinToggle.checked; });
el.settingsSave?.addEventListener('click', async (e)=>{ if(!el.settingsDialog) return; e.preventDefault(); prefs.dailyGoal= el.dailyGoalInput? (parseInt(el.dailyGoalInput.value||'0',10)||0):prefs.dailyGoal; prefs.weeklyGoal= el.weeklyGoalInput? (parseInt(el.weeklyGoalInput.value||'0',10)||0):prefs.weeklyGoal; prefs.shortIntervalMin= el.shortIntervalInput? (parseInt(el.shortIntervalInput.value||'0',10)||0):prefs.shortIntervalMin; prefs.baselinePerDay= el.baselineInput? (parseInt(el.baselineInput.value||'0',10)||null):prefs.baselinePerDay; prefs.notifications= el.notifToggle? !!el.notifToggle.checked: prefs.notifications; const wantPin= el.pinToggle? !!el.pinToggle.checked: false; if(wantPin){ const p1=el.pinNew?.value||''; const p2=el.pinNew2?.value||''; if(p1 && p1===p2){ prefs.pinSalt=genSalt(); prefs.pinHash=await hashWithSalt(p1, prefs.pinSalt); prefs.pinEnabled=true; } } else { prefs.pinEnabled=false; prefs.pinHash=null; prefs.pinSalt=null; } savePrefs(prefs); el.settingsDialog.close(); requestNotifPermissionIfNeeded(); renderAll(); });


// 10) Loops & init
setInterval(()=>{ renderTimer(); coach(); }, 1000);
(async function init(){ prefs=Object.assign({}, defaultPrefs, JSON.parse(storage.getItem(PREF)||'{}')); await ensureUnlocked(); requestNotifPermissionIfNeeded(); renderAll(); console.log('TabacTracker ready (stats)'); })();
```javascript
// --- Safe storage wrapper (handl

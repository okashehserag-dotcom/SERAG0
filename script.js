/* =========================================================
  SERAJ0 — Local-only script.js (NO Firebase)
  - No login, opens مباشرة
  - Hash routing
  - Daily Goals lock
  - Timer earns 1 coin per full minute
  - Store + Inventory + Equip
  - Stats + Notebooks + Plan + Settings + Profile
  - Safe JS: no structuredClone / no crypto.randomUUID
========================================================= */

/* ---------------------------
  Safe helpers
---------------------------- */
const $ = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => Array.from(el.querySelectorAll(q));
const LS_KEY = "seraj_state_v1";
const nowISO = ()=> new Date().toISOString();
const clamp = (n,a,b)=> Math.max(a, Math.min(b,n));

function deepCopy(obj){
  return JSON.parse(JSON.stringify(obj));
}
function escapeHtml(s){
  return String(s||"")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}
function uuid(){
  // Simple unique id (safe in any browser)
  return "id_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
}
function todayKey(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const da = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${da}`;
}
function toast(msg, type="info"){
  const t = document.createElement("div");
  t.textContent = msg;
  t.style.cssText = `
    position:fixed; left:12px; right:12px; bottom:12px;
    padding:12px 14px; border-radius:16px;
    border:1px solid rgba(255,255,255,.14);
    background:rgba(0,0,0,.55); color:#fff;
    z-index:9999; font-weight:800; backdrop-filter:blur(8px);
  `;
  if(type==="bad") t.style.borderColor="rgba(255,107,107,.6)";
  if(type==="good") t.style.borderColor="rgba(54,211,153,.6)";
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 2200);
}

/* ---------------------------
  Default state
---------------------------- */
const DEFAULT_STATE = {
  version: 1,
  user: { uid:"local", displayName:"طالب سراج", photoURL:"" },

  coins: 0,
  totalMinutes: 0,
  history: [], // {ts, delta, reason}

  inventory: { skin_basic:true, bg_basic:true },
  equipped: { timerSkin:"skin_basic", bgTheme:"bg_basic" },

  daily: {
    date: "",
    locked: true,
    goals: null,   // {totalMinutes, startTime, subjects:[{name,pct}]}
    plan: [],
    sessionsToday: []
  },

  sessions: [], // global per-minute logs: {tsISO, minutes:1, skin}

  notebooks: { strengths:[], weaknesses:[], lessonNotes:[] },

  longPlan: {
    rangeDays: 30,
    hero: "سوي خطتك بنفسك — هذا طريقك الخاص",
    days: [] // [{date, items:[{id, subject, task, done}]}]
  },

  avatar: {
    parts: { skin:"#f2c6a0", hair:"#1b1b1b", glasses:"none", clothes:"#2b64ff", face:"smile" },
    svg: ""
  },

  settings: { sound:true },

  timer: { running:false, carrySeconds:0, lastTick:0 }
};

let state = loadState();

/* ---------------------------
  Storage
---------------------------- */
function deepMerge(base, extra){
  for(const k in extra){
    const v = extra[k];
    if(v && typeof v === "object" && !Array.isArray(v)){
      base[k] = deepMerge(base[k] || {}, v);
    }else{
      base[k] = v;
    }
  }
  return base;
}
function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return deepCopy(DEFAULT_STATE);
    return deepMerge(deepCopy(DEFAULT_STATE), JSON.parse(raw));
  }catch{
    return deepCopy(DEFAULT_STATE);
  }
}
function saveState(){
  try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch{}
  paintShell();
}

/* ---------------------------
  Daily reset + lock
---------------------------- */
function dailyResetIfNeeded(){
  const t = todayKey();
  if(state.daily.date !== t){
    state.daily.date = t;
    state.daily.locked = true;
    state.daily.goals = null;
    state.daily.plan = [];
    state.daily.sessionsToday = [];
    state.timer.running = false;
    state.timer.carrySeconds = 0;
    state.timer.lastTick = 0;
    saveState();
  }
}

/* ---------------------------
  Theme
---------------------------- */
function setBackgroundTheme(){
  const bg = state.equipped.bgTheme;
  document.body.dataset.bg = bg;

  const root = document.documentElement;
  if(bg==="bg_fire") root.style.setProperty("--pri", "#ff7a66");
  else if(bg==="bg_water") root.style.setProperty("--pri", "#6aa8ff");
  else if(bg==="bg_jordan") root.style.setProperty("--pri", "#36d399");
  else root.style.setProperty("--pri", "#6aa8ff");
}

/* ---------------------------
  Shell UI
---------------------------- */
function paintShell(){
  const coin = $("#coinBadge");
  if(coin) coin.textContent = `${state.coins} SC`;

  const total = $("#totalMinPill");
  if(total) total.textContent = `${state.totalMinutes}`;

  const pill = $("#dailyLockPill");
  if(pill){
    const locked = state.daily.locked;
    pill.textContent = locked ? "🔒 لازم تدخل أهداف اليوم" : "✅ أهداف اليوم جاهزة";
    pill.style.borderColor = locked ? "rgba(255,204,102,.55)" : "rgba(54,211,153,.55)";
  }

  const userName = $("#userName");
  if(userName) userName.textContent = state.user.displayName || "طالب سراج";

  const miniAvatar = $("#miniAvatar");
  if(miniAvatar){
    miniAvatar.innerHTML = state.avatar.svg ? state.avatar.svg : `<span class="small">🙂</span>`;
  }
}
function setActiveNav(){
  const hash = location.hash || "#timer";
  $$("[data-route]").forEach(a=>{
    a.classList.toggle("active", a.getAttribute("href")===hash);
  });
}

/* ---------------------------
  Router
---------------------------- */
function routeGuard(hash){
  const safe = new Set(["#timer","#goals","#settings","#profile"]);
  if(state.daily.locked && !safe.has(hash)) return "#goals";
  return hash;
}
function setTitle(hash){
  const map = {
    "#timer":"⏱️ التايمر",
    "#goals":"✅ أهداف اليوم",
    "#progress":"🪙 التقدم",
    "#store":"🛒 المتجر",
    "#stats":"📊 الإحصائيات",
    "#notebooks":"📒 الدفاتر",
    "#plan":"🗓️ خطة طويلة",
    "#leaderboard":"🏆 المتصدرين (محلي)",
    "#settings":"⚙️ الإعدادات",
    "#profile":"🧑‍🎨 البروفايل"
  };
  const t = $("#pageTitle");
  if(t) t.textContent = map[hash] || "—";
}
function render(){
  dailyResetIfNeeded();
  setBackgroundTheme();
  setActiveNav();
  paintShell();

  let hash = location.hash || "#timer";
  hash = routeGuard(hash);
  if(hash !== location.hash) location.hash = hash;

  setTitle(hash);

  const view = $("#view");
  if(!view) return;
  view.innerHTML = "";

  const page = ({
    "#timer": renderTimer,
    "#goals": renderGoals,
    "#progress": renderProgress,
    "#store": renderStore,
    "#stats": renderStats,
    "#notebooks": renderNotebooks,
    "#plan": renderPlan,
    "#leaderboard": renderLeaderboardLocal,
    "#settings": renderSettings,
    "#profile": renderProfile
  })[hash] || renderTimer;

  page(view);
}

/* =========================================================
  Timer logic (earn 1 coin per minute)
========================================================= */
setInterval(()=>{
  if(!state.timer.running) return;
  const now = Date.now();
  if(!state.timer.lastTick) state.timer.lastTick = now;

  const deltaSec = Math.floor((now - state.timer.lastTick)/1000);
  if(deltaSec <= 0) return;

  state.timer.lastTick = now;
  state.timer.carrySeconds += deltaSec;

  while(state.timer.carrySeconds >= 60){
    state.timer.carrySeconds -= 60;
    earnOneMinute();
  }

  saveState();
  const secLeft = 60 - state.timer.carrySeconds;
  const hud = $("#timerSecLeft");
  if(hud) hud.textContent = `${secLeft}s`;
}, 1000);

function earnOneMinute(){
  state.coins += 1;
  state.totalMinutes += 1;

  const skin = state.equipped.timerSkin;
  state.sessions.push({ tsISO: nowISO(), minutes:1, skin });
  state.daily.sessionsToday.push({ tsISO: nowISO(), minutes:1, skin });

  state.history.unshift({ ts: nowISO(), delta:+1, reason:"دقيقة مكتملة (Timer)" });
  state.history = state.history.slice(0, 80);

  const pop = $("#coinPop");
  if(pop){
    pop.textContent = "+1 SC";
    pop.classList.add("show");
    setTimeout(()=>pop.classList.remove("show"), 300);
  }
}

/* =========================================================
  Pages
========================================================= */
function minutesToday(){
  const t = todayKey();
  return (state.sessions||[]).filter(s=> (s.tsISO||"").slice(0,10)===t).length;
}
function minutesInLastDays(days){
  const from = Date.now() - days*24*60*60*1000;
  return (state.sessions||[]).filter(s=> Date.parse(s.tsISO||0) >= from).length;
}
function bar(val, max){
  const pct = clamp((val/(max||1))*100, 0, 100);
  return `
    <div style="margin-top:8px;border:1px solid var(--line);border-radius:999px;overflow:hidden;background:rgba(255,255,255,.04)">
      <div style="width:${pct}%;height:10px;background:var(--pri)"></div>
    </div>
    <div class="small" style="margin-top:6px">${val} / ${max} دقيقة</div>
  `;
}

/* ---------------------------
  Timer page (safe even if THREE missing)
---------------------------- */
function renderTimer(view){
  const wrap = document.createElement("div");
  wrap.className = "grid two";

  const left = document.createElement("div");
  left.className = "card";
  left.innerHTML = `
    <h3 class="h">التايمر</h3>
    <p class="p">كل دقيقة مكتملة = <b>1 Seraj Coin</b>.</p>

    <div class="timerWrap" id="timerWrap">
      <div class="timerHUD">
        <div class="hudBox">
          <div class="timerBig">${state.timer.running ? "RUN" : "READY"}</div>
          <div class="timerSmall">ثواني للـ +1: <span id="timerSecLeft">${60 - state.timer.carrySeconds}s</span></div>
        </div>
        <div class="hudBox">
          <div class="timerBig">${state.coins} SC</div>
          <div class="timerSmall">الرصيد الحالي</div>
        </div>
      </div>

      <div class="timerControls">
        <div class="row">
          <button class="btn primary" id="btnStartStop">${state.timer.running ? "إيقاف" : "تشغيل"}</button>
          <button class="btn" id="btnResetTimer">تصفير العدّاد</button>
        </div>
      </div>

      <div class="coinPop" id="coinPop">+1 SC</div>

      <div id="timer3dOrFallback" style="margin-top:10px"></div>
    </div>
  `;

  const right = document.createElement("div");
  right.className = "card";
  right.innerHTML = `
    <h3 class="h">مختصر اليوم</h3>
    <div class="grid three">
      <div class="kpi"><div class="n">${minutesToday()}</div><div class="t">دقائق اليوم</div></div>
      <div class="kpi"><div class="n">${state.daily.locked ? "🔒" : "✅"}</div><div class="t">أهداف اليوم</div></div>
      <div class="kpi"><div class="n">${escapeHtml(state.equipped.timerSkin)}</div><div class="t">Skin</div></div>
    </div>
    <div class="sep"></div>
    <div class="row">
      <a class="btn" href="#goals">أهداف اليوم</a>
      <a class="btn" href="#store">المتجر</a>
    </div>
  `;

  wrap.appendChild(left);
  wrap.appendChild(right);
  view.appendChild(wrap);

  // 3D timer placeholder (no crash if Three.js absent)
  const box = $("#timer3dOrFallback");
  if(box){
    if(window.THREE){
      box.innerHTML = `<div class="small">✅ Three.js موجود — (إذا حاب، بركب لك 3D Timer كامل لاحقًا)</div>`;
    }else{
      box.innerHTML = `<div class="small" style="opacity:.85">Three.js مش محمّل — التايمر شغال بدون 3D.</div>`;
    }
  }

  $("#btnStartStop").onclick = ()=>{
    if(!state.daily.goals){
      toast("لازم تدخل أهداف اليوم أولاً", "bad");
      location.hash = "#goals";
      return;
    }
    state.timer.running = !state.timer.running;
    if(state.timer.running) state.timer.lastTick = Date.now();
    saveState();
    render();
  };

  $("#btnResetTimer").onclick = ()=>{
    state.timer.running = false;
    state.timer.carrySeconds = 0;
    state.timer.lastTick = 0;
    saveState();
    render();
  };
}

/* ---------------------------
  Goals + heuristic plan
---------------------------- */
function generateStudyPlan(goals){
  const MIN=25, MAX=55;
  const subjects = goals.subjects.map(s=>{
    const target = Math.round(goals.totalMinutes * s.pct / 100);
    return { name:s.name, left:target };
  }).sort((a,b)=>b.left-a.left);

  const plan = [];
  let last=null, last2=null;

  function pick(){
    const sorted = subjects.slice().sort((a,b)=>b.left-a.left);
    for(const s of sorted){
      if(s.left<=0) continue;
      if(last && last2 && last===s.name && last2===s.name) continue;
      return s;
    }
    return sorted.find(x=>x.left>0) || null;
  }

  while(subjects.some(s=>s.left>0)){
    const s = pick();
    if(!s) break;
    let chunk = clamp(s.left, MIN, MAX);

    if(s.left < MIN){
      const prev = plan.slice().reverse().find(x=>x.subject===s.name);
      if(prev && prev.minutes + s.left <= MAX){
        prev.minutes += s.left;
        s.left = 0;
      }else{
        chunk = clamp(s.left, 15, 20);
        plan.push({ subject:s.name, minutes:chunk, quick:true });
        s.left -= chunk;
      }
    }else{
      plan.push({ subject:s.name, minutes:chunk });
      s.left -= chunk;
    }
    last2 = last; last = s.name;
    if(plan.length>80) break;
  }
  return plan;
}

function renderGoals(view){
  const card = document.createElement("div");
  card.className = "card";

  const goals = state.daily.goals;
  const subj = goals?.subjects || [
    {name:"رياضيات", pct:40},
    {name:"عربي", pct:25},
    {name:"إنجليزي", pct:20},
    {name:"مادة 4", pct:15}
  ];

  card.innerHTML = `
    <h3 class="h">أهداف اليوم (إلزامي)</h3>
    <p class="p">لا تقدر تستخدم باقي الصفحات قبل إدخال أهداف اليوم.</p>

    <div class="grid two">
      <div>
        <label>وقت الدراسة الكلي (بالساعات)</label>
        <input id="gTotalH" class="field" type="number" min="1" max="16" step="0.5" value="${goals ? (goals.totalMinutes/60) : 3}">
      </div>
      <div>
        <label>وقت بداية الدراسة (اختياري)</label>
        <input id="gStart" class="field" type="time" value="${goals?.startTime || ""}">
      </div>
    </div>

    <div class="sep"></div>
    <div id="subjectsBox"></div>

    <div class="row" style="margin-top:12px">
      <button class="btn" id="btnAddSub">+ إضافة مادة</button>
      <button class="btn primary" id="btnSaveGoals">حفظ + توليد خطة</button>
    </div>

    <div class="sep"></div>
    <h3 class="h">الخطة المقترحة</h3>
    <div id="planBox" class="list"></div>
    <p class="small">قواعد: 25–55 دقيقة للجلسة، منع 3 جلسات متتالية لنفس المادة، وبقايا أقل من 25 تُدمج قدر الإمكان.</p>
  `;
  view.appendChild(card);

  // local editable list
  const tmp = subj.map(x=>({name:x.name, pct:Number(x.pct)}));

  function renderSubjects(){
    const box = $("#subjectsBox");
    const sum = tmp.reduce((a,b)=>a+Number(b.pct||0),0);

    box.innerHTML = `
      <div class="grid two">
        ${tmp.map((s,i)=>`
          <div class="item">
            <div class="row" style="justify-content:space-between">
              <div style="flex:1;min-width:160px">
                <label>المادة</label>
                <input class="field" data-name="${i}" value="${escapeHtml(s.name)}">
              </div>
              <div style="width:140px">
                <label>النسبة %</label>
                <input class="field" type="number" min="0" max="100" step="1" data-pct="${i}" value="${s.pct}">
              </div>
              <button class="btn" data-del="${i}">حذف</button>
            </div>
          </div>
        `).join("")}
      </div>
      <div class="small" id="pctSum" style="color:${sum===100?"var(--good)":"var(--warn)"}">مجموع النسب: ${sum}%</div>
    `;

    $$("[data-name]").forEach(inp=>{
      inp.oninput = ()=>{ tmp[Number(inp.dataset.name)].name = inp.value; };
    });
    $$("[data-pct]").forEach(inp=>{
      inp.oninput = ()=>{ tmp[Number(inp.dataset.pct)].pct = Number(inp.value||0); renderSubjects(); };
    });
    $$("[data-del]").forEach(btn=>{
      btn.onclick = ()=>{ tmp.splice(Number(btn.dataset.del),1); renderSubjects(); };
    });
  }

  function renderPlanBox(){
    const pb = $("#planBox");
    const plan = state.daily.plan || [];
    pb.innerHTML = plan.length ? plan.map((p,idx)=>`
      <div class="item">
        <div class="row" style="justify-content:space-between">
          <div>
            <div class="itemTitle">جلسة ${idx+1}: ${escapeHtml(p.subject)}</div>
            <div class="itemSub">${p.minutes} دقيقة • استراحة 5–10 دقائق</div>
          </div>
          <span class="badge">${p.minutes}m</span>
        </div>
      </div>
    `).join("") : `<div class="small">لا توجد خطة بعد.</div>`;
  }

  $("#btnAddSub").onclick = ()=>{
    tmp.push({name:`مادة ${tmp.length+1}`, pct:0});
    renderSubjects();
  };

  $("#btnSaveGoals").onclick = ()=>{
    const totalH = Number($("#gTotalH").value||0);
    const totalMinutes = Math.round(totalH*60);
    const startTime = $("#gStart").value || "";
    const sum = tmp.reduce((a,b)=>a+Number(b.pct||0),0);

    if(totalMinutes<=0){ toast("أدخل وقت صحيح", "bad"); return; }
    if(sum!==100){ toast("مجموع النسب لازم يكون 100%", "bad"); return; }
    if(tmp.some(s=>!String(s.name||"").trim())){ toast("في مادة اسمها فاضي", "bad"); return; }

    state.daily.goals = { totalMinutes, startTime, subjects: tmp.map(s=>({name:String(s.name).trim(), pct:Number(s.pct)})) };
    state.daily.plan = generateStudyPlan(state.daily.goals);
    state.daily.locked = false;
    saveState();
    toast("تم حفظ أهداف اليوم ✅", "good");
    render();
  };

  renderSubjects();
  renderPlanBox();
}

/* ---------------------------
  Progress
---------------------------- */
function renderProgress(view){
  const card = document.createElement("div");
  card.className = "grid two";

  const today = minutesToday();
  const week = minutesInLastDays(7);
  const month = minutesInLastDays(30);

  const left = document.createElement("div");
  left.className = "card";
  left.innerHTML = `
    <h3 class="h">التقدم + العملات</h3>
    <div class="grid three">
      <div class="kpi"><div class="n">${state.coins}</div><div class="t">Seraj Coin</div></div>
      <div class="kpi"><div class="n">${today}</div><div class="t">دقائق اليوم</div></div>
      <div class="kpi"><div class="n">${state.totalMinutes}</div><div class="t">الإجمالي</div></div>
    </div>
    <div class="sep"></div>
    <h3 class="h">History</h3>
    <div class="list" id="histBox"></div>
  `;

  const right = document.createElement("div");
  right.className = "card";
  right.innerHTML = `
    <h3 class="h">خط الإنجاز</h3>
    <div class="item">
      <div class="itemTitle">اليوم</div>
      ${bar(today, (state.daily.goals?.totalMinutes || 180))}
    </div>
    <div class="item">
      <div class="itemTitle">آخر 7 أيام</div>
      ${bar(week, 7*(state.daily.goals?.totalMinutes || 180))}
    </div>
    <div class="item">
      <div class="itemTitle">آخر 30 يوم</div>
      ${bar(month, 30*(state.daily.goals?.totalMinutes || 180))}
    </div>
  `;

  card.appendChild(left);
  card.appendChild(right);
  view.appendChild(card);

  const hb = $("#histBox");
  const hist = (state.history||[]).slice(0,18);
  hb.innerHTML = hist.length ? hist.map(h=>`
    <div class="item">
      <div class="row" style="justify-content:space-between">
        <div>
          <div class="itemTitle">${h.delta>0?`+${h.delta}`:h.delta} SC</div>
          <div class="itemSub">${escapeHtml(h.reason)} • ${new Date(h.ts).toLocaleString("ar-JO")}</div>
        </div>
        <span class="badge">${h.delta>0?"ربح":"صرف"}</span>
      </div>
    </div>
  `).join("") : `<div class="small">ما في سجل بعد.</div>`;
}

/* ---------------------------
  Store
---------------------------- */
const STORE = [
  { id:"skin_fire",  slot:"timerSkin", name:"Timer Skin — Fire",  price:120, desc:"Glow ناري" },
  { id:"skin_water", slot:"timerSkin", name:"Timer Skin — Water", price:120, desc:"Glow مائي" },
  { id:"skin_jordan",slot:"timerSkin", name:"Timer Skin — Jordan",price:350, desc:"علم الأردن" },

  { id:"bg_fire",  slot:"bgTheme", name:"Background — Fire",  price:60,  desc:"خلفية دافئة" },
  { id:"bg_water", slot:"bgTheme", name:"Background — Water", price:60,  desc:"خلفية هادئة" },
  { id:"bg_jordan",slot:"bgTheme", name:"Background — Jordan",price:140, desc:"خلفية وطنية" }
];

function renderStore(view){
  const card = document.createElement("div");
  card.className = "grid two";

  const left = document.createElement("div");
  left.className = "card";
  left.innerHTML = `
    <h3 class="h">المتجر</h3>
    <p class="p">1 Coin لكل دقيقة. الأشياء الكبيرة بدها وقت أكثر.</p>
    <div class="grid" id="storeList"></div>
  `;

  const right = document.createElement("div");
  right.className = "card";
  right.innerHTML = `
    <h3 class="h">مخزونك</h3>
    <div class="item"><div class="itemTitle">الرصيد</div><div class="itemSub"><b>${state.coins} SC</b></div></div>
    <div class="sep"></div>
    <div class="item">
      <div class="itemTitle">المجهز الآن</div>
      <div class="itemSub">Timer Skin: <b>${escapeHtml(state.equipped.timerSkin)}</b></div>
      <div class="itemSub">Background: <b>${escapeHtml(state.equipped.bgTheme)}</b></div>
    </div>
  `;

  card.appendChild(left);
  card.appendChild(right);
  view.appendChild(card);

  const list = $("#storeList");
  list.innerHTML = STORE.map(it=>{
    const owned = !!state.inventory[it.id];
    const equipped = state.equipped[it.slot] === it.id;
    const canBuy = state.coins >= it.price;

    return `
      <div class="item">
        <div class="row" style="justify-content:space-between">
          <div style="min-width:220px">
            <div class="itemTitle">${escapeHtml(it.name)}</div>
            <div class="itemSub">${escapeHtml(it.desc)} • السعر: <b>${it.price} SC</b></div>
          </div>
          <div class="row">
            ${owned ? `<span class="badge">مملوك</span>` : `<span class="badge">${canBuy?"تقدر تشتري":"ناقصك عملات"}</span>`}
            ${owned
              ? `<button class="btn ${equipped?"primary":""}" data-eq="${it.id}">${equipped?"مُجهّز":"تجهيز"}</button>`
              : `<button class="btn primary" data-buy="${it.id}">شراء</button>`
            }
          </div>
        </div>
      </div>
    `;
  }).join("");

  $$("[data-buy]").forEach(b=> b.onclick = ()=> buyItem(b.dataset.buy));
  $$("[data-eq]").forEach(b=> b.onclick = ()=> equipItem(b.dataset.eq));
}
function buyItem(id){
  const it = STORE.find(x=>x.id===id);
  if(!it) return;
  if(state.inventory[it.id]){ toast("أنت مالكه أصلاً"); return; }
  if(state.coins < it.price){ toast("رصيدك لا يكفي", "bad"); return; }

  state.coins -= it.price;
  state.inventory[it.id] = true;
  state.history.unshift({ ts: nowISO(), delta: -it.price, reason: `شراء: ${it.name}` });
  state.history = state.history.slice(0, 80);
  saveState();
  toast("تم الشراء ✅", "good");
  render();
}
function equipItem(id){
  const it = STORE.find(x=>x.id===id);
  if(!it) return;
  if(!state.inventory[it.id]){ toast("لازم تشتريه أولاً", "bad"); return; }
  state.equipped[it.slot] = it.id;
  saveState();
  toast("تم التجهيز ✅", "good");
  render();
}

/* ---------------------------
  Stats + Badges
---------------------------- */
function computeBadges(total){
  const defs = [
    { at:60,   icon:"🥉", name:"ساعة إنجاز", desc:"وصلت 60 دقيقة إجمالي" },
    { at:300,  icon:"🥈", name:"5 ساعات",    desc:"استمراريتك ممتازة" },
    { at:600,  icon:"🥇", name:"10 ساعات",   desc:"أنت جدي بالتوجيهي" },
    { at:1200, icon:"🏅", name:"20 ساعة",    desc:"محرك قوي" },
    { at:2400, icon:"🏆", name:"40 ساعة",    desc:"مستوى متقدم" }
  ];
  return defs.map(d=>({ ...d, earned: total>=d.at }));
}
function renderStats(view){
  const card = document.createElement("div");
  card.className = "grid two";

  const today = minutesToday();
  const week = minutesInLastDays(7);
  const month = minutesInLastDays(30);
  const badges = computeBadges(state.totalMinutes);

  const left = document.createElement("div");
  left.className = "card";
  left.innerHTML = `
    <h3 class="h">الإحصائيات</h3>
    <div class="grid three">
      <div class="kpi"><div class="n">${today}</div><div class="t">اليوم</div></div>
      <div class="kpi"><div class="n">${week}</div><div class="t">الأسبوع</div></div>
      <div class="kpi"><div class="n">${month}</div><div class="t">الشهر</div></div>
    </div>
    <div class="sep"></div>
    <div class="kpi"><div class="n">${state.totalMinutes}</div><div class="t">الإجمالي (دقيقة)</div></div>
  `;

  const right = document.createElement("div");
  right.className = "card";
  right.innerHTML = `
    <h3 class="h">Badges</h3>
    <div class="list">
      ${badges.map(b=>`
        <div class="item">
          <div class="row" style="justify-content:space-between">
            <div>
              <div class="itemTitle">${b.icon} ${escapeHtml(b.name)}</div>
              <div class="itemSub">${escapeHtml(b.desc)}</div>
            </div>
            <span class="badge">${b.earned?"مُكتسب":"لسه"}</span>
          </div>
        </div>
      `).join("")}
    </div>
  `;
  card.appendChild(left);
  card.appendChild(right);
  view.appendChild(card);
}

/* ---------------------------
  Avatar/Profile (simple SVG)
---------------------------- */
function opt(current, arr){
  return arr.map(v=>`<option value="${v}" ${v===current?"selected":""}>${v}</option>`).join("");
}
function buildAvatarSVG(p){
  const mouth = p.face==="smile"
    ? `<path d="M78 112 Q100 128 122 112" stroke="#2b2b2b" stroke-width="6" fill="none" stroke-linecap="round"/>`
    : p.face==="happy"
      ? `<path d="M76 110 Q100 140 124 110" stroke="#2b2b2b" stroke-width="6" fill="none" stroke-linecap="round"/>`
      : `<path d="M80 118 L120 118" stroke="#2b2b2b" stroke-width="6" stroke-linecap="round"/>`;

  const g = p.glasses==="round"
    ? `<circle cx="78" cy="92" r="16" stroke="#111" stroke-width="6" fill="rgba(255,255,255,.2)"/>
       <circle cx="122" cy="92" r="16" stroke="#111" stroke-width="6" fill="rgba(255,255,255,.2)"/>
       <path d="M94 92 L106 92" stroke="#111" stroke-width="6" stroke-linecap="round"/>`
    : p.glasses==="square"
      ? `<rect x="62" y="76" width="32" height="32" rx="8" stroke="#111" stroke-width="6" fill="rgba(255,255,255,.2)"/>
         <rect x="106" y="76" width="32" height="32" rx="8" stroke="#111" stroke-width="6" fill="rgba(255,255,255,.2)"/>
         <path d="M94 92 L106 92" stroke="#111" stroke-width="6" stroke-linecap="round"/>`
      : "";

  return `
  <svg width="220" height="220" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-label="Seraj Avatar">
    <g>
      <circle cx="100" cy="90" r="56" fill="${p.skin}"/>
      <path d="M52 82 Q100 30 148 82 Q132 50 100 46 Q68 50 52 82Z" fill="${p.hair}"/>
      <circle cx="80" cy="92" r="7" fill="#2b2b2b"/>
      <circle cx="120" cy="92" r="7" fill="#2b2b2b"/>
      ${g}
      ${mouth}
      <path d="M48 156 Q100 128 152 156 L152 200 L48 200Z" fill="${p.clothes}"/>
    </g>
  </svg>`;
}
function renderProfile(view){
  const card = document.createElement("div");
  card.className = "grid two";

  const left = document.createElement("div");
  left.className = "card";
  left.innerHTML = `
    <h3 class="h">Avatar مبسط</h3>
    <div class="grid two">
      <div><label>لون البشرة</label><input id="avSkin" class="field" type="color" value="${state.avatar.parts.skin}"></div>
      <div><label>لون الشعر</label><input id="avHair" class="field" type="color" value="${state.avatar.parts.hair}"></div>
      <div>
        <label>نظارة</label>
        <select id="avGlasses" class="field">${opt(state.avatar.parts.glasses, ["none","round","square"])}</select>
      </div>
      <div><label>الملابس</label><input id="avClothes" class="field" type="color" value="${state.avatar.parts.clothes}"></div>
      <div>
        <label>التعبير</label>
        <select id="avFace" class="field">${opt(state.avatar.parts.face, ["smile","serious","happy"])}</select>
      </div>
    </div>
    <div class="row" style="margin-top:12px">
      <button class="btn primary" id="btnSaveAvatar">حفظ</button>
    </div>
  `;

  const right = document.createElement("div");
  right.className = "card";
  right.innerHTML = `
    <h3 class="h">معاينة</h3>
    <div class="item" style="display:grid;place-items:center;min-height:260px" id="avatarPreview"></div>
  `;

  card.appendChild(left);
  card.appendChild(right);
  view.appendChild(card);

  const preview = $("#avatarPreview");

  function rebuild(){
    const p = {
      skin: $("#avSkin").value,
      hair: $("#avHair").value,
      glasses: $("#avGlasses").value,
      clothes: $("#avClothes").value,
      face: $("#avFace").value
    };
    const svg = buildAvatarSVG(p);
    preview.innerHTML = svg;
    return {p, svg};
  }

  rebuild();
  ["avSkin","avHair","avGlasses","avClothes","avFace"].forEach(id=>{
    $("#"+id).oninput = rebuild;
    $("#"+id).onchange = rebuild;
  });

  $("#btnSaveAvatar").onclick = ()=>{
    const {p, svg} = rebuild();
    state.avatar.parts = p;
    state.avatar.svg = svg;
    saveState();
    toast("تم حفظ الأفاتار ✅", "good");
    paintShell();
  };
}

/* ---------------------------
  Notebooks
---------------------------- */
function renderNotebooks(view){
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <h3 class="h">الدفاتر</h3>

    <div class="grid two">
      <div>
        <label>القسم</label>
        <select id="nbType" class="field">
          ${opt("strengths", ["strengths","weaknesses","lessonNotes"])}
        </select>
      </div>
      <div>
        <label>بحث</label>
        <input id="nbSearch" class="field" placeholder="اكتب كلمة...">
      </div>
    </div>

    <div class="sep"></div>

    <div class="grid two">
      <div>
        <label>نص الملاحظة</label>
        <textarea id="nbText" class="field" rows="3" placeholder="اكتب..."></textarea>
      </div>
      <div class="row" style="align-items:flex-end">
        <button class="btn primary" id="nbAdd">إضافة</button>
      </div>
    </div>

    <div class="sep"></div>
    <div id="nbList" class="list"></div>
  `;
  view.appendChild(card);

  function label(t){
    return t==="strengths" ? "نقاط قوة" : t==="weaknesses" ? "نقاط ضعف" : "ملاحظات الدرس";
  }

  function renderList(){
    const t = $("#nbType").value;
    const q = ($("#nbSearch").value||"").trim().toLowerCase();
    const arr = state.notebooks[t] || [];
    const filtered = q ? arr.filter(x=> String(x.text||"").toLowerCase().includes(q)) : arr;

    const box = $("#nbList");
    box.innerHTML = filtered.length ? filtered
      .slice()
      .sort((a,b)=> (b.ts||"").localeCompare(a.ts||""))
      .map(x=>`
        <div class="item">
          <div class="row" style="justify-content:space-between">
            <div style="flex:1">
              <div class="itemTitle">${label(t)}</div>
              <div class="itemSub">${new Date(x.ts).toLocaleString("ar-JO")}</div>
              <div style="margin-top:6px">${escapeHtml(x.text)}</div>
            </div>
            <div class="row">
              <button class="btn" data-edit="${x.id}">تعديل</button>
              <button class="btn" data-del="${x.id}">حذف</button>
            </div>
          </div>
        </div>
      `).join("") : `<div class="small">لا يوجد عناصر.</div>`;

    $$("[data-del]").forEach(b=>{
      b.onclick = ()=>{
        const id = b.dataset.del;
        state.notebooks[t] = (state.notebooks[t]||[]).filter(x=>x.id!==id);
        saveState();
        renderList();
      };
    });
    $$("[data-edit]").forEach(b=>{
      b.onclick = ()=>{
        const id = b.dataset.edit;
        const item = (state.notebooks[t]||[]).find(x=>x.id===id);
        if(!item) return;
        const txt = prompt("عدّل النص:", item.text);
        if(txt===null) return;
        item.text = String(txt).trim();
        saveState();
        renderList();
      };
    });
  }

  $("#nbType").onchange = renderList;
  $("#nbSearch").oninput = renderList;

  $("#nbAdd").onclick = ()=>{
    const t = $("#nbType").value;
    const text = ($("#nbText").value||"").trim();
    if(!text){ toast("اكتب نص", "bad"); return; }
    const item = { id: uuid(), ts: nowISO(), text };
    state.notebooks[t] = [item, ...(state.notebooks[t]||[])];
    $("#nbText").value = "";
    saveState();
    renderList();
  };

  renderList();
}

/* ---------------------------
  Long plan
---------------------------- */
function renderPlan(view){
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <h3 class="h">خطة طويلة</h3>
    <p class="p"><b>${escapeHtml(state.longPlan.hero)}</b></p>

    <div class="grid two">
      <div>
        <label>المدة</label>
        <select id="lpRange" class="field">
          ${[30,60,90,120].map(n=>`<option value="${n}" ${n===state.longPlan.rangeDays?"selected":""}>${n} يوم</option>`).join("")}
        </select>
      </div>
      <div class="row" style="align-items:flex-end">
        <button class="btn" id="lpBuild">توليد أيام الخطة</button>
      </div>
    </div>

    <div class="sep"></div>

    <div class="grid two">
      <div>
        <label>تاريخ</label>
        <input id="lpDate" class="field" type="date" value="${todayKey()}">
      </div>
      <div>
        <label>المادة</label>
        <input id="lpSub" class="field" placeholder="مثلاً: رياضيات">
      </div>
      <div style="grid-column:1/-1">
        <label>المهمة</label>
        <input id="lpTask" class="field" placeholder="مثلاً: حل 30 سؤال مشتقات">
      </div>
      <div class="row" style="align-items:flex-end">
        <button class="btn primary" id="lpAddTask">إضافة مهمة</button>
      </div>
    </div>

    <div class="sep"></div>
    <div id="lpList" class="list"></div>
  `;
  view.appendChild(card);

  $("#lpBuild").onclick = ()=>{
    const n = Number($("#lpRange").value);
    state.longPlan.rangeDays = n;
    state.longPlan.days = [];
    const start = new Date();
    for(let i=0;i<n;i++){
      const d = new Date(start);
      d.setDate(start.getDate()+i);
      state.longPlan.days.push({ date: d.toISOString().slice(0,10), items: [] });
    }
    saveState();
    toast("تم توليد أيام الخطة ✅", "good");
    render();
  };

  $("#lpAddTask").onclick = ()=>{
    if(!state.longPlan.days || !state.longPlan.days.length){
      toast("اضغط توليد أيام الخطة أولاً", "bad");
      return;
    }
    const date = $("#lpDate").value || todayKey();
    const subject = ($("#lpSub").value||"").trim();
    const task = ($("#lpTask").value||"").trim();
    if(!subject || !task){ toast("أدخل المادة والمهمة", "bad"); return; }

    const day = state.longPlan.days.find(d=>d.date===date);
    if(!day){ toast("التاريخ خارج نطاق الخطة", "bad"); return; }
    day.items.unshift({ id: uuid(), subject, task, done:false });

    $("#lpSub").value=""; $("#lpTask").value="";
    saveState();
    renderPlanList();
  };

  function renderPlanList(){
    const box = $("#lpList");
    if(!state.longPlan.days || !state.longPlan.days.length){
      box.innerHTML = `<div class="small">اضغط "توليد أيام الخطة" لتبدأ.</div>`;
      return;
    }
    const focus = $("#lpDate").value || todayKey();
    const day = state.longPlan.days.find(d=>d.date===focus);
    if(!day){ box.innerHTML = `<div class="small">اختر تاريخ داخل نطاق الخطة.</div>`; return; }

    box.innerHTML = `
      <div class="item">
        <div class="row" style="justify-content:space-between">
          <div>
            <div class="itemTitle">مهام ${focus}</div>
            <div class="itemSub">${day.items.length} مهمة</div>
          </div>
          <span class="badge">${state.longPlan.rangeDays} يوم</span>
        </div>
      </div>
      ${day.items.map(it=>`
        <div class="item">
          <div class="row" style="justify-content:space-between">
            <div style="flex:1">
              <div class="itemTitle">${escapeHtml(it.subject)}</div>
              <div class="itemSub">${escapeHtml(it.task)}</div>
            </div>
            <div class="row">
              <button class="btn ${it.done?"primary":""}" data-done="${it.id}">${it.done?"منجز":"إنجاز"}</button>
              <button class="btn" data-del="${it.id}">حذف</button>
            </div>
          </div>
        </div>
      `).join("") || `<div class="small">لا توجد مهام لليوم.</div>`}
    `;

    $$("[data-done]").forEach(b=>{
      b.onclick = ()=>{
        const it = day.items.find(x=>x.id===b.dataset.done);
        if(!it) return;
        it.done = !it.done;
        saveState();
        renderPlanList();
      };
    });
    $$("[data-del]").forEach(b=>{
      b.onclick = ()=>{
        day.items = day.items.filter(x=>x.id!==b.dataset.del);
        saveState();
        renderPlanList();
      };
    });
  }

  $("#lpDate").onchange = renderPlanList;
  renderPlanList();
}

/* ---------------------------
  Leaderboard (local)
---------------------------- */
function renderLeaderboardLocal(view){
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <h3 class="h">🏆 المتصدرين (محلي)</h3>
    <p class="p">بدون Firebase: يعرض بيانات جهازك فقط.</p>
    <div class="list">
      <div class="item">
        <div class="row" style="justify-content:space-between">
          <div class="row" style="gap:12px">
            <span class="badge">#1</span>
            <div class="avatarCircle" style="width:38px;height:38px">${state.avatar.svg || "🙂"}</div>
            <div>
              <div class="itemTitle">${escapeHtml(state.user.displayName || "طالب سراج")}</div>
              <div class="itemSub">${state.totalMinutes} دقيقة</div>
            </div>
          </div>
          <span class="badge">${state.coins} SC</span>
        </div>
      </div>
    </div>
  `;
  view.appendChild(card);
}

/* ---------------------------
  Settings
---------------------------- */
function ownedOptions(slot){
  const ownedIds = Object.keys(state.inventory||{}).filter(id=>state.inventory[id]);
  const items = [];
  if(slot==="timerSkin"){
    items.push({id:"skin_basic", label:"Basic (مجاني)"});
    if(ownedIds.includes("skin_fire")) items.push({id:"skin_fire", label:"Fire"});
    if(ownedIds.includes("skin_water")) items.push({id:"skin_water", label:"Water"});
    if(ownedIds.includes("skin_jordan")) items.push({id:"skin_jordan", label:"Jordan"});
  }else if(slot==="bgTheme"){
    items.push({id:"bg_basic", label:"Basic (مجاني)"});
    if(ownedIds.includes("bg_fire")) items.push({id:"bg_fire", label:"Fire"});
    if(ownedIds.includes("bg_water")) items.push({id:"bg_water", label:"Water"});
    if(ownedIds.includes("bg_jordan")) items.push({id:"bg_jordan", label:"Jordan"});
  }
  return items.map(x=>`<option value="${x.id}" ${state.equipped[slot]===x.id?"selected":""}>${x.label}</option>`).join("");
}
function renderSettings(view){
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <h3 class="h">الإعدادات</h3>
    <div class="grid two">
      <div><label>Timer Skin</label><select id="setSkin" class="field">${ownedOptions("timerSkin")}</select></div>
      <div><label>Background</label><select id="setBg" class="field">${ownedOptions("bgTheme")}</select></div>
      <div><label>الصوت</label><select id="setSound" class="field">${opt(String(state.settings.sound), ["true","false"])}</select></div>
    </div>

    <div class="sep"></div>

    <div class="row">
      <button class="btn" id="resetDaily">Reset بيانات اليوم</button>
      <button class="btn ghost" id="resetAll">مسح كل البيانات</button>
    </div>
  `;
  view.appendChild(card);

  $("#setSkin").onchange = ()=>{
    state.equipped.timerSkin = $("#setSkin").value;
    saveState();
    toast("تم ✅", "good");
  };
  $("#setBg").onchange = ()=>{
    state.equipped.bgTheme = $("#setBg").value;
    saveState();
    setBackgroundTheme();
    toast("تم ✅", "good");
  };
  $("#setSound").onchange = ()=>{
    state.settings.sound = ($("#setSound").value==="true");
    saveState();
    toast("تم ✅", "good");
  };

  $("#resetDaily").onclick = ()=>{
    state.daily.goals = null;
    state.daily.plan = [];
    state.daily.sessionsToday = [];
    state.daily.locked = true;
    state.timer.running = false;
    state.timer.carrySeconds = 0;
    state.timer.lastTick = 0;
    saveState();
    toast("تم Reset لليوم", "good");
    location.hash = "#goals";
  };

  $("#resetAll").onclick = ()=>{
    if(confirm("متأكد بدك تمسح كل بيانات سراج على هذا الجهاز؟")){
      localStorage.removeItem(LS_KEY);
      location.reload();
    }
  };
}

/* =========================================================
  BOOT
========================================================= */
(function boot(){
  dailyResetIfNeeded();

  // فتح مباشر (بدون auth)
  const auth = $("#authScreen");
  const main = $("#mainScreen");
  if(auth) auth.classList.add("hidden");
  if(main) main.classList.remove("hidden");

  // زر logout: Reset اختياري
  const btnLogout = $("#btnLogout");
  if(btnLogout){
    btnLogout.textContent = "إعادة ضبط";
    btnLogout.onclick = ()=>{
      if(confirm("تمسح بيانات سراج على هذا الجهاز؟")){
        localStorage.removeItem(LS_KEY);
        location.reload();
      }
    };
  }

  paintShell();
  if(!location.hash) location.hash = "#timer";
  render();

  window.addEventListener("hashchange", render);
})();

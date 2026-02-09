const $ = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => [...el.querySelectorAll(q)];

const LS = {
  get(k, fallback=null){
    try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
    catch{ return fallback; }
  },
  set(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
};

function toast(title, desc){
  const host = $("#toastHost");
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<div class="t">${escapeHtml(title)}</div><div class="d">${escapeHtml(desc)}</div>`;
  host.appendChild(el);
  setTimeout(()=>{ el.style.opacity="0"; el.style.transform="translateY(8px)"; }, 2600);
  setTimeout(()=> el.remove(), 3200);
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[s]));
}
function escapeAttr(str){ return escapeHtml(str).replace(/"/g,"&quot;"); }
function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }

function fmtTime(sec){
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec/3600);
  const m = Math.floor((sec%3600)/60);
  const s = sec%60;
  if(h>0) return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

/* ===== Weekly Key (resets weekly) ===== */
function getWeekKey(d=new Date()){
  // ISO week key: YYYY-W##
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2,"0")}`;
}
function todayKey(d=new Date()){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

/* ===== Store Catalog ===== */
const STORE = {
  backgrounds: [
    { id:"bg-blue",  name:"الخلفية الزرقاء (الأصلية)", price:0, themeClass:"theme-blue",  anim:"radial-gradient(circle at 25% 25%, rgba(37,99,235,.65), rgba(0,0,0,0) 60%)" },
    { id:"bg-red",   name:"الخلفية الحمراء (Flame)",   price:160, themeClass:"theme-red",   anim:"radial-gradient(circle at 30% 30%, rgba(239,68,68,.62), rgba(0,0,0,0) 60%)" },
    { id:"bg-purple",name:"الخلفية البنفسجية (Nebula)",price:140, themeClass:"theme-purple",anim:"radial-gradient(circle at 30% 30%, rgba(124,58,237,.62), rgba(0,0,0,0) 60%)" },
    { id:"bg-green", name:"الخلفية الخضراء (Forest)",  price:140, themeClass:"theme-green", anim:"radial-gradient(circle at 30% 30%, rgba(34,197,94,.55), rgba(0,0,0,0) 60%)" },
    { id:"bg-amber", name:"الخلفية الذهبية (Sun)",     price:150, themeClass:"theme-amber", anim:"radial-gradient(circle at 30% 30%, rgba(245,158,11,.55), rgba(0,0,0,0) 60%)" },
    { id:"bg-cyber", name:"الخلفية السايبر (Pulse)",   price:220, themeClass:"theme-cyber", anim:"radial-gradient(circle at 25% 25%, rgba(6,182,212,.6), rgba(0,0,0,0) 55%)" },
  ],
  timerSkins: [
    { id:"t-cyan",   name:"ستايل سماوي",     price:0,   accent:"rgba(6,182,212,.95)",  glow:"rgba(124,58,237,.45)" },
    { id:"t-red",    name:"ستايل أحمر",      price:120, accent:"rgba(239,68,68,.95)",  glow:"rgba(245,158,11,.35)" },
    { id:"t-purple", name:"ستايل بنفسجي",    price:120, accent:"rgba(124,58,237,.95)", glow:"rgba(6,182,212,.35)" },
    { id:"t-green",  name:"ستايل أخضر",      price:120, accent:"rgba(34,197,94,.95)",  glow:"rgba(6,182,212,.25)" },
    { id:"t-amber",  name:"ستايل ذهبي",      price:120, accent:"rgba(245,158,11,.95)", glow:"rgba(239,68,68,.25)" },
    { id:"t-ice",    name:"ستايل ثلجي",      price:180, accent:"rgba(255,255,255,.95)",glow:"rgba(6,182,212,.35)" },
  ]
};

/* ===== App State ===== */
const state = LS.get("seraj.v2", null) || {
  user: { name:"" },
  coins: 0,

  // Timer
  timer: {
    secondsLeft: 25*60,
    totalSeconds: 25*60,
    running: false,
    lastTick: 0,
    boxPos: { x: null, y: null }, // draggable position
  },

  // Notebooks
  notebooks: {
    strengths: [], // {text, coins}
    weaknesses: [], // {text, tasks:[{text, coins, done}]}
    notes: [], // {title, body}
  },

  // Daily tasks
  daily: {
    dateKey: "",
    subjects: [], // max 12: {name}
    tasks: [], // {id, subject, text, coins, done, createdAt}
  },

  // Weekly stats
  stats: {
    weekKey: "",
    perDay: {}, // { "YYYY-MM-DD": minutes }
  },

  // Store
  store: {
    ownedBg: ["bg-blue"],
    ownedTimer: ["t-cyan"],
    activeBg: "bg-blue",
    activeTimer: "t-cyan",
  },

  // Settings
  settings: {
    reduceMotion: false,
    sound: true,
    coinPerMinute: 2,
    coinPerTask: 12,
  }
};

function save(){ LS.set("seraj.v2", state); }

/* ===== Ensure Daily/Weekly ===== */
function ensureDaily(){
  const tk = todayKey();
  if(state.daily.dateKey !== tk){
    state.daily.dateKey = tk;
    // ما نحذف المواد، فقط نبدأ مهام يوم جديد
    state.daily.tasks = [];
  }
}

function ensureWeekly(){
  const wk = getWeekKey();
  if(state.stats.weekKey !== wk){
    state.stats.weekKey = wk;
    state.stats.perDay = {};
  }
}

/* ===== Apply Theme & Timer Skin ===== */
function applyTheme(){
  const bg = STORE.backgrounds.find(x=>x.id === state.store.activeBg) || STORE.backgrounds[0];
  const animEl = $("#bgAnim");
  animEl.className = `bgLayer bgAnim ${bg.themeClass}`;

  const skin = STORE.timerSkins.find(x=>x.id === state.store.activeTimer) || STORE.timerSkins[0];
  document.documentElement.style.setProperty("--timerAccent", skin.accent);
  document.documentElement.style.setProperty("--timerGlow", skin.glow);

  document.documentElement.style.setProperty("--reduceMotion", state.settings.reduceMotion ? "1" : "0");
}

/* ===== Topbar update ===== */
function updateTop(){
  $("#coinsBadge").textContent = `${state.coins} SC`;
  $("#userBadge").textContent = state.user.name || "—";
  $("#weekHint").textContent = `الأسبوع الحالي: ${state.stats.weekKey}`;
}

/* ===== Router ===== */
const routes = {
  home: renderHome,
  notebooks: renderNotebooks,
  daily: renderDaily,
  stats: renderStats,
  store: renderStore,
  settings: renderSettings,
};

function getRoute(){
  const r = (location.hash || "#home").replace("#","");
  return routes[r] ? r : "home";
}
function go(r){ location.hash = `#${r}`; }

function setActiveNav(route){
  $$(".navItem").forEach(a=>{
    a.classList.toggle("active", a.getAttribute("href") === `#${route}`);
  });
}

function render(html){
  const view = $("#view");
  view.style.opacity = "0";
  view.style.transform = "translateY(8px)";
  setTimeout(()=>{
    view.innerHTML = html;
    view.style.opacity = "1";
    view.style.transform = "translateY(0)";
    wireView();
  }, 120);
}

function onRoute(){
  ensureDaily();
  ensureWeekly();
  applyTheme();
  updateTop();

  const r = getRoute();
  setActiveNav(r);
  render(routes[r]());
}

/* ===== Timer Logic ===== */
let timerInterval = null;

function startLoop(){
  if(timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(tickTimer, 350);
}

function tickTimer(){
  const t = state.timer;
  if(!t.running) return;

  const now = Date.now();
  const dt = Math.floor((now - t.lastTick)/1000);
  if(dt <= 0) return;

  t.lastTick = now;
  t.secondsLeft -= dt;

  if(t.secondsLeft <= 0){
    t.secondsLeft = 0;
    t.running = false;

    // rewards based on totalSeconds
    const minutes = Math.max(1, Math.round(t.totalSeconds / 60));
    const coinsEarn = minutes * state.settings.coinPerMinute;

    state.coins += coinsEarn;

    const day = todayKey();
    ensureWeekly();
    state.stats.perDay[day] = (state.stats.perDay[day] || 0) + minutes;

    toast("🎉 خلصت الجلسة!", `+${coinsEarn} SC • +${minutes} دقيقة للأسبوع`);
    burstConfetti();

    save();
    onRoute();
    return;
  }

  save();
  // update UI without rerender (if home)
  if(getRoute() === "home") updateTimerUI();
  updateTop();
}

function setTimerFromInputs(){
  const min = parseInt($("#inMin").value || "0", 10);
  const sec = parseInt($("#inSec").value || "0", 10);
  const total = Math.max(0, min*60 + sec);

  if(total <= 0){
    toast("خطأ", "حط وقت أكبر من 0");
    return;
  }
  state.timer.totalSeconds = total;
  state.timer.secondsLeft = total;
  state.timer.running = false;
  state.timer.lastTick = 0;
  save();
  toast("تم", "تم ضبط الوقت ✅");
  updateTimerUI(true);
  updateTop();
}

function startStopTimer(){
  const t = state.timer;
  if(!t.running){
    if(t.secondsLeft <= 0){
      toast("ملاحظة", "اضبط الوقت أولاً");
      return;
    }
    t.running = true;
    t.lastTick = Date.now();
    toast("🔥 بدأنا", "شد حيلك!");
  }else{
    t.running = false;
    toast("⏸️ توقف", "كمل بعد شوي");
  }
  save();
  updateTimerUI(true);
}

function resetTimer(){
  const t = state.timer;
  t.running = false;
  t.secondsLeft = t.totalSeconds;
  t.lastTick = 0;
  save();
  toast("تم", "رجعنا للبداية");
  updateTimerUI(true);
}

function updateTimerUI(force=false){
  const t = state.timer;
  const timeEl = $("#bigTime");
  const ring = $("#ring");
  const runPill = $("#runPill");
  const leftPill = $("#leftPill");

  if(!timeEl || !ring) return;

  timeEl.textContent = fmtTime(t.secondsLeft);
  runPill.textContent = t.running ? "يعمل الآن 🔥" : "متوقف ⏸️";
  leftPill.textContent = `الوقت: ${fmtTime(t.secondsLeft)} / ${fmtTime(t.totalSeconds)}`;

  const p = clamp(1 - (t.secondsLeft / t.totalSeconds), 0, 1);
  ring.style.setProperty("--prog", `${p*360}deg`);

  if(force){
    $("#inMin").value = String(Math.floor(t.totalSeconds/60));
    $("#inSec").value = String(t.totalSeconds%60);
  }
}

/* ===== Draggable Timer Box ===== */
function initDraggable(){
  const stage = $("#timerStage");
  const box = $("#timerBox");
  if(!stage || !box) return;

  // set saved pos
  if(state.timer.boxPos.x !== null && state.timer.boxPos.y !== null){
    box.style.left = state.timer.boxPos.x + "px";
    box.style.top = state.timer.boxPos.y + "px";
    box.style.transform = "translate(-50%, -50%)";
  }

  let dragging = false;
  let offsetX = 0, offsetY = 0;

  const onDown = (e)=>{
    dragging = true;
    box.setPointerCapture(e.pointerId);
    const rect = box.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
  };

  const onMove = (e)=>{
    if(!dragging) return;
    const stageRect = stage.getBoundingClientRect();

    let x = e.clientX - stageRect.left - offsetX + (box.offsetWidth/2);
    let y = e.clientY - stageRect.top - offsetY + (box.offsetHeight/2);

    // clamp inside stage
    x = clamp(x, box.offsetWidth/2, stageRect.width - box.offsetWidth/2);
    y = clamp(y, box.offsetHeight/2, stageRect.height - box.offsetHeight/2);

    box.style.left = x + "px";
    box.style.top = y + "px";
    box.style.transform = "translate(-50%, -50%)";

    state.timer.boxPos.x = x;
    state.timer.boxPos.y = y;
    save();
  };

  const onUp = ()=>{
    dragging = false;
  };

  box.addEventListener("pointerdown", onDown);
  box.addEventListener("pointermove", onMove);
  box.addEventListener("pointerup", onUp);
  box.addEventListener("pointercancel", onUp);
}

/* ===== Weakness -> Tasks Generator ===== */
function weaknessToTasks(text){
  const t = text.trim();
  if(!t) return [];
  // “تحويل” بسيط لكنه عملي: يولّد مهام تنفيذية + كوينز
  const base = state.settings.coinPerTask;
  const tasks = [
    { text:`حل 10 أسئلة عن: ${t}`, coins: base, done:false },
    { text:`مراجعة ملخص/فيديو 15 دقيقة عن: ${t}`, coins: base, done:false },
    { text:`كتابة 5 نقاط فهم (بإيدك) عن: ${t}`, coins: base, done:false },
  ];
  return tasks;
}

/* ===== Coins awarding for tasks ===== */
function completeTask(task){
  if(task.done) return;
  task.done = true;
  state.coins += task.coins;
  toast("✅ إنجاز!", `+${task.coins} SC`);
  burstConfetti(70);
  save();
}

/* ===== Pages ===== */
function renderHome(){
  const t = state.timer;
  return `
    <div class="grid">
      <div class="card" style="grid-column: span 12">
        <div class="h1">⏱️ Timer 3D</div>
        <p class="sub">اسحب التايمر داخل المسرح، وحدد الوقت اللي بدك إياه بدون حدود. عند انتهاء الجلسة: نقاط + دقائق للأسبوع.</p>

        <div class="grid">
          <div class="card" style="grid-column: span 7">
            <div class="timerStage" id="timerStage">
              <div class="timerBox" id="timerBox" title="اسحبني">
                <div class="timer3d">
                  <div class="ring" id="ring"></div>
                  <div class="timerText">
                    <div class="bigTime" id="bigTime">${fmtTime(t.secondsLeft)}</div>
                    <div class="smallMeta">
                      <span class="badgeMini" id="runPill">${t.running ? "يعمل الآن 🔥" : "متوقف ⏸️"}</span>
                      <span class="badgeMini" id="leftPill">الوقت: ${fmtTime(t.secondsLeft)} / ${fmtTime(t.totalSeconds)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="stageHint">
                <span>🖱️ اسحب التايمر لأي مكان داخل المسرح</span>
                <span>🎁 ${state.settings.coinPerMinute} SC لكل دقيقة عند النهاية</span>
              </div>
            </div>
          </div>

          <div class="card" style="grid-column: span 5">
            <div class="cardTitle">التحكم</div>

            <div class="timeRow">
              <div>
                <label class="label">دقائق (بدون حدود)</label>
                <input class="field" id="inMin" type="number" min="0" value="${Math.floor(t.totalSeconds/60)}" />
              </div>
              <div>
                <label class="label">ثواني</label>
                <input class="field" id="inSec" type="number" min="0" max="59" value="${t.totalSeconds%60}" />
              </div>
            </div>

            <div class="inline" style="margin-top:10px">
              <button class="btn primary" id="btnSetTime">ضبط الوقت</button>
              <button class="btn" id="btnStartStop">${t.running ? "إيقاف" : "بدء"}</button>
              <button class="btn ghost" id="btnReset">إعادة</button>
            </div>

            <div class="sep"></div>

            <div class="cardRow">
              <button class="btn" data-preset="25">25</button>
              <button class="btn" data-preset="45">45</button>
              <button class="btn" data-preset="60">60</button>
              <button class="btn" data-preset="90">90</button>
              <button class="btn" data-preset="120">120</button>
            </div>

            <div class="sep"></div>

            <div class="kpi">
              <div class="k">تذكير</div>
              <div class="v" style="font-size:1rem;font-weight:800;line-height:1.6">
                عند انتهاء الجلسة يتم احتساب الدقائق للأسبوع وتكسب كوينز تلقائياً.
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  `;
}

function renderNotebooks(){
  const nb = state.notebooks;
  return `
    <div class="grid">
      <div class="card" style="grid-column: span 12">
        <div class="h1">📒 دفاترك</div>
        <p class="sub">3 دفاتر: نقاط قوة = كوينز فوراً. نقاط ضعف = تتحول لمهام + كوينز عند الإنجاز. وملاحظات عامة.</p>

        <div class="tabsRow">
          <button class="tabBtn active" data-nbtab="strengths">💪 نقاط القوة</button>
          <button class="tabBtn" data-nbtab="weaknesses">🧱 نقاط الضعف</button>
          <button class="tabBtn" data-nbtab="notes">📝 ملاحظات</button>
        </div>

        <div class="sep"></div>

        <div id="nbPanel"></div>
      </div>
    </div>

    <template id="tplStrengths">
      <div class="grid">
        <div class="card" style="grid-column: span 5">
          <div class="cardTitle">إضافة نقطة قوة</div>
          <label class="label">نقطة القوة</label>
          <input class="field" id="stText" placeholder="مثال: بحل سريع… / بفهم القوانين…" />

          <label class="label">قيمة الكوينز</label>
          <select class="field" id="stCoins">
            <option value="10">10 SC</option>
            <option value="20">20 SC</option>
            <option value="35">35 SC</option>
            <option value="50">50 SC</option>
          </select>

          <div class="row end gap" style="margin-top:10px">
            <button class="btn primary" id="btnAddStrength">إضافة + كوينز</button>
          </div>
        </div>

        <div class="card" style="grid-column: span 7">
          <div class="cardTitle">قائمة نقاط القوة</div>
          <div class="list" id="stList"></div>
        </div>
      </div>
    </template>

    <template id="tplWeaknesses">
      <div class="grid">
        <div class="card" style="grid-column: span 5">
          <div class="cardTitle">اكتب نقطة ضعف</div>
          <label class="label">نقطة الضعف</label>
          <input class="field" id="wkText" placeholder="مثال: ضعف في الاشتقاق / أتلخبط بالكيمياء العضوية…" />
          <div class="row end gap" style="margin-top:10px">
            <button class="btn primary" id="btnAddWeakness">حوّلها لمهام</button>
          </div>
          <div class="sep"></div>
          <div class="kpi">
            <div class="k">فكرة</div>
            <div class="v" style="font-size:1rem;font-weight:800;line-height:1.6">
              كل نقطة ضعف تتحول لـ 3 مهام جاهزة. عند إنجاز كل مهمة: +${state.settings.coinPerTask} SC.
            </div>
          </div>
        </div>

        <div class="card" style="grid-column: span 7">
          <div class="cardTitle">نقاط الضعف + المهام</div>
          <div class="list" id="wkList"></div>
        </div>
      </div>
    </template>

    <template id="tplNotes">
      <div class="grid">
        <div class="card" style="grid-column: span 5">
          <div class="cardTitle">دفتر ملاحظات</div>
          <label class="label">العنوان</label>
          <input class="field" id="noteTitle" placeholder="مثال: قوانين مهمة" />
          <label class="label">المحتوى</label>
          <textarea id="noteBody" class="field" placeholder="اكتب…" ></textarea>
          <div class="row end gap" style="margin-top:10px">
            <button class="btn primary" id="btnAddNote">حفظ</button>
          </div>
        </div>

        <div class="card" style="grid-column: span 7">
          <div class="cardTitle">ملاحظاتك</div>
          <div class="list" id="noteList"></div>
        </div>
      </div>
    </template>
  `;
}

function renderDaily(){
  ensureDaily();
  const subj = state.daily.subjects;
  const tasks = state.daily.tasks;

  return `
    <div class="grid">
      <div class="card" style="grid-column: span 12">
        <div class="h1">✅ المهام اليومية</div>
        <p class="sub">اختر موادك (حد أقصى 12)، ثم أضف مهام لكل مادة. عند الإنجاز: كوينز.</p>

        <div class="grid">
          <div class="card" style="grid-column: span 5">
            <div class="cardTitle">المواد (حتى 12)</div>

            <div class="cardRow">
              <input class="field" id="subjInput" placeholder="مثال: رياضيات / عربي / فيزياء…" />
              <button class="btn primary" id="btnAddSubj">إضافة</button>
            </div>

            <div class="sep"></div>

            <div class="subjectGrid" id="subjGrid"></div>

            <div class="sep"></div>

            <div class="kpi">
              <div class="k">تاريخ اليوم</div>
              <div class="v">${state.daily.dateKey}</div>
            </div>
          </div>

          <div class="card" style="grid-column: span 7">
            <div class="cardTitle">إضافة مهمة</div>
            <label class="label">اختر مادة</label>
            <select class="field" id="taskSubject"></select>

            <label class="label">المهمة</label>
            <input class="field" id="taskText" placeholder="مثال: حل صفحة 12 / مراجعة درس 3…" />

            <label class="label">كوينز عند الإنجاز</label>
            <input class="field" id="taskCoins" type="number" min="1" value="${state.settings.coinPerTask}" />

            <div class="row end gap" style="margin-top:10px">
              <button class="btn primary" id="btnAddTask">إضافة مهمة</button>
            </div>

            <div class="sep"></div>

            <div class="cardTitle">قائمة مهام اليوم</div>
            <div class="list" id="tasksList"></div>
          </div>
        </div>

      </div>
    </div>
  `;
}

function renderStats(){
  ensureWeekly();
  const days = Object.keys(state.stats.perDay).sort();
  const total = days.reduce((a,k)=>a+(state.stats.perDay[k]||0),0);

  // show last 7 days in this weekKey (simple)
  const rows = days.map(k=>{
    const v = state.stats.perDay[k] || 0;
    return `<div class="itemRow">
      <div class="left">
        <div class="title">${k}</div>
        <div class="desc">${v} دقيقة</div>
      </div>
      <div class="right">
        <span class="badgeMini">الأسبوع: ${state.stats.weekKey}</span>
      </div>
    </div>`;
  }).join("");

  return `
    <div class="grid">
      <div class="card" style="grid-column: span 12">
        <div class="h1">📊 الإحصائيات الأسبوعية</div>
        <p class="sub">تنعاد تلقائياً مع كل أسبوع جديد. الدقائق تُحسب عند انتهاء جلسات التايمر.</p>

        <div class="cardRow">
          <div class="kpi">
            <div class="k">الأسبوع الحالي</div>
            <div class="v">${state.stats.weekKey}</div>
          </div>
          <div class="kpi">
            <div class="k">دقائق هذا الأسبوع</div>
            <div class="v">${total}</div>
          </div>
          <div class="kpi">
            <div class="k">معدل يومي تقريبي</div>
            <div class="v">${days.length ? Math.round(total/days.length) : 0}</div>
          </div>
        </div>

        <div class="sep"></div>

        <div class="cardTitle">تفصيل الأيام</div>
        <div class="list">
          ${rows || `<div class="itemRow"><div class="left"><div class="title">لا يوجد بيانات بعد</div><div class="desc">ابدأ جلسة تايمر وخلّصها ✅</div></div></div>`}
        </div>
      </div>
    </div>
  `;
}

function renderStore(){
  const ownedBg = new Set(state.store.ownedBg);
  const ownedT = new Set(state.store.ownedTimer);

  return `
    <div class="grid">
      <div class="card" style="grid-column: span 12">
        <div class="h1">🛒 المتجر</div>
        <p class="sub">اشتري خلفيات للموقع وستايلات للتايمر. كل عنصر له شكل/أنيميشن خاص.</p>

        <div class="cardRow">
          <div class="kpi">
            <div class="k">رصيدك</div>
            <div class="v">${state.coins} SC</div>
          </div>
          <div class="kpi">
            <div class="k">الخلفية الحالية</div>
            <div class="v">${(STORE.backgrounds.find(x=>x.id===state.store.activeBg)?.name)||"—"}</div>
          </div>
          <div class="kpi">
            <div class="k">ستايل التايمر</div>
            <div class="v">${(STORE.timerSkins.find(x=>x.id===state.store.activeTimer)?.name)||"—"}</div>
          </div>
        </div>

        <div class="sep"></div>

        <div class="grid">
          <div class="card" style="grid-column: span 12">
            <div class="cardTitle">الخلفيات</div>
            <div class="storeGrid">
              ${STORE.backgrounds.map(b=>{
                const owned = ownedBg.has(b.id);
                const active = state.store.activeBg === b.id;
                const canBuy = state.coins >= b.price;

                return `
                  <div class="card storeCard">
                    <div class="tagPrice">${b.price} SC</div>
                    <div class="previewBox">
                      <div class="previewAnim" style="background:${b.anim}"></div>
                    </div>
                    <div class="sep"></div>
                    <div class="cardTitle">${escapeHtml(b.name)}</div>
                    <div class="cardRow">
                      ${owned ? `
                        <button class="btn ${active ? "primary":""}" data-apply-bg="${b.id}">
                          ${active ? "مفعّلة ✅" : "تفعيل"}
                        </button>
                      ` : `
                        <button class="btn ${canBuy ? "primary":""}" data-buy-bg="${b.id}">
                          ${canBuy ? "شراء" : "الرصيد غير كافي"}
                        </button>
                      `}
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>

          <div class="card" style="grid-column: span 12">
            <div class="cardTitle">ستايلات التايمر</div>
            <div class="storeGrid">
              ${STORE.timerSkins.map(s=>{
                const owned = ownedT.has(s.id);
                const active = state.store.activeTimer === s.id;
                const canBuy = state.coins >= s.price;

                return `
                  <div class="card storeCard">
                    <div class="tagPrice">${s.price} SC</div>
                    <div class="previewBox">
                      <div class="previewAnim" style="background: radial-gradient(circle at 30% 30%, ${s.accent}, rgba(0,0,0,0) 65%)"></div>
                    </div>
                    <div class="sep"></div>
                    <div class="cardTitle">${escapeHtml(s.name)}</div>
                    <div class="cardRow">
                      ${owned ? `
                        <button class="btn ${active ? "primary":""}" data-apply-timer="${s.id}">
                          ${active ? "مفعّل ✅" : "تفعيل"}
                        </button>
                      ` : `
                        <button class="btn ${canBuy ? "primary":""}" data-buy-timer="${s.id}">
                          ${canBuy ? "شراء" : "الرصيد غير كافي"}
                        </button>
                      `}
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        </div>

      </div>
    </div>
  `;
}

function renderSettings(){
  return `
    <div class="grid">
      <div class="card" style="grid-column: span 12">
        <div class="h1">⚙️ الإعدادات</div>
        <p class="sub">تحكم بالتجربة: اسمك، الحركة، الصوت، تصدير/استيراد بيانات، وإعادة ضبط.</p>

        <div class="grid">
          <div class="card" style="grid-column: span 6">
            <div class="cardTitle">الاسم</div>
            <label class="label">اسمك</label>
            <input class="field" id="setName" value="${escapeAttr(state.user.name||"")}" maxlength="24" />
            <div class="row end gap" style="margin-top:10px">
              <button class="btn primary" id="btnSaveName">حفظ</button>
            </div>
          </div>

          <div class="card" style="grid-column: span 6">
            <div class="cardTitle">الحركة والصوت</div>
            <div class="itemRow">
              <div class="left">
                <div class="title">تقليل الحركة</div>
                <div class="desc">إذا بدك واجهة أهدأ.</div>
              </div>
              <div class="right">
                <button class="btn" id="btnToggleMotion">${state.settings.reduceMotion ? "مفعّل ✅" : "إيقاف"}</button>
              </div>
            </div>

            <div class="itemRow" style="margin-top:10px">
              <div class="left">
                <div class="title">الصوت</div>
                <div class="desc">تشغيل/إيقاف (حالياً بسيط).</div>
              </div>
              <div class="right">
                <button class="btn" id="btnToggleSound">${state.settings.sound ? "تشغيل ✅" : "إيقاف"}</button>
              </div>
            </div>
          </div>

          <div class="card" style="grid-column: span 12">
            <div class="cardTitle">تصدير / استيراد البيانات</div>
            <textarea class="field" id="dataBox" placeholder="انسخ بياناتك أو الصقها هنا"></textarea>
            <div class="cardRow" style="margin-top:10px">
              <button class="btn" id="btnExport">تصدير</button>
              <button class="btn primary" id="btnImport">استيراد</button>
            </div>
            <div class="tiny muted" style="margin-top:8px">
              التصدير يعطيك JSON. الاستيراد يستبدل بياناتك الحالية.
            </div>
          </div>

          <div class="card" style="grid-column: span 12">
            <div class="cardTitle">إعادة ضبط</div>
            <div class="cardRow">
              <button class="btn danger" id="btnResetAll">حذف كل شيء (خطير)</button>
            </div>
          </div>

        </div>
      </div>
    </div>
  `;
}

/* ===== Wire Views ===== */
function wireView(){
  const r = getRoute();
  if(r === "home") wireHome();
  if(r === "notebooks") wireNotebooks();
  if(r === "daily") wireDaily();
  if(r === "store") wireStore();
  if(r === "settings") wireSettings();
}

function wireHome(){
  updateTimerUI(true);
  initDraggable();

  $("#btnSetTime")?.addEventListener("click", setTimerFromInputs);
  $("#btnStartStop")?.addEventListener("click", startStopTimer);
  $("#btnReset")?.addEventListener("click", resetTimer);

  $$("[data-preset]").forEach(b=>{
    b.addEventListener("click", ()=>{
      const min = parseInt(b.dataset.preset, 10);
      state.timer.totalSeconds = min*60;
      state.timer.secondsLeft = min*60;
      state.timer.running = false;
      state.timer.lastTick = 0;
      save();
      toast("تم", `ضبط ${min} دقيقة`);
      updateTimerUI(true);
    });
  });

  // enter to set
  $("#inMin")?.addEventListener("keydown", (e)=>{ if(e.key==="Enter") setTimerFromInputs(); });
  $("#inSec")?.addEventListener("keydown", (e)=>{ if(e.key==="Enter") setTimerFromInputs(); });
}

function wireNotebooks(){
  const panel = $("#nbPanel");
  const tabs = $$("[data-nbtab]");
  let active = "strengths";

  function setTab(tab){
    active = tab;
    tabs.forEach(t=>t.classList.toggle("active", t.dataset.nbtab===tab));
    panel.innerHTML = "";

    if(tab==="strengths"){
      panel.appendChild($("#tplStrengths").content.cloneNode(true));
      renderStrengths();
    }
    if(tab==="weaknesses"){
      panel.appendChild($("#tplWeaknesses").content.cloneNode(true));
      renderWeaknesses();
    }
    if(tab==="notes"){
      panel.appendChild($("#tplNotes").content.cloneNode(true));
      renderNotes();
    }
  }

  tabs.forEach(t=> t.addEventListener("click", ()=> setTab(t.dataset.nbtab)));
  setTab(active);

  function renderStrengths(){
    const list = $("#stList");
    const items = state.notebooks.strengths;

    const draw = ()=>{
      list.innerHTML = items.length ? items.map((it,i)=>`
        <div class="itemRow">
          <div class="left">
            <div class="title">💪 ${escapeHtml(it.text)}</div>
            <div class="desc">القيمة: ${it.coins} SC</div>
          </div>
          <div class="right">
            <button class="btn" data-del-st="${i}">حذف</button>
          </div>
        </div>
      `).join("") : `<div class="itemRow"><div class="left"><div class="title">لا يوجد نقاط بعد</div><div class="desc">أضف أول نقطة قوة.</div></div></div>`;

      $$("[data-del-st]").forEach(btn=>{
        btn.addEventListener("click", ()=>{
          const i = parseInt(btn.dataset.delSt,10);
          items.splice(i,1);
          save();
          draw();
        });
      });
    };

    $("#btnAddStrength").addEventListener("click", ()=>{
      const text = ($("#stText").value || "").trim();
      const coins = parseInt($("#stCoins").value,10);
      if(!text) return toast("خطأ", "اكتب نقطة القوة");
      items.unshift({ text, coins });
      state.coins += coins; // تعطيه فوراً
      save();
      $("#stText").value = "";
      toast("تم ✅", `+${coins} SC (نقطة قوة)`);
      burstConfetti(60);
      updateTop();
      draw();
    });

    draw();
  }

  function renderWeaknesses(){
    const list = $("#wkList");
    const items = state.notebooks.weaknesses;

    const draw = ()=>{
      list.innerHTML = items.length ? items.map((it,i)=>`
        <div class="itemRow">
          <div class="left">
            <div class="title">🧱 ${escapeHtml(it.text)}</div>
            <div class="desc">تم توليد ${it.tasks.length} مهام</div>
            <div class="list" style="margin-top:10px">
              ${it.tasks.map((t,j)=>`
                <div class="taskLine ${t.done?"done":""}">
                  <input type="checkbox" ${t.done?"checked":""} data-wk-task="${i}:${j}">
                  <div class="taskText">${escapeHtml(t.text)}</div>
                  <span class="badgeMini">+${t.coins} SC</span>
                </div>
              `).join("")}
            </div>
          </div>
          <div class="right">
            <button class="btn" data-add-to-daily="${i}">إرسال للمهام اليومية</button>
            <button class="btn" data-del-wk="${i}">حذف</button>
          </div>
        </div>
      `).join("") : `<div class="itemRow"><div class="left"><div class="title">لا يوجد نقاط ضعف بعد</div><div class="desc">اكتب ضعف وخليه يتحول لمهام.</div></div></div>`;

      $$("[data-del-wk]").forEach(btn=>{
        btn.addEventListener("click", ()=>{
          const i = parseInt(btn.dataset.delWk,10);
          items.splice(i,1);
          save();
          draw();
        });
      });

      $$("[data-wk-task]").forEach(cb=>{
        cb.addEventListener("change", ()=>{
          const [i,j] = cb.dataset.wkTask.split(":").map(Number);
          const task = items[i].tasks[j];
          if(cb.checked){
            completeTask(task);
          }else{
            // لا نسمح بإلغاء الإنجاز لأنه أخذ كوينز
            cb.checked = true;
            toast("ملاحظة", "لا يمكن إلغاء مهمة بعد أخذ الكوينز.");
          }
          save();
          draw();
          updateTop();
        });
      });

      $$("[data-add-to-daily]").forEach(btn=>{
        btn.addEventListener("click", ()=>{
          const i = parseInt(btn.dataset.addToDaily,10);
          // push these tasks to daily as tasks without auto-done
          ensureDaily();
          // create subject auto if not exists
          const subjectName = "تحسين نقاط الضعف";
          if(!state.daily.subjects.some(s=>s.name===subjectName)){
            if(state.daily.subjects.length >= 12) {
              toast("تنبيه", "وصلت الحد الأقصى للمواد (12). احذف مادة لتضيف.");
              return;
            }
            state.daily.subjects.push({name: subjectName});
          }

          const wk = items[i];
          wk.tasks.forEach(t=>{
            state.daily.tasks.push({
              id: cryptoRandomId(),
              subject: subjectName,
              text: t.text,
              coins: t.coins,
              done: false,
              createdAt: Date.now(),
            });
          });
          save();
          toast("تم ✅", "انرسلت للمهام اليومية");
          go("daily");
        });
      });
    };

    $("#btnAddWeakness").addEventListener("click", ()=>{
      const text = ($("#wkText").value || "").trim();
      if(!text) return toast("خطأ", "اكتب نقطة الضعف");
      const tasks = weaknessToTasks(text);
      items.unshift({ text, tasks });
      save();
      $("#wkText").value = "";
      toast("تم ✅", "حوّلناها لمهام جاهزة");
      draw();
    });

    draw();
  }

  function renderNotes(){
    const list = $("#noteList");
    const notes = state.notebooks.notes;

    const draw = ()=>{
      list.innerHTML = notes.length ? notes.map((n,i)=>`
        <div class="itemRow">
          <div class="left">
            <div class="title">📝 ${escapeHtml(n.title || "بدون عنوان")}</div>
            <div class="desc">${escapeHtml((n.body||"").slice(0,160))}${(n.body||"").length>160?"…":""}</div>
          </div>
          <div class="right">
            <button class="btn" data-edit-note="${i}">تعديل</button>
            <button class="btn" data-del-note="${i}">حذف</button>
          </div>
        </div>
      `).join("") : `<div class="itemRow"><div class="left"><div class="title">لا يوجد ملاحظات</div><div class="desc">أضف أول ملاحظة.</div></div></div>`;

      $$("[data-del-note]").forEach(btn=>{
        btn.addEventListener("click", ()=>{
          const i = parseInt(btn.dataset.delNote,10);
          notes.splice(i,1);
          save();
          draw();
        });
      });

      $$("[data-edit-note]").forEach(btn=>{
        btn.addEventListener("click", ()=>{
          const i = parseInt(btn.dataset.editNote,10);
          const n = notes[i];
          const title = prompt("العنوان:", n.title || "");
          if(title === null) return;
          const body = prompt("المحتوى:", n.body || "");
          if(body === null) return;
          n.title = title;
          n.body = body;
          save();
          draw();
        });
      });
    };

    $("#btnAddNote").addEventListener("click", ()=>{
      const title = ($("#noteTitle").value||"").trim();
      const body = ($("#noteBody").value||"").trim();
      if(!title && !body) return toast("خطأ", "اكتب عنوان أو محتوى");
      notes.unshift({ title, body });
      save();
      $("#noteTitle").value = "";
      $("#noteBody").value = "";
      toast("تم ✅", "انحفظت الملاحظة");
      draw();
    });

    draw();
  }
}

function wireDaily(){
  const subjGrid = $("#subjGrid");
  const subjSelect = $("#taskSubject");
  const tasksList = $("#tasksList");

  const drawSubjects = ()=>{
    subjGrid.innerHTML = state.daily.subjects.map((s,i)=>`
      <div class="subjectChip">
        <span>${escapeHtml(s.name)}</span>
        <button class="btn ghost" data-del-subj="${i}">حذف</button>
      </div>
    `).join("") || `<div class="tiny muted">لا يوجد مواد بعد. أضف مادة.</div>`;

    subjSelect.innerHTML = state.daily.subjects.map(s=>`<option value="${escapeAttr(s.name)}">${escapeHtml(s.name)}</option>`).join("")
      || `<option value="">— لا يوجد مواد —</option>`;

    $$("[data-del-subj]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const i = parseInt(btn.dataset.delSubj,10);
        const name = state.daily.subjects[i].name;
        state.daily.subjects.splice(i,1);
        // حذف مهام المادة
        state.daily.tasks = state.daily.tasks.filter(t=>t.subject !== name);
        save();
        toast("تم", "تم حذف المادة ومهامها");
        drawAll();
      });
    });
  };

  const drawTasks = ()=>{
    const items = state.daily.tasks.slice().sort((a,b)=>b.createdAt-a.createdAt);
    tasksList.innerHTML = items.length ? items.map(t=>`
      <div class="taskLine ${t.done?"done":""}">
        <input type="checkbox" ${t.done?"checked":""} data-task="${t.id}">
        <div class="taskText"><b>[${escapeHtml(t.subject)}]</b> ${escapeHtml(t.text)}</div>
        <span class="badgeMini">+${t.coins} SC</span>
        <button class="btn ghost" data-del-task="${t.id}">حذف</button>
      </div>
    `).join("") : `<div class="itemRow"><div class="left"><div class="title">لا يوجد مهام اليوم</div><div class="desc">أضف مهمة من الأعلى.</div></div></div>`;

    $$("[data-del-task]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const id = btn.dataset.delTask;
        state.daily.tasks = state.daily.tasks.filter(x=>x.id !== id);
        save();
        drawAll();
      });
    });

    $$("[data-task]").forEach(cb=>{
      cb.addEventListener("change", ()=>{
        const id = cb.dataset.task;
        const task = state.daily.tasks.find(x=>x.id===id);
        if(!task) return;
        if(cb.checked){
          completeTask(task);
          save();
          drawAll();
        }else{
          cb.checked = true;
          toast("ملاحظة", "لا يمكن إلغاء بعد أخذ الكوينز.");
        }
      });
    });
  };

  const drawAll = ()=>{
    drawSubjects();
    drawTasks();
    updateTop();
  };

  $("#btnAddSubj").addEventListener("click", ()=>{
    const name = ($("#subjInput").value||"").trim();
    if(!name) return toast("خطأ", "اكتب اسم المادة");
    if(state.daily.subjects.length >= 12) return toast("تنبيه", "وصلت الحد الأقصى 12 مادة");
    if(state.daily.subjects.some(s=>s.name===name)) return toast("تنبيه", "هذه المادة موجودة");
    state.daily.subjects.push({name});
    $("#subjInput").value = "";
    save();
    toast("تم ✅", "تمت إضافة المادة");
    drawAll();
  });

  $("#btnAddTask").addEventListener("click", ()=>{
    const subject = $("#taskSubject").value;
    const text = ($("#taskText").value||"").trim();
    const coins = parseInt($("#taskCoins").value||String(state.settings.coinPerTask),10);

    if(!subject) return toast("خطأ", "أضف مادة أولاً");
    if(!text) return toast("خطأ", "اكتب المهمة");
    const c = Math.max(1, coins || state.settings.coinPerTask);

    state.daily.tasks.push({
      id: cryptoRandomId(),
      subject,
      text,
      coins: c,
      done:false,
      createdAt: Date.now(),
    });
    $("#taskText").value = "";
    save();
    toast("تم ✅", "انضافت المهمة");
    drawAll();
  });

  drawAll();
}

function wireStore(){
  $$("[data-buy-bg]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.dataset.buyBg;
      const item = STORE.backgrounds.find(x=>x.id===id);
      if(!item) return;
      if(state.store.ownedBg.includes(id)) return;
      if(state.coins < item.price) return toast("الرصيد غير كافي", "اجمع كوينز أولاً");
      state.coins -= item.price;
      state.store.ownedBg.push(id);
      state.store.activeBg = id;
      save();
      applyTheme();
      toast("تم ✅", "اشتريت الخلفية وفعّلتها");
      burstConfetti();
      onRoute();
    });
  });

  $$("[data-apply-bg]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.dataset.applyBg;
      if(!state.store.ownedBg.includes(id)) return;
      state.store.activeBg = id;
      save();
      applyTheme();
      toast("تم ✅", "تم تفعيل الخلفية");
      onRoute();
    });
  });

  $$("[data-buy-timer]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.dataset.buyTimer;
      const item = STORE.timerSkins.find(x=>x.id===id);
      if(!item) return;
      if(state.store.ownedTimer.includes(id)) return;
      if(state.coins < item.price) return toast("الرصيد غير كافي", "اجمع كوينز أولاً");
      state.coins -= item.price;
      state.store.ownedTimer.push(id);
      state.store.activeTimer = id;
      save();
      applyTheme();
      toast("تم ✅", "اشتريت ستايل التايمر وفعّلته");
      burstConfetti();
      onRoute();
    });
  });

  $$("[data-apply-timer]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.dataset.applyTimer;
      if(!state.store.ownedTimer.includes(id)) return;
      state.store.activeTimer = id;
      save();
      applyTheme();
      toast("تم ✅", "تم تفعيل ستايل التايمر");
      onRoute();
    });
  });
}

function wireSettings(){
  $("#btnSaveName").addEventListener("click", ()=>{
    const name = ($("#setName").value||"").trim().slice(0,24);
    if(!name) return toast("خطأ", "اكتب اسمك");
    state.user.name = name;
    save();
    updateTop();
    toast("تم ✅", "انحفظ الاسم");
  });

  $("#btnToggleMotion").addEventListener("click", ()=>{
    state.settings.reduceMotion = !state.settings.reduceMotion;
    save();
    applyTheme();
    toast("تم", state.settings.reduceMotion ? "تقليل الحركة ✅" : "تقليل الحركة ⛔");
    onRoute();
  });

  $("#btnToggleSound").addEventListener("click", ()=>{
    state.settings.sound = !state.settings.sound;
    save();
    toast("تم", state.settings.sound ? "الصوت ✅" : "الصوت ⛔");
    onRoute();
  });

  $("#btnExport").addEventListener("click", ()=>{
    $("#dataBox").value = JSON.stringify(state, null, 2);
    toast("تم", "انسخ البيانات");
  });

  $("#btnImport").addEventListener("click", ()=>{
    try{
      const txt = ($("#dataBox").value||"").trim();
      if(!txt) return toast("خطأ", "الصق البيانات أولاً");
      const obj = JSON.parse(txt);
      // Replace state safely
      LS.set("seraj.v2", obj);
      location.reload();
    }catch{
      toast("خطأ", "JSON غير صالح");
    }
  });

  $("#btnResetAll").addEventListener("click", ()=>{
    if(!confirm("أكيد بدك تمسح كل بيانات سراج من هذا الجهاز؟")) return;
    localStorage.removeItem("seraj.v2");
    location.reload();
  });
}

/* ===== Init Name Modal (Required) ===== */
function initNameGate(){
  const modal = $("#nameModal");
  const input = $("#nameInput");
  const saveBtn = $("#nameSave");

  if(!state.user.name){
    modal.classList.remove("hidden");
    setTimeout(()=>input.focus(), 60);
  }

  const commit = ()=>{
    const name = (input.value||"").trim().slice(0,24);
    if(!name) return toast("لازم اسم", "اكتب اسمك عشان نكمل");
    state.user.name = name;
    save();
    modal.classList.add("hidden");
    toast("أهلاً 👋", `يا ${name} — بلشنا!`);
    updateTop();
    onRoute();
  };

  saveBtn.addEventListener("click", commit);
  input.addEventListener("keydown", (e)=>{ if(e.key==="Enter") commit(); });
}

/* ===== Quick 25 ===== */
function initQuick(){
  $("#btnQuick25").addEventListener("click", ()=>{
    state.timer.totalSeconds = 25*60;
    state.timer.secondsLeft = 25*60;
    state.timer.running = true;
    state.timer.lastTick = Date.now();
    save();
    toast("⚡ بدء سريع", "25 دقيقة");
    go("home");
    onRoute();
  });
}

/* ===== Confetti FX ===== */
const fxCanvas = $("#fxCanvas");
const fx = fxCanvas.getContext("2d");
let confetti = [];

function resizeFX(){
  fxCanvas.width = window.innerWidth * devicePixelRatio;
  fxCanvas.height = window.innerHeight * devicePixelRatio;
}
window.addEventListener("resize", resizeFX);

function burstConfetti(n=140){
  const w = window.innerWidth, h = window.innerHeight;
  for(let i=0;i<n;i++){
    confetti.push({
      x: w*0.5 + (Math.random()-0.5)*240,
      y: h*0.25 + (Math.random()-0.5)*90,
      vx: (Math.random()-0.5)*8,
      vy: Math.random()*-8 - 3,
      g: 0.22 + Math.random()*0.18,
      r: 2 + Math.random()*4,
      a: 1,
      rot: Math.random()*Math.PI,
      vr: (Math.random()-0.5)*0.25,
    });
  }
}
function drawFX(){
  const W = fxCanvas.width, H = fxCanvas.height;
  fx.clearRect(0,0,W,H);

  confetti = confetti.filter(p => p.a > 0.02);
  for(const p of confetti){
    p.vy += p.g;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    p.a *= 0.985;

    fx.save();
    fx.globalAlpha = p.a;
    fx.translate(p.x*devicePixelRatio, p.y*devicePixelRatio);
    fx.rotate(p.rot);

    const palette = [
      "rgba(37,99,235,.95)",
      "rgba(6,182,212,.95)",
      "rgba(124,58,237,.95)",
      "rgba(34,197,94,.95)",
      "rgba(245,158,11,.95)",
      "rgba(239,68,68,.95)"
    ];
    fx.fillStyle = palette[(Math.random()*palette.length)|0];
    fx.fillRect(-p.r*devicePixelRatio, -p.r*devicePixelRatio, p.r*2*devicePixelRatio, p.r*2*devicePixelRatio);
    fx.restore();
  }
  requestAnimationFrame(drawFX);
}

/* ===== Small util ===== */
function cryptoRandomId(){
  // works on modern browsers; fallback if not
  if(window.crypto?.getRandomValues){
    const a = new Uint32Array(2);
    crypto.getRandomValues(a);
    return `${a[0].toString(16)}${a[1].toString(16)}`;
  }
  return String(Math.random()).slice(2) + String(Date.now());
}

/* ===== Start App ===== */
function init(){
  ensureDaily();
  ensureWeekly();
  applyTheme();
  updateTop();

  initNameGate();
  initQuick();

  window.addEventListener("hashchange", onRoute);

  resizeFX();
  requestAnimationFrame(drawFX);

  startLoop();
  onRoute();
}

init();

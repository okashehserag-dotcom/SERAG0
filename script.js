/* =========================================================
  Seraj — Static Web App (GitHub Pages) + Firebase + Three.js
  كل صفحة: function renderX(view)
========================================================= */

let FB = null;       // سيتم التقاطها بعد تحميل firebase.js
let authedUser = null;
let leaderboardUnsub = null;

/* ---------------------------
  State (localStorage)
---------------------------- */
const LS_KEY = "seraj_state_v1";

const DEFAULT_STATE = {
  version: 1,
  user: { uid: null, displayName: "", photoURL: "" },

  coins: 0,
  totalMinutes: 0,
  history: [], // {ts, delta, reason}

  equipped: {
    timerSkin: "skin_basic",
    bgTheme: "bg_basic"
  },

  inventory: {
    // free defaults:
    skin_basic: true,
    bg_basic: true,
    avatar_basic: true
  },

  daily: {
    date: "",        // YYYY-MM-DD
    locked: true,
    goals: null,     // { totalMinutes, startTime, subjects:[{name,pct}] }
    plan: [],        // generated sessions [{subject, minutes}]
    sessionsToday: []// for stats today (optional)
  },

  sessions: [], // global sessions: {tsISO, minutes, skin} per minute earned (min-granularity)

  notebooks: {
    strengths: [],
    weaknesses: [],
    lessonNotes: []
  },

  longPlan: {
    rangeDays: 30,
    hero: "سوي خطتك بنفسك — هذا طريقك الخاص",
    days: [] // [{date, items:[{subject, task, done}]}]
  },

  avatar: {
    parts: { skin:"#f2c6a0", hair:"#1b1b1b", glasses:"none", clothes:"#2b64ff", face:"smile" },
    svg: ""
  },

  settings: {
    sound: true
  },

  timer: {
    running: false,
    carrySeconds: 0,
    lastTick: 0
  }
};

let state = loadState();

/* ---------------------------
  Helpers
---------------------------- */
const $ = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => [...el.querySelectorAll(q)];
const nowISO = () => new Date().toISOString();

function todayKey(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const da = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${da}`;
}

function saveState(){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  paintShell();
}

function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return deepMerge(structuredClone(DEFAULT_STATE), parsed);
  }catch{
    return structuredClone(DEFAULT_STATE);
  }
}

function deepMerge(base, extra){
  for(const k in extra){
    if(extra[k] && typeof extra[k] === "object" && !Array.isArray(extra[k])){
      base[k] = deepMerge(base[k] || {}, extra[k]);
    }else{
      base[k] = extra[k];
    }
  }
  return base;
}

function toast(msg, type="info"){
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  Object.assign(t.style, {
    position:"fixed", inset:"auto 14px 14px 14px",
    padding:"12px 14px", borderRadius:"16px",
    border:"1px solid rgba(255,255,255,.14)",
    background:"rgba(0,0,0,.55)", color:"#fff",
    zIndex:9999, fontWeight:800, backdropFilter:"blur(8px)"
  });
  if(type==="bad") t.style.borderColor="rgba(255,107,107,.6)";
  if(type==="good") t.style.borderColor="rgba(54,211,153,.6)";
  document.body.appendChild(t);
  setTimeout(()=> t.remove(), 2200);
}

function fmtTime(sec){
  const m = Math.floor(sec/60);
  const s = sec%60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }

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
    // reset timer carry for cleanliness
    state.timer.running = false;
    state.timer.carrySeconds = 0;
    state.timer.lastTick = 0;
    saveState();
  }
}

/* ---------------------------
  Firebase wiring (dynamic import from firebase.js module)
---------------------------- */
async function initFirebase(){
  try{
    // firebase.js is type="module" already loaded by browser.
    // We import it again to access exports safely.
    const mod = await import("./firebase.js");
    FB = mod;
  }catch(e){
    console.error(e);
    toast("تعذر تحميل Firebase.js — تأكد من رفع الملف", "bad");
  }
async function googleLogin(){
  // Local mode: "login" instantly
  state.user.uid = "local";
  state.user.displayName = state.user.displayName || "طالب سراج";
  state.user.photoURL = "";
  saveState();

  document.querySelector("#authScreen").classList.add("hidden");
  document.querySelector("#mainScreen").classList.remove("hidden");

  if(!location.hash) location.hash = "#timer";
  render();
}
async function logout(){
  // Local mode: just reset session UI (keep data)
  document.querySelector("#authScreen").classList.remove("hidden");
  document.querySelector("#mainScreen").classList.add("hidden");
  location.hash = "";
}

async function ensureUserDoc(user){
  const { fb, db } = FB;
  const ref = fb.doc(db, "users", user.uid);
  const snap = await fb.getDoc(ref);
  if(!snap.exists()){
    await fb.setDoc(ref, {
      displayName: user.displayName || "طالب سراج",
      photoURL: user.photoURL || "",
      coins: state.coins || 0,
      totalMinutes: state.totalMinutes || 0,
      equipped: state.equipped,
      inventory: state.inventory,
      avatar: state.avatar,
      updatedAt: fb.serverTimestamp()
    }, { merge:true });
  }
  return ref;
}

async function pullUserDoc(user){
  const { fb, db } = FB;
  const ref = fb.doc(db, "users", user.uid);
  const snap = await fb.getDoc(ref);
  if(!snap.exists()) return;

  const data = snap.data();

  // Merge strategy: keep higher progress to avoid losing work
  state.coins = Math.max(state.coins || 0, data.coins || 0);
  state.totalMinutes = Math.max(state.totalMinutes || 0, data.totalMinutes || 0);

  // Inventory/equipped/avatar: merge
  state.inventory = { ...(data.inventory || {}), ...(state.inventory || {}) };
  state.equipped = deepMerge(state.equipped, data.equipped || {});
  state.avatar = deepMerge(state.avatar, data.avatar || {});

  saveState();
}
function syncUserThrottled(){ /* local only */ }
async function pushUserDoc(){ /* local only */ }
  
    const { fb, db } = FB;
    const ref = fb.doc(db, "users", authedUser.uid);
    await fb.updateDoc(ref, {
      displayName: state.user.displayName || authedUser.displayName || "طالب سراج",
      photoURL: state.user.photoURL || authedUser.photoURL || "",
      coins: state.coins,
      totalMinutes: state.totalMinutes,
      equipped: state.equipped,
      inventory: state.inventory,
      avatar: state.avatar,
      updatedAt: fb.serverTimestamp()
    });
  }catch(e){
    console.error(e);
  }
}

/* ---------------------------
  App shell paint
---------------------------- */
function setActiveNav(){
  const hash = location.hash || "#timer";
  $$("[data-route]").forEach(a=>{
    a.classList.toggle("active", a.getAttribute("href")===hash);
  });
}

function paintShell(){
  // coins + total + lock pill + mini avatar
  $("#coinBadge").textContent = `${state.coins} SC`;
  $("#totalMinPill").textContent = `${state.totalMinutes}`;

  const locked = state.daily.locked;
  $("#dailyLockPill").textContent = locked ? "🔒 لازم تدخل أهداف اليوم" : "✅ أهداف اليوم جاهزة";
  $("#dailyLockPill").style.borderColor = locked ? "rgba(255,204,102,.55)" : "rgba(54,211,153,.55)";

  // mini avatar
  const av = $("#miniAvatar");
  av.innerHTML = state.avatar.svg ? state.avatar.svg : `<span class="small">🙂</span>`;

  // user name
  $("#userName").textContent = state.user.displayName || "—";
}

function setBackgroundTheme(){
  const bg = state.equipped.bgTheme;
  // Simple body overlay by adding a data attribute:
  document.body.dataset.bg = bg;

  // Lightweight theme tint
  const root = document.documentElement;
  if(bg==="bg_fire"){
    root.style.setProperty("--pri", "#ff7a66");
  }else if(bg==="bg_water"){
    root.style.setProperty("--pri", "#6aa8ff");
  }else if(bg==="bg_jordan"){
    root.style.setProperty("--pri", "#36d399");
  }else{
    root.style.setProperty("--pri", "#6aa8ff");
  }
}

/* ---------------------------
  Router
---------------------------- */
function routeGuard(hash){
  const safe = new Set(["#goals", "#settings", "#profile", "#timer"]);
  if(state.daily.locked && !safe.has(hash)){
    return "#goals";
  }
  return hash;
}

function setTitle(hash){
  const map = {
    "#timer":"⏱️ التايمر 3D",
    "#goals":"✅ أهداف اليوم",
    "#progress":"🪙 التقدم والعملات",
    "#store":"🛒 المتجر",
    "#stats":"📊 الإحصائيات",
    "#notebooks":"📒 الدفاتر",
    "#plan":"🗓️ خطة طويلة",
    "#leaderboard":"🏆 المتصدرين",
    "#settings":"⚙️ الإعدادات",
    "#profile":"🧑‍🎨 البروفايل/أفاتار"
  };
  $("#pageTitle").textContent = map[hash] || "—";
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
  view.innerHTML = "";
  stopLeaderboard();
  // ensure timer keeps ticking regardless view; but stop 3d when leaving
  if(hash !== "#timer") destroyTimer3D();

  const page = ({
    "#timer": renderTimer,
    "#goals": renderGoals,
    "#progress": renderProgress,
    "#store": renderStore,
    "#stats": renderStats,
    "#notebooks": renderNotebooks,
    "#plan": renderPlan,
    "#leaderboard": renderLeaderboard,
    "#settings": renderSettings,
    "#profile": renderProfile
  })[hash] || renderTimer;

  page(view);
}

/* =========================================================
  TIMER 3D (Three.js) — Ring + Glow + Sparks + Drag/Touch
========================================================= */
let T = {
  renderer:null, scene:null, camera:null,
  ring:null, glow:null, sparks:null,
  canvas:null,
  raf:0,
  dragging:false,
  lastX:0,lastY:0,
  rotY:0, rotX:0
};

function skinDef(id){
  // Skin colors (simple, fast) — Jordan uses multi-color ring texture.
  const defs = {
    skin_basic: { name:"Basic", base:0x6aa8ff, glow:0x6aa8ff },
    skin_fire:  { name:"Fire",  base:0xff6b6b, glow:0xffcc66 },
    skin_water: { name:"Water", base:0x6aa8ff, glow:0x36d399 },
    skin_jordan:{ name:"Jordan",base:0xffffff, glow:0x36d399, jordan:true }
  };
  return defs[id] || defs.skin_basic;
}

function makeJordanTexture(){
  const c = document.createElement("canvas");
  c.width = 512; c.height = 64;
  const g = c.getContext("2d");

  // Jordan-like bands: black/white/green + red triangle hint
  g.fillStyle = "#000"; g.fillRect(0,0,512,22);
  g.fillStyle = "#fff"; g.fillRect(0,22,512,20);
  g.fillStyle = "#007a3d"; g.fillRect(0,42,512,22);

  // Red accent stripe
  g.fillStyle = "#ce1126";
  g.fillRect(0,0,120,64);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.x = 2;
  return tex;
}

function initTimer3D(container){
  const canvas = document.createElement("canvas");
  canvas.id = "timerCanvas";
  container.appendChild(canvas);

  const w = container.clientWidth;
  const h = container.clientHeight;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
  renderer.setSize(w,h,false);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(45, w/h, 0.1, 100);
  camera.position.set(0, 0.6, 3.2);

  // Lights
  const amb = new THREE.AmbientLight(0xffffff, 0.75);
  scene.add(amb);
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(2,2,3);
  scene.add(dir);

  // Ring
  const skin = skinDef(state.equipped.timerSkin);

  const geo = new THREE.TorusGeometry(1, 0.18, 32, 160);
  let mat;

  if(skin.jordan){
    const tex = makeJordanTexture();
    mat = new THREE.MeshStandardMaterial({
      map: tex,
      metalness: 0.25,
      roughness: 0.35,
      emissive: new THREE.Color(0x222222),
      emissiveIntensity: 0.35
    });
  }else{
    mat = new THREE.MeshStandardMaterial({
      color: skin.base,
      metalness: 0.2,
      roughness: 0.35,
      emissive: new THREE.Color(skin.glow),
      emissiveIntensity: 0.35
    });
  }

  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = 0.7;
  scene.add(ring);

  // Glow shell (additive)
  const glowGeo = new THREE.TorusGeometry(1, 0.24, 16, 120);
  const glowMat = new THREE.MeshBasicMaterial({
    color: skin.glow,
    transparent:true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite:false
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.rotation.copy(ring.rotation);
  scene.add(glow);

  // Sparks (simple points)
  const sparkCount = 260;
  const positions = new Float32Array(sparkCount*3);
  for(let i=0;i<sparkCount;i++){
    const a = Math.random()*Math.PI*2;
    const r = 1 + (Math.random()*0.35);
    positions[i*3+0] = Math.cos(a)*r;
    positions[i*3+1] = (Math.random()-0.5)*0.6;
    positions[i*3+2] = Math.sin(a)*r;
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const sparkMat = new THREE.PointsMaterial({
    color: skin.glow,
    size: 0.02,
    transparent:true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite:false
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  scene.add(sparks);

  // Store
  T.renderer = renderer;
  T.scene = scene;
  T.camera = camera;
  T.ring = ring;
  T.glow = glow;
  T.sparks = sparks;
  T.canvas = canvas;

  // Drag/Touch controls (lightweight)
  const onDown = (x,y)=>{
    T.dragging = true; T.lastX=x; T.lastY=y;
  };
  const onMove = (x,y)=>{
    if(!T.dragging) return;
    const dx = (x - T.lastX);
    const dy = (y - T.lastY);
    T.lastX = x; T.lastY = y;
    T.rotY += dx * 0.006;
    T.rotX += dy * 0.004;
    T.rotX = clamp(T.rotX, -0.7, 0.7);
  };
  const onUp = ()=>{ T.dragging=false; };

  canvas.addEventListener("mousedown", e=>onDown(e.clientX, e.clientY));
  window.addEventListener("mousemove", e=>onMove(e.clientX, e.clientY));
  window.addEventListener("mouseup", onUp);

  canvas.addEventListener("touchstart", e=>{
    const t = e.touches[0];
    onDown(t.clientX, t.clientY);
  }, {passive:true});
  canvas.addEventListener("touchmove", e=>{
    const t = e.touches[0];
    onMove(t.clientX, t.clientY);
  }, {passive:true});
  canvas.addEventListener("touchend", onUp, {passive:true});

  // Resize
  const ro = new ResizeObserver(()=>{
    if(!T.renderer) return;
    const W = container.clientWidth;
    const H = container.clientHeight;
    T.renderer.setSize(W,H,false);
    T.camera.aspect = W/H;
    T.camera.updateProjectionMatrix();
  });
  ro.observe(container);
  T._ro = ro;

  // Animate
  const tick = (tms)=>{
    // ambient motion
    const t = tms * 0.001;
    ring.rotation.y = T.rotY + Math.sin(t*0.7)*0.15;
    ring.rotation.x = 0.7 + T.rotX + Math.sin(t*0.9)*0.05;
    glow.rotation.copy(ring.rotation);

    sparks.rotation.y = -t*0.3;
    sparks.rotation.x = Math.sin(t*0.2)*0.08;

    // subtle pulse while running
    const running = state.timer.running;
    glow.material.opacity = running ? 0.22 + Math.sin(t*6)*0.03 : 0.16 + Math.sin(t*2)*0.02;

    T.renderer.render(scene, camera);
    T.raf = requestAnimationFrame(tick);
  };
  T.raf = requestAnimationFrame(tick);
}

function destroyTimer3D(){
  if(!T.renderer) return;
  cancelAnimationFrame(T.raf);
  try{ T._ro?.disconnect(); }catch{}
  T.renderer.dispose();
  // Clear references
  T = { renderer:null, scene:null, camera:null, ring:null, glow:null, sparks:null, canvas:null, raf:0, dragging:false, lastX:0,lastY:0, rotY:0, rotX:0 };
}

/* ---------------------------
  Timer minute earning loop
---------------------------- */
setInterval(()=>{
  if(!state.timer.running) return;
  const now = Date.now();
  if(!state.timer.lastTick) state.timer.lastTick = now;
  const deltaSec = Math.floor((now - state.timer.lastTick)/1000);
  if(deltaSec <= 0) return;
  state.timer.lastTick = now;
  state.timer.carrySeconds += deltaSec;

  // consume minutes
  while(state.timer.carrySeconds >= 60){
    state.timer.carrySeconds -= 60;
    earnOneMinute();
  }
  saveState();
  // update HUD on timer view if exists
  const secLeft = 60 - state.timer.carrySeconds;
  const hud = $("#timerSecLeft");
  if(hud) hud.textContent = `${secLeft}s`;
  const tsec = $("#timerRunSec");
  if(tsec) tsec.textContent = fmtTime(state.timer.carrySeconds);
}, 1000);

function earnOneMinute(){
  state.coins += 1;
  state.totalMinutes += 1;

  const skin = state.equipped.timerSkin;
  state.sessions.push({ tsISO: nowISO(), minutes: 1, skin });

  state.daily.sessionsToday.push({ tsISO: nowISO(), minutes: 1, skin });

  state.history.unshift({ ts: nowISO(), delta: +1, reason: "دقيقة مكتملة (Timer)" });
  state.history = state.history.slice(0, 80);

  // UI coin animation
  const pop = $("#coinPop");
  if(pop){
    pop.textContent = "+1 SC";
    pop.classList.add("show");
    setTimeout(()=> pop.classList.remove("show"), 350);
  }

  syncUserThrottled();
}

/* =========================================================
  Pages
========================================================= */

function renderTimer(view){
  const wrap = document.createElement("div");
  wrap.className = "grid two";

  // Left: Timer card
  const left = document.createElement("div");
  left.className = "card";

  left.innerHTML = `
    <h3 class="h">تايمر 3D — اسحب ولف</h3>
    <p class="p">كل دقيقة مكتملة = <b>1 Seraj Coin</b>. اختر Skin من المتجر/الإعدادات.</p>

    <div class="timerWrap" id="timerWrap">
      <div class="timerHUD">
        <div class="hudBox">
          <div class="timerBig" id="timerDisplay">${state.timer.running ? "RUN" : "READY"}</div>
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
        <div class="rtlNote">Drag/Touch للتحكم</div>
      </div>
      <div class="coinPop" id="coinPop">+1 SC</div>
    </div>
  `;

  // Right: Quick panel
  const right = document.createElement("div");
  right.className = "card";
  right.innerHTML = `
    <h3 class="h">مختصر اليوم</h3>
    <div class="grid three">
      <div class="kpi">
        <div class="n">${minutesToday()}</div>
        <div class="t">دقائق اليوم</div>
      </div>
      <div class="kpi">
        <div class="n">${state.daily.locked ? "🔒" : "✅"}</div>
        <div class="t">أهداف اليوم</div>
      </div>
      <div class="kpi">
        <div class="n">${state.equipped.timerSkin.replace("skin_","")}</div>
        <div class="t">Timer Skin</div>
      </div>
    </div>
    <div class="sep"></div>
    <div class="p">
      نصيحة سريعة: ابدأ بجلسة 25–45 دقيقة، وبعدها استراحة 5–10 دقائق. المهم الاستمرارية.
    </div>
    <div class="row">
      <a class="btn" href="#goals">تعديل أهداف اليوم</a>
      <a class="btn" href="#store">فتح المتجر</a>
    </div>
  `;

  wrap.appendChild(left);
  wrap.appendChild(right);
  view.appendChild(wrap);

  // Init 3D
  const timerWrap = $("#timerWrap");
  initTimer3D(timerWrap);

  // Wire controls
  $("#btnStartStop").onclick = ()=>{
    if(!state.daily.goals){
      toast("لازم تدخل أهداف اليوم أولاً", "bad");
      location.hash = "#goals";
      return;
    }
    state.timer.running = !state.timer.running;
    if(state.timer.running){
      state.timer.lastTick = Date.now();
      toast("ابدأ 🔥", "good");
    }else{
      toast("توقف ⏸️");
    }
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

function renderGoals(view){
  const card = document.createElement("div");
  card.className = "card";

  const goals = state.daily.goals;

  card.innerHTML = `
    <h3 class="h">أهداف اليوم (إلزامي)</h3>
    <p class="p">
      لازم تدخل أهدافك أول مرة كل يوم. بعدها ينفتح كل شيء.
      <br><span class="badge">مجموع النسب لازم = 100%</span>
    </p>

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
      <button class="btn primary" id="btnSaveGoals">حفظ + توليد خطة جلسات</button>
    </div>

    <div class="sep"></div>
    <div>
      <h3 class="h">الخطة المقترحة (Heuristic محلي)</h3>
      <div id="planBox" class="list"></div>
      <p class="small">قواعد: 25–55 دقيقة للجلسة، منع 3 جلسات متتالية لنفس المادة، وبقايا أقل من 25 تُدمج.</p>
    </div>
  `;

  view.appendChild(card);

  // subjects editor
  const subj = goals?.subjects || [
    { name:"رياضيات", pct:40 },
    { name:"عربي", pct:25 },
    { name:"إنجليزي", pct:20 },
    { name:"مادة 4", pct:15 }
  ];

  function renderSubjects(){
    const box = $("#subjectsBox");
    box.innerHTML = `
      <div class="grid two">
        ${subj.map((s,i)=>`
          <div class="item">
            <div class="row" style="justify-content:space-between">
              <div style="flex:1; min-width:160px">
                <label>المادة</label>
                <input class="field" data-sub-name="${i}" value="${escapeHtml(s.name)}">
              </div>
              <div style="width:140px">
                <label>النسبة %</label>
                <input class="field" type="number" min="0" max="100" step="1" data-sub-pct="${i}" value="${s.pct}">
              </div>
              <button class="btn" data-sub-del="${i}">حذف</button>
            </div>
          </div>
        `).join("")}
      </div>
      <div class="small" id="pctSum">—</div>
    `;

    // events
    $$("[data-sub-name]").forEach(inp=>{
      inp.oninput = ()=>{ subj[inp.dataset.subName].name = inp.value.trim(); updateSum(); };
    });
    $$("[data-sub-pct]").forEach(inp=>{
      inp.oninput = ()=>{ subj[inp.dataset.subPct].pct = Number(inp.value||0); updateSum(); };
    });
    $$("[data-sub-del]").forEach(btn=>{
      btn.onclick = ()=>{
        subj.splice(Number(btn.dataset.subDel),1);
        renderSubjects();
      };
    });

    updateSum();
  }

  function updateSum(){
    const sum = subj.reduce((a,b)=>a+Number(b.pct||0),0);
    const el = $("#pctSum");
    el.textContent = `مجموع النسب: ${sum}%`;
    el.style.color = (sum===100) ? "var(--good)" : "var(--warn)";
  }

  renderSubjects();

  $("#btnAddSub").onclick = ()=>{
    subj.push({ name:`مادة ${subj.length+1}`, pct:0 });
    renderSubjects();
  };

  $("#btnSaveGoals").onclick = ()=>{
    const totalH = Number($("#gTotalH").value || 0);
    const totalMinutes = Math.round(totalH * 60);
    const startTime = $("#gStart").value || "";

    const sum = subj.reduce((a,b)=>a+Number(b.pct||0),0);
    if(totalMinutes <= 0){ toast("أدخل وقت صحيح", "bad"); return; }
    if(sum !== 100){ toast("مجموع النسب لازم يكون 100%", "bad"); return; }
    if(subj.some(s=>!s.name.trim())){ toast("في مادة اسمها فاضي", "bad"); return; }

    state.daily.goals = { totalMinutes, startTime, subjects: subj.map(s=>({name:s.name.trim(), pct:Number(s.pct)})) };

    // Generate plan
    state.daily.plan = generateStudyPlan(state.daily.goals);
    state.daily.locked = false;

    saveState();
    syncUserThrottled();
    toast("تم حفظ أهداف اليوم ✅", "good");
    renderPlanBox();
    render(); // refresh nav lock
  };

  function renderPlanBox(){
    const pb = $("#planBox");
    const plan = state.daily.plan || [];
    if(!plan.length){
      pb.innerHTML = `<div class="small">لا توجد خطة بعد. اضغط حفظ لتوليدها.</div>`;
      return;
    }
    pb.innerHTML = plan.map((p,idx)=>`
      <div class="item">
        <div class="row" style="justify-content:space-between">
          <div>
            <div class="itemTitle">جلسة ${idx+1}: ${escapeHtml(p.subject)}</div>
            <div class="itemSub">${p.minutes} دقيقة • استراحة 5–10 دقائق بعدها</div>
          </div>
          <span class="badge">${p.minutes}m</span>
        </div>
      </div>
    `).join("");
  }

  renderPlanBox();
}

function generateStudyPlan(goals){
  // Heuristic:
  // - chunk minutes in [25..55]
  // - momentum: start with highest pct
  // - no 3 consecutive same subject
  // - merge remainder < 25 into prior session if possible
  const MIN = 25, MAX = 55;

  const subjects = goals.subjects
    .map(s=>{
      const target = Math.round(goals.totalMinutes * s.pct / 100);
      return { name:s.name, target, left:target };
    })
    .sort((a,b)=>b.target-a.target);

  const plan = [];
  let last = null, last2 = null;

  function pickNext(){
    // pick highest left but avoid 3-in-a-row
    const sorted = [...subjects].sort((a,b)=>b.left-a.left);
    for(const s of sorted){
      if(s.left <= 0) continue;
      if(last && last2 && last===s.name && last2===s.name) continue;
      return s;
    }
    // if all blocked, return first with left
    return sorted.find(x=>x.left>0) || null;
  }

  while(subjects.some(s=>s.left>0)){
    const s = pickNext();
    if(!s) break;

    // decide chunk
    let chunk = clamp(s.left, MIN, MAX);

    // if left is small (<MIN) try merge into previous same subject
    if(s.left < MIN){
      const prev = [...plan].reverse().find(x=>x.subject===s.name);
      if(prev && prev.minutes + s.left <= MAX){
        prev.minutes += s.left;
        s.left = 0;
      }else{
        // allow one quick review exception (15-20) at end
        chunk = clamp(s.left, 15, 20);
        plan.push({ subject:s.name, minutes:chunk, quick:true });
        s.left -= chunk;
      }
    }else{
      plan.push({ subject:s.name, minutes:chunk });
      s.left -= chunk;
    }

    last2 = last;
    last = s.name;

    // safety: prevent infinite loops
    if(plan.length > 60) break;
  }

  // final cleanup: merge any tiny quick leftovers again
  for(const s of subjects){
    if(s.left>0){
      const prev = [...plan].reverse().find(x=>x.subject===s.name);
      if(prev && prev.minutes + s.left <= MAX){
        prev.minutes += s.left;
      }else{
        plan.push({ subject:s.name, minutes:s.left, quick:true });
      }
    }
  }

  return plan;
}

function renderProgress(view){
  const card = document.createElement("div");
  card.className = "grid two";

  const left = document.createElement("div");
  left.className = "card";

  const today = minutesToday();
  const week = minutesInLastDays(7);
  const month = minutesInLastDays(30);

  left.innerHTML = `
    <h3 class="h">التقدم + العملات</h3>
    <div class="grid three">
      <div class="kpi"><div class="n">${state.coins}</div><div class="t">Seraj Coin</div></div>
      <div class="kpi"><div class="n">${today}</div><div class="t">دقائق اليوم</div></div>
      <div class="kpi"><div class="n">${state.totalMinutes}</div><div class="t">الإجمالي</div></div>
    </div>
    <div class="sep"></div>
    <h3 class="h">سجل مختصر</h3>
    <div class="list" id="histBox"></div>
  `;

  const right = document.createElement("div");
  right.className = "card";
  right.innerHTML = `
    <h3 class="h">خط إنجاز حي</h3>
    <p class="p">هذا شريط بسيط يعتمد على دقائقك (اليوم/الأسبوع/الشهر).</p>
    <div class="item">
      <div class="itemTitle">اليوم</div>
      ${bar(today, (state.daily.goals?.totalMinutes||180))}
    </div>
    <div class="item">
      <div class="itemTitle">آخر 7 أيام</div>
      ${bar(week, 7*(state.daily.goals?.totalMinutes||180))}
    </div>
    <div class="item">
      <div class="itemTitle">آخر 30 يوم</div>
      ${bar(month, 30*(state.daily.goals?.totalMinutes||180))}
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
  `).join("") : `<div class="small">ما في سجل بعد. شغّل التايمر.</div>`;
}

function bar(val, max){
  const pct = clamp((val/(max||1))*100, 0, 100);
  return `
    <div style="margin-top:8px; border:1px solid var(--line); border-radius:999px; overflow:hidden; background:rgba(255,255,255,.04)">
      <div style="width:${pct}%; height:10px; background:var(--pri)"></div>
    </div>
    <div class="small" style="margin-top:6px">${val} / ${max} دقيقة</div>
  `;
}

/* ---------------------------
  Store
---------------------------- */
const STORE = [
  // Timer skins
  { id:"skin_fire",  slot:"timerSkin", name:"Timer Skin — Fire",  price:120, desc:"تأثير ناري + Glow" },
  { id:"skin_water", slot:"timerSkin", name:"Timer Skin — Water", price:120, desc:"تأثير مائي + Glow" },
  { id:"skin_jordan",slot:"timerSkin", name:"Timer Skin — Jordan",price:350, desc:"علم الأردن (الأغلى)" },

  // Background themes
  { id:"bg_fire",  slot:"bgTheme", name:"Background — Fire",  price:60,  desc:"خلفية دافئة" },
  { id:"bg_water", slot:"bgTheme", name:"Background — Water", price:60,  desc:"خلفية هادئة" },
  { id:"bg_jordan",slot:"bgTheme", name:"Background — Jordan",price:140, desc:"خلفية وطنية" },

  // Profile pictures / Avatars (as items)
  { id:"avatar_jordanflag", slot:"avatarStyle", name:"Avatar Pack — Jordan Flag", price:80, desc:"ستايل وطن" },
  { id:"avatar_petra",      slot:"avatarStyle", name:"Avatar Pack — Petra",       price:90, desc:"ستايل البترا" },
  { id:"avatar_quotes",     slot:"avatarStyle", name:"Avatar Pack — Tawjihi Quotes", price:70, desc:"ستايل اقتباسات" }
];

function renderStore(view){
  const card = document.createElement("div");
  card.className = "grid two";

  const left = document.createElement("div");
  left.className = "card";
  left.innerHTML = `
    <h3 class="h">المتجر (شراء بعملة Seraj Coin فقط)</h3>
    <p class="p">
      1 Coin لكل دقيقة. في يوم دراسة طبيعي تقدر تشتري أشياء بسيطة، والأشياء الكبيرة بدها وقت أكثر.
    </p>
    <div class="grid" id="storeList"></div>
  `;

  const right = document.createElement("div");
  right.className = "card";
  right.innerHTML = `
    <h3 class="h">مخزونك + تجهيز</h3>
    <div class="item">
      <div class="itemTitle">الرصيد</div>
      <div class="itemSub"><b>${state.coins} SC</b></div>
    </div>
    <div class="sep"></div>
    <div class="item">
      <div class="itemTitle">المجهز الآن</div>
      <div class="itemSub">Timer Skin: <b>${state.equipped.timerSkin}</b></div>
      <div class="itemSub">Background: <b>${state.equipped.bgTheme}</b></div>
    </div>
    <div class="sep"></div>
    <div class="small">بعد تجهيز Timer Skin ارجع للتايمر لتشوف الشكل.</div>
  `;

  card.appendChild(left);
  card.appendChild(right);
  view.appendChild(card);

  const list = $("#storeList");
  list.innerHTML = STORE.map(it=>{
    const owned = !!state.inventory[it.id];
    const equipped = (state.equipped[it.slot] === it.id);
    const canBuy = state.coins >= it.price;

    return `
      <div class="item">
        <div class="row" style="justify-content:space-between">
          <div style="min-width:200px">
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

  $$("[data-buy]").forEach(b=>{
    b.onclick = ()=> buyItem(b.dataset.buy);
  });
  $$("[data-eq]").forEach(b=>{
    b.onclick = ()=> equipItem(b.dataset.eq);
  });
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
  syncUserThrottled();
  toast("تم الشراء ✅", "good");
  render();
}

function equipItem(id){
  const it = STORE.find(x=>x.id===id);
  if(!it) return;
  if(!state.inventory[it.id]){ toast("لازم تشتريه أولاً", "bad"); return; }

  state.equipped[it.slot] = it.id;
  saveState();
  syncUserThrottled();
  toast("تم التجهيز ✅", "good");
  render();
}

/* ---------------------------
  Statistics + Badges
---------------------------- */
function renderStats(view){
  const card = document.createElement("div");
  card.className = "grid two";

  const today = minutesToday();
  const week = minutesInLastDays(7);
  const month = minutesInLastDays(30);
  const total = state.totalMinutes;

  const badges = computeBadges(total);

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
    <div class="kpi"><div class="n">${total}</div><div class="t">الإجمالي (دقيقة)</div></div>
  `;

  const right = document.createElement("div");
  right.className = "card";
  right.innerHTML = `
    <h3 class="h">Badges (مكافآت)</h3>
    <p class="p">على حسب إجمالي الدقائق — (حد أدنى 5 بادجات).</p>
    <div class="list">
      ${badges.map(b=>`
        <div class="item">
          <div class="row" style="justify-content:space-between">
            <div>
              <div class="itemTitle">${b.icon} ${escapeHtml(b.name)}</div>
              <div class="itemSub">${escapeHtml(b.desc)}</div>
            </div>
            <span class="badge">${b.earned ? "مُكتسب" : "لسه"}</span>
          </div>
        </div>
      `).join("")}
    </div>
  `;

  card.appendChild(left);
  card.appendChild(right);
  view.appendChild(card);
}

function computeBadges(totalMinutes){
  const defs = [
    { at: 60,   icon:"🥉", name:"ساعة إنجاز", desc:"وصلت 60 دقيقة إجمالي" },
    { at: 300,  icon:"🥈", name:"5 ساعات",    desc:"استمراريتك ممتازة" },
    { at: 600,  icon:"🥇", name:"10 ساعات",   desc:"أنت جدي بالتوجيهي" },
    { at: 1200, icon:"🏅", name:"20 ساعة",    desc:"محرك قوي" },
    { at: 2400, icon:"🏆", name:"40 ساعة",    desc:"مستوى متقدم" },
    { at: 3600, icon:"🔥", name:"60 ساعة",    desc:"أسطورة سراج" }
  ];
  return defs.map(d=>({ ...d, earned: totalMinutes >= d.at }));
}

/* ---------------------------
  Avatar / Profile (SVG builder)
---------------------------- */
function renderProfile(view){
  const card = document.createElement("div");
  card.className = "grid two";

  const left = document.createElement("div");
  left.className = "card";
  left.innerHTML = `
    <h3 class="h">Avatar (Bitmoji-like مبسط)</h3>
    <p class="p">اختار أجزاء بسيطة، وبنحفظها محليًا + Firestore وتظهر بالـLeaderboard.</p>

    <div class="grid two">
      <div>
        <label>لون البشرة</label>
        <input id="avSkin" class="field" type="color" value="${state.avatar.parts.skin}">
      </div>
      <div>
        <label>لون الشعر</label>
        <input id="avHair" class="field" type="color" value="${state.avatar.parts.hair}">
      </div>
      <div>
        <label>نظارة</label>
        <select id="avGlasses" class="field">
          ${opt(state.avatar.parts.glasses, ["none","round","square"])}
        </select>
      </div>
      <div>
        <label>الملابس</label>
        <input id="avClothes" class="field" type="color" value="${state.avatar.parts.clothes}">
      </div>
      <div>
        <label>التعبير</label>
        <select id="avFace" class="field">
          ${opt(state.avatar.parts.face, ["smile","serious","happy"])}
        </select>
      </div>
    </div>

    <div class="row" style="margin-top:12px">
      <button class="btn primary" id="btnSaveAvatar">حفظ الأفاتار</button>
    </div>
  `;

  const right = document.createElement("div");
  right.className = "card";
  right.innerHTML = `
    <h3 class="h">المعاينة</h3>
    <div class="item" style="display:grid; place-items:center; min-height:260px" id="avatarPreview"></div>
    <div class="small">هذا SVG خفيف وسريع.</div>
  `;

  card.appendChild(left);
  card.appendChild(right);
  view.appendChild(card);

  const preview = $("#avatarPreview");
  function rebuild(){
    const parts = {
      skin: $("#avSkin").value,
      hair: $("#avHair").value,
      glasses: $("#avGlasses").value,
      clothes: $("#avClothes").value,
      face: $("#avFace").value
    };
    const svg = buildAvatarSVG(parts);
    preview.innerHTML = svg;
    return {parts, svg};
  }

  // initial
  rebuild();

  ["avSkin","avHair","avGlasses","avClothes","avFace"].forEach(id=>{
    $("#"+id).oninput = rebuild;
    $("#"+id).onchange = rebuild;
  });

  $("#btnSaveAvatar").onclick = ()=>{
    const {parts, svg} = rebuild();
    state.avatar.parts = parts;
    state.avatar.svg = svg;
    saveState();
    syncUserThrottled();
    toast("تم حفظ الأفاتار ✅", "good");
    paintShell();
  };
}

function buildAvatarSVG(parts){
  // Simple SVG: head + hair + glasses + clothes + face
  const glasses = parts.glasses;
  const face = parts.face;

  const mouth = face==="smile"
    ? `<path d="M78 112 Q100 128 122 112" stroke="#2b2b2b" stroke-width="6" fill="none" stroke-linecap="round"/>`
    : face==="happy"
      ? `<path d="M76 110 Q100 140 124 110" stroke="#2b2b2b" stroke-width="6" fill="none" stroke-linecap="round"/>`
      : `<path d="M80 118 L120 118" stroke="#2b2b2b" stroke-width="6" stroke-linecap="round"/>`;

  const g = glasses==="round"
    ? `<circle cx="78" cy="92" r="16" stroke="#111" stroke-width="6" fill="rgba(255,255,255,.2)"/>
       <circle cx="122" cy="92" r="16" stroke="#111" stroke-width="6" fill="rgba(255,255,255,.2)"/>
       <path d="M94 92 L106 92" stroke="#111" stroke-width="6" stroke-linecap="round"/>`
    : glasses==="square"
      ? `<rect x="62" y="76" width="32" height="32" rx="8" stroke="#111" stroke-width="6" fill="rgba(255,255,255,.2)"/>
         <rect x="106" y="76" width="32" height="32" rx="8" stroke="#111" stroke-width="6" fill="rgba(255,255,255,.2)"/>
         <path d="M94 92 L106 92" stroke="#111" stroke-width="6" stroke-linecap="round"/>`
      : "";

  return `
  <svg width="220" height="220" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-label="Seraj Avatar">
    <defs>
      <filter id="s" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="rgba(0,0,0,.35)"/>
      </filter>
    </defs>
    <g filter="url(#s)">
      <circle cx="100" cy="90" r="56" fill="${parts.skin}"/>
      <path d="M52 82 Q100 30 148 82 Q132 50 100 46 Q68 50 52 82Z" fill="${parts.hair}"/>
      <circle cx="80" cy="92" r="7" fill="#2b2b2b"/>
      <circle cx="120" cy="92" r="7" fill="#2b2b2b"/>
      ${g}
      ${mouth}
      <path d="M48 156 Q100 128 152 156 L152 200 L48 200Z" fill="${parts.clothes}"/>
    </g>
  </svg>`;
}

function opt(current, arr){
  return arr.map(v=>`<option value="${v}" ${v===current?"selected":""}>${v}</option>`).join("");
}

/* ---------------------------
  Notebooks
---------------------------- */
function renderNotebooks(view){
  const card = document.createElement("div");
  card.className = "card";

  card.innerHTML = `
    <h3 class="h">الدفاتر</h3>
    <p class="p">أقسام: نقاط قوة / نقاط ضعف / ملاحظات الدرس — مع بحث وإضافة/تعديل/حذف.</p>

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

  function typeLabel(t){
    return t==="strengths" ? "نقاط قوة" : t==="weaknesses" ? "نقاط ضعف" : "ملاحظات الدرس";
  }

  function getArr(){
    const t = $("#nbType").value;
    return state.notebooks[t];
  }

  function renderList(){
    const t = $("#nbType").value;
    const q = ($("#nbSearch").value||"").trim().toLowerCase();
    const arr = state.notebooks[t] || [];
    const filtered = q ? arr.filter(x=> (x.text||"").toLowerCase().includes(q)) : arr;

    const box = $("#nbList");
    box.innerHTML = filtered.length ? filtered
      .slice()
      .sort((a,b)=> (b.ts||"").localeCompare(a.ts||""))
      .map(x=>`
        <div class="item">
          <div class="row" style="justify-content:space-between">
            <div style="flex:1">
              <div class="itemTitle">${typeLabel(t)}</div>
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
        if(txt === null) return;
        item.text = txt.trim();
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
    const item = { id: crypto.randomUUID(), ts: nowISO(), text };
    state.notebooks[t] = [item, ...(state.notebooks[t]||[])];
    $("#nbText").value = "";
    saveState();
    renderList();
  };

  renderList();
}

/* ---------------------------
  Long-term Plan
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
        <label>تاريخ اليوم في الخطة</label>
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
    if(!state.longPlan.days?.length){
      toast("اضغط توليد أيام الخطة أولاً", "bad");
      return;
    }
    const date = $("#lpDate").value || todayKey();
    const subject = ($("#lpSub").value||"").trim();
    const task = ($("#lpTask").value||"").trim();
    if(!subject || !task){ toast("أدخل المادة والمهمة", "bad"); return; }

    const day = state.longPlan.days.find(d=>d.date===date);
    if(!day){ toast("التاريخ خارج نطاق الخطة", "bad"); return; }
    day.items.unshift({ id: crypto.randomUUID(), subject, task, done:false });

    $("#lpSub").value = ""; $("#lpTask").value = "";
    saveState();
    renderPlanList();
  };

  function renderPlanList(){
    const box = $("#lpList");
    if(!state.longPlan.days?.length){
      box.innerHTML = `<div class="small">اضغط "توليد أيام الخطة" لتبدأ.</div>`;
      return;
    }
    const focusDate = $("#lpDate").value || todayKey();
    const day = state.longPlan.days.find(d=>d.date===focusDate);
    if(!day){
      box.innerHTML = `<div class="small">اختر تاريخ داخل نطاق الخطة.</div>`;
      return;
    }

    box.innerHTML = `
      <div class="item">
        <div class="row" style="justify-content:space-between">
          <div>
            <div class="itemTitle">مهام ${focusDate}</div>
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
        const id = b.dataset.done;
        const item = day.items.find(x=>x.id===id);
        if(!item) return;
        item.done = !item.done;
        saveState();
        renderPlanList();
      };
    });
    $$("[data-del]").forEach(b=>{
      b.onclick = ()=>{
        const id = b.dataset.del;
        day.items = day.items.filter(x=>x.id!==id);
        saveState();
        renderPlanList();
      };
    });
  }

  $("#lpDate").onchange = renderPlanList;
  renderPlanList();
}

function renderLeaderboard(view){
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <h3 class="h">🏆 المتصدرين (محلي)</h3>
    <p class="p">بدون تسجيل دخول/فايربيس: هذا يعرض بيانات جهازك فقط.</p>
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

  const { fb, db } = FB;
  const q = fb.query(
    fb.collection(db, "users"),
    fb.orderBy("totalMinutes", "desc"),
    fb.limit(10)
  );

  leaderboardUnsub = fb.onSnapshot(q, (snap)=>{
    const rows = snap.docs.map((d,i)=>({ rank:i+1, ...d.data() }));
    box.innerHTML = rows.length ? rows.map(r=>`
      <div class="item">
        <div class="row" style="justify-content:space-between">
          <div class="row" style="gap:12px">
            <span class="badge">#${r.rank}</span>
            <div class="avatarCircle" style="width:38px;height:38px">${r.avatar?.svg || "🙂"}</div>
            <div>
              <div class="itemTitle">${escapeHtml(r.displayName || "طالب")}</div>
              <div class="itemSub">${r.totalMinutes || 0} دقيقة</div>
            </div>
          </div>
          <span class="badge">${(r.coins||0)} SC</span>
        </div>
      </div>
    `).join("") : `<div class="small">لا يوجد بيانات بعد.</div>`;
  }, (err)=>{
    console.error(err);
    box.innerHTML = `<div class="small">تعذر تحميل المتصدرين (تحقق من Firestore rules).</div>`;
  });
}

function stopLeaderboard(){
  try{ leaderboardUnsub?.(); }catch{}
  leaderboardUnsub = null;
}

/* ---------------------------
  Settings
---------------------------- */
function renderSettings(view){
  const card = document.createElement("div");
  card.className = "card";

  card.innerHTML = `
    <h3 class="h">الإعدادات</h3>

    <div class="grid two">
      <div>
        <label>Timer Skin</label>
        <select id="setSkin" class="field">
          ${ownedOptions("timerSkin")}
        </select>
      </div>
      <div>
        <label>Background</label>
        <select id="setBg" class="field">
          ${ownedOptions("bgTheme")}
        </select>
      </div>
      <div>
        <label>الصوت</label>
        <select id="setSound" class="field">
          ${opt(String(state.settings.sound), ["true","false"])}
        </select>
      </div>
    </div>

    <div class="sep"></div>

    <div class="row">
      <button class="btn" id="resetDaily">Reset بيانات اليوم (Goals + Sessions)</button>
      <button class="btn ghost" id="pushNow">مزامنة الآن</button>
    </div>

    <p class="small" style="margin-top:10px">
      Reset اليوم لا يمسّ إجمالي الدقائق أو عملاتك (بس بيانات اليوم والخطة).
    </p>
  `;
  view.appendChild(card);

  $("#setSkin").onchange = ()=>{
    state.equipped.timerSkin = $("#setSkin").value;
    saveState();
    syncUserThrottled();
    toast("تم تغيير Skin ✅", "good");
  };
  $("#setBg").onchange = ()=>{
    state.equipped.bgTheme = $("#setBg").value;
    saveState();
    syncUserThrottled();
    setBackgroundTheme();
    toast("تم تغيير الخلفية ✅", "good");
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
    // stop timer too
    state.timer.running = false;
    state.timer.carrySeconds = 0;
    state.timer.lastTick = 0;
    saveState();
    toast("تم Reset لبيانات اليوم", "good");
    location.hash = "#goals";
  };

  $("#pushNow").onclick = async ()=>{
    await pushUserDoc();
    toast("تمت المزامنة ✅", "good");
  };
}

function ownedOptions(slot){
  // slot: timerSkin/bgTheme
  const ownedIds = Object.keys(state.inventory||{}).filter(id=>state.inventory[id]);
  const items = [];

  // include basic
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

/* =========================================================
  Metrics helpers
========================================================= */
function minutesToday(){
  const t = todayKey();
  return (state.sessions||[]).filter(s=> (s.tsISO||"").slice(0,10)===t).length;
}
function minutesInLastDays(days){
  const now = Date.now();
  const from = now - (days*24*60*60*1000);
  return (state.sessions||[]).filter(s=>{
    const ts = Date.parse(s.tsISO || 0);
    return ts >= from;
  }).length;
}

function escapeHtml(str){
  return String(str||"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

(async function boot(){
  dailyResetIfNeeded();

  // اسم افتراضي محلي
  state.user.uid = "local";
  state.user.displayName = state.user.displayName || "طالب سراج";
  state.user.photoURL = "";

  // زر logout يصير "إعادة ضبط التطبيق" (اختياري)
  const btnLogout = document.querySelector("#btnLogout");
  if(btnLogout){
    btnLogout.textContent = "إعادة ضبط";
    btnLogout.onclick = ()=>{
      if(confirm("بدك تمسح بيانات سراج على هذا الجهاز؟")){
        localStorage.removeItem("seraj_state_v1");
        location.reload();
      }
    };
  }

  paintShell();

  // افتح مباشرة على التايمر
  if(!location.hash) location.hash = "#timer";
  render();

  window.addEventListener("hashchange", render);
})();

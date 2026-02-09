/* =========================================================
  Seraj — Pro Static (GitHub Pages)
  - No Firebase / No Login
  - Name required (local)
  - Daily goals lock (daily reset)
  - Three.js 3D circular timer (glow + sparks + ambient + drag/touch)
  - Coins: 1 per full minute
========================================================= */

import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

/* ---------------------------
  DOM helpers
---------------------------- */
const $ = (q, el=document)=> el.querySelector(q);
const $$ = (q, el=document)=> Array.from(el.querySelectorAll(q));

const LS_KEY = "seraj_pro_state_v1";

/* ---------------------------
  Base state
---------------------------- */
const DEFAULT = {
  user: { name: "" },

  coins: 0,
  totalMinutes: 0,
  history: [], // {ts, delta, reason}

  equipped: { timerSkin:"skin_basic", bgTheme:"bg_basic" },
  inventory: { skin_basic:true, bg_basic:true },

  daily: {
    date: "",
    locked: true,
    goals: null,   // {totalMinutes,startTime,subjects:[{name,pct}]}
    plan: []
  },

  sessions: [], // {tsISO, minutes:1, skin}

  avatar: {
    parts: { skin:"#f2c6a0", hair:"#1b1b1b", glasses:"none", clothes:"#2b64ff", face:"smile", hairStyle:"fade" },
    svg: ""
  },

  timer: { running:false, carrySeconds:0, lastTick:0 }
};

let state = loadState();

/* ---------------------------
  Utils
---------------------------- */
const nowISO = ()=> new Date().toISOString();
const clamp = (n,a,b)=> Math.max(a, Math.min(b,n));

function deepMerge(base, extra){
  for(const k in extra){
    const v = extra[k];
    if(v && typeof v==="object" && !Array.isArray(v)){
      base[k] = deepMerge(base[k] || {}, v);
    }else base[k] = v;
  }
  return base;
}
function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return structuredClone(DEFAULT);
    return deepMerge(structuredClone(DEFAULT), JSON.parse(raw));
  }catch{
    // fallback for old browsers
    try{ return deepMerge(JSON.parse(JSON.stringify(DEFAULT)), JSON.parse(localStorage.getItem(LS_KEY)||"{}")); }
    catch{ return JSON.parse(JSON.stringify(DEFAULT)); }
  }
}
function saveState(){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  paintShell();
}
function todayKey(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const da = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${da}`;
}
function escapeHtml(s){
  return String(s||"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function toast(msg, type="info"){
  const host = $("#toastHost");
  if(!host) return alert(msg);
  const el = document.createElement("div");
  el.className = `toast ${type==="good"?"good":type==="bad"?"bad":""}`;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(()=> el.remove(), 2200);
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
    // stop timer on new day
    state.timer.running = false;
    state.timer.carrySeconds = 0;
    state.timer.lastTick = 0;
    saveState();
  }
}

/* ---------------------------
  Guard pages
---------------------------- */
function routeGuard(hash){
  const safe = new Set(["#timer","#goals","#settings","#profile"]);
  if(state.daily.locked && !safe.has(hash)){
    // show modal
    $("#lockModal")?.classList.remove("hidden");
    return "#goals";
  }
  $("#lockModal")?.classList.add("hidden");
  return hash;
}

/* ---------------------------
  Header paint
---------------------------- */
function setActiveNav(){
  const hash = location.hash || "#timer";
  $$("[data-route]").forEach(a=>{
    a.classList.toggle("active", a.getAttribute("href")===hash);
  });
}
function setTitle(hash){
  const map = {
    "#timer":"⏱️ Timer 3D",
    "#goals":"✅ Daily Goals",
    "#progress":"🪙 Progress",
    "#store":"🛒 Store",
    "#stats":"📊 Statistics",
    "#notebooks":"📒 Notebooks",
    "#plan":"🗓️ Long-term Plan",
    "#leaderboard":"🏆 Leaderboard",
    "#settings":"⚙️ Settings",
    "#profile":"🧑‍🎨 Profile / Avatar"
  };
  const t = $("#pageTitle");
  if(t) t.textContent = map[hash] || "—";
}
function paintShell(){
  $("#coinBadge").textContent = `${state.coins} SC`;
  $("#totalMinPill").textContent = `${state.totalMinutes}`;
  $("#userName").textContent = state.user.name || "طالب سراج";

  const locked = state.daily.locked;
  const pill = $("#dailyLockPill");
  pill.textContent = locked ? "🔒 لازم تدخل أهداف اليوم" : "✅ أهداف اليوم جاهزة";
  pill.style.borderColor = locked ? "rgba(255,204,102,.55)" : "rgba(54,211,153,.55)";

  const mini = $("#miniAvatar");
  mini.innerHTML = state.avatar.svg ? state.avatar.svg : "🙂";
}

/* ---------------------------
  Name required modal
---------------------------- */
function ensureName(){
  if(state.user.name && state.user.name.trim().length >= 2) return;
  const m = $("#nameModal");
  const input = $("#nameInput");
  m.classList.remove("hidden");
  input.value = "";
  input.focus();

  $("#nameSave").onclick = ()=>{
    const v = (input.value||"").trim();
    if(v.length < 2){
      toast("اكتب اسم صحيح (حرفين أو أكثر)", "bad");
      return;
    }
    state.user.name = v.slice(0,24);
    saveState();
    m.classList.add("hidden");
    toast("تم حفظ الاسم ✅", "good");
    paintShell();
  };
}

/* ---------------------------
  Router render
---------------------------- */
function render(){
  dailyResetIfNeeded();
  ensureName();
  setActiveNav();

  let hash = location.hash || "#timer";
  hash = routeGuard(hash);
  if(hash !== location.hash) location.hash = hash;

  setTitle(hash);
  paintShell();

  const view = $("#view");
  view.innerHTML = "";

  // destroy 3D if leaving timer
  if(hash !== "#timer") timer3d.destroy();

  const pages = {
    "#timer": pageTimer,
    "#goals": pageGoals,
    "#progress": pageProgress,
    "#store": pageStore,
    "#stats": pageStats,
    "#notebooks": pageNotebooks,
    "#plan": pagePlan,
    "#leaderboard": pageLeaderboard,
    "#settings": pageSettings,
    "#profile": pageProfile
  };
  (pages[hash] || pageTimer)(view);
}

/* =========================================================
  TIMER 3D — Glow + Sparks + Drag/Touch
========================================================= */
const timer3d = {
  renderer:null, scene:null, camera:null,
  ring:null, glow:null, sparks:null,
  wrap:null, raf:0,
  rotX:0, rotY:0,
  dragging:false, lastX:0, lastY:0,
  ro:null,
  skins: {
    skin_basic:{ name:"Basic", base:0x6aa8ff, glow:0x6aa8ff },
    skin_fire:{ name:"Fire", base:0xff6b6b, glow:0xffcc66 },
    skin_water:{ name:"Water", base:0x6aa8ff, glow:0x36d399 },
    skin_jordan:{ name:"Jordan", base:0xffffff, glow:0x36d399, jordan:true }
  },
  jordanTex(){
    const c = document.createElement("canvas");
    c.width = 512; c.height = 64;
    const g = c.getContext("2d");
    g.fillStyle="#000"; g.fillRect(0,0,512,22);
    g.fillStyle="#fff"; g.fillRect(0,22,512,20);
    g.fillStyle="#007a3d"; g.fillRect(0,42,512,22);
    g.fillStyle="#ce1126"; g.fillRect(0,0,120,64);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.x = 2;
    return tex;
  },
  init(container){
    this.wrap = container;

    const canvas = document.createElement("canvas");
    canvas.style.width="100%";
    canvas.style.height="100%";
    container.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0.55, 3.2);

    const amb = new THREE.AmbientLight(0xffffff, 0.75);
    const dir = new THREE.DirectionalLight(0xffffff, 0.95);
    dir.position.set(2,2,3);
    scene.add(amb, dir);

    const skin = this.skins[state.equipped.timerSkin] || this.skins.skin_basic;

    const torus = new THREE.TorusGeometry(1, 0.18, 32, 180);

    let mat;
    if(skin.jordan){
      mat = new THREE.MeshStandardMaterial({
        map: this.jordanTex(),
        metalness:0.25,
        roughness:0.35,
        emissive: new THREE.Color(0x222222),
        emissiveIntensity:0.35
      });
    }else{
      mat = new THREE.MeshStandardMaterial({
        color: skin.base,
        metalness:0.22,
        roughness:0.36,
        emissive: new THREE.Color(skin.glow),
        emissiveIntensity:0.35
      });
    }

    const ring = new THREE.Mesh(torus, mat);
    ring.rotation.x = 0.75;
    scene.add(ring);

    const glowGeo = new THREE.TorusGeometry(1, 0.25, 16, 140);
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

    const sparkCount = 320;
    const pos = new Float32Array(sparkCount*3);
    for(let i=0;i<sparkCount;i++){
      const a = Math.random()*Math.PI*2;
      const r = 1 + Math.random()*0.38;
      pos[i*3+0] = Math.cos(a)*r;
      pos[i*3+1] = (Math.random()-0.5)*0.7;
      pos[i*3+2] = Math.sin(a)*r;
    }
    const g0 = new THREE.BufferGeometry();
    g0.setAttribute("position", new THREE.BufferAttribute(pos,3));
    const pm = new THREE.PointsMaterial({
      color: skin.glow,
      size: 0.02,
      transparent:true,
      opacity:0.85,
      blending: THREE.AdditiveBlending,
      depthWrite:false
    });
    const sparks = new THREE.Points(g0, pm);
    scene.add(sparks);

    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.ring = ring;
    this.glow = glow;
    this.sparks = sparks;

    const resize = ()=>{
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1,h);
      camera.updateProjectionMatrix();
    };
    resize();
    this.ro = new ResizeObserver(resize);
    this.ro.observe(container);

    const down = (x,y)=>{ this.dragging=true; this.lastX=x; this.lastY=y; };
    const move = (x,y)=>{
      if(!this.dragging) return;
      const dx = x - this.lastX;
      const dy = y - this.lastY;
      this.lastX=x; this.lastY=y;
      this.rotY += dx*0.006;
      this.rotX += dy*0.004;
      this.rotX = clamp(this.rotX, -0.65, 0.65);
    };
    const up = ()=>{ this.dragging=false; };

    canvas.addEventListener("mousedown", e=>down(e.clientX,e.clientY));
    window.addEventListener("mousemove", e=>move(e.clientX,e.clientY));
    window.addEventListener("mouseup", up);

    canvas.addEventListener("touchstart", e=>{
      const t = e.touches[0];
      down(t.clientX,t.clientY);
    }, {passive:true});
    canvas.addEventListener("touchmove", e=>{
      const t = e.touches[0];
      move(t.clientX,t.clientY);
    }, {passive:true});
    canvas.addEventListener("touchend", up, {passive:true});

    const tick = (ms)=>{
      const t = ms*0.001;

      ring.rotation.y = this.rotY + Math.sin(t*0.7)*0.14;
      ring.rotation.x = 0.75 + this.rotX + Math.sin(t*0.9)*0.05;
      glow.rotation.copy(ring.rotation);

      sparks.rotation.y = -t*0.35;
      sparks.rotation.x = Math.sin(t*0.25)*0.08;

      glow.material.opacity = state.timer.running
        ? 0.22 + Math.sin(t*6)*0.03
        : 0.16 + Math.sin(t*2)*0.02;

      renderer.render(scene, camera);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  },
  destroy(){
    if(!this.renderer) return;
    cancelAnimationFrame(this.raf);
    try{ this.ro?.disconnect(); }catch{}
    try{ this.renderer.dispose(); }catch{}
    this.renderer=null; this.scene=null; this.camera=null;
    this.ring=null; this.glow=null; this.sparks=null;
    this.wrap?.replaceChildren();
    this.wrap=null;
  }
};

/* ---------------------------
  Timer earning loop
---------------------------- */
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
    earnMinute();
  }

  const secLeft = 60 - state.timer.carrySeconds;
  $("#timerSecLeft") && ($("#timerSecLeft").textContent = `${secLeft}s`);
  saveState();
}, 1000);

function earnMinute(){
  state.coins += 1;
  state.totalMinutes += 1;

  const skin = state.equipped.timerSkin;
  state.sessions.push({ tsISO: nowISO(), minutes:1, skin });

  state.history.unshift({ ts: nowISO(), delta:+1, reason:"دقيقة مكتملة (Timer)" });
  state.history = state.history.slice(0, 80);

  const pop = $("#coinPop");
  if(pop){
    pop.textContent = "+1 SC";
    pop.classList.add("show");
    setTimeout(()=> pop.classList.remove("show"), 320);
  }
}

/* =========================================================
  Pages
========================================================= */
function minutesToday(){
  const t = todayKey();
  return state.sessions.filter(s=> (s.tsISO||"").slice(0,10)===t).length;
}
function minutesInLastDays(days){
  const from = Date.now() - days*24*60*60*1000;
  return state.sessions.filter(s=> Date.parse(s.tsISO||0) >= from).length;
}
function bar(val, max){
  const pct = clamp((val/(max||1))*100, 0, 100);
  return `
    <div style="margin-top:8px;border:1px solid var(--line);border-radius:999px;overflow:hidden;background:rgba(255,255,255,.04)">
      <div style="width:${pct}%;height:10px;background:var(--pri)"></div>
    </div>
    <div class="tiny muted" style="margin-top:6px">${val} / ${max} دقيقة</div>
  `;
}

/* ---------------------------
  Timer page
---------------------------- */
function pageTimer(view){
  const wrap = document.createElement("div");
  wrap.className = "grid two";

  const left = document.createElement("div");
  left.className = "card";
  left.innerHTML = `
    <h3 class="h">Timer 3D</h3>
    <p class="p">اسحب ولف — Glow + Sparks. كل دقيقة مكتملة = <b>1 Seraj Coin</b>.</p>

    <div class="timerStage" id="timerStage">
      <div class="timerHud">
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
          <button class="btn" id="btnResetTimer">تصفير</button>
          <a class="btn ghost" href="#store">Skins</a>
        </div>
        <div class="hint">Drag/Touch للتحكم</div>
      </div>

      <div class="coinPop" id="coinPop">+1 SC</div>
    </div>
  `;

  const right = document.createElement("div");
  right.className = "card";
  const today = minutesToday();
  const goal = state.daily.goals?.totalMinutes || 180;

  right.innerHTML = `
    <h3 class="h">مختصر سريع</h3>
    <div class="grid three">
      <div class="kpi"><div class="n">${today}</div><div class="t">دقائق اليوم</div></div>
      <div class="kpi"><div class="n">${state.coins}</div><div class="t">Seraj Coin</div></div>
      <div class="kpi"><div class="n">${state.equipped.timerSkin.replace("skin_","")}</div><div class="t">Skin</div></div>
    </div>

    <div class="sep"></div>
    <div class="item">
      <div class="itemTitle">تقدمك اليوم</div>
      ${bar(today, goal)}
    </div>

    <div class="sep"></div>
    <div class="row">
      <a class="btn" href="#goals">Daily Goals</a>
      <a class="btn" href="#progress">Progress</a>
      <a class="btn" href="#profile">Avatar</a>
    </div>
  `;

  wrap.appendChild(left);
  wrap.appendChild(right);
  view.appendChild(wrap);

  // init 3D
  timer3d.init($("#timerStage"));

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
  Goals + AI heuristic (local)
---------------------------- */
function generatePlan(goals){
  // قواعد:
  // - الجلسة: min 25, max 55
  // - لا 3 جلسات متتالية لنفس المادة
  // - البقايا < 25: تندمج إن أمكن، أو تصير micro 15–20
  const MIN=25, MAX=55;

  const subjects = goals.subjects
    .map(s=>{
      const target = Math.round(goals.totalMinutes * s.pct / 100);
      return { name:s.name, left:target, target };
    })
    .sort((a,b)=>b.left-a.left);

  const plan = [];
  let last=null, last2=null;

  function pick(){
    const sorted = [...subjects].sort((a,b)=>b.left-a.left);
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
      const prev = [...plan].reverse().find(x=>x.subject===s.name);
      if(prev && prev.minutes + s.left <= MAX){
        prev.minutes += s.left;
        s.left = 0;
      }else{
        chunk = clamp(s.left, 15, 20);
        plan.push({ subject:s.name, minutes:chunk, micro:true });
        s.left -= chunk;
      }
    }else{
      plan.push({ subject:s.name, minutes:chunk });
      s.left -= chunk;
    }

    last2 = last;
    last = s.name;
    if(plan.length > 60) break;
  }
  return plan;
}

function pageGoals(view){
  const card = document.createElement("div");
  card.className = "card";

  const goals = state.daily.goals;

  const subjects = goals?.subjects || [
    {name:"رياضيات", pct:40},
    {name:"عربي", pct:25},
    {name:"إنجليزي", pct:20},
    {name:"مادة 4", pct:15},
  ];

  card.innerHTML = `
    <h3 class="h">Daily Goals (إلزامي)</h3>
    <p class="p">كل يوم لازم تدخل أهدافك مرة واحدة. بعدها ينفتح كل شيء.</p>

    <div class="grid two">
      <div>
        <div class="label">وقت الدراسة الكلي (بالساعات)</div>
        <input class="field" id="gHours" type="number" min="1" max="16" step="0.5" value="${goals ? goals.totalMinutes/60 : 3}">
      </div>
      <div>
        <div class="label">بداية الدراسة (اختياري)</div>
        <input class="field" id="gStart" type="time" value="${goals?.startTime || ""}">
      </div>
    </div>

    <div class="sep"></div>
    <div id="subBox" class="grid two"></div>

    <div class="row" style="margin-top:10px">
      <button class="btn" id="addSub">+ إضافة مادة</button>
      <button class="btn primary" id="saveGoals">حفظ + توليد خطة</button>
    </div>

    <div class="sep"></div>
    <h3 class="h">الخطة المقترحة (AI-like)</h3>
    <div class="list" id="planBox"></div>
  `;
  view.appendChild(card);

  const tmp = subjects.map(s=>({name:s.name, pct:Number(s.pct)}));

  function renderSubs(){
    const box = $("#subBox");
    box.innerHTML = tmp.map((s,i)=>`
      <div class="item">
        <div class="row" style="justify-content:space-between">
          <div style="flex:1;min-width:160px">
            <div class="label">المادة</div>
            <input class="field" data-name="${i}" value="${escapeHtml(s.name)}">
          </div>
          <div style="width:140px">
            <div class="label">النسبة %</div>
            <input class="field" type="number" min="0" max="100" step="1" data-pct="${i}" value="${s.pct}">
          </div>
          <button class="btn ghost" data-del="${i}">حذف</button>
        </div>
      </div>
    `).join("");

    $$("[data-name]").forEach(inp=>{
      inp.oninput = ()=> tmp[Number(inp.dataset.name)].name = inp.value;
    });
    $$("[data-pct]").forEach(inp=>{
      inp.oninput = ()=> tmp[Number(inp.dataset.pct)].pct = Number(inp.value||0);
    });
    $$("[data-del]").forEach(btn=>{
      btn.onclick = ()=>{ tmp.splice(Number(btn.dataset.del),1); renderSubs(); };
    });
  }

  function renderPlan(){
    const pb = $("#planBox");
    const plan = state.daily.plan || [];
    pb.innerHTML = plan.length ? plan.map((p,idx)=>`
      <div class="item">
        <div class="row" style="justify-content:space-between">
          <div>
            <div class="itemTitle">جلسة ${idx+1}: ${escapeHtml(p.subject)}</div>
            <div class="itemSub">${p.minutes} دقيقة • ${p.micro?"micro ":""}استراحة 5–10 دقائق</div>
          </div>
          <span class="badge">${p.minutes}m</span>
        </div>
      </div>
    `).join("") : `<div class="tiny muted">احفظ الأهداف لتوليد الخطة.</div>`;
  }

  $("#addSub").onclick = ()=>{
    tmp.push({name:`مادة ${tmp.length+1}`, pct:0});
    renderSubs();
  };

  $("#saveGoals").onclick = ()=>{
    const hours = Number($("#gHours").value||0);
    const totalMinutes = Math.round(hours*60);
    const startTime = $("#gStart").value || "";
    const sum = tmp.reduce((a,b)=>a+Number(b.pct||0),0);

    if(totalMinutes<=0){ toast("أدخل وقت صحيح", "bad"); return; }
    if(sum!==100){ toast("مجموع النسب لازم يكون 100%", "bad"); return; }
    if(tmp.some(s=>!(s.name||"").trim())){ toast("في مادة اسمها فاضي", "bad"); return; }

    state.daily.goals = { totalMinutes, startTime, subjects: tmp.map(s=>({name:s.name.trim(), pct:Number(s.pct)})) };
    state.daily.plan = generatePlan(state.daily.goals);
    state.daily.locked = false;

    saveState();
    toast("تم حفظ أهداف اليوم ✅", "good");
    render();
  };

  renderSubs();
  renderPlan();
}

/* ---------------------------
  Progress
---------------------------- */
function pageProgress(view){
  const wrap = document.createElement("div");
  wrap.className = "grid two";

  const today = minutesToday();
  const week = minutesInLastDays(7);
  const month = minutesInLastDays(30);

  const left = document.createElement("div");
  left.className = "card";
  left.innerHTML = `
    <h3 class="h">Progress / Coins</h3>
    <div class="grid three">
      <div class="kpi"><div class="n">${state.coins}</div><div class="t">Seraj Coin</div></div>
      <div class="kpi"><div class="n">${today}</div><div class="t">اليوم</div></div>
      <div class="kpi"><div class="n">${state.totalMinutes}</div><div class="t">الإجمالي</div></div>
    </div>

    <div class="sep"></div>
    <h3 class="h">History</h3>
    <div class="list" id="hist"></div>
  `;

  const right = document.createElement("div");
  right.className = "card";
  const goal = state.daily.goals?.totalMinutes || 180;
  right.innerHTML = `
    <h3 class="h">الإنجاز</h3>
    <div class="item">
      <div class="itemTitle">اليوم</div>
      ${bar(today, goal)}
    </div>
    <div class="item">
      <div class="itemTitle">آخر 7 أيام</div>
      ${bar(week, 7*goal)}
    </div>
    <div class="item">
      <div class="itemTitle">آخر 30 يوم</div>
      ${bar(month, 30*goal)}
    </div>
  `;

  wrap.appendChild(left);
  wrap.appendChild(right);
  view.appendChild(wrap);

  const h = $("#hist");
  const hist = state.history.slice(0,18);
  h.innerHTML = hist.length ? hist.map(x=>`
    <div class="item">
      <div class="row" style="justify-content:space-between">
        <div>
          <div class="itemTitle">${x.delta>0?`+${x.delta}`:x.delta} SC</div>
          <div class="itemSub">${escapeHtml(x.reason)} • ${new Date(x.ts).toLocaleString("ar-JO")}</div>
        </div>
        <span class="badge">${x.delta>0?"ربح":"صرف"}</span>
      </div>
    </div>
  `).join("") : `<div class="tiny muted">ما في سجل بعد.</div>`;
}

/* ---------------------------
  Store (balanced prices)
---------------------------- */
const STORE = [
  { id:"skin_fire", slot:"timerSkin", name:"Timer Skin — Fire", price:120, desc:"Glow ناري" },
  { id:"skin_water", slot:"timerSkin", name:"Timer Skin — Water", price:120, desc:"Glow مائي" },
  { id:"skin_jordan", slot:"timerSkin", name:"Timer Skin — Jordan", price:350, desc:"علم الأردن (الأغلى)" },

  { id:"bg_fire", slot:"bgTheme", name:"Background — Fire", price:60, desc:"خلفية دافئة" },
  { id:"bg_water", slot:"bgTheme", name:"Background — Water", price:60, desc:"خلفية هادئة" },
  { id:"bg_jordan", slot:"bgTheme", name:"Background — Jordan", price:140, desc:"خلفية وطنية" },
];

function pageStore(view){
  const wrap = document.createElement("div");
  wrap.className = "grid two";

  const left = document.createElement("div");
  left.className = "card";
  left.innerHTML = `
    <h3 class="h">Store</h3>
    <p class="p">اليوم الطبيعي (120–240 دقيقة) بخليك تشتري شي بسيط بسرعة، والأشياء الكبيرة بدها وقت أكثر.</p>
    <div class="list" id="storeList"></div>
  `;

  const right = document.createElement("div");
  right.className = "card";
  right.innerHTML = `
    <h3 class="h">Inventory</h3>
    <div class="item"><div class="itemTitle">الرصيد</div><div class="itemSub"><b>${state.coins} SC</b></div></div>
    <div class="sep"></div>
    <div class="item">
      <div class="itemTitle">مُجهّز</div>
      <div class="itemSub">Timer: <b>${escapeHtml(state.equipped.timerSkin)}</b></div>
      <div class="itemSub">BG: <b>${escapeHtml(state.equipped.bgTheme)}</b></div>
    </div>
  `;

  wrap.appendChild(left);
  wrap.appendChild(right);
  view.appendChild(wrap);

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
  if(state.inventory[it.id]) return toast("أنت مالكه أصلاً");
  if(state.coins < it.price) return toast("رصيدك لا يكفي", "bad");

  state.coins -= it.price;
  state.inventory[it.id] = true;
  state.history.unshift({ ts: nowISO(), delta: -it.price, reason:`شراء: ${it.name}` });
  state.history = state.history.slice(0,80);
  saveState();
  toast("تم الشراء ✅", "good");
  render();
}

function equipItem(id){
  const it = STORE.find(x=>x.id===id);
  if(!it) return;
  if(!state.inventory[it.id]) return toast("لازم تشتريه أولاً", "bad");

  state.equipped[it.slot] = it.id;
  saveState();
  toast("تم التجهيز ✅", "good");

  // refresh timer skin instantly if on timer page
  if((location.hash||"#timer")==="#timer"){
    timer3d.destroy();
    timer3d.init($("#timerStage"));
  }
  render();
}

/* ---------------------------
  Statistics (simple + badges)
---------------------------- */
function badges(total){
  const defs = [
    { at:60, icon:"🥉", name:"ساعة", desc:"60 دقيقة إجمالي" },
    { at:300, icon:"🥈", name:"5 ساعات", desc:"300 دقيقة إجمالي" },
    { at:600, icon:"🥇", name:"10 ساعات", desc:"600 دقيقة إجمالي" },
    { at:1200, icon:"🏅", name:"20 ساعة", desc:"1200 دقيقة إجمالي" },
    { at:2400, icon:"🏆", name:"40 ساعة", desc:"2400 دقيقة إجمالي" },
  ];
  return defs.map(d=>({ ...d, earned: total>=d.at }));
}
function pageStats(view){
  const wrap = document.createElement("div");
  wrap.className = "grid two";

  const today = minutesToday();
  const week = minutesInLastDays(7);
  const month = minutesInLastDays(30);

  const left = document.createElement("div");
  left.className = "card";
  left.innerHTML = `
    <h3 class="h">Statistics</h3>
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
  const b = badges(state.totalMinutes);
  right.innerHTML = `
    <h3 class="h">Badges</h3>
    <div class="list">
      ${b.map(x=>`
        <div class="item">
          <div class="row" style="justify-content:space-between">
            <div>
              <div class="itemTitle">${x.icon} ${escapeHtml(x.name)}</div>
              <div class="itemSub">${escapeHtml(x.desc)}</div>
            </div>
            <span class="badge">${x.earned?"مُكتسب":"لسه"}</span>
          </div>
        </div>
      `).join("")}
    </div>
  `;

  wrap.appendChild(left);
  wrap.appendChild(right);
  view.appendChild(wrap);
}

/* ---------------------------
  Notebooks (simple)
---------------------------- */
function pageNotebooks(view){
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <h3 class="h">Notebooks</h3>
    <p class="p">قسم: نقاط قوة/ضعف/ملاحظات — إضافة/تعديل/حذف + بحث.</p>

    <div class="grid two">
      <div>
        <div class="label">القسم</div>
        <select class="field" id="nbType">
          <option value="strengths">نقاط قوة</option>
          <option value="weaknesses">نقاط ضعف</option>
          <option value="lessonNotes">ملاحظات الدرس</option>
        </select>
      </div>
      <div>
        <div class="label">بحث</div>
        <input class="field" id="nbSearch" placeholder="اكتب كلمة...">
      </div>
    </div>

    <div class="sep"></div>

    <div class="grid two">
      <div>
        <div class="label">النص</div>
        <textarea class="field" id="nbText" rows="3" placeholder="اكتب..."></textarea>
      </div>
      <div class="row end" style="align-items:flex-end">
        <button class="btn primary" id="nbAdd">إضافة</button>
      </div>
    </div>

    <div class="sep"></div>
    <div class="list" id="nbList"></div>
  `;
  view.appendChild(card);

  const getArr = ()=> state.notebooks[$("#nbType").value];

  function renderList(){
    const t = $("#nbType").value;
    const q = ($("#nbSearch").value||"").trim().toLowerCase();
    const arr = state.notebooks[t] || [];
    const items = q ? arr.filter(x=> (x.text||"").toLowerCase().includes(q)) : arr;

    $("#nbList").innerHTML = items.length ? items
      .slice()
      .sort((a,b)=> (b.ts||"").localeCompare(a.ts||""))
      .map(x=>`
        <div class="item">
          <div class="row" style="justify-content:space-between">
            <div style="flex:1">
              <div class="itemTitle">${new Date(x.ts).toLocaleString("ar-JO")}</div>
              <div class="itemSub" style="margin-top:6px">${escapeHtml(x.text)}</div>
            </div>
            <div class="row">
              <button class="btn" data-ed="${x.id}">تعديل</button>
              <button class="btn ghost" data-del="${x.id}">حذف</button>
            </div>
          </div>
        </div>
      `).join("") : `<div class="tiny muted">لا يوجد عناصر.</div>`;

    $$("[data-del]").forEach(b=>{
      b.onclick = ()=>{
        const id = b.dataset.del;
        state.notebooks[t] = (state.notebooks[t]||[]).filter(x=>x.id!==id);
        saveState(); renderList();
      };
    });
    $$("[data-ed]").forEach(b=>{
      b.onclick = ()=>{
        const id = b.dataset.ed;
        const item = (state.notebooks[t]||[]).find(x=>x.id===id);
        if(!item) return;
        const txt = prompt("عدّل النص:", item.text);
        if(txt===null) return;
        item.text = (txt||"").trim();
        saveState(); renderList();
      };
    });
  }

  $("#nbType").onchange = renderList;
  $("#nbSearch").oninput = renderList;

  $("#nbAdd").onclick = ()=>{
    const t = $("#nbType").value;
    const text = ($("#nbText").value||"").trim();
    if(!text) return toast("اكتب نص", "bad");
    const item = { id: crypto.randomUUID(), ts: nowISO(), text };
    state.notebooks[t] = [item, ...(state.notebooks[t]||[])];
    $("#nbText").value = "";
    saveState(); renderList();
  };

  renderList();
}

/* ---------------------------
  Plan + Leaderboard (local placeholders)
---------------------------- */
function pagePlan(view){
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <h3 class="h">Long-term Plan</h3>
    <p class="p"><b>سوي خطتك بنفسك — هذا طريقك الخاص</b></p>
    <div class="item">
      <div class="itemTitle">جاهزة للتطوير</div>
      <div class="itemSub">نضيفها بالتفصيل بعد ما تثبت المنصة تمامًا.</div>
    </div>
  `;
  view.appendChild(card);
}
function pageLeaderboard(view){
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <h3 class="h">Leaderboard (محلي)</h3>
    <p class="p">بدون Firebase: هذا يعرض جهازك فقط.</p>
    <div class="item">
      <div class="row" style="justify-content:space-between">
        <div>
          <div class="itemTitle">#1 ${escapeHtml(state.user.name||"طالب سراج")}</div>
          <div class="itemSub">${state.totalMinutes} دقيقة</div>
        </div>
        <span class="badge">${state.coins} SC</span>
      </div>
    </div>
  `;
  view.appendChild(card);
}

/* ---------------------------
  Settings
---------------------------- */
function pageSettings(view){
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <h3 class="h">Settings</h3>

    <div class="grid two">
      <div>
        <div class="label">Timer Skin</div>
        <select class="field" id="setSkin">
          ${ownedOptions("timerSkin")}
        </select>
      </div>
      <div>
        <div class="label">Background</div>
        <select class="field" id="setBg">
          ${ownedOptions("bgTheme")}
        </select>
      </div>
    </div>

    <div class="sep"></div>
    <div class="row">
      <button class="btn" id="resetDaily">Reset بيانات اليوم (Goals)</button>
      <button class="btn ghost" id="rename">تغيير الاسم</button>
    </div>
  `;
  view.appendChild(card);

  $("#setSkin").onchange = ()=>{
    state.equipped.timerSkin = $("#setSkin").value;
    saveState();
    toast("تم تغيير Skin ✅", "good");
  };
  $("#setBg").onchange = ()=>{
    state.equipped.bgTheme = $("#setBg").value;
    saveState();
    toast("تم تغيير الخلفية ✅", "good");
  };

  $("#resetDaily").onclick = ()=>{
    state.daily.goals = null;
    state.daily.plan = [];
    state.daily.locked = true;
    state.timer.running = false;
    state.timer.carrySeconds = 0;
    state.timer.lastTick = 0;
    saveState();
    toast("تم Reset لليوم ✅", "good");
    location.hash = "#goals";
  };

  $("#rename").onclick = ()=>{
    state.user.name = "";
    saveState();
    $("#nameModal").classList.remove("hidden");
    $("#nameInput").focus();
  };
}

function ownedOptions(slot){
  const owned = Object.keys(state.inventory||{}).filter(k=>state.inventory[k]);
  const items = [];
  if(slot==="timerSkin"){
    items.push({id:"skin_basic", label:"Basic (مجاني)"});
    if(owned.includes("skin_fire")) items.push({id:"skin_fire", label:"Fire"});
    if(owned.includes("skin_water")) items.push({id:"skin_water", label:"Water"});
    if(owned.includes("skin_jordan")) items.push({id:"skin_jordan", label:"Jordan"});
  }else{
    items.push({id:"bg_basic", label:"Basic (مجاني)"});
    if(owned.includes("bg_fire")) items.push({id:"bg_fire", label:"Fire"});
    if(owned.includes("bg_water")) items.push({id:"bg_water", label:"Water"});
    if(owned.includes("bg_jordan")) items.push({id:"bg_jordan", label:"Jordan"});
  }
  return items.map(x=>`<option value="${x.id}" ${state.equipped[slot]===x.id?"selected":""}>${x.label}</option>`).join("");
}

/* ---------------------------
  Profile / Avatar (better looking)
---------------------------- */
function avatarSVG(p){
  // تحسين بسيط: hairStyle + face + glasses
  const mouth = p.face==="smile"
    ? `<path d="M78 112 Q100 128 122 112" stroke="#222" stroke-width="6" fill="none" stroke-linecap="round"/>`
    : p.face==="happy"
      ? `<path d="M76 110 Q100 140 124 110" stroke="#222" stroke-width="6" fill="none" stroke-linecap="round"/>`
      : `<path d="M80 118 L120 118" stroke="#222" stroke-width="6" stroke-linecap="round"/>`;

  const hair =
    p.hairStyle==="curl"
      ? `<path d="M50 86 Q70 30 100 34 Q130 30 150 86
                Q135 60 120 56 Q110 54 100 56 Q90 54 80 56 Q65 60 50 86Z"
          fill="${p.hair}"/>`
      : p.hairStyle==="long"
        ? `<path d="M50 86 Q100 22 150 86 L150 140 Q130 150 120 132 Q112 120 100 120
                   Q88 120 80 132 Q70 150 50 140Z" fill="${p.hair}"/>`
        : `<path d="M52 82 Q100 30 148 82 Q132 50 100 46 Q68 50 52 82Z" fill="${p.hair}"/>`;

  const glasses =
    p.glasses==="round"
      ? `<circle cx="78" cy="92" r="16" stroke="#111" stroke-width="6" fill="rgba(255,255,255,.18)"/>
         <circle cx="122" cy="92" r="16" stroke="#111" stroke-width="6" fill="rgba(255,255,255,.18)"/>
         <path d="M94 92 L106 92" stroke="#111" stroke-width="6" stroke-linecap="round"/>`
      : p.glasses==="square"
        ? `<rect x="62" y="76" width="32" height="32" rx="8" stroke="#111" stroke-width="6" fill="rgba(255,255,255,.18)"/>
           <rect x="106" y="76" width="32" height="32" rx="8" stroke="#111" stroke-width="6" fill="rgba(255,255,255,.18)"/>
           <path d="M94 92 L106 92" stroke="#111" stroke-width="6" stroke-linecap="round"/>`
        : "";

  return `
  <svg width="220" height="220" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-label="Avatar">
    <defs>
      <filter id="sh" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="rgba(0,0,0,.35)"/>
      </filter>
    </defs>
    <g filter="url(#sh)">
      <circle cx="100" cy="90" r="56" fill="${p.skin}"/>
      ${hair}
      <circle cx="80" cy="92" r="7" fill="#222"/>
      <circle cx="120" cy="92" r="7" fill="#222"/>
      ${glasses}
      ${mouth}
      <path d="M48 156 Q100 128 152 156 L152 200 L48 200Z" fill="${p.clothes}"/>
    </g>
  </svg>`;
}

function pageProfile(view){
  const card = document.createElement("div");
  card.className = "grid two";

  const left = document.createElement("div");
  left.className = "card";
  left.innerHTML = `
    <h3 class="h">Profile / Avatar</h3>
    <p class="p">Bitmoji-like بسيط (SVG) لكن شكله أنظف من السابق.</p>

    <div class="grid two">
      <div>
        <div class="label">لون البشرة</div>
        <input class="field" id="avSkin" type="color" value="${state.avatar.parts.skin}">
      </div>
      <div>
        <div class="label">لون الشعر</div>
        <input class="field" id="avHair" type="color" value="${state.avatar.parts.hair}">
      </div>

      <div>
        <div class="label">ستايل الشعر</div>
        <select class="field" id="avHairStyle">
          <option value="fade" ${state.avatar.parts.hairStyle==="fade"?"selected":""}>Fade</option>
          <option value="curl" ${state.avatar.parts.hairStyle==="curl"?"selected":""}>Curly</option>
          <option value="long" ${state.avatar.parts.hairStyle==="long"?"selected":""}>Long</option>
        </select>
      </div>

      <div>
        <div class="label">نظارة</div>
        <select class="field" id="avGlasses">
          <option value="none" ${state.avatar.parts.glasses==="none"?"selected":""}>None</option>
          <option value="round" ${state.avatar.parts.glasses==="round"?"selected":""}>Round</option>
          <option value="square" ${state.avatar.parts.glasses==="square"?"selected":""}>Square</option>
        </select>
      </div>

      <div>
        <div class="label">الملابس</div>
        <input class="field" id="avClothes" type="color" value="${state.avatar.parts.clothes}">
      </div>

      <div>
        <div class="label">التعبير</div>
        <select class="field" id="avFace">
          <option value="smile" ${state.avatar.parts.face==="smile"?"selected":""}>Smile</option>
          <option value="happy" ${state.avatar.parts.face==="happy"?"selected":""}>Happy</option>
          <option value="serious" ${state.avatar.parts.face==="serious"?"selected":""}>Serious</option>
        </select>
      </div>
    </div>

    <div class="row end" style="margin-top:10px">
      <button class="btn primary" id="saveAvatar">حفظ</button>
    </div>
  `;

  const right = document.createElement("div");
  right.className = "card";
  right.innerHTML = `
    <h3 class="h">Preview</h3>
    <div class="item" style="display:grid;place-items:center;min-height:320px" id="avPrev"></div>
  `;

  card.appendChild(left);
  card.appendChild(right);
  view.appendChild(card);

  const prev = $("#avPrev");

  function rebuild(){
    const p = {
      skin: $("#avSkin").value,
      hair: $("#avHair").value,
      hairStyle: $("#avHairStyle").value,
      glasses: $("#avGlasses").value,
      clothes: $("#avClothes").value,
      face: $("#avFace").value,
    };
    const svg = avatarSVG(p);
    prev.innerHTML = svg;
    return {p, svg};
  }

  rebuild();
  ["avSkin","avHair","avHairStyle","avGlasses","avClothes","avFace"].forEach(id=>{
    $("#"+id).oninput = rebuild;
    $("#"+id).onchange = rebuild;
  });

  $("#saveAvatar").onclick = ()=>{
    const {p, svg} = rebuild();
    state.avatar.parts = p;
    state.avatar.svg = svg;
    saveState();
    toast("تم حفظ الأفاتار ✅", "good");
    paintShell();
  };
}

/* =========================================================
  Boot
========================================================= */
function wire(){
  $("#goGoalsNow").onclick = ()=>{
    $("#lockModal").classList.add("hidden");
    location.hash = "#goals";
  };

  $("#btnResetApp").onclick = ()=>{
    if(confirm("تمسح كل بيانات سراج من هذا الجهاز؟")){
      localStorage.removeItem(LS_KEY);
      location.reload();
    }
  };
}

(function boot(){
  wire();
  dailyResetIfNeeded();

  if(!location.hash) location.hash = "#timer";
  render();

  window.addEventListener("hashchange", render);
})();

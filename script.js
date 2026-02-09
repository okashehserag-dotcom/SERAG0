// Seraj — Single Page (Hash Router) + LocalStorage
const $ = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => [...el.querySelectorAll(q)];

const LS = {
  get(k, fallback=null){
    try{
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : fallback;
    }catch{ return fallback; }
  },
  set(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
};

const state = {
  user: LS.get("seraj.user", { name:"", avatar:"🙂" }),
  coins: LS.get("seraj.coins", 0),
  totalMin: LS.get("seraj.totalMin", 0),
  // lock rule: لازم يدخل goals مرة باليوم
  daily: LS.get("seraj.daily", { dateKey:"", goalsDone:false, goals:[] }),
  timer: LS.get("seraj.timer", { mode:"focus", secondsLeft:25*60, running:false, lastTick:0 }),
  notebooks: LS.get("seraj.notebooks", []),
  plan: LS.get("seraj.plan", { items:[] }),
  theme: LS.get("seraj.theme", { focusMode:false })
};

const view = $("#view");
const pageTitle = $("#pageTitle");
const coinBadge = $("#coinBadge");
const totalMinPill = $("#totalMinPill");
const dailyLockPill = $("#dailyLockPill");
const toastHost = $("#toastHost");

const fxCanvas = $("#fxCanvas");
const fx = fxCanvas.getContext("2d");
let confetti = [];

function todayKey(){
  const d = new Date();
  // key based on local date
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function ensureDaily(){
  const tk = todayKey();
  if(state.daily.dateKey !== tk){
    state.daily.dateKey = tk;
    state.daily.goalsDone = false;
    state.daily.goals = [
      { text:"حل 20 سؤال مواد مشتركة", done:false },
      { text:"مراجعة درس واحد", done:false },
      { text:"جلسة 25 دقيقة تركيز", done:false },
    ];
    LS.set("seraj.daily", state.daily);
  }
}

function saveAll(){
  LS.set("seraj.user", state.user);
  LS.set("seraj.coins", state.coins);
  LS.set("seraj.totalMin", state.totalMin);
  LS.set("seraj.daily", state.daily);
  LS.set("seraj.timer", state.timer);
  LS.set("seraj.notebooks", state.notebooks);
  LS.set("seraj.plan", state.plan);
  LS.set("seraj.theme", state.theme);
}

function toast(title, desc){
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<div class="t">${title}</div><div class="d">${desc}</div>`;
  toastHost.appendChild(el);
  setTimeout(()=>{ el.style.opacity="0"; el.style.transform="translateY(8px)"; }, 2600);
  setTimeout(()=> el.remove(), 3200);
}

function fmtTime(sec){
  sec = Math.max(0, Math.floor(sec));
  const m = String(Math.floor(sec/60)).padStart(2,"0");
  const s = String(sec%60).padStart(2,"0");
  return `${m}:${s}`;
}

function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }

function updateTop(){
  $("#userName").textContent = state.user.name ? state.user.name : "طالب سراج";
  $("#miniAvatar").textContent = state.user.avatar || "🙂";
  coinBadge.textContent = `${state.coins} SC`;
  totalMinPill.textContent = state.totalMin;

  ensureDaily();
  dailyLockPill.textContent = state.daily.goalsDone ? "مفتوح ✅" : "مقفل 🔒";
  dailyLockPill.classList.toggle("pillWarn", !state.daily.goalsDone);
}

function setActiveNav(route){
  $$(".navItem").forEach(a=>{
    const href = a.getAttribute("href");
    a.classList.toggle("active", href === `#${route}`);
  });
}

function routeName(route){
  const map = {
    timer:"Timer 3D",
    goals:"Daily Goals",
    progress:"Progress",
    store:"Store",
    stats:"Statistics",
    notebooks:"Notebooks",
    plan:"Long-term Plan",
    leaderboard:"Leaderboard",
    settings:"Settings",
    profile:"Profile / Avatar",
  };
  return map[route] || "—";
}

function mustLock(route){
  // pages allowed even if locked
  const allowed = new Set(["goals","profile","settings"]);
  return !state.daily.goalsDone && !allowed.has(route);
}

function showLockModal(){
  $("#lockModal").classList.remove("hidden");
}
function hideLockModal(){
  $("#lockModal").classList.add("hidden");
}

function showNameModal(){
  $("#nameModal").classList.remove("hidden");
  setTimeout(()=> $("#nameInput").focus(), 50);
}
function hideNameModal(){
  $("#nameModal").classList.add("hidden");
}

function render(html){
  // smooth transition
  view.style.opacity = "0";
  view.style.transform = "translateY(8px)";
  setTimeout(()=>{
    view.innerHTML = html;
    view.style.opacity = "1";
    view.style.transform = "translateY(0)";
    wireView();
  }, 140);
}

/* ================== Pages ================== */

function pageHomeTimer(){
  const t = state.timer;
  return `
    <div class="grid">
      <div class="card cardGlow" style="grid-column: span 12">
        <div class="h1">⏱️ Timer 3D</div>
        <p class="sub">جلسات تركيز (Pomodoro) — كل دقيقة بتجمع نقاط (SC) + بتنضاف للإجمالي. خلّيك ثابت!</p>

        <div class="timerWrap">
          <div class="timer3d" id="timer3d">
            <div class="timerFace">
              <div class="timerRing">
                <div class="timerProg" id="timerProg"></div>
              </div>
              <div class="timerText">
                <div class="bigTime" id="bigTime">${fmtTime(t.secondsLeft)}</div>
                <div class="smallMeta">
                  <span class="pillMini" id="modePill">الوضع: ${t.mode === "focus" ? "تركيز" : "راحة"}</span>
                  <span class="pillMini" id="runPill">${t.running ? "يعمل الآن 🔥" : "متوقف ⏸️"}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="timerSide">
            <div class="card" style="grid-column: span 12">
              <div class="cardTitle">التحكم</div>
              <div class="cardRow">
                <button class="btn primary" id="btnStartStop">${t.running ? "إيقاف" : "بدء"}</button>
                <button class="btn" id="btnReset">إعادة</button>
                <button class="btn" id="btnSwitchMode">تبديل (تركيز/راحة)</button>
              </div>
              <div class="sep"></div>
              <div class="cardRow">
                <button class="btn" id="btn25">25 دقيقة</button>
                <button class="btn" id="btn45">45 دقيقة</button>
                <button class="btn" id="btn60">60 دقيقة</button>
              </div>

              <div class="sep"></div>
              <div class="cardRow">
                <div class="kpi">
                  <div class="k">نقاط الجلسة</div>
                  <div class="v" id="sessionCoins">+0 SC</div>
                </div>
                <div class="kpi">
                  <div class="k">دقائق اليوم</div>
                  <div class="v" id="todayMin">0</div>
                </div>
                <div class="kpi">
                  <div class="k">سلسلة الأيام</div>
                  <div class="v" id="streak">1</div>
                </div>
              </div>

              <div class="sep"></div>
              <p class="sub" style="margin:0">
                Tip: كل ما تخلص جلسة تركيز بنعطيك احتفال صغير 🎉 و SC.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  `;
}

function pageGoals(){
  ensureDaily();
  const goals = state.daily.goals || [];
  const doneCount = goals.filter(g=>g.done).length;
  const allDone = goals.length && doneCount === goals.length;

  return `
    <div class="grid">
      <div class="card cardGlow" style="grid-column: span 12">
        <div class="h1">✅ Daily Goals</div>
        <p class="sub">لازم تفتح أهداف اليوم أولاً. لما تكمّلهم بتفتح كل الصفحات 🔓</p>

        <div class="cardRow">
          <div class="kpi">
            <div class="k">تاريخ اليوم</div>
            <div class="v">${state.daily.dateKey}</div>
          </div>
          <div class="kpi">
            <div class="k">المنجز</div>
            <div class="v">${doneCount}/${goals.length}</div>
          </div>
          <div class="kpi">
            <div class="k">حالة القفل</div>
            <div class="v">${state.daily.goalsDone ? "مفتوح ✅" : "مقفل 🔒"}</div>
          </div>
        </div>

        <div class="sep"></div>

        <div class="grid" id="goalsGrid">
          ${goals.map((g,i)=>`
            <div class="card" style="grid-column: span 6">
              <div class="cardTitle">${g.done ? "✅" : "⬜"} هدف ${i+1}</div>
              <div class="sub" style="margin:0 0 10px">${escapeHtml(g.text)}</div>
              <button class="btn ${g.done ? "ghost" : "primary"}" data-goal-toggle="${i}">
                ${g.done ? "إلغاء الإنجاز" : "تم ✅"}
              </button>
            </div>
          `).join("")}
        </div>

        <div class="sep"></div>

        <div class="cardRow">
          <button class="btn" id="btnAddGoal">+ إضافة هدف</button>
          <button class="btn ${allDone ? "primary" : ""}" id="btnUnlock" ${allDone ? "" : "disabled"} style="${allDone ? "" : "opacity:.6; cursor:not-allowed"}">
            فتح كل الصفحات 🔓
          </button>
        </div>
      </div>
    </div>
  `;
}

function pageProgress(){
  return `
    <div class="grid">
      <div class="card cardGlow" style="grid-column: span 12">
        <div class="h1">🪙 Progress</div>
        <p class="sub">تتبع إنجازك: دقائق + نقاط + مكافآت. كل شي محفوظ على جهازك.</p>

        <div class="cardRow">
          <div class="kpi">
            <div class="k">الرصيد الحالي</div>
            <div class="v">${state.coins} SC</div>
          </div>
          <div class="kpi">
            <div class="k">الإجمالي</div>
            <div class="v">${state.totalMin} دقيقة</div>
          </div>
          <div class="kpi">
            <div class="k">مستوى سراج</div>
            <div class="v">Lv ${calcLevel(state.totalMin)}</div>
          </div>
        </div>

        <div class="sep"></div>

        <div class="card" style="grid-column: span 12">
          <div class="cardTitle">🎯 نصيحة</div>
          <p class="sub" style="margin:0">
            ركّز على الاستمرارية: 25 دقيقة يومياً أحسن من 5 ساعات مرة وحدة.
          </p>
        </div>
      </div>
    </div>
  `;
}

function pageStore(){
  const items = [
    { id:"coffee", name:"☕ قهوة/شاي", cost:60, desc:"استراحة لطيفة بعد جلسة قوية." },
    { id:"walk", name:"🚶 مشوار قصير", cost:40, desc:"تمشاية 15 دقيقة لتصفية الدماغ." },
    { id:"game", name:"🎮 لعب 20 دقيقة", cost:90, desc:"مكافأة مضبوطة بدون ما تضيع اليوم." },
    { id:"snack", name:"🍫 سناك", cost:55, desc:"حلاوة صغيرة بس بحدود." },
  ];

  return `
    <div class="grid">
      <div class="card cardGlow" style="grid-column: span 12">
        <div class="h1">🛒 Store</div>
        <p class="sub">اشتري مكافآت من نقاطك. الهدف: تحفّز حالك وتظل ملتزم.</p>

        <div class="grid">
          ${items.map(it=>`
            <div class="card" style="grid-column: span 6">
              <div class="cardTitle">${it.name} <span class="chip" style="float:left">${it.cost} SC</span></div>
              <p class="sub">${it.desc}</p>
              <button class="btn ${state.coins>=it.cost ? "primary":""}" data-buy="${it.id}">
                ${state.coins>=it.cost ? "شراء" : "الرصيد غير كافي"}
              </button>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function pageStats(){
  // بسيط: شريط مستوى
  const lvl = calcLevel(state.totalMin);
  const next = (lvl+1)*(lvl+1)*10;
  const prev = (lvl)*(lvl)*10;
  const p = clamp(((state.totalMin - prev)/(next - prev))*100, 0, 100);

  return `
    <div class="grid">
      <div class="card cardGlow" style="grid-column: span 12">
        <div class="h1">📊 Statistics</div>
        <p class="sub">ملخص سريع (بدون مكتبات خارجية). رح نوسعها لاحقًا لرسوم بيانية أكبر.</p>

        <div class="cardRow">
          <div class="kpi">
            <div class="k">المستوى</div>
            <div class="v">Lv ${lvl}</div>
          </div>
          <div class="kpi" style="flex:2">
            <div class="k">التقدم للمستوى التالي</div>
            <div class="v" style="font-size:1rem; font-weight:800">${Math.round(p)}%</div>
            <div style="height:10px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.10);overflow:hidden;margin-top:10px">
              <div style="height:100%;width:${p}%;background:linear-gradient(90deg, rgba(6,182,212,.9), rgba(124,58,237,.85))"></div>
            </div>
          </div>
        </div>

        <div class="sep"></div>
        <div class="card" style="grid-column: span 12">
          <div class="cardTitle">اقتراح ذكي</div>
          <p class="sub" style="margin:0">
            إذا أنت ضعيف بموضوع معيّن، اعمل له Notebook خاص وخلي كل الأخطاء تتجمع فيه.
          </p>
        </div>
      </div>
    </div>
  `;
}

function pageNotebooks(){
  const notes = state.notebooks || [];
  return `
    <div class="grid">
      <div class="card cardGlow" style="grid-column: span 12">
        <div class="h1">📒 Notebooks</div>
        <p class="sub">دفاتر للملاحظات، أخطاء متكررة، قوانين، أفكار… (محلياً على جهازك).</p>

        <div class="cardRow">
          <button class="btn primary" id="btnNewNote">+ دفتر جديد</button>
        </div>

        <div class="sep"></div>

        <div class="grid">
          ${notes.length ? notes.map((n,i)=>`
            <div class="card" style="grid-column: span 6">
              <div class="cardTitle">${escapeHtml(n.title || "بدون عنوان")}</div>
              <div class="sub" style="margin:0 0 10px">${escapeHtml((n.body||"").slice(0,120))}${(n.body||"").length>120?"…":""}</div>
              <div class="cardRow">
                <button class="btn" data-edit-note="${i}">تعديل</button>
                <button class="btn" data-del-note="${i}" style="border-color: rgba(239,68,68,.35)">حذف</button>
              </div>
            </div>
          `).join("") : `
            <div class="card" style="grid-column: span 12">
              <div class="cardTitle">ابدأ أول دفتر</div>
              <p class="sub" style="margin:0">مثال: “أخطاء الفيزياء” أو “قوانين الرياضيات”.</p>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
}

function pagePlan(){
  const items = state.plan.items || [];
  return `
    <div class="grid">
      <div class="card cardGlow" style="grid-column: span 12">
        <div class="h1">🗓️ Long-term Plan</div>
        <p class="sub">خطة طويلة: مواد/وحدات/تواريخ. خليه بسيط وقابل للتنفيذ.</p>

        <div class="cardRow">
          <button class="btn primary" id="btnAddPlan">+ إضافة بند</button>
        </div>

        <div class="sep"></div>

        <div class="grid">
          ${items.length ? items.map((it,i)=>`
            <div class="card" style="grid-column: span 6">
              <div class="cardTitle">${escapeHtml(it.title)}</div>
              <p class="sub">${escapeHtml(it.date || "بدون تاريخ")} • ${escapeHtml(it.note||"")}</p>
              <button class="btn" data-del-plan="${i}">حذف</button>
            </div>
          `).join("") : `
            <div class="card" style="grid-column: span 12">
              <div class="cardTitle">ما عندك بنود بعد</div>
              <p class="sub" style="margin:0">حط مثلاً: “إنهاء وحدة التفاضل — 2026-03-01”.</p>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
}

function pageLeaderboard(){
  // محلي: تلميح شكل (مش أونلاين)
  const fake = [
    {name: state.user.name || "أنت", min: state.totalMin},
    {name:"ليان", min: 820},
    {name:"محمد", min: 640},
    {name:"سارة", min: 510},
  ].sort((a,b)=>b.min-a.min);

  return `
    <div class="grid">
      <div class="card cardGlow" style="grid-column: span 12">
        <div class="h1">🏆 Leaderboard</div>
        <p class="sub">ترتيب تجريبي محلي (بدون سيرفر). بنقدر نعمله Online لاحقاً.</p>

        <div class="grid">
          ${fake.map((p,i)=>`
            <div class="card" style="grid-column: span 6">
              <div class="cardTitle">#${i+1} — ${escapeHtml(p.name)}</div>
              <div class="kpi">
                <div class="k">الدقائق</div>
                <div class="v">${p.min}</div>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function pageSettings(){
  return `
    <div class="grid">
      <div class="card cardGlow" style="grid-column: span 12">
        <div class="h1">⚙️ Settings</div>
        <p class="sub">تحكم بالشكل والسلوك.</p>

        <div class="card" style="grid-column: span 12">
          <div class="cardTitle">وضع التركيز</div>
          <p class="sub">يخفف الحركة ويبسّط الصفحة ليركز الطالب.</p>
          <button class="btn ${state.theme.focusMode ? "primary":""}" id="btnFocusMode">
            ${state.theme.focusMode ? "مُفعّل ✅" : "تفعيل"}
          </button>
        </div>

        <div class="card" style="grid-column: span 12">
          <div class="cardTitle">تصفير مؤقت فقط</div>
          <p class="sub">بدون حذف بقية البيانات.</p>
          <button class="btn" id="btnResetTimer">Reset Timer</button>
        </div>
      </div>
    </div>
  `;
}

function pageProfile(){
  const emojis = ["🙂","😎","🔥","📚","🧠","🦁","⭐","⚡","🧩","🏆"];
  return `
    <div class="grid">
      <div class="card cardGlow" style="grid-column: span 12">
        <div class="h1">🧑‍🎨 Profile / Avatar</div>
        <p class="sub">غيّر اسمك وأفاتارك.</p>

        <label class="label">الاسم</label>
        <input class="field" id="profileName" value="${escapeAttr(state.user.name||"")}" placeholder="اكتب اسمك" maxlength="24"/>

        <div class="sep"></div>
        <div class="cardTitle">الأفاتار</div>
        <div class="cardRow" style="gap:10px; flex-wrap:wrap">
          ${emojis.map(e=>`
            <button class="btn ${state.user.avatar===e?"primary":""}" data-avatar="${e}">${e}</button>
          `).join("")}
        </div>

        <div class="sep"></div>
        <div class="row end gap">
          <button class="btn primary" id="btnSaveProfile">حفظ</button>
        </div>
      </div>
    </div>
  `;
}

/* ================== Router ================== */

const routes = {
  timer: pageHomeTimer,
  goals: pageGoals,
  progress: pageProgress,
  store: pageStore,
  stats: pageStats,
  notebooks: pageNotebooks,
  plan: pagePlan,
  leaderboard: pageLeaderboard,
  settings: pageSettings,
  profile: pageProfile,
};

function getRoute(){
  const raw = (location.hash || "#timer").replace("#","");
  return routes[raw] ? raw : "timer";
}

function go(route){
  location.hash = `#${route}`;
}

function onRoute(){
  ensureDaily();
  const r = getRoute();

  if(mustLock(r)){
    showLockModal();
    go("goals");
    return;
  }else{
    hideLockModal();
  }

  pageTitle.textContent = routeName(r);
  setActiveNav(r);

  render(routes[r]());
  updateTop();
}

/* ================== View Wiring ================== */

function wireView(){
  const r = getRoute();

  if(r === "timer") wireTimer();
  if(r === "goals") wireGoals();
  if(r === "store") wireStore();
  if(r === "notebooks") wireNotebooks();
  if(r === "plan") wirePlan();
  if(r === "settings") wireSettings();
  if(r === "profile") wireProfile();
}

function wireGoals(){
  $$("[data-goal-toggle]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const i = Number(btn.dataset.goalToggle);
      const g = state.daily.goals[i];
      g.done = !g.done;
      LS.set("seraj.daily", state.daily);

      const allDone = state.daily.goals.length && state.daily.goals.every(x=>x.done);
      if(allDone) toast("قريب تفتح القفل!", "اضغط فتح كل الصفحات 🔓");

      onRoute();
    });
  });

  $("#btnAddGoal")?.addEventListener("click", ()=>{
    const text = prompt("اكتب هدف اليوم:");
    if(!text) return;
    state.daily.goals.push({ text, done:false });
    saveAll();
    toast("تمت الإضافة", "هدف جديد انضاف ✅");
    onRoute();
  });

  $("#btnUnlock")?.addEventListener("click", ()=>{
    if(!(state.daily.goals.length && state.daily.goals.every(x=>x.done))) return;
    state.daily.goalsDone = true;
    saveAll();
    burstConfetti();
    toast("انفتح القفل 🔓", "هسا كل الصفحات صارت متاحة!");
    go("timer");
  });
}

function wireStore(){
  const items = {
    coffee:60, walk:40, game:90, snack:55
  };
  $$("[data-buy]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.dataset.buy;
      const cost = items[id] || 0;
      if(state.coins < cost){
        toast("الرصيد غير كافي", "اشتغل جلسة تركيز واجمع SC.");
        return;
      }
      state.coins -= cost;
      saveAll();
      toast("تم الشراء ✅", `انخصم ${cost} SC`);
      burstConfetti(80);
      onRoute();
    });
  });
}

function wireNotebooks(){
  $("#btnNewNote")?.addEventListener("click", ()=>{
    const title = prompt("عنوان الدفتر:");
    if(!title) return;
    state.notebooks.unshift({ title, body:"" });
    saveAll();
    toast("دفتر جديد", "اكتب فيه أهم ملاحظاتك.");
    onRoute();
  });

  $$("[data-edit-note]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const i = Number(btn.dataset.editNote);
      const n = state.notebooks[i];
      const body = prompt(`تعديل: ${n.title}\n(اكتب النص كامل)`, n.body || "");
      if(body === null) return;
      n.body = body;
      saveAll();
      toast("تم الحفظ", "تحديث الدفتر ✅");
      onRoute();
    });
  });

  $$("[data-del-note]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const i = Number(btn.dataset.delNote);
      if(!confirm("متأكد حذف؟")) return;
      state.notebooks.splice(i,1);
      saveAll();
      toast("تم الحذف", "انحذف الدفتر.");
      onRoute();
    });
  });
}

function wirePlan(){
  $("#btnAddPlan")?.addEventListener("click", ()=>{
    const title = prompt("عنوان البند:");
    if(!title) return;
    const date = prompt("تاريخ (YYYY-MM-DD) اختياري:", "");
    const note = prompt("ملاحظة قصيرة:", "");
    state.plan.items.unshift({ title, date: date||"", note: note||"" });
    saveAll();
    toast("تمت الإضافة", "بند جديد بالخطة ✅");
    onRoute();
  });

  $$("[data-del-plan]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const i = Number(btn.dataset.delPlan);
      state.plan.items.splice(i,1);
      saveAll();
      toast("تم الحذف", "انحذف البند.");
      onRoute();
    });
  });
}

function wireSettings(){
  $("#btnFocusMode")?.addEventListener("click", ()=>{
    state.theme.focusMode = !state.theme.focusMode;
    saveAll();
    applyFocusMode();
    toast("تم", state.theme.focusMode ? "وضع التركيز تفعّل ✅" : "وضع التركيز انلغى");
    onRoute();
  });

  $("#btnResetTimer")?.addEventListener("click", ()=>{
    state.timer = { mode:"focus", secondsLeft:25*60, running:false, lastTick:0 };
    saveAll();
    toast("تم", "المؤقت رجع افتراضي.");
    onRoute();
  });
}

function wireProfile(){
  $$("[data-avatar]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      state.user.avatar = btn.dataset.avatar;
      saveAll();
      updateTop();
      onRoute();
    });
  });
  $("#btnSaveProfile")?.addEventListener("click", ()=>{
    const v = $("#profileName").value.trim();
    state.user.name = v.slice(0,24);
    saveAll();
    updateTop();
    toast("تم الحفظ ✅", "الملف الشخصي اتحدّث.");
    onRoute();
  });
}

/* ================== Timer ================== */

let timerInterval = null;

function setTimerMinutes(min){
  state.timer.secondsLeft = min*60;
  state.timer.running = false;
  state.timer.lastTick = 0;
  saveAll();
  toast("تم ضبط المؤقت", `${min} دقيقة`);
  onRoute();
}

function switchMode(){
  state.timer.mode = (state.timer.mode === "focus") ? "break" : "focus";
  state.timer.secondsLeft = state.timer.mode === "focus" ? 25*60 : 5*60;
  state.timer.running = false;
  state.timer.lastTick = 0;
  saveAll();
  toast("تم التبديل", state.timer.mode === "focus" ? "تركيز" : "راحة");
  onRoute();
}

function startStop(){
  state.timer.running = !state.timer.running;
  state.timer.lastTick = Date.now();
  saveAll();
  toast(state.timer.running ? "بدأنا 🔥" : "تم الإيقاف", "شد حيلك!");
}

function wireTimer(){
  $("#btn25")?.addEventListener("click", ()=>setTimerMinutes(25));
  $("#btn45")?.addEventListener("click", ()=>setTimerMinutes(45));
  $("#btn60")?.addEventListener("click", ()=>setTimerMinutes(60));
  $("#btnReset")?.addEventListener("click", ()=>setTimerMinutes(state.timer.mode==="focus"?25:5));
  $("#btnSwitchMode")?.addEventListener("click", switchMode);
  $("#btnStartStop")?.addEventListener("click", ()=>{
    startStop();
    onRoute();
  });

  // animation progress ring
  updateTimerUI();
}

function updateTimerUI(){
  const t = state.timer;
  const big = $("#bigTime");
  const prog = $("#timerProg");
  const modePill = $("#modePill");
  const runPill = $("#runPill");
  if(!big || !prog) return;

  big.textContent = fmtTime(t.secondsLeft);
  modePill.textContent = `الوضع: ${t.mode === "focus" ? "تركيز" : "راحة"}`;
  runPill.textContent = t.running ? "يعمل الآن 🔥" : "متوقف ⏸️";

  const total = (t.mode === "focus") ? (25*60) : (5*60);
  const p = clamp((1 - (t.secondsLeft/total))*100, 0, 100);
  prog.style.opacity = t.running ? ".92" : ".65";
  prog.style.filter = t.running ? "saturate(1.1)" : "saturate(.9)";
  prog.style.transform = `rotate(${p*3.6}deg)`;

  // session coins (تقريبياً)
  const elapsed = total - t.secondsLeft;
  const sc = Math.floor(elapsed / 60) * (t.mode==="focus" ? 2 : 0); // كل دقيقة تركيز = 2 SC
  $("#sessionCoins") && ($("#sessionCoins").textContent = `+${sc} SC`);
  $("#todayMin") && ($("#todayMin").textContent = `${Math.floor(elapsed/60)}`);
  $("#streak") && ($("#streak").textContent = `${state.daily.goalsDone ? 2 : 1}`);
}

function tickTimer(){
  if(!state.timer.running) return;

  const now = Date.now();
  const dt = Math.floor((now - state.timer.lastTick) / 1000);
  if(dt <= 0) return;

  state.timer.lastTick = now;
  state.timer.secondsLeft -= dt;

  if(state.timer.secondsLeft <= 0){
    state.timer.secondsLeft = 0;
    state.timer.running = false;

    if(state.timer.mode === "focus"){
      // reward: minutes + coins
      const rewardMin = 25; // لأننا افتراضياً 25 بالتركيز (بإمكانك توسع لاحقاً)
      state.totalMin += rewardMin;
      state.coins += rewardMin * 2;
      toast("خلصت جلسة تركيز ✅", `+${rewardMin*2} SC • +${rewardMin} دقيقة`);
      burstConfetti();
    }else{
      toast("خلصت الراحة ✅", "ارجع للتركيز 🔥");
    }

    saveAll();
  }else{
    saveAll();
  }

  updateTop();
  updateTimerUI();
}

function startLoop(){
  if(timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(tickTimer, 350);
}

/* ================== Confetti FX ================== */

function resizeFX(){
  fxCanvas.width = window.innerWidth * devicePixelRatio;
  fxCanvas.height = window.innerHeight * devicePixelRatio;
}
window.addEventListener("resize", resizeFX);

function burstConfetti(n=140){
  const w = window.innerWidth, h = window.innerHeight;
  for(let i=0;i<n;i++){
    confetti.push({
      x: w*0.5 + (Math.random()-0.5)*220,
      y: h*0.25 + (Math.random()-0.5)*80,
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

    // لون عشوائي من نفس باليت
    const palette = ["rgba(124,58,237,.95)","rgba(6,182,212,.95)","rgba(34,197,94,.95)","rgba(245,158,11,.95)"];
    fx.fillStyle = palette[(Math.random()*palette.length)|0];
    fx.fillRect(-p.r*devicePixelRatio, -p.r*devicePixelRatio, p.r*2*devicePixelRatio, p.r*2*devicePixelRatio);
    fx.restore();
  }

  requestAnimationFrame(drawFX);
}

/* ================== Helpers / Init ================== */

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[s]));
}
function escapeAttr(str){
  return escapeHtml(str).replace(/"/g,"&quot;");
}

function calcLevel(totalMin){
  // مستوى بسيط: Lv ~ sqrt(totalMin/10)
  return Math.max(1, Math.floor(Math.sqrt(totalMin/10)));
}

function applyFocusMode(){
  // focus mode: يقلل الأنيميشن
  document.documentElement.style.scrollBehavior = state.theme.focusMode ? "auto" : "smooth";
  // تقدر توسعها أكثر: تخفيف blur / blobs
  const blobs = $(".blobs");
  const grain = $(".grain");
  if(blobs) blobs.style.opacity = state.theme.focusMode ? ".35" : ".9";
  if(grain) grain.style.opacity = state.theme.focusMode ? ".06" : ".10";
}

function init(){
  ensureDaily();
  updateTop();
  applyFocusMode();

  // Name modal
  if(!state.user.name){
    showNameModal();
  }

  $("#nameSave").addEventListener("click", ()=>{
    const v = $("#nameInput").value.trim();
    if(v) state.user.name = v.slice(0,24);
    hideNameModal();
    saveAll();
    updateTop();
    toast("أهلاً فيك 👋", "بلشنا!");
    onRoute();
  });

  $("#nameSkip").addEventListener("click", ()=>{
    hideNameModal();
    toast("تمام", "بتقدر تغيّر الاسم من Profile.");
    onRoute();
  });

  // Lock modal
  $("#goGoalsNow").addEventListener("click", ()=>{
    hideLockModal();
    go("goals");
  });

  // Nav click highlight handled by router
  window.addEventListener("hashchange", onRoute);

  $("#btnResetApp").addEventListener("click", ()=>{
    if(!confirm("هذا بحذف كل بيانات سراج من هذا الجهاز. متأكد؟")) return;
    localStorage.clear();
    location.reload();
  });

  $("#btnQuickStart").addEventListener("click", ()=>{
    // quick: 25 focus start
    state.timer.mode = "focus";
    state.timer.secondsLeft = 25*60;
    state.timer.running = true;
    state.timer.lastTick = Date.now();
    saveAll();
    toast("بدء سريع ⚡", "25 دقيقة تركيز");
    go("timer");
    onRoute();
  });

  $("#userMiniBtn").addEventListener("click", ()=> go("profile"));

  // Close modals on overlay click (optional)
  $("#nameModal").addEventListener("click", (e)=>{ if(e.target.id==="nameModal"){} });
  $("#lockModal").addEventListener("click", (e)=>{ if(e.target.id==="lockModal") hideLockModal(); });

  // FX
  resizeFX();
  requestAnimationFrame(drawFX);

  // start loops
  startLoop();

  // initial route
  onRoute();
}

init();

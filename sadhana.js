/* ============================================================
   Sadhana — 每日修練記錄
   結構（群組 / 項目 / 參數）可在 App 內設定，資料存在 DB.sadhana。
   ============================================================ */

'use strict';

(function () {

/* ---------- 預設參數定義（第三層可改）---------- */
const DEF_PARAMS = {
  alert:   { label: '精神', type: 'scale', scale: 5, ui: 'dots',
             prompt: '剛睜眼那一秒，身體是輕的還是重的？' },
  round:   { label: '輪數', type: 'count', prompt: '做了幾輪？' },
  focus:   { label: '專注', type: 'scale', scale: 5, ui: 'dots',
             prompt: '這段時間裡，你發現自己飄走了幾次？回想那個「拉回來」的動作。' },
  breathe: { label: '呼吸', type: 'scale', scale: 5, ui: 'dots',
             prompt: '呼吸是自己走的，還是你在推它？' },
  subtle:  { label: '細微', type: 'scale', scale: 5, ui: 'dots',
             prompt: '有沒有察覺到平常不會注意到的東西？' },
  samyama: { label: 'samyama', type: 'bool',
             prompt: '這段時間裡，有沒有保持住？' },
};
/* 每個參數共用的記錄行為（刻意不方便，預設如此）*/
const DEF_BEHAVIOR = { prefill: false, showAvg: false, hold: true };

const TAG = { round: 'R', time: 'T', focus: 'F', breathe: 'B', subtle: 'S', samyama: 'Y', alert: 'A' };
const FIELD_ORDER = ['round', 'time', 'focus', 'breathe', 'subtle', 'samyama', 'alert'];

/* ---------- 預設結構（第一層可改）---------- */
function seed() {
  return {
    groups: [
      { id: 'g_morning', name: 'morning session' },
      { id: 'g_main',    name: 'Main sadhana' },
      { id: 'g_break',   name: 'Break' },
      { id: 'g_fixed',   name: 'Fixed' },
      { id: 'g_others',  name: 'Others', optional: true },
    ],
    chains: [
      { id: 'c_morning', name: '早課' },
      { id: 'c_kriya',   name: '體式' },
      { id: 'c_energy',  name: '能量' },
    ],
    items: [
      { id: 'i_awake',  name: 'Awake',          group: null,       kind: 'awake',
        fields: ['alert'], est: 0 },
      { id: 'i_gpooja', name: 'Guru Pooja',     group: 'g_morning', chain: 'c_morning',
        fields: ['focus', 'samyama'], est: 17 },
      { id: 'i_maha',   name: 'Maha Chant',     group: 'g_morning', chain: 'c_morning',
        fields: ['focus'], est: 18 },
      { id: 'i_surya',  name: 'Surya Kriya',    group: 'g_main',    chain: 'c_kriya',
        fields: ['round', 'time', 'focus', 'breathe', 'subtle', 'samyama'], est: 45 },
      { id: 'i_yoga',   name: 'Yogasana',       group: 'g_main',    chain: 'c_kriya',
        fields: ['time', 'focus', 'breathe', 'subtle', 'samyama'], est: 35 },
      { id: 'i_shakti', name: 'Shakti Chalana', group: 'g_main',    chain: 'c_energy',
        fields: ['round', 'time', 'focus', 'samyama'], est: 30 },
      { id: 'i_shamb',  name: 'Shambhavi',      group: 'g_main',    chain: 'c_energy',
        fields: ['time', 'focus', 'samyama'], est: 21 },
      { id: 'i_samy',   name: 'Samyama',        group: 'g_main',
        fields: ['time', 'focus'], est: 15 },
      { id: 'i_shoonya', name: 'Shoonya',       group: 'g_break',
        fields: ['time', 'focus'], est: 20 },
      { id: 'i_breathe', name: 'Breathe Watch', group: 'g_break',
        fields: ['time', 'breathe'], est: 15 },
      { id: 'i_brunch', name: 'Brunch',         group: 'g_fixed',  anchor: 600,
        fields: ['focus', 'samyama'], est: 40 },
      { id: 'i_dinner', name: 'Dinner',         group: 'g_fixed',  anchor: 1140,
        fields: ['focus'], est: 40 },
      { id: 'i_anga',   name: 'Angamardana',    group: 'g_others',
        fields: ['time', 'focus'], est: 35 },
      { id: 'i_sshakti', name: 'Surya Shakti',  group: 'g_others',
        fields: ['round', 'time', 'focus'], est: 30 },
    ],
    params: JSON.parse(JSON.stringify(DEF_PARAMS)),
    behavior: { ...DEF_BEHAVIOR },
    days: {},          // 'YYYY-MM-DD' → { entries:[], wake, up, alert }
    running: null,     // { itemId, startMs }
  };
}

/* ---------- 存取 ---------- */
function SD() {
  if (!DB.sadhana) { DB.sadhana = seed(); saveDB(); }
  const s = DB.sadhana;
  if (!s.params) s.params = JSON.parse(JSON.stringify(DEF_PARAMS));
  if (!s.behavior) s.behavior = { ...DEF_BEHAVIOR };
  if (!s.days) s.days = {};
  return s;
}
const dayKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function today() {
  const s = SD(), k = dayKey(Date.now());
  if (!s.days[k]) s.days[k] = { entries: [] };
  return s.days[k];
}
const item = (id) => SD().items.find(i => i.id === id);
const param = (k) => SD().params[k] || DEF_PARAMS[k] || { label: k, type: 'scale', scale: 5 };

const hm = (ms) => { const d = new Date(ms); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); };
const minOfDay = (ms) => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };
const dur = (m) => m >= 60 ? (Math.floor(m / 60) + 'h' + (m % 60 ? String(m % 60).padStart(2, '0') : '')) : (m + ' 分');
const mins = (e) => Math.max(1, Math.round((e.end - e.start) / 60000));

/* ============================================================
   狀態
   ============================================================ */
let VIEW = { name: 'main' };
let TICK = null;
let FOLD_OPEN = false;
let DONE_OPEN = false;   // 選單裡是否展開已完成的項目

function el() { return document.getElementById('view'); }
function stopTick() { if (TICK) { clearInterval(TICK); TICK = null; } }

function open() {
  document.body.classList.add('sd-on');
  VIEW = { name: 'main' };
  render();
}
function close() {
  stopTick();
  document.body.classList.remove('sd-on');
  go('home');
}

/* ============================================================
   繪製
   ============================================================ */
function render() {
  stopTick();
  const v = el();
  if (VIEW.name === 'main') renderMain(v);
  else if (VIEW.name === 'q') renderQuestion(v);
  else if (VIEW.name === 'set') renderStructure(v);
  else if (VIEW.name === 'setItem') renderItemSettings(v);
  else if (VIEW.name === 'setParam') renderParamSettings(v);
  v.scrollTop = 0;
}

/* ---------- 主畫面 ---------- */
function renderMain(v) {
  const s = SD(), d = today();
  const doneIds = new Set(d.entries.map(e => e.itemId));
  const run = s.running;

  /* ── 頂部：Awake ── */
  let top = '';
  if (!d.wake) {
    top = `<div class="sd-top">
      <div class="sd-awk-q">還沒開始</div>
      <button class="sd-awk-btn" id="sd-wake">醒了</button>
    </div>`;
  } else if (!d.up) {
    const lying = Math.round((Date.now() - d.wake) / 60000);
    top = `<div class="sd-top">
      <div class="sd-t-sm">${hm(d.wake)}</div>
      <div class="sd-t-lg">Awake</div>
      <div class="sd-seg" style="height:${Math.min(90, 16 + lying * 0.6)}px">
        <i class="d0"></i><i class="d1"></i></div>
      <div class="sd-t-gd">躺著 ${dur(lying)}</div>
      <button class="sd-awk-btn sm" id="sd-up">起身</button>
    </div>`;
  } else {
    const lying = Math.round((d.up - d.wake) / 60000);
    top = `<div class="sd-top"${d.alert == null ? ' id="sd-awake-fill"' : ''}>
      <div class="sd-t-sm">${hm(d.wake)}</div>
      <div class="sd-t-lg">Awake</div>
      <div class="sd-seg done" style="height:${Math.min(70, 14 + lying * 0.5)}px">
        <i class="d0"></i><i class="d1"></i></div>
      <div class="sd-t-sm">${hm(d.up)}　·　躺床 ${dur(lying)}</div>
      ${d.alert != null
        ? `<div class="sd-t-sm">精神 ${'●'.repeat(d.alert)}${'○'.repeat(5 - d.alert)}</div>`
        : `<div class="sd-pend one">精神未記　·　點一下補</div>`}
    </div>`;
  }

  /* ── 柱子：已完成的項目（摺疊）── */
  const es = [...d.entries].sort((a, b) => a.start - b.start);
  const KEEP = 2;
  let rail = '';
  const old = (es.length > KEEP + 1 && !FOLD_OPEN) ? es.slice(0, es.length - KEEP) : [];
  const vis = old.length ? es.slice(es.length - KEEP) : es;
  if (old.length) {
    const sum = old.reduce((a, e) => a + mins(e), 0);
    rail += `<div class="sd-fold" id="sd-fold">
      <i class="ln"></i><i class="cap"><b></b><b></b><b></b></i>
      <span class="tm">${hm(old[0].start)}</span>
      <span class="nm">${old.length} 項　·　${dur(sum)}　⌄</span></div>`;
  }
  vis.forEach(e => {
    const it = item(e.itemId);
    const miss = missing(e).length;
    rail += `<div class="sd-row${isPending(e) ? ' pending' : ''}" data-entry="${e.id}">
      <i class="ln"></i><i class="dt${it && it.anchor != null ? ' anc' : ''}"></i>
      <span class="tm">${hm(e.start)}</span>
      <span class="nm">${esc(it ? it.name : '?')}<b>${dur(mins(e))}</b>${
        isPending(e) ? `<em>${miss ? '待補 ' + miss : '待完成'}</em>` : ''}</span></div>`;
  });
  if (FOLD_OPEN && es.length > KEEP + 1) rail += `<div class="sd-foldless" id="sd-foldless">收合 ⌃</div>`;

  /* ── 進行中 ── */
  let active = '', menu = '';
  if (run) {
    const it = item(run.itemId);
    const e = Math.floor((Date.now() - run.startMs) / 1000);
    const stem = Math.max(6, Math.min(120, Math.round(e / 60 * 1.6)));
    active = `<div class="sd-act">
        <i class="ln" style="height:14px"></i>
        <i class="hg" style="top:14px;height:${stem}px"></i>
        <i class="bb" style="top:${10 + stem}px"></i>
        <span class="tm" style="top:${11 + stem}px">${hm(run.startMs)}</span>
        <span class="nm" style="top:${6 + stem}px">${esc(it ? it.name : '')}</span>
      </div>
      <div class="sd-tml">timer</div>
      <div class="sd-tmv" id="sd-tmv">00:00</div>
      <div class="sd-fin" id="sd-fin">Finished</div>
      <div class="sd-adj" id="sd-cancel">取消這次計時</div>`;
  } else if (d.up) {
    /* ── 選單：完成的移除，只留還沒做完的（還沒起身就不顯示）── */
    const chainNext = nextInChain(doneIds);
    let hidden = 0;
    s.groups.forEach(g => {
      const its = s.items.filter(i => i.group === g.id);
      if (!its.length) return;
      const rows = its.map(i => {
        const mine = d.entries.filter(e => e.itemId === i.id);
        const pend = mine.some(isPending);
        const complete = mine.length && !pend;
        if (complete && !DONE_OPEN) { hidden++; return ''; }

        const cls = ['sd-it'];
        if (g.optional) cls.push('opt');
        if (complete) cls.push('done');
        if (pend) cls.push('pend');
        if (!mine.length && chainNext === i.id) cls.push('next');

        let sub = '';
        if (pend) sub = '待補';
        else if (complete) sub = '再做一次';
        else if (i.anchor != null)
          sub = `${Math.floor(i.anchor / 60)}:${String(i.anchor % 60).padStart(2, '0')}`;
        else if (i.est) sub = `${i.est} 分`;

        return `<div class="${cls.join(' ')}" data-start="${i.id}">
          <span class="n">${esc(i.name)}</span>${sub ? `<span class="d">${sub}</span>` : ''}</div>`;
      }).join('');
      if (!rows.trim()) return;
      menu += `<div class="sd-grp"><div class="sd-gl"><span>${esc(g.name)}</span></div>${rows}</div>`;
    });
    if (hidden) menu += `<div class="sd-donebar" id="sd-doneopen">已完成 ${hidden}　⌄</div>`;
    else if (DONE_OPEN) menu += `<div class="sd-donebar" id="sd-doneclose">收起完成的　⌃</div>`;
    menu = `<div class="sd-menu">${menu}</div>`;
  }

  /* ── 下一個固定點 ── */
  let anchorLine = '';
  const nextAnc = s.items
    .filter(i => i.anchor != null && !doneIds.has(i.id))
    .sort((a, b) => a.anchor - b.anchor)
    .find(i => i.anchor >= minOfDay(Date.now()) - 240);
  if (nextAnc) {
    const left = nextAnc.anchor - minOfDay(Date.now());
    anchorLine = `<div class="sd-anchor${left <= 60 ? ' hot' : ''}" data-start="${nextAnc.id}">
      下一個固定點　<b>${esc(nextAnc.name)} ${Math.floor(nextAnc.anchor / 60)}:${String(nextAnc.anchor % 60).padStart(2, '0')}</b>
      ${left > 0 ? `　還有 ${dur(left)}` : '　已經過了'}</div>`;
  }

  v.innerHTML = `<div class="sd">
    <div class="sd-nav"><button class="sd-back" id="sd-back">‹</button>
      <button class="sd-gear" id="sd-gear">⚙</button></div>
    ${top}
    <div class="sd-rail">${rail}</div>
    ${active}
    ${menu}
    ${anchorLine}
    ${(() => {
      const n = d.entries.filter(isPending).length;
      return n ? `<div class="sd-pend" id="sd-pendall">${n} 筆只記了時間　·　點紀錄補完</div>` : '';
    })()}
  </div>`;

  $('#sd-back').onclick = close;
  $('#sd-gear').onclick = () => { VIEW = { name: 'set' }; render(); };
  const w = $('#sd-wake'); if (w) w.onclick = () => { today().wake = Date.now(); saveDB(); render(); };
  const u = $('#sd-up'); if (u) u.onclick = () => {
    today().up = Date.now(); saveDB();
    startQuestions({ awake: true, fields: ['alert'] });
  };
  const f = $('#sd-fold'); if (f) f.onclick = () => { FOLD_OPEN = true; render(); };
  const pa = $('#sd-pendall'); if (pa) pa.onclick = () => { FOLD_OPEN = true; render(); };
  const dOpen = $('#sd-doneopen'); if (dOpen) dOpen.onclick = () => { DONE_OPEN = true; render(); };
  const dClose = $('#sd-doneclose'); if (dClose) dClose.onclick = () => { DONE_OPEN = false; render(); };
  const fl = $('#sd-foldless'); if (fl) fl.onclick = () => { FOLD_OPEN = false; render(); };
  const af = $('#sd-awake-fill');
  if (af) af.onclick = () => startQuestions({ awake: true, fields: ['alert'] });
  $$('[data-start]').forEach(b => b.onclick = () => {
    /* 這一項今天有未完成的紀錄 → 點名字是去補，不是再開一次 */
    const pend = today().entries.find(e => e.itemId === b.dataset.start && isPending(e));
    if (pend) editEntry(pend.id); else startPractice(b.dataset.start);
  });
  $$('[data-entry]').forEach(b => b.onclick = () => editEntry(b.dataset.entry));

  const fin = $('#sd-fin');
  if (fin) {
    fin.onclick = finish;
    $('#sd-cancel').onclick = () => { SD().running = null; saveDB(); render(); };
    const paint = () => {
      const e = Math.floor((Date.now() - SD().running.startMs) / 1000);
      const t = $('#sd-tmv'); if (!t) return;
      t.textContent = String(Math.floor(e / 60)).padStart(2, '0') + ':' + String(e % 60).padStart(2, '0');
      const hg = document.querySelector('.sd-act .hg');
      const bb = document.querySelector('.sd-act .bb');
      const nm = document.querySelector('.sd-act .nm');
      const tm = document.querySelector('.sd-act .tm');
      if (hg) {
        const stem = Math.max(6, Math.min(120, Math.round(e / 60 * 1.6)));
        hg.style.height = stem + 'px';
        bb.style.top = (10 + stem) + 'px';
        nm.style.top = (6 + stem) + 'px';
        tm.style.top = (11 + stem) + 'px';
      }
    };
    paint();
    TICK = setInterval(paint, 1000);
  }
}

/* 鏈進行到一半時，合法的下一項只有一個 */
function nextInChain(doneIds) {
  const s = SD();
  for (const c of s.chains) {
    const members = s.items.filter(i => i.chain === c.id);
    if (!members.length) continue;
    const doneN = members.filter(i => doneIds.has(i.id)).length;
    if (doneN > 0 && doneN < members.length) {
      const nx = members.find(i => !doneIds.has(i.id));
      if (nx) return nx.id;
    }
  }
  return null;
}

/* ---------- 開始 / 結束 ---------- */
function startPractice(itemId) {
  const s = SD();
  if (s.running) { toast('已經有一項在計時'); return; }
  s.running = { itemId, startMs: Date.now() };
  saveDB(); render();
}
/* Finished 只做一件事：把時間寫下來。品質留到之後補。 */
function finish() {
  const s = SD(), run = s.running;
  if (!run) return;
  today().entries.push({
    id: uid(), itemId: run.itemId,
    start: run.startMs, end: Math.max(Date.now(), run.startMs + 60000),
    vals: {}, done: false,
  });
  s.running = null;
  saveDB();
  VIEW = { name: 'main' };
  render();
}

/* 這筆還缺什麼 */
function missing(e) {
  const it = item(e.itemId);
  return ((it && it.fields) || []).filter(f => f !== 'time' && e.vals[f] == null);
}
const isPending = (e) => e.done !== true;

/* ---------- 一頁一題 ---------- */
function startQuestions(cfg) {
  const steps = [];
  if (cfg.entryId) steps.push({ kind: 'time' });
  (cfg.fields || []).forEach(f => steps.push({ kind: 'param', key: f }));
  if (!steps.length) { VIEW = { name: 'main' }; render(); return; }
  VIEW = { name: 'q', entryId: cfg.entryId, awake: cfg.awake, steps, i: 0, val: null };
  render();
}

function renderQuestion(v) {
  const st = VIEW.steps[VIEW.i];
  const total = VIEW.steps.length;
  const entry = VIEW.entryId ? today().entries.find(e => e.id === VIEW.entryId) : null;
  const it = entry ? item(entry.itemId) : null;
  const head = VIEW.awake ? `AWAKE　·　躺床 ${dur(Math.round((today().up - today().wake) / 60000))}`
    : `${esc(it ? it.name.toUpperCase() : '')}　·　${dur(mins(entry))}`;

  /* 回頭補的時候，把這一筆已經填過的值帶回來（不是帶「上次」的值）*/
  if (VIEW.val == null && st.kind === 'param') {
    const cur = VIEW.awake ? today().alert : (entry ? entry.vals[st.key] : null);
    if (cur != null) VIEW.val = cur;
  }

  let body = '';
  if (st.kind === 'time') {
    body = `<div class="sd-q-lb">時間</div>
      <div class="sd-q-tx">計時抓到的是這一段。不對就改。</div>
      <div class="sd-time">
        <div class="sd-tm"><span>起</span><b id="sd-t0">${hm(entry.start)}</b>
          <div class="sd-pm"><i data-t="s-5">−5</i><i data-t="s-1">−1</i><i data-t="s+1">+1</i><i data-t="s+5">+5</i></div></div>
        <div class="sd-arrow">→</div>
        <div class="sd-tm"><span>訖</span><b id="sd-t1">${hm(entry.end)}</b>
          <div class="sd-pm"><i data-t="e-5">−5</i><i data-t="e-1">−1</i><i data-t="e+1">+1</i><i data-t="e+5">+5</i></div></div>
      </div>
      <div class="sd-q-dur" id="sd-dur">${dur(mins(entry))}</div>`;
  } else {
    const p = param(st.key);
    if (p.type === 'bool') {
      body = `<div class="sd-q-lb">${esc(p.label)}</div>
        <div class="sd-q-tx">${esc(p.prompt || '')}</div>
        <div class="sd-yn">
          <i data-v="1" class="${VIEW.val === 1 ? 'on' : ''}">有</i>
          <i data-v="0" class="${VIEW.val === 0 ? 'on' : ''}">沒有</i></div>`;
    } else if (p.type === 'count') {
      body = `<div class="sd-q-lb">${esc(p.label)}</div>
        <div class="sd-q-tx">${esc(p.prompt || '')}</div>
        <div class="sd-count">${[1, 2, 3, 4, 5, 6, 7, 8].map(n =>
          `<i data-v="${n}" class="${VIEW.val === n ? 'on' : ''}">${n}</i>`).join('')}</div>`;
    } else {
      const n = p.scale || 5;
      body = `<div class="sd-q-lb">${esc(p.label)}</div>
        <div class="sd-q-tx">${esc(p.prompt || '')}</div>
        <div class="sd-dots">${Array.from({ length: n }, (_, i) =>
          `<i data-v="${i + 1}" class="${VIEW.val === i + 1 ? 'on' : ''}"></i>`).join('')}</div>`;
    }
  }

  const ready = st.kind === 'time' || VIEW.val != null;
  const hold = SD().behavior.hold;
  const last = VIEW.i === VIEW.steps.length - 1;
  v.innerHTML = `<div class="sd sd-qwrap">
    <div class="sd-nav"><button class="sd-back" id="sd-back">‹</button></div>
    <div class="sd-q-of">${VIEW.i + 1} / ${total}</div>
    <div class="sd-q-nm">${head}</div>
    ${body}
    <button class="sd-hold${ready ? '' : ' off'}${last ? ' last' : ''}" id="sd-ok"><i></i><span>${
      hold ? (last ? '長按完成' : '長按確認') : (last ? '完成' : '確認')}</span></button>
    <div class="sd-pips">${VIEW.steps.map((_, i) =>
      `<i class="${i <= VIEW.i ? 'on' : ''}"></i>`).join('')}</div>
  </div>`;

  $('#sd-back').onclick = () => { VIEW = { name: 'main' }; render(); };
  $$('[data-v]').forEach(b => b.onclick = () => { VIEW.val = +b.dataset.v; render(); });
  $$('[data-t]').forEach(b => b.onclick = () => {
    const [which, delta] = [b.dataset.t[0], +b.dataset.t.slice(1)];
    const e = today().entries.find(x => x.id === VIEW.entryId);
    if (which === 's') e.start = Math.min(e.start + delta * 60000, e.end - 60000);
    else e.end = Math.max(e.end + delta * 60000, e.start + 60000);
    saveDB(); render();
  });

  const ok = $('#sd-ok');
  if (ready) {
    if (hold) bindHold(ok, commitStep); else ok.onclick = commitStep;
  }
}

function commitStep() {
  const st = VIEW.steps[VIEW.i];
  if (st.kind === 'param') {
    if (VIEW.awake) today().alert = VIEW.val;
    else {
      const e = today().entries.find(x => x.id === VIEW.entryId);
      if (e) e.vals[st.key] = VIEW.val;
    }
    saveDB();
  }
  VIEW.i++; VIEW.val = null;
  if (VIEW.i >= VIEW.steps.length) {
    /* 走完最後一題 = 這一筆完成 */
    if (VIEW.entryId) {
      const e = today().entries.find(x => x.id === VIEW.entryId);
      if (e) { e.done = true; saveDB(); }
    }
    VIEW = { name: 'main' };
  }
  render();
}

function bindHold(node, fn) {
  let t = null;
  const start = ev => { ev.preventDefault(); node.classList.add('holding');
    t = setTimeout(() => { node.classList.remove('holding'); fn(); }, 620); };
  const cancel = () => { node.classList.remove('holding'); clearTimeout(t); };
  node.addEventListener('pointerdown', start);
  node.addEventListener('pointerup', cancel);
  node.addEventListener('pointerleave', cancel);
  node.addEventListener('pointercancel', cancel);
}

/* ---------- 改一筆已記錄的 ---------- */
function editEntry(id) {
  const e = today().entries.find(x => x.id === id);
  if (!e) return;
  const it = item(e.itemId);
  VIEW = { name: 'q', entryId: id, steps: [{ kind: 'time' }]
    .concat((it ? it.fields : []).filter(f => f !== 'time').map(k => ({ kind: 'param', key: k }))),
    i: 0, val: null };
  render();
}

/* ============================================================
   設定 · 第一層：結構
   ============================================================ */
function renderStructure(v) {
  const s = SD();
  /* Awake 不屬於任何群組：釘在最上面單獨一列 */
  const awake = s.items.find(i => i.kind === 'awake');
  let html = awake ? `<div class="sd-sg">
      <div class="sd-sgh"><span class="sd-h2">起床</span></div>
      <div class="sd-sbox"><div class="sd-srow">
        <span class="nm" data-item="${awake.id}">${esc(awake.name)}
          <small>兩個時間戳　躺床時長自動算</small></span>
        <span class="tags"><i class="on">A</i></span>
        <span class="chev" data-item="${awake.id}">›</span>
      </div></div>
    </div>` : '';
  s.groups.forEach((g, gi) => {
    const its = s.items.filter(i => i.group === g.id);
    html += `<div class="sd-sg">
      <div class="sd-sgh">
        <input class="sd-ginput" data-gname="${g.id}" value="${esc(g.name)}">
        <button class="sd-mv" data-gmv="${g.id}|-1"${gi === 0 ? ' disabled' : ''}>⌃</button>
        <button class="sd-mv" data-gmv="${g.id}|1"${gi === s.groups.length - 1 ? ' disabled' : ''}>⌄</button>
        <button class="sd-mv" data-gopt="${g.id}">${g.optional ? '選配' : '每日'}</button>
      </div>
      <div class="sd-sbox">
        ${its.map((i, ii) => `
          <div class="sd-srow">
            <button class="sd-mv" data-imv="${i.id}|-1"${ii === 0 ? ' disabled' : ''}>⌃</button>
            <button class="sd-mv" data-imv="${i.id}|1"${ii === its.length - 1 ? ' disabled' : ''}>⌄</button>
            <span class="nm" data-item="${i.id}">${esc(i.name)}</span>
            <span class="tags">${FIELD_ORDER
              .filter(f => f !== 'alert' || i.kind === 'awake')
              .map(f => `<i class="${(i.fields || []).includes(f) ? 'on' : ''}">${TAG[f]}</i>`).join('')}</span>
            <span class="chev" data-item="${i.id}">›</span>
          </div>`).join('')}
        <button class="sd-add" data-additem="${g.id}">＋　新增項目</button>
      </div>
    </div>`;
  });

  v.innerHTML = `<div class="sd sd-set">
    <div class="sd-nav"><button class="sd-back" id="sd-back">‹</button>
      <span class="sd-h1">Sadhana 結構</span></div>
    <div class="sd-sub">群組名可直接改　·　⌃⌄ 排序　·　點項目進去設參數</div>
    ${html}
    <button class="sd-add big" id="sd-addgrp">＋　新增群組</button>
    <div class="sd-legend">R 輪數　T 時間　F 專注　B 呼吸　S 細微　Y samyama　A 精神</div>
    <div class="sd-sgh" style="margin-top:22px"><span class="sd-h2">參數</span></div>
    <div class="sd-sbox">
      ${Object.keys(s.params).map(k =>
        `<div class="sd-srow"><span class="nm" data-param="${k}">${esc(s.params[k].label)}
          <small>${s.params[k].type === 'scale' ? (s.params[k].scale + ' 級') :
            s.params[k].type === 'bool' ? '是／否' : '數字'}</small></span>
          <span class="chev" data-param="${k}">›</span></div>`).join('')}
    </div>
  </div>`;

  $('#sd-back').onclick = () => { VIEW = { name: 'main' }; render(); };
  $$('[data-item]').forEach(b => b.onclick = () => { VIEW = { name: 'setItem', id: b.dataset.item }; render(); });
  $$('[data-param]').forEach(b => b.onclick = () => { VIEW = { name: 'setParam', key: b.dataset.param }; render(); });
  $$('[data-gname]').forEach(inp => inp.onchange = () => {
    const g = SD().groups.find(x => x.id === inp.dataset.gname);
    if (g) { g.name = inp.value.trim() || g.name; saveDB(); }
  });
  $$('[data-gopt]').forEach(b => b.onclick = () => {
    const g = SD().groups.find(x => x.id === b.dataset.gopt);
    g.optional = !g.optional; saveDB(); render();
  });
  $$('[data-gmv]').forEach(b => b.onclick = () => {
    const [id, dir] = b.dataset.gmv.split('|');
    const gs = SD().groups, i = gs.findIndex(x => x.id === id), j = i + (+dir);
    if (j < 0 || j >= gs.length) return;
    [gs[i], gs[j]] = [gs[j], gs[i]]; saveDB(); render();
  });
  $$('[data-imv]').forEach(b => b.onclick = () => {
    const [id, dir] = b.dataset.imv.split('|');
    const all = SD().items, it = all.find(x => x.id === id);
    const sib = all.filter(x => x.group === it.group);
    const i = sib.indexOf(it), j = i + (+dir);
    if (j < 0 || j >= sib.length) return;
    const ai = all.indexOf(sib[i]), aj = all.indexOf(sib[j]);
    [all[ai], all[aj]] = [all[aj], all[ai]]; saveDB(); render();
  });
  $$('[data-additem]').forEach(b => b.onclick = () => {
    const id = 'i_' + uid();
    SD().items.push({ id, name: '新項目', group: b.dataset.additem, fields: ['time', 'focus'], est: 20 });
    saveDB(); VIEW = { name: 'setItem', id }; render();
  });
  $('#sd-addgrp').onclick = () => {
    SD().groups.push({ id: 'g_' + uid(), name: '新群組' }); saveDB(); render();
  };
}

/* ---------- 第二層：單一項目 ---------- */
function renderItemSettings(v) {
  const s = SD(), it = item(VIEW.id);
  if (!it) { VIEW = { name: 'set' }; render(); return; }
  const anchored = it.anchor != null;

  v.innerHTML = `<div class="sd sd-set">
    <div class="sd-nav"><button class="sd-back" id="sd-back">‹</button>
      <span class="sd-h1">${esc(it.name)}</span></div>

    <div class="sd-fl">名稱</div>
    <input class="sd-input" id="sd-name" value="${esc(it.name)}">

    <div class="sd-fl">群組</div>
    <div class="sd-segc">${s.groups.map(g =>
      `<i data-grp="${g.id}" class="${it.group === g.id ? 'on' : ''}">${esc(g.name)}</i>`).join('')}</div>

    <div class="sd-fl">時刻</div>
    <div class="sd-segc"><i data-anc="0" class="${anchored ? '' : 'on'}">浮動</i>
      <i data-anc="1" class="${anchored ? 'on' : ''}">固定時刻</i></div>
    ${anchored ? `<div class="sd-anctime">
      <button class="sd-mv" data-ancd="-15">−15</button>
      <b>${Math.floor(it.anchor / 60)}:${String(it.anchor % 60).padStart(2, '0')}</b>
      <button class="sd-mv" data-ancd="15">+15</button></div>` : ''}

    <div class="sd-fl">順序</div>
    <div class="sd-segc"><i data-chain="" class="${it.chain ? '' : 'on'}">自由</i>
      ${s.chains.map(c => `<i data-chain="${c.id}" class="${it.chain === c.id ? 'on' : ''}">${esc(c.name)}</i>`).join('')}</div>
    ${it.chain ? `<div class="sd-hintbox">${esc((s.chains.find(c => c.id === it.chain) || {}).name)}：${
      s.items.filter(i => i.chain === it.chain).map(i => esc(i.name)).join(' → ')}</div>` : ''}

    <div class="sd-fl">預估時長　<small>只影響預填</small></div>
    <div class="sd-anctime">
      <button class="sd-mv" data-est="-5">−5</button><b>${it.est || 0} 分</b>
      <button class="sd-mv" data-est="5">+5</button></div>

    <div class="sd-fl">Finished 之後要問</div>
    <div class="sd-sbox">
      ${FIELD_ORDER.filter(f => f !== 'alert' || it.kind === 'awake').map(f => {
        const p = param(f), on = (it.fields || []).includes(f);
        return `<div class="sd-tog" data-fld="${f}">
          <span class="l">${f === 'time' ? '時間' : esc(p.label)}
            <small>${f === 'time' ? '起訖時刻，永遠會記' : (p.type === 'bool' ? '是／否' :
              p.type === 'count' ? '數字' : (p.scale + ' 級評分'))}</small></span>
          <span class="sd-sw${on ? ' on' : ''}"><i></i></span></div>`;
      }).join('')}
    </div>

    <button class="sd-del" id="sd-del">刪除這個項目</button>
  </div>`;

  $('#sd-back').onclick = () => { VIEW = { name: 'set' }; render(); };
  $('#sd-name').onchange = e => { it.name = e.target.value.trim() || it.name; saveDB(); render(); };
  $$('[data-grp]').forEach(b => b.onclick = () => { it.group = b.dataset.grp; saveDB(); render(); });
  $$('[data-anc]').forEach(b => b.onclick = () => {
    it.anchor = b.dataset.anc === '1' ? (it.anchor != null ? it.anchor : 600) : null;
    saveDB(); render();
  });
  $$('[data-ancd]').forEach(b => b.onclick = () => {
    it.anchor = (it.anchor + (+b.dataset.ancd) + 1440) % 1440; saveDB(); render();
  });
  $$('[data-chain]').forEach(b => b.onclick = () => { it.chain = b.dataset.chain || null; saveDB(); render(); });
  $$('[data-est]').forEach(b => b.onclick = () => {
    it.est = Math.max(0, (it.est || 0) + (+b.dataset.est)); saveDB(); render();
  });
  $$('[data-fld]').forEach(b => b.onclick = () => {
    const f = b.dataset.fld;
    it.fields = it.fields || [];
    it.fields = it.fields.includes(f) ? it.fields.filter(x => x !== f) : [...it.fields, f];
    saveDB(); render();
  });
  $('#sd-del').onclick = () => {
    if (!confirm(`刪除「${it.name}」？已記錄的資料會留著。`)) return;
    SD().items = SD().items.filter(x => x.id !== it.id);
    saveDB(); VIEW = { name: 'set' }; render();
  };
}

/* ---------- 第三層：參數 ---------- */
function renderParamSettings(v) {
  const s = SD(), k = VIEW.key, p = s.params[k];
  if (!p) { VIEW = { name: 'set' }; render(); return; }
  const users = s.items.filter(i => (i.fields || []).includes(k));

  v.innerHTML = `<div class="sd sd-set">
    <div class="sd-nav"><button class="sd-back" id="sd-back">‹</button>
      <span class="sd-h1">${esc(p.label)}　<small>${esc(k)}</small></span></div>

    <div class="sd-fl">名稱</div>
    <input class="sd-input" id="sd-plabel" value="${esc(p.label)}">

    <div class="sd-fl">型別</div>
    <div class="sd-segc"><i data-pt="scale" class="${p.type === 'scale' ? 'on' : ''}">評分</i>
      <i data-pt="bool" class="${p.type === 'bool' ? 'on' : ''}">是／否</i>
      <i data-pt="count" class="${p.type === 'count' ? 'on' : ''}">數字</i></div>

    ${p.type === 'scale' ? `<div class="sd-fl">級距</div>
      <div class="sd-segc">${[3, 5, 7, 10].map(n =>
        `<i data-ps="${n}" class="${(p.scale || 5) === n ? 'on' : ''}">${n}</i>`).join('')}</div>` : ''}

    <div class="sd-fl">引導句</div>
    <textarea class="sd-input ta" id="sd-prompt" rows="3">${esc(p.prompt || '')}</textarea>

    <div class="sd-fl">記錄時（全域）</div>
    <div class="sd-sbox">
      <div class="sd-tog" data-bh="prefill"><span class="l">預填上次的值<small>建議關閉</small></span>
        <span class="sd-sw${s.behavior.prefill ? ' on' : ''}"><i></i></span></div>
      <div class="sd-tog" data-bh="showAvg"><span class="l">顯示歷史平均<small>建議關閉</small></span>
        <span class="sd-sw${s.behavior.showAvg ? ' on' : ''}"><i></i></span></div>
      <div class="sd-tog" data-bh="hold"><span class="l">長按才能確認</span>
        <span class="sd-sw${s.behavior.hold ? ' on' : ''}"><i></i></span></div>
    </div>

    <div class="sd-fl">用在這些項目　<small>共 ${users.length} 項</small></div>
    <div class="sd-usedby">${users.map(i => esc(i.name)).join('　') || '（沒有項目用到）'}</div>
  </div>`;

  $('#sd-back').onclick = () => { VIEW = { name: 'set' }; render(); };
  $('#sd-plabel').onchange = e => { p.label = e.target.value.trim() || p.label; saveDB(); render(); };
  $('#sd-prompt').onchange = e => { p.prompt = e.target.value; saveDB(); };
  $$('[data-pt]').forEach(b => b.onclick = () => { p.type = b.dataset.pt; saveDB(); render(); });
  $$('[data-ps]').forEach(b => b.onclick = () => { p.scale = +b.dataset.ps; saveDB(); render(); });
  $$('[data-bh]').forEach(b => b.onclick = () => {
    s.behavior[b.dataset.bh] = !s.behavior[b.dataset.bh]; saveDB(); render();
  });
}

/* ============================================================
   給首頁卡用的摘要
   ============================================================ */
function homeSummary() {
  const s = SD(), d = today();
  const total = s.items.filter(i => i.kind !== 'awake' && !(s.groups.find(g => g.id === i.group) || {}).optional).length;
  const doneIds = new Set(d.entries.map(e => e.itemId));
  const done = d.entries.length;
  const minsAll = d.entries.reduce((a, e) => a + mins(e), 0);
  const run = s.running ? item(s.running.itemId) : null;
  let next = null;
  if (!run) {
    const chainId = nextInChain(doneIds);
    next = chainId ? item(chainId)
      : s.items.find(i => i.kind !== 'awake' && !doneIds.has(i.id) &&
          !(s.groups.find(g => g.id === i.group) || {}).optional);
  }
  return {
    awake: !!d.wake, up: !!d.up, done, total, mins: minsAll,
    pending: d.entries.filter(isPending).length + (d.up && d.alert == null ? 1 : 0),
    wakeAt: d.wake ? hm(d.wake) : null,
    lying: d.wake ? Math.round(((d.up || Date.now()) - d.wake) / 60000) : 0,
    running: run ? run.name : null, next: next ? next.name : null,
  };
}

/* 首頁卡上的那顆鈕：依當下狀態做該做的事，不多問 */
function cta() {
  const d = today();
  if (!d.wake) {                       // 還躺著：只蓋時間戳，不進頁面
    d.wake = Date.now(); saveDB(); renderHome(); return;
  }
  if (!d.up) {                         // 起身：一樣只蓋時間戳，精神之後再補
    d.up = Date.now(); saveDB(); renderHome(); return;
  }
  const s = SD();
  if (s.running) { open(); return; }
  const sum = homeSummary();
  const nx = s.items.find(i => i.name === sum.next);
  document.body.classList.add('sd-on');
  if (nx) { s.running = { itemId: nx.id, startMs: Date.now() }; saveDB(); }
  VIEW = { name: 'main' }; render();
}

window.SADHANA = { open, homeSummary, cta };

})();

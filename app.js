/* ============================================================
   街健日誌 — Street Workout Tracker (PWA)
   資料全部存在本機 localStorage，離線可用。
   ============================================================ */

'use strict';

/* ---------- 小工具 ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayISO = () => new Date().toISOString().slice(0, 10);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  const wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()} (${wd})`;
}
function daysAgo(iso) {
  const ms = new Date(todayISO()) - new Date(iso);
  const d = Math.round(ms / 86400000);
  if (d <= 0) return '今天';
  if (d === 1) return '昨天';
  if (d < 7) return `${d} 天前`;
  if (d < 30) return `${Math.floor(d / 7)} 週前`;
  return `${Math.floor(d / 30)} 個月前`;
}

/* HTML escaping for any user text */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1600);
}

/* ============================================================
   資料層
   ============================================================ */
const KEY = 'streetlog.v1';

const SKILL_LIBRARY = [
  { key: 'pullup', icon: '🧗', name: '引體 / Muscle-up',
    levels: ['負重引體', '單槓引體 ×10', '爆發引體', '半程 Muscle-up', '單力臂 Muscle-up', '雙力臂 Muscle-up'] },
  { key: 'frontlever', icon: '🪂', name: '前水平 Front Lever',
    levels: ['團身 Tuck', '進階團身', '單腿伸展', '團身+', '半展 Straddle', '全展 Full Front Lever'] },
  { key: 'planche', icon: '🤸', name: '俄挺 Planche',
    levels: ['蛙式 Frog', '團身 Tuck', '進階團身', '分腿 Straddle', '半展', '全俄挺 Full Planche'] },
  { key: 'humanflag', icon: '🚩', name: '人體國旗 Human Flag',
    levels: ['支撐架式', '團身國旗', '單腿國旗', '分腿國旗', '全國旗 Full Flag'] },
  { key: 'handstand', icon: '🤾', name: '倒立 Handstand',
    levels: ['靠牆倒立', '離牆平衡 5s', '自由倒立 30s', '倒立走', '倒立伏地挺身 HSPU'] },
  { key: 'lsit', icon: '🅻', name: 'L-sit / V-sit',
    levels: ['屈膝支撐', 'L-sit 10s', 'L-sit 30s', 'V-sit', '直臂 Manna'] },
];

/* 省思：預設的每日面向與引導問題（可在 App 內編輯） */
const REFLECT_ASPECTS_DEFAULT = [
  { id: 'rf_eat',    title: '進食', prompt: '今天吃得是否節制、專注？有沒有為了情緒而吃？' },
  { id: 'rf_react',  title: '回應', prompt: '遇到不如意時，我第一時間的反應是什麼？能不能更沉穩？' },
  { id: 'rf_accept', title: '接納', prompt: '接收任何形式的指令時，我的第一瞬間的反應是什麼？' },
  { id: 'rf_active', title: '活躍', prompt: '我是否整天都保持活力，早上醒來時是否感到輕盈。' },
  { id: 'rf_lang',   title: '語言', prompt: '今天說出口的話，是否誠實、必要、且不傷人？' },
  { id: 'rf_focus',  title: '投入', prompt: '是否更不費力地達成專注，還是仍然需要一直提醒自己。' },
  { id: 'rf_speak',  title: '話語', prompt: '能不能用更少的字獲得一樣的效果，用字是不是更精準，9:30 之後是否能保持靜默。' },
];

function seedDB() {
  return {
    version: 1,
    profile: { name: '', unit: 'kg' },
    workouts: [],       // {id,date,name,tags:[],exercises:[{name,type,sets:[{reps,weight,time,done}],note}],note}
    skills: [],         // {id,key,icon,name,levels:[],current,note,updated}
    prs: [],            // {id,name,type:'reps'|'time'|'weight',history:[{date,value,note}]}
    body: [],           // {id,date,weight,bodyfat,notes,measures:{}}
    templates: [],      // {id,name,day,icon,exercises:[{name,type,sets:[{reps,weight,time}]}]}
    timeline: [],       // (舊版即時時間軸，保留相容)
    goals: [],          // (已停用，保留向後相容)
    calendar: [],       // (已停用，保留向後相容)
    program: [],        // (已停用，保留向後相容)
    reflect: {          // 每日省思：固定一套可編輯面向 + 每天一則
      aspects: REFLECT_ASPECTS_DEFAULT.map(a => ({ ...a })),
      entries: [],      // {date,notes:{aspectId:text},updated}
    },
  };
}

let DB = loadDB();
function loadDB() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seedDB();
    const d = JSON.parse(raw);
    return { ...seedDB(), ...d };
  } catch (e) {
    console.error('load fail', e);
    return seedDB();
  }
}
function saveDB() {
  try { localStorage.setItem(KEY, JSON.stringify(DB)); }
  catch (e) { toast('⚠️ 儲存失敗（空間不足？）'); }
}

/* ============================================================
   路由
   ============================================================ */
let CURRENT = 'home';
let REFLECT_DATE = todayISO();   // 省思分頁目前檢視的日期
const view = $('#view');

function go(tab) {
  CURRENT = tab;
  $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
  RENDERERS[tab]();
  view.scrollTop = 0;
  window.scrollTo(0, 0);
}

$$('.tab').forEach(t => t.addEventListener('click', () => go(t.dataset.tab)));

/* ============================================================
   首頁 Dashboard
   ============================================================ */
function renderHome() {
  const now = new Date();
  const wdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const dateSm = `${now.getMonth() + 1}月${now.getDate()}`;
  const dateLg = wdays[now.getDay()];

  // Sadhana 卡即時狀態（sadhana.js 提供）
  const sd = window.SADHANA ? window.SADHANA.homeSummary() : null;
  let sdSub, sdCta = '';
  if (!sd) sdSub = '每日修練';
  else if (!sd.awake) { sdSub = '今天還沒開始'; sdCta = '醒了'; }
  else if (!sd.up) { sdSub = `${sd.wakeAt} 醒　·　躺著 ${sd.lying} 分`; sdCta = '起身'; }
  else if (sd.running) sdSub = `${esc(sd.running)}　進行中`;
  else sdSub = `${sd.done} / ${sd.total}　·　已練 ${sd.mins >= 60
    ? Math.floor(sd.mins / 60) + 'h' + String(sd.mins % 60).padStart(2, '0') : sd.mins + ' 分'}`
    + (sd.pending ? `<br><span class="jr-pend">${sd.pending} 筆待補</span>` : '');
  if (sd && sd.up && !sd.running && sd.next) sdCta = `▶　${sd.next}`;

  view.innerHTML = `
    <div class="row between" style="margin-top:4px">
      <h1 class="jr-title">Journal</h1>
      <button class="btn icon ghost" id="btn-settings" aria-label="設定" style="margin-top:-4px">⚙️</button>
    </div>

    <div class="jr-date-sm">${dateSm}</div>
    <div class="jr-date-lg">${dateLg}</div>

    <div class="jr-cards">
      <div class="jr-card big${sd && sd.running ? ' running' : ''}" id="jr-sadhana">
        <div class="jr-c-title">Sadhana</div>
        <div class="jr-c-sub">${sdSub}</div>
        ${sdCta ? `<div class="jr-cta" id="jr-sd-cta">${esc(sdCta)}</div>` : ''}
      </div>
      <div class="jr-card sm physics" id="jr-physics">
        <div class="jr-c-title">Physics</div>
        <div class="jr-c-sub">Push + Leg day</div>
      </div>
      <div class="jr-card sm journal" id="jr-journal">
        <div class="jr-c-title">Journal</div>
        <div class="jr-c-sub">Daily Parameters</div>
      </div>
    </div>
  `;

  $('#btn-settings').onclick = openSettings;
  $('#jr-sadhana').onclick = () => window.SADHANA && window.SADHANA.open();
  const sdCtaEl = $('#jr-sd-cta');
  if (sdCtaEl) sdCtaEl.onclick = e => { e.stopPropagation(); window.SADHANA.cta(); };
}

/* ---------- 本週計畫（一眼看出本週還缺什麼） ---------- */
function weekStartISO() {
  const d = new Date(todayISO() + 'T00:00:00');
  const day = (d.getDay() + 6) % 7;           // 週一為一週開始
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}
function templateDoneThisWeek(t) {
  const ws = weekStartISO();
  return DB.workouts.some(w => w.fromTemplate === t.id && w.date >= ws);
}
function renderWeekPlan() {
  if (!DB.templates.length) {
    return `<div class="section-title">本週計畫</div>
      <div class="card tap" id="setup-plan"><div class="row between">
        <div><h3 style="margin:0">🗓️ 建立你的固定課表</h3>
          <div class="muted" style="font-size:13px">例如 A 日 / B 日，之後一鍵開始、自動追蹤每週進度</div></div>
        <span style="font-size:22px">＋</span></div></div>`;
  }
  const done = DB.templates.filter(templateDoneThisWeek).length;
  const total = DB.templates.length;
  const pct = Math.round(done / total * 100);
  const remain = DB.templates.filter(t => !templateDoneThisWeek(t));
  return `<div class="section-title">本週計畫 · ${done}/${total} 完成</div>
    <div class="card">
      <div class="row between" style="margin-bottom:6px">
        <b style="font-size:14px;color:${done === total ? 'var(--accent-2)' : 'var(--text)'}">
          ${done === total ? '🎉 本週課表全部完成！' : '還缺：' + remain.map(t => esc(t.name)).join('、')}</b>
        <span class="muted" style="font-size:13px">${pct}%</span></div>
      <div class="pbar"><i style="width:${pct}%"></i></div>
    </div>
    ${DB.templates.map(t => {
      const d = templateDoneThisWeek(t);
      return `<div class="card"><div class="row between">
        <div class="row" style="gap:12px"><span style="font-size:22px;${d ? '' : 'filter:none'}">${t.icon || '📋'}</span>
          <div><b style="font-size:15px;color:${d ? 'var(--text-dim)' : 'var(--text)'}">${esc(t.name)}</b>
            <div class="faint" style="font-size:12px">${t.day ? esc(t.day) + ' · ' : ''}${t.exercises.length} 動作</div></div></div>
        ${d ? '<span class="tag green">✓ 本週完成</span>'
            : `<button class="btn primary sm wk-start" data-tpl="${t.id}">▶ 開始</button>`}
      </div></div>`;
    }).join('')}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return '深夜還在練';
  if (h < 12) return '早安';
  if (h < 18) return '午安';
  return '晚安';
}

function calcStreak() {
  if (!DB.workouts.length) return 0;
  const dates = new Set(DB.workouts.map(w => w.date));
  let streak = 0;
  let d = new Date(todayISO());
  // 允許今天還沒練：從今天或昨天起算
  if (!dates.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1);
  while (dates.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function workoutVolume(w) {
  let v = 0;
  for (const ex of w.exercises || []) {
    for (const s of ex.sets || []) {
      const reps = +s.reps || 0;
      const weight = +s.weight || 0;
      // 徒手動作用體重估算負荷（若有身體資料）
      const bw = latestBodyWeight() || 0;
      v += reps * (weight > 0 ? weight : bw * 0.6);
    }
  }
  return v;
}
function latestBodyWeight() {
  const b = [...DB.body].sort((a, b) => b.date.localeCompare(a.date))[0];
  return b ? +b.weight : 0;
}

function recentPRcard() {
  // 找最近 14 天內有新 PR 的項目
  const cut = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const hits = [];
  for (const pr of DB.prs) {
    const recent = pr.history.filter(h => h.date >= cut);
    if (!recent.length) continue;
    const best = Math.max(...pr.history.map(h => +h.value));
    const newBest = recent.some(h => +h.value === best);
    if (newBest) hits.push({ name: pr.name, value: best, type: pr.type });
  }
  if (!hits.length && !DB.workouts.some(w => w.date >= cut)) {
    return emptyBox('✨', '這兩週還沒破紀錄', '繼續加油！');
  }
  if (!hits.length) return `<div class="card muted" style="font-size:14px">持續累積中，還沒有新的 PR。到「紀錄」頁挑戰極限吧！</div>`;
  return hits.map(h =>
    `<div class="card"><div class="row between"><div><span class="tag gold">新 PR 🏆</span> <b>${esc(h.name)}</b></div><div style="font-size:20px;font-weight:800;color:var(--gold)">${prValueText(h)}</div></div></div>`
  ).join('');
}

/* ============================================================
   訓練日誌 Log
   ============================================================ */
function renderLog() {
  const list = [...DB.workouts].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  view.innerHTML = `
    <div class="page-head">
      <div><h1>訓練日誌</h1><div class="sub">${list.length} 次紀錄 · 共 ${sumSets()} 組</div></div>
    </div>
    ${list.length ? list.map(workoutCard).join('') : emptyBox('🏋️', '還沒有訓練紀錄', '點右下角 ＋ 新增')}
    <button class="fab" id="fab-add" aria-label="新增訓練">＋</button>
  `;
  $('#fab-add').onclick = () => openStartChooser();
  bindWorkoutCards();
}

function sumSets() {
  return DB.workouts.reduce((s, w) => s + (w.exercises || []).reduce((a, e) => a + (e.sets || []).length, 0), 0);
}

function workoutCard(w) {
  const exCount = (w.exercises || []).length;
  const setCount = (w.exercises || []).reduce((a, e) => a + (e.sets || []).length, 0);
  const names = (w.exercises || []).map(e => esc(e.name)).slice(0, 3).join('、');
  const more = exCount > 3 ? ` +${exCount - 3}` : '';
  return `
    <div class="card tap" data-wid="${w.id}">
      <div class="row between">
        <div class="grow">
          <h3>${esc(w.name || '訓練')}</h3>
          <div class="muted" style="font-size:13px">${names || '尚未加入動作'}${more}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:13px;color:var(--text-dim)">${fmtDate(w.date)}</div>
          <div class="faint" style="font-size:12px">${daysAgo(w.date)}</div>
        </div>
      </div>
      <div class="row" style="gap:14px;margin-top:10px">
        <span class="tag">${exCount} 動作</span>
        <span class="tag">${setCount} 組</span>
        ${w.tags?.length ? w.tags.map(t => `<span class="tag accent">${esc(t)}</span>`).join(' ') : ''}
      </div>
    </div>`;
}
function bindWorkoutCards() {
  $$('[data-wid]').forEach(c => c.onclick = () => openWorkoutSheet(c.dataset.wid));
}

/* ---------- 訓練編輯 Sheet ---------- */
const COMMON_EX = ['引體向上', '伏地挺身', '雙槓臂屈伸', '深蹲', '倒立伏地挺身', 'L-sit', '前水平', '俄挺撐', '划船', '核心捲腹', '登階', '硬拉'];
const WORKOUT_TAGS = ['推 Push', '拉 Pull', '腿 Legs', '核心 Core', '全身', '技能日'];

/* 開始訓練：有範本就先讓你挑，否則直接空白 */
function openStartChooser() {
  if (!DB.templates.length) { openWorkoutSheet(); return; }
  openSheet(`
    <div class="sheet-head"><h2>開始訓練</h2></div>
    <div class="muted" style="font-size:13px;margin-bottom:12px">選一個範本（會自動帶入上次的次數 / 重量，你只要微調），或空白開始。</div>
    ${DB.templates.map(t => `
      <div class="card tap tpl-pick" data-tpl="${t.id}">
        <div class="row between">
          <div class="row" style="gap:12px"><span style="font-size:24px">${t.icon || '📋'}</span>
            <div><h3 style="margin:0">${esc(t.name)}</h3>
              <div class="faint" style="font-size:12px">${t.day ? esc(t.day) + ' · ' : ''}${t.exercises.length} 個動作${templateDoneThisWeek(t) ? ' · <span style="color:var(--accent-2)">本週已完成</span>' : ''}</div></div></div>
          <span style="font-size:20px;color:var(--accent)">▶</span></div>
      </div>`).join('')}
    <button class="btn ghost block" id="blank-start" style="margin-top:6px">＋ 空白訓練</button>
    <button class="btn ghost block sm" id="manage-tpl" style="margin-top:8px">⚙️ 管理範本</button>
  `, sheet => {
    $$('.tpl-pick', sheet).forEach(c => c.onclick = () => { closeSheet(); openWorkoutSheet(null, c.dataset.tpl); });
    $('#blank-start', sheet).onclick = () => { closeSheet(); openWorkoutSheet(); };
    $('#manage-tpl', sheet).onclick = () => { closeSheet(); go('body'); setTimeout(() => document.querySelector('#tpl-anchor')?.scrollIntoView({ behavior: 'smooth' }), 80); };
  });
}

/* 找某動作最近一次的表現，用來預填（實現「上次做多少，這次微調」） */
function lastPerf(name, type) {
  const sorted = [...DB.workouts].sort((a, b) => b.date.localeCompare(a.date));
  for (const w of sorted) {
    const ex = (w.exercises || []).find(e => e.name === name && (e.type || 'reps') === type);
    if (ex && ex.sets.length) return ex;
  }
  return null;
}
/* 由範本動作產生可填的動作（優先帶入上次數字） */
function instantiateEx(tex) {
  const type = tex.type || 'reps';
  const last = lastPerf(tex.name, type);
  const src = (last && last.sets.length) ? last.sets
    : (tex.sets && tex.sets.length ? tex.sets : [{ reps: '', weight: '', time: '' }]);
  return {
    name: tex.name, type, note: tex.note || '',
    sets: src.map(s => ({ reps: s.reps || '', weight: s.weight || '', time: s.time || '', done: false })),
  };
}

function openWorkoutSheet(id, fromTemplateId) {
  const editing = DB.workouts.find(w => w.id === id);
  let w;
  if (editing) {
    w = JSON.parse(JSON.stringify(editing));
  } else {
    w = { id: uid(), date: todayISO(), name: '', tags: [], exercises: [], note: '' };
    const t = fromTemplateId ? DB.templates.find(x => x.id === fromTemplateId) : null;
    if (t) {
      w.name = t.name;
      w.exercises = t.exercises.map(instantiateEx);
      w.fromTemplate = t.id;
    }
  }
  if (!w.exercises.length) w.exercises.push(newEx());

  openSheet(renderWorkoutForm(w, !!editing), sheet => {
    let state = w;

    function rerender() {
      $('.sheet-body', sheet).innerHTML = workoutFormBody(state);
      wire();
    }
    function wire() {
      $('#w-name', sheet).oninput = e => state.name = e.target.value;
      $('#w-date', sheet).onchange = e => state.date = e.target.value;
      $('#w-note', sheet).oninput = e => state.note = e.target.value;
      $$('.tag-chip', sheet).forEach(ch => ch.onclick = () => {
        const t = ch.dataset.t;
        state.tags = state.tags.includes(t) ? state.tags.filter(x => x !== t) : [...state.tags, t];
        rerender();
      });
      wireExercises(sheet, state, rerender);
      $('#save-w', sheet).onclick = () => {
        state.exercises = state.exercises.filter(e => e.name || e.sets.some(s => s.reps || s.time || s.weight));
        if (!state.name && !state.exercises.length) { toast('先加點內容吧'); return; }
        if (!state.name) state.name = state.tags[0] || '訓練';
        const idx = DB.workouts.findIndex(x => x.id === state.id);
        if (idx >= 0) DB.workouts[idx] = state; else DB.workouts.unshift(state);
        autoUpdatePRs(state);
        saveDB(); closeSheet(); toast(editing ? '已更新 ✓' : '已儲存 ✓'); go(CURRENT);
      };
      const delBtn = $('#del-w', sheet);
      if (delBtn) delBtn.onclick = () => {
        if (!confirm('刪除這次訓練紀錄？')) return;
        DB.workouts = DB.workouts.filter(x => x.id !== state.id);
        saveDB(); closeSheet(); toast('已刪除'); go(CURRENT);
      };
    }
    wire();
  });
}
function newEx(name = '') { return { name, type: 'reps', sets: [{ reps: '', weight: '', time: '', done: false }], note: '' }; }

/* 動作區塊的共用事件綁定（訓練與範本編輯共用） */
function wireExercises(sheet, state, rerender) {
  $$('.ex-block', sheet).forEach(block => {
    const ei = +block.dataset.ei;
    $('.ex-name', block).oninput = e => state.exercises[ei].name = e.target.value;
    $('.ex-del', block).onclick = () => { state.exercises.splice(ei, 1); if (!state.exercises.length) state.exercises.push(newEx()); rerender(); };
    $('.ex-addset', block).onclick = () => {
      const sets = state.exercises[ei].sets;
      const last = sets[sets.length - 1] || {};
      sets.push({ reps: last.reps || '', weight: last.weight || '', time: last.time || '', done: false });
      rerender();
    };
    $$('.set-row', block).forEach(sr => {
      const si = +sr.dataset.si;
      $$('input', sr).forEach(inp => inp.oninput = e => state.exercises[ei].sets[si][inp.dataset.f] = e.target.value);
      const del = $('.set-del', sr); if (del) del.onclick = () => { state.exercises[ei].sets.splice(si, 1); rerender(); };
    });
    $('.ex-type', block).onchange = e => { state.exercises[ei].type = e.target.value; rerender(); };
  });
  const addEx = $('#add-ex', sheet);
  if (addEx) addEx.onclick = () => {
    state.exercises.push(newEx()); rerender();
    setTimeout(() => { const b = $$('.ex-block', sheet); b[b.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 30);
  };
  $$('.quick-ex', sheet).forEach(q => q.onclick = () => {
    const empty = state.exercises.find(x => !x.name);
    if (empty) empty.name = q.dataset.n; else state.exercises.push(newEx(q.dataset.n));
    rerender();
  });
}

function renderWorkoutForm(w, editing) {
  return `
    <div class="sheet-head">
      <h2>${editing ? '編輯訓練' : '新增訓練'}</h2>
      <button class="btn primary sm" id="save-w">儲存</button>
    </div>
    <div class="sheet-body">${workoutFormBody(w)}</div>
  `;
}
function workoutFormBody(w) {
  return `
    <div class="row" style="gap:10px">
      <label class="field grow"><span class="lbl">名稱</span>
        <input id="w-name" placeholder="例：上肢拉 / 技能日" value="${esc(w.name)}"></label>
      <label class="field" style="width:150px"><span class="lbl">日期</span>
        <input id="w-date" type="date" value="${esc(w.date)}"></label>
    </div>
    <div class="chips" style="margin-bottom:14px">
      ${WORKOUT_TAGS.map(t => `<span class="chip tag-chip ${w.tags.includes(t) ? 'on' : ''}" data-t="${t}">${t}</span>`).join('')}
    </div>

    ${w.exercises.map((ex, ei) => exerciseBlock(ex, ei)).join('')}

    <button class="btn ghost block" id="add-ex" style="margin-top:4px">＋ 新增動作</button>

    <div class="section-title">快速加入</div>
    <div class="chips">${COMMON_EX.map(n => `<span class="chip quick-ex" data-n="${n}">${n}</span>`).join('')}</div>

    <label class="field" style="margin-top:16px"><span class="lbl">備註</span>
      <textarea id="w-note" placeholder="感受、狀態、待改進…">${esc(w.note)}</textarea></label>

    ${w.id && DB.workouts.some(x => x.id === w.id) ? '<button class="btn danger block" id="del-w">刪除此紀錄</button>' : ''}
  `;
}
function exerciseBlock(ex, ei) {
  const isTime = ex.type === 'time';
  return `
    <div class="ex-block" data-ei="${ei}">
      <div class="row between" style="gap:8px">
        <input class="ex-name grow" placeholder="動作名稱" value="${esc(ex.name)}" list="ex-list">
        <select class="ex-type" style="width:96px">
          <option value="reps" ${!isTime ? 'selected' : ''}>次數</option>
          <option value="time" ${isTime ? 'selected' : ''}>秒數</option>
        </select>
        <button class="btn sm ghost ex-del" aria-label="刪除動作">✕</button>
      </div>
      <div class="set-row" style="color:var(--text-faint)">
        <div class="mini-lbl">組</div>
        <div class="mini-lbl">${isTime ? '秒數' : '次數'}</div>
        <div class="mini-lbl">負重(${DB.profile.unit})</div>
        <div></div>
      </div>
      ${ex.sets.map((s, si) => `
        <div class="set-row" data-si="${si}">
          <div class="idx">${si + 1}</div>
          ${isTime
            ? `<input data-f="time" inputmode="numeric" placeholder="秒" value="${esc(s.time)}">`
            : `<input data-f="reps" inputmode="numeric" placeholder="次" value="${esc(s.reps)}">`}
          <input data-f="weight" inputmode="decimal" placeholder="0" value="${esc(s.weight)}">
          <button class="btn sm ghost set-del" aria-label="刪除組">✕</button>
        </div>`).join('')}
      <button class="btn sm ghost ex-addset" style="margin-top:8px">＋ 加一組</button>
    </div>
    <datalist id="ex-list">${COMMON_EX.map(n => `<option value="${n}">`).join('')}</datalist>
  `;
}

/* 自動把訓練中的最佳成績更新到 PR */
function autoUpdatePRs(w) {
  for (const ex of w.exercises) {
    if (!ex.name) continue;
    const isTime = ex.type === 'time';
    let best = 0;
    for (const s of ex.sets) {
      const v = isTime ? +s.time : +s.reps;
      if (v > best) best = v;
    }
    if (best <= 0) continue;
    let pr = DB.prs.find(p => p.name === ex.name && p.type === (isTime ? 'time' : 'reps'));
    if (!pr) {
      pr = { id: uid(), name: ex.name, type: isTime ? 'time' : 'reps', history: [] };
      DB.prs.push(pr);
    }
    const prevBest = pr.history.length ? Math.max(...pr.history.map(h => +h.value)) : 0;
    if (best > prevBest) {
      pr.history.push({ date: w.date, value: best, note: '來自訓練日誌' });
    }
  }
}

/* ============================================================
   技能 Skills
   ============================================================ */
function renderSkills() {
  view.innerHTML = `
    <div class="page-head"><div><h1>技能進度</h1><div class="sub">解鎖你的街頭技能樹</div></div></div>
    ${DB.skills.length ? DB.skills.map(skillCard).join('') : ''}
    <div class="section-title">加入新技能</div>
    <div id="skill-lib">
      ${SKILL_LIBRARY.filter(s => !DB.skills.some(x => x.key === s.key))
        .map(s => `<div class="card tap lib-skill" data-key="${s.key}">
          <div class="row between"><div class="row" style="gap:12px"><span style="font-size:24px">${s.icon}</span>
          <div><h3 style="margin:0">${esc(s.name)}</h3><div class="faint" style="font-size:12px">${s.levels.length} 個階段</div></div></div>
          <span style="font-size:22px">＋</span></div></div>`).join('')
        || '<div class="card muted" style="font-size:14px">所有預設技能都加了！可繼續追蹤現有進度。</div>'}
    </div>
    <button class="btn ghost block sm" id="custom-skill" style="margin-top:10px">＋ 自訂技能</button>
  `;
  $$('.lib-skill').forEach(c => c.onclick = () => addSkillFromLib(c.dataset.key));
  $$('[data-skill]').forEach(c => c.onclick = () => openSkillSheet(c.dataset.skill));
  $('#custom-skill').onclick = () => openCustomSkill();
}

function skillCard(s) {
  const pct = Math.round((s.current / (s.levels.length - 1)) * 100);
  const done = s.current >= s.levels.length - 1;
  return `
    <div class="card tap" data-skill="${s.id}">
      <div class="row between">
        <div class="row" style="gap:12px"><span style="font-size:26px">${s.icon}</span>
          <div><h3 style="margin:0">${esc(s.name)}</h3>
          <div style="font-size:13px;color:${done ? 'var(--accent-2)' : 'var(--gold)'}">${done ? '✓ 已精通' : esc(s.levels[s.current])}</div></div>
        </div>
        <div style="font-weight:800;font-size:18px;color:var(--accent)">${pct}%</div>
      </div>
      <div class="level-track">
        ${s.levels.map((_, i) => `<span class="level-dot ${i < s.current ? 'done' : i === s.current ? 'cur' : ''}"></span>`).join('')}
      </div>
    </div>`;
}
function skillMiniCard(s) {
  const pct = Math.round((s.current / (s.levels.length - 1)) * 100);
  return `
    <div class="card tap" data-skill="${s.id}">
      <div class="row between">
        <div class="row" style="gap:10px"><span style="font-size:20px">${s.icon}</span>
          <div><b style="font-size:15px">${esc(s.name)}</b><div class="faint" style="font-size:12px">${esc(s.levels[s.current])}</div></div></div>
        <div style="font-weight:800;color:var(--accent)">${pct}%</div>
      </div>
      <div class="pbar"><i style="width:${pct}%"></i></div>
    </div>`;
}

function addSkillFromLib(key) {
  const lib = SKILL_LIBRARY.find(s => s.key === key);
  DB.skills.push({ id: uid(), key, icon: lib.icon, name: lib.name, levels: [...lib.levels], current: 0, note: '', updated: todayISO() });
  saveDB(); toast('已加入技能'); renderSkills();
}

function openSkillSheet(id) {
  const s = DB.skills.find(x => x.id === id);
  if (!s) return;
  openSheet(`
    <div class="sheet-head"><h2>${s.icon} ${esc(s.name)}</h2>
      <button class="btn danger sm" id="del-skill">移除</button></div>
    <div class="muted" style="font-size:13px;margin-bottom:12px">點擊你目前達到的階段：</div>
    <div id="lv-list"></div>
    <label class="field" style="margin-top:14px"><span class="lbl">練習筆記</span>
      <textarea id="s-note" placeholder="卡在哪、下一步怎麼練…">${esc(s.note || '')}</textarea></label>
    <div class="faint" style="font-size:12px">上次更新：${daysAgo(s.updated)}</div>
  `, sheet => {
    function draw() {
      $('#lv-list', sheet).innerHTML = s.levels.map((lv, i) => `
        <div class="li lv-item" data-i="${i}" style="cursor:pointer">
          <div class="badge" style="background:${i < s.current ? 'rgba(255,90,60,.15)' : i === s.current ? 'rgba(245,196,81,.18)' : ''}">
            ${i < s.current ? '✓' : i === s.current ? '➤' : i + 1}</div>
          <div class="grow"><b style="color:${i <= s.current ? 'var(--text)' : 'var(--text-faint)'}">${esc(lv)}</b></div>
          ${i === s.current ? '<span class="tag gold">目前</span>' : ''}
        </div>`).join('');
      $$('.lv-item', sheet).forEach(el => el.onclick = () => {
        s.current = +el.dataset.i; s.updated = todayISO(); saveDB(); draw();
        if (s.current >= s.levels.length - 1) toast('🎉 技能精通！');
      });
    }
    draw();
    $('#s-note', sheet).oninput = e => { s.note = e.target.value; };
    $('#s-note', sheet).onblur = () => saveDB();
    $('#del-skill', sheet).onclick = () => {
      if (!confirm('移除這個技能追蹤？')) return;
      DB.skills = DB.skills.filter(x => x.id !== s.id);
      saveDB(); closeSheet(); renderSkills();
    };
  }, () => { saveDB(); go(CURRENT); });
}

function openCustomSkill() {
  const s = { id: uid(), key: 'custom-' + uid(), icon: '⭐', name: '', levels: ['入門', '進階', '精通'], current: 0, note: '', updated: todayISO() };
  openSheet(`
    <div class="sheet-head"><h2>自訂技能</h2><button class="btn primary sm" id="save-skill">儲存</button></div>
    <label class="field"><span class="lbl">技能名稱</span><input id="cs-name" placeholder="例：後水平 Back Lever"></label>
    <label class="field"><span class="lbl">各階段（每行一個，由易到難）</span>
      <textarea id="cs-levels" style="min-height:120px">團身\n單腿\n分腿\n全展</textarea></label>
    <div class="faint" style="font-size:12px">圖示：<input id="cs-icon" value="⭐" style="width:60px;display:inline-block;text-align:center"></div>
  `, sheet => {
    $('#save-skill', sheet).onclick = () => {
      const name = $('#cs-name', sheet).value.trim();
      const levels = $('#cs-levels', sheet).value.split('\n').map(x => x.trim()).filter(Boolean);
      if (!name || levels.length < 2) { toast('請填名稱與至少 2 個階段'); return; }
      s.name = name; s.levels = levels; s.icon = $('#cs-icon', sheet).value.trim() || '⭐';
      DB.skills.push(s); saveDB(); closeSheet(); toast('已建立'); renderSkills();
    };
  });
}

/* ============================================================
   紀錄 PR
   ============================================================ */
function renderPR() {
  const list = DB.prs.filter(p => p.history.length).sort((a, b) => bestOf(b) === bestOf(a) ? 0 : 1);
  view.innerHTML = `
    <div class="page-head"><div><h1>個人紀錄</h1><div class="sub">${DB.prs.filter(p=>p.history.length).length} 個項目 · 挑戰極限</div></div></div>
    ${list.length ? list.map(prCard).join('') : emptyBox('🏆', '還沒有個人紀錄', '訓練日誌會自動記錄，或點 ＋ 手動新增')}
    <button class="fab" id="fab-pr" aria-label="新增紀錄">＋</button>
  `;
  $('#fab-pr').onclick = () => openPRSheet();
  $$('[data-pr]').forEach(c => c.onclick = () => openPRSheet(c.dataset.pr));
}
function bestOf(p) { return p.history.length ? Math.max(...p.history.map(h => +h.value)) : 0; }
function prValueText(p) {
  const best = typeof p.value === 'number' ? p.value : bestOf(p);
  if (p.type === 'time') return best + 's';
  if (p.type === 'weight') return '+' + best + DB.profile.unit;
  return best + ' 次';
}

function prCard(p) {
  const best = bestOf(p);
  const hist = [...p.history].sort((a, b) => a.date.localeCompare(b.date));
  const first = hist[0];
  const gain = best - (+first.value);
  const icon = p.type === 'time' ? '⏱' : p.type === 'weight' ? '⚖️' : '🔢';
  return `
    <div class="card tap" data-pr="${p.id}">
      <div class="row between">
        <div class="row" style="gap:10px"><span style="font-size:20px">${icon}</span><b style="font-size:16px">${esc(p.name)}</b></div>
        <div style="text-align:right"><div style="font-size:22px;font-weight:800;color:var(--gold)">${prValueText({ type: p.type, value: best })}</div>
          ${gain > 0 ? `<div class="faint" style="font-size:11px">↑ +${gain} 起步以來</div>` : ''}</div>
      </div>
      ${hist.length > 1 ? sparkline(hist.map(h => +h.value)) : `<div class="faint" style="font-size:12px;margin-top:8px">記錄更多次數就會出現成長曲線</div>`}
    </div>`;
}

function openPRSheet(id) {
  const editing = DB.prs.find(p => p.id === id);
  const p = editing ? JSON.parse(JSON.stringify(editing))
    : { id: uid(), name: '', type: 'reps', history: [] };

  openSheet(``, sheet => {
    function draw() {
      const hist = [...p.history].sort((a, b) => b.date.localeCompare(a.date));
      sheet.innerHTML = `
        <div class="sheet-head"><h2>${editing ? '編輯紀錄' : '新增紀錄'}</h2>
          <button class="btn primary sm" id="save-pr">完成</button></div>
        <label class="field"><span class="lbl">項目名稱</span>
          <input id="pr-name" placeholder="例：單槓引體最多次" value="${esc(p.name)}"></label>
        <label class="field"><span class="lbl">類型</span>
          <div class="chips">
            <span class="chip pr-type ${p.type === 'reps' ? 'on' : ''}" data-t="reps">次數</span>
            <span class="chip pr-type ${p.type === 'time' ? 'on' : ''}" data-t="time">秒數</span>
            <span class="chip pr-type ${p.type === 'weight' ? 'on' : ''}" data-t="weight">負重(${DB.profile.unit})</span>
          </div></label>

        <div class="section-title">新增一筆成績</div>
        <div class="row" style="gap:8px;align-items:flex-end">
          <label class="field grow" style="margin:0"><span class="lbl">數值</span>
            <input id="pr-val" inputmode="decimal" placeholder="${p.type === 'time' ? '秒' : p.type === 'weight' ? DB.profile.unit : '次'}"></label>
          <label class="field" style="margin:0;width:150px"><span class="lbl">日期</span>
            <input id="pr-date" type="date" value="${todayISO()}"></label>
          <button class="btn primary" id="pr-add" style="margin-bottom:0">加入</button>
        </div>

        ${p.history.length ? `<div class="section-title">歷史（最佳 ${prValueText({ type: p.type, value: bestOf(p) })}）</div>
          ${hist.length > 1 ? sparkline([...p.history].sort((a,b)=>a.date.localeCompare(b.date)).map(h => +h.value)) : ''}
          <div style="margin-top:10px">${hist.map(h => `
            <div class="li"><div class="grow"><b>${prValueText({ type: p.type, value: +h.value })}</b>
              <span class="faint" style="font-size:12px;margin-left:8px">${fmtDate(h.date)}</span></div>
              <button class="btn sm danger" data-del="${h.date}_${h.value}">✕</button></div>`).join('')}</div>` : ''}

        ${editing ? '<button class="btn danger block" id="del-pr" style="margin-top:16px">刪除整個項目</button>' : ''}
      `;
      $('#pr-name', sheet).oninput = e => p.name = e.target.value;
      $$('.pr-type', sheet).forEach(c => c.onclick = () => { p.type = c.dataset.t; draw(); });
      $('#pr-add', sheet).onclick = () => {
        const v = parseFloat($('#pr-val', sheet).value);
        const d = $('#pr-date', sheet).value || todayISO();
        if (isNaN(v)) { toast('請輸入數值'); return; }
        p.history.push({ date: d, value: v, note: '' });
        commit(); draw();
        const prev = bestOf({ history: p.history.slice(0, -1) });
        if (v > prev && p.history.length > 1) toast('🏆 新紀錄！');
      };
      $$('[data-del]', sheet).forEach(b => b.onclick = () => {
        const [dd, vv] = b.dataset.del.split('_');
        const i = p.history.findIndex(h => h.date === dd && String(h.value) === vv);
        if (i >= 0) p.history.splice(i, 1); commit(); draw();
      });
      $('#save-pr', sheet).onclick = () => {
        if (!p.name.trim()) { toast('請填項目名稱'); return; }
        commit(true); closeSheet(); toast('已儲存 ✓'); go(CURRENT);
      };
      const dp = $('#del-pr', sheet);
      if (dp) dp.onclick = () => { if (!confirm('刪除整個項目？')) return; DB.prs = DB.prs.filter(x => x.id !== p.id); saveDB(); closeSheet(); renderPR(); };
    }
    function commit(force) {
      const idx = DB.prs.findIndex(x => x.id === p.id);
      if (idx >= 0) DB.prs[idx] = JSON.parse(JSON.stringify(p));
      else if (p.name.trim() || p.history.length || force) DB.prs.push(JSON.parse(JSON.stringify(p)));
      saveDB();
    }
    draw();
  });
}

/* ============================================================
   身體 Body & 課表 Program
   ============================================================ */
function renderBody() {
  const body = [...DB.body].sort((a, b) => b.date.localeCompare(a.date));
  const latest = body[0];
  const weights = [...DB.body].sort((a, b) => a.date.localeCompare(b.date)).map(b => +b.weight).filter(Boolean);

  view.innerHTML = `
    <div class="page-head"><div><h1>身體 & 課表</h1><div class="sub">追蹤數據 · 安排每週訓練</div></div></div>

    <div class="stat-grid">
      <div class="stat"><div class="num blue">${latest?.weight ? latest.weight : '—'}</div><div class="lbl">目前體重 (${DB.profile.unit})</div></div>
      <div class="stat"><div class="num">${latest?.bodyfat ? latest.bodyfat + '%' : '—'}</div><div class="lbl">體脂率</div></div>
    </div>
    ${weights.length > 1 ? `<div class="card"><div class="muted" style="font-size:13px;margin-bottom:6px">體重趨勢</div>${sparkline(weights, '#60a5fa')}</div>` : ''}
    <button class="btn primary block" id="add-body">＋ 記錄今日數據</button>

    <div class="section-title">歷史數據</div>
    ${body.length ? body.slice(0, 8).map(b => `
      <div class="li"><div class="badge">📅</div>
        <div class="grow"><b>${b.weight || '—'} ${DB.profile.unit}</b>${b.bodyfat ? ` · ${b.bodyfat}%` : ''}
          <div class="faint" style="font-size:12px">${fmtDate(b.date)}${b.notes ? ' · ' + esc(b.notes) : ''}</div></div>
        <button class="btn sm danger" data-delbody="${b.id}">✕</button></div>`).join('')
      : '<div class="card muted" style="font-size:14px">還沒有身體數據</div>'}

    <div class="section-title" id="tpl-anchor">訓練範本 / 課表</div>
    <div class="muted" style="font-size:13px;margin:-4px 0 10px">把固定課表存成範本（例：A 日 / B 日）。開始訓練時選它，會自動帶入上次數字，只要微調就好。</div>
    <div id="tpl-list">${renderTemplates()}</div>
    <button class="btn ghost block sm" id="add-tpl" style="margin-top:8px">＋ 新增範本</button>
  `;

  $('#add-body').onclick = openBodySheet;
  $('#add-tpl').onclick = () => openTemplateSheet();
  $$('.tpl-start').forEach(b => b.onclick = () => openWorkoutSheet(null, b.dataset.tpl));
  $$('.tpl-edit').forEach(b => b.onclick = () => openTemplateSheet(b.dataset.tpl));
  $$('[data-delbody]').forEach(b => b.onclick = () => {
    if (!confirm('刪除這筆數據？')) return;
    DB.body = DB.body.filter(x => x.id !== b.dataset.delbody); saveDB(); renderBody();
  });
}

const WEEKDAYS = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];
const DAY_ORDER = { '週一': 1, '週二': 2, '週三': 3, '週四': 4, '週五': 5, '週六': 6, '週日': 7 };
function renderTemplates() {
  if (!DB.templates.length) return '<div class="card muted" style="font-size:14px">還沒有範本。建一個固定課表（例如 A 日、B 日），之後點「開始訓練」選它就能直接做，不必每次重打。</div>';
  return [...DB.templates].sort((a, b) => (DAY_ORDER[a.day] || 9) - (DAY_ORDER[b.day] || 9)).map(t => {
    const done = templateDoneThisWeek(t);
    return `<div class="card">
      <div class="row between">
        <div class="row" style="gap:12px"><span style="font-size:22px">${t.icon || '📋'}</span>
          <div><b style="font-size:15px">${esc(t.name)}</b>
            <div class="faint" style="font-size:12px">${t.day ? `<span class="tag accent">${esc(t.day)}</span> ` : ''}${t.exercises.length} 動作${done ? ' · <span style="color:var(--accent-2)">本週已完成</span>' : ''}</div></div></div>
      </div>
      ${t.exercises.length ? `<div class="muted" style="font-size:13px;margin-top:8px">${t.exercises.map(e => esc(e.name)).join(' · ')}</div>` : ''}
      <div class="row" style="gap:8px;margin-top:12px">
        <button class="btn green sm grow tpl-start" data-tpl="${t.id}">▶ 開始這個</button>
        <button class="btn sm grow tpl-edit" data-tpl="${t.id}">編輯</button>
      </div>
    </div>`;
  }).join('');
}

function openBodySheet() {
  const b = { id: uid(), date: todayISO(), weight: '', bodyfat: '', notes: '' };
  openSheet(`
    <div class="sheet-head"><h2>記錄身體數據</h2><button class="btn primary sm" id="save-body">儲存</button></div>
    <label class="field"><span class="lbl">日期</span><input id="b-date" type="date" value="${b.date}"></label>
    <div class="row" style="gap:10px">
      <label class="field grow"><span class="lbl">體重 (${DB.profile.unit})</span><input id="b-weight" inputmode="decimal" placeholder="0"></label>
      <label class="field grow"><span class="lbl">體脂率 %</span><input id="b-fat" inputmode="decimal" placeholder="選填"></label>
    </div>
    <label class="field"><span class="lbl">備註</span><textarea id="b-notes" placeholder="圍度、狀態…"></textarea></label>
  `, sheet => {
    $('#save-body', sheet).onclick = () => {
      b.date = $('#b-date', sheet).value || todayISO();
      b.weight = $('#b-weight', sheet).value;
      b.bodyfat = $('#b-fat', sheet).value;
      b.notes = $('#b-notes', sheet).value;
      if (!b.weight && !b.bodyfat && !b.notes) { toast('至少填一項'); return; }
      DB.body.push(b); saveDB(); closeSheet(); toast('已儲存 ✓'); renderBody();
    };
  });
}

function templateForm(t) {
  const isEdit = DB.templates.some(x => x.id === t.id);
  return `
    <div class="sheet-head"><h2>${isEdit ? '編輯範本' : '新增範本'}</h2>
      <button class="btn primary sm" id="save-tpl">儲存</button></div>
    <label class="field"><span class="lbl">範本名稱</span>
      <input id="t-name" placeholder="例：A 日 · 推 ／ B 日 · 拉" value="${esc(t.name)}"></label>
    <label class="field"><span class="lbl">安排在星期幾（選填）</span>
      <div class="chips">${WEEKDAYS.map(d => `<span class="chip tday-chip ${t.day === d ? 'on' : ''}" data-d="${d}">${d}</span>`).join('')}</div></label>

    <div class="section-title">固定動作</div>
    ${t.exercises.map((ex, ei) => exerciseBlock(ex, ei)).join('')}
    <button class="btn ghost block" id="add-ex" style="margin-top:4px">＋ 新增動作</button>

    <div class="section-title">快速加入</div>
    <div class="chips">${COMMON_EX.map(n => `<span class="chip quick-ex" data-n="${n}">${n}</span>`).join('')}</div>

    <div class="faint" style="font-size:12px;margin-top:14px">💡 這裡填的次數/重量只是預設值，實際訓練時會以你「上一次的成績」自動帶入。</div>
    ${isEdit ? '<button class="btn danger block" id="del-tpl" style="margin-top:12px">刪除範本</button>' : ''}
  `;
}
function openTemplateSheet(id) {
  const editing = DB.templates.find(t => t.id === id);
  const state = editing ? JSON.parse(JSON.stringify(editing))
    : { id: uid(), name: '', day: '', icon: '📋', exercises: [newEx()] };
  if (!state.exercises.length) state.exercises.push(newEx());

  openSheet('', sheet => {
    function rerender() { sheet.innerHTML = templateForm(state); wire(); }
    function wire() {
      $('#t-name', sheet).oninput = e => state.name = e.target.value;
      $$('.tday-chip', sheet).forEach(c => c.onclick = () => { state.day = state.day === c.dataset.d ? '' : c.dataset.d; rerender(); });
      wireExercises(sheet, state, rerender);
      $('#save-tpl', sheet).onclick = () => {
        state.exercises = state.exercises.filter(e => e.name.trim());
        if (!state.name.trim()) { toast('幫範本取個名字'); return; }
        if (!state.exercises.length) { toast('至少加一個動作'); return; }
        const idx = DB.templates.findIndex(x => x.id === state.id);
        if (idx >= 0) DB.templates[idx] = state; else DB.templates.push(state);
        saveDB(); closeSheet(); toast(editing ? '範本已更新 ✓' : '範本已建立 ✓'); go(CURRENT);
      };
      const del = $('#del-tpl', sheet);
      if (del) del.onclick = () => {
        if (!confirm('刪除這個範本？（已記錄的訓練不會消失）')) return;
        DB.templates = DB.templates.filter(x => x.id !== state.id);
        saveDB(); closeSheet(); toast('已刪除'); go(CURRENT);
      };
    }
    rerender();
  });
}

/* ============================================================
   設定 / 備份
   ============================================================ */
function openSettings() {
  openSheet(`
    <div class="sheet-head"><h2>設定</h2><button class="btn sm ghost" id="close-set">關閉</button></div>
    <label class="field"><span class="lbl">你的名字</span><input id="set-name" placeholder="選填" value="${esc(DB.profile.name)}"></label>
    <label class="field"><span class="lbl">重量單位</span>
      <div class="chips"><span class="chip unit-chip ${DB.profile.unit === 'kg' ? 'on' : ''}" data-u="kg">公斤 kg</span>
      <span class="chip unit-chip ${DB.profile.unit === 'lb' ? 'on' : ''}" data-u="lb">磅 lb</span></div></label>

    <div class="section-title">資料備份</div>
    <div class="card" style="font-size:13px" class="muted">
      <p style="margin:0 0 10px;color:var(--text-dim)">資料只存在這支手機。換機或清除瀏覽器前，記得先匯出備份。</p>
      <button class="btn block" id="export-btn" style="margin-bottom:8px">⬇️ 匯出備份 (JSON)</button>
      <button class="btn block" id="import-btn">⬆️ 匯入備份</button>
      <input type="file" id="import-file" accept="application/json" hidden>
    </div>

    <div class="section-title">危險區</div>
    <button class="btn danger block" id="reset-btn">清除所有資料</button>
    <div class="faint" style="font-size:12px;text-align:center;margin-top:20px">街健日誌 · 本機儲存 · v1</div>
  `, sheet => {
    $('#close-set', sheet).onclick = closeSheet;
    $('#set-name', sheet).oninput = e => { DB.profile.name = e.target.value; saveDB(); };
    $$('.unit-chip', sheet).forEach(c => c.onclick = () => { DB.profile.unit = c.dataset.u; saveDB(); c.parentElement.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c)); });
    $('#export-btn', sheet).onclick = exportData;
    $('#import-btn', sheet).onclick = () => $('#import-file', sheet).click();
    $('#import-file', sheet).onchange = e => importData(e.target.files[0]);
    $('#reset-btn', sheet).onclick = () => {
      if (!confirm('確定清除所有訓練、技能、紀錄資料？此動作無法復原！')) return;
      if (!confirm('真的要清除嗎？建議先匯出備份。')) return;
      localStorage.removeItem(KEY); DB = seedDB(); closeSheet(); toast('已重置'); go('home');
    };
  });
}

function exportData() {
  const blob = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `街健日誌_備份_${todayISO()}.json`;
  a.click(); URL.revokeObjectURL(url);
  toast('已匯出備份');
}
function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if (!d.version) throw new Error('格式錯誤');
      if (!confirm('匯入將覆蓋目前所有資料，繼續？')) return;
      DB = { ...seedDB(), ...d }; saveDB(); closeSheet(); toast('匯入成功 ✓'); go('home');
    } catch (e) { toast('檔案無法讀取'); }
  };
  reader.readAsText(file);
}

/* ============================================================
   回顧 Review（週 / 月 / 年 / 全部）
   ============================================================ */
let reviewType = 'week';
let reviewOffset = 0;

function isoLocal(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fmtDur(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  if (m < 60) return `${m} 分 ${sec} 秒`;
  const h = Math.floor(m / 60);
  return `${h} 小時 ${m % 60} 分`;
}
function reviewRange(type, offset) {
  const now = new Date(todayISO() + 'T00:00:00');
  if (type === 'all') return { start: '0000-01-01', end: '9999-12-31', label: '全部時間', nav: false };
  if (type === 'week') {
    const ws = new Date(now); const day = (ws.getDay() + 6) % 7;
    ws.setDate(ws.getDate() - day + offset * 7);
    const we = new Date(ws); we.setDate(we.getDate() + 6);
    const lbl = `${ws.getMonth() + 1}/${ws.getDate()} – ${we.getMonth() + 1}/${we.getDate()}`;
    return { start: isoLocal(ws), end: isoLocal(we), label: offset === 0 ? '本週 · ' + lbl : lbl, nav: true };
  }
  if (type === 'month') {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const e = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { start: isoLocal(d), end: isoLocal(e), label: `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`, nav: true };
  }
  const y = now.getFullYear() + offset;
  return { start: `${y}-01-01`, end: `${y}-12-31`, label: `${y} 年`, nav: true };
}

function renderReview() {
  const rng = reviewRange(reviewType, reviewOffset);
  const ws = DB.workouts.filter(w => w.date >= rng.start && w.date <= rng.end);

  let sets = 0, reps = 0, vol = 0, secs = 0;
  const exCount = {}, dayset = new Set(), tplCount = {};
  for (const w of ws) {
    dayset.add(w.date);
    if (w.fromTemplate) tplCount[w.fromTemplate] = (tplCount[w.fromTemplate] || 0) + 1;
    for (const ex of w.exercises || []) {
      const t = ex.type || 'reps';
      for (const s of ex.sets || []) {
        sets++;
        if (t === 'time') secs += +s.time || 0; else reps += +s.reps || 0;
        vol += (+s.reps || 0) * (+s.weight || 0);
      }
      exCount[ex.name] = (exCount[ex.name] || 0) + (ex.sets || []).length;
    }
  }
  const topEx = Object.entries(exCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const newPRs = [];
  for (const pr of DB.prs) {
    const h = [...pr.history].sort((a, b) => a.date.localeCompare(b.date));
    let mx = 0;
    for (const e of h) {
      if (+e.value > mx) {
        if (e.date >= rng.start && e.date <= rng.end) newPRs.push({ name: pr.name, type: pr.type, value: +e.value, date: e.date });
        mx = +e.value;
      }
    }
  }
  const bodies = DB.body.filter(b => b.date >= rng.start && b.date <= rng.end && b.weight)
    .sort((a, b) => a.date.localeCompare(b.date));
  let bodyDelta = null;
  if (bodies.length >= 2) {
    const d = (+bodies[bodies.length - 1].weight) - (+bodies[0].weight);
    bodyDelta = { from: +bodies[0].weight, to: +bodies[bodies.length - 1].weight, d };
  }
  const tplRows = Object.entries(tplCount).map(([id, c]) => {
    const t = DB.templates.find(x => x.id === id);
    return { name: t ? t.name : '（已刪除的範本）', icon: (t && t.icon) || '📋', c };
  }).sort((a, b) => b.c - a.c);

  view.innerHTML = `
    <div class="page-head"><div><h1>回顧</h1><div class="sub">看看你的累積與進步</div></div></div>
    <div class="chips" style="margin-bottom:12px">
      ${[['week', '本週'], ['month', '本月'], ['year', '今年'], ['all', '全部']]
        .map(([k, l]) => `<span class="chip rv-type ${reviewType === k ? 'on' : ''}" data-k="${k}">${l}</span>`).join('')}
    </div>
    <div class="row between" style="margin-bottom:16px">
      ${rng.nav ? `<button class="btn sm ghost" id="rv-prev" style="font-size:20px;padding:4px 14px">‹</button>` : '<span></span>'}
      <b style="font-size:16px">${rng.label}</b>
      ${rng.nav ? `<button class="btn sm ghost" id="rv-next" style="font-size:20px;padding:4px 14px${reviewOffset >= 0 ? ';opacity:.25' : ''}">›</button>` : '<span></span>'}
    </div>

    ${ws.length === 0 ? emptyBox('🗓️', '這段期間沒有訓練紀錄', '換個時間範圍，或去練一場 💪') : `
    <div class="stat-grid">
      <div class="stat"><div class="num accent">${ws.length}</div><div class="lbl">訓練場次</div></div>
      <div class="stat"><div class="num">${dayset.size}</div><div class="lbl">訓練天數</div></div>
      <div class="stat"><div class="num green">${sets}</div><div class="lbl">總組數</div></div>
      <div class="stat"><div class="num blue">${reps.toLocaleString()}</div><div class="lbl">總反覆次數</div></div>
    </div>
    ${secs > 0 ? `<div class="card"><div class="row between"><span class="muted">靜態撐體總時間</span><b>${fmtDur(secs)}</b></div></div>` : ''}
    ${vol > 0 ? `<div class="card"><div class="row between"><span class="muted">負重總量</span><b>${Math.round(vol).toLocaleString()} ${DB.profile.unit}</b></div></div>` : ''}

    <div class="section-title">訓練頻率</div>
    <div class="card">${renderHeatmap(reviewType, rng, ws)}</div>

    ${tplRows.length ? `<div class="section-title">課表完成</div>
      ${tplRows.map(t => `<div class="li"><div class="badge">${t.icon}</div><div class="grow"><b>${esc(t.name)}</b></div><span class="tag accent">${t.c} 次</span></div>`).join('')}` : ''}

    ${topEx.length ? `<div class="section-title">最常練的動作</div>
      <div class="card">${topEx.map(([n, c], i) => { const mx = topEx[0][1]; return `
        <div style="margin-bottom:${i < topEx.length - 1 ? '12px' : '0'}">
          <div class="row between" style="margin-bottom:4px"><b style="font-size:14px">${esc(n)}</b><span class="muted" style="font-size:13px">${c} 組</span></div>
          <div class="pbar"><i style="width:${Math.round(c / mx * 100)}%"></i></div></div>`; }).join('')}</div>` : ''}

    <div class="section-title">亮點</div>
    ${newPRs.length ? newPRs.sort((a, b) => b.date.localeCompare(a.date)).map(p => `
      <div class="card"><div class="row between"><div><span class="tag gold">🏆 新 PR</span> <b>${esc(p.name)}</b></div>
        <div style="font-weight:800;color:var(--gold)">${prValueText({ type: p.type, value: p.value })}</div></div>
        <div class="faint" style="font-size:12px;margin-top:6px">${fmtDate(p.date)}</div></div>`).join('')
      : `<div class="card muted" style="font-size:14px">這段期間還沒有新的個人紀錄 — 下一個突破就靠你了！</div>`}
    ${bodyDelta ? `<div class="card"><div class="row between"><span class="muted">體重變化</span>
      <b style="color:${bodyDelta.d < 0 ? 'var(--accent-2)' : bodyDelta.d > 0 ? 'var(--accent-3)' : 'var(--text)'}">${bodyDelta.from} → ${bodyDelta.to} ${DB.profile.unit}（${bodyDelta.d > 0 ? '+' : ''}${bodyDelta.d.toFixed(1)}）</b></div></div>` : ''}
    `}
  `;

  $$('.rv-type').forEach(c => c.onclick = () => { reviewType = c.dataset.k; reviewOffset = 0; renderReview(); });
  const pv = $('#rv-prev'); if (pv) pv.onclick = () => { reviewOffset--; renderReview(); };
  const nx = $('#rv-next'); if (nx && reviewOffset < 0) nx.onclick = () => { reviewOffset++; renderReview(); };
}

/* 訓練頻率熱力圖：週→日條、月→日曆、年/全部→月柱 */
function renderHeatmap(type, rng, ws) {
  const perDay = {};
  for (const w of ws) {
    let s = 0; for (const ex of w.exercises || []) s += (ex.sets || []).length;
    perDay[w.date] = (perDay[w.date] || 0) + s;
  }
  const maxSets = Math.max(1, ...Object.values(perDay));
  const cellColor = v => v > 0 ? `background:rgba(255,90,60,${(0.28 + 0.62 * Math.min(1, v / maxSets)).toFixed(2)})` : 'background:var(--bg-elev2)';
  const wd = ['一', '二', '三', '四', '五', '六', '日'];

  if (type === 'week') {
    const start = new Date(rng.start + 'T00:00:00');
    let cells = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const iso = isoLocal(d); const v = perDay[iso] || 0;
      cells += `<div style="flex:1;text-align:center"><div class="faint" style="font-size:11px;margin-bottom:4px">${wd[i]}</div>
        <div style="height:44px;border-radius:8px;${cellColor(v)};display:flex;align-items:center;justify-content:center;font-size:13px;color:#fff;font-weight:700">${v || ''}</div>
        <div class="faint" style="font-size:10px;margin-top:3px">${d.getMonth() + 1}/${d.getDate()}</div></div>`;
    }
    return `<div class="row" style="gap:6px;align-items:flex-end">${cells}</div>
      <div class="faint" style="font-size:11px;text-align:center;margin-top:10px">格內數字＝當天完成組數</div>`;
  }
  if (type === 'month') {
    const first = new Date(rng.start + 'T00:00:00');
    const y = first.getFullYear(), m = first.getMonth();
    const daysIn = new Date(y, m + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7;
    let head = wd.map(d => `<div class="faint" style="font-size:10px;text-align:center">${d}</div>`).join('');
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<div></div>';
    for (let day = 1; day <= daysIn; day++) {
      const iso = isoLocal(new Date(y, m, day)); const v = perDay[iso] || 0;
      cells += `<div style="aspect-ratio:1;border-radius:6px;${cellColor(v)};display:flex;align-items:center;justify-content:center;font-size:11px;color:${v > 0 ? '#fff' : 'var(--text-faint)'}">${day}</div>`;
    }
    return `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px">${head}${cells}</div>`;
  }
  // year / all → 月柱狀圖
  const perMonth = {};
  for (const w of ws) { const k = w.date.slice(0, 7); perMonth[k] = (perMonth[k] || 0) + 1; }
  let months = [];
  if (type === 'year') {
    const y = rng.start.slice(0, 4);
    for (let mm = 1; mm <= 12; mm++) { const k = `${y}-${String(mm).padStart(2, '0')}`; months.push([mm + '月', perMonth[k] || 0]); }
  } else {
    const keys = Object.keys(perMonth).sort();
    if (!keys.length) return '<div class="chart-empty">無資料</div>';
    months = keys.map(k => [k.slice(2).replace('-', '/'), perMonth[k]]);
  }
  const mx = Math.max(1, ...months.map(m => m[1]));
  return `<div class="row" style="gap:4px;align-items:flex-end;height:130px">${months.map(([lbl, v]) => `
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">
      <div style="font-size:10px;color:var(--text-dim);margin-bottom:2px">${v || ''}</div>
      <div style="width:100%;border-radius:4px 4px 0 0;background:${v > 0 ? 'var(--accent)' : 'var(--bg-elev2)'};height:${Math.max(3, Math.round(v / mx * 96))}px"></div>
      <div class="faint" style="font-size:9px;margin-top:4px;white-space:nowrap">${lbl}</div></div>`).join('')}</div>
    <div class="faint" style="font-size:11px;text-align:center;margin-top:8px">柱高＝當月訓練場次</div>`;
}

/* ============================================================
   共用 UI：Sheet / 圖表 / 空狀態
   ============================================================ */
function openSheet(html, onMount, onClose) {
  closeSheet();
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="sheet"><div class="grip"></div><div class="sheet-content">${html}</div></div>`;
  $('#modal-root').appendChild(overlay);
  const sheet = $('.sheet-content', overlay);
  overlay._onClose = onClose;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeSheet(); });
  if (onMount) onMount(sheet);
  document.body.style.overflow = 'hidden';
}
function closeSheet() {
  const o = $('#modal-root .overlay');
  if (o) { if (o._onClose) o._onClose(); o.remove(); }
  document.body.style.overflow = '';
}

function emptyBox(icon, title, sub) {
  return `<div class="empty"><div class="big">${icon}</div><div style="font-size:16px;font-weight:600;color:var(--text-dim)">${title}</div><div style="font-size:13px;margin-top:4px">${sub || ''}</div></div>`;
}

/* 簡易 SVG 折線圖 */
function sparkline(values, color = '#f5c451') {
  if (!values || values.length < 2) return '';
  const w = 320, h = 90, pad = 8;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const step = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return [x, y];
  });
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)} ${h - pad} L ${pad} ${h - pad} Z`;
  const gid = 'g' + Math.random().toString(36).slice(2, 7);
  return `
    <svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${color}" stop-opacity="0.28"/>
        <stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      <path d="${area}" fill="url(#${gid})"/>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5" fill="${color}"/>`).join('')}
    </svg>`;
}

/* ============================================================
   省思 Reflect — 每日書寫編輯器（自由文字 + 可插入的互動省思格式）
   ============================================================ */
let _rfScrollHandler = null;      // 掛在 window 上的捲動監聽（同步頂部主題高亮）
let _rfSaveTimer = null;

function rfNewText() { return { id: 'b' + uid(), type: 'text', text: '' }; }
function rfNewReflect() {
  return {
    id: 'b' + uid(), type: 'reflect',
    rows: DB.reflect.aspects.map(a => ({ aspectId: a.id, title: a.title, prompt: a.prompt, text: '' })),
  };
}
/* 把舊版 {notes:{aid:text}} 資料轉成一個「省思格式」區塊 */
function rfMigrate(e) {
  if (!e || e.blocks) return e;
  const rows = DB.reflect.aspects.map(a => ({ aspectId: a.id, title: a.title, prompt: a.prompt, text: (e.notes && e.notes[a.id]) || '' }));
  e.blocks = [{ id: 'b' + uid(), type: 'reflect', rows }];
  delete e.notes;
  return e;
}
function rfEntry(date, create) {
  let e = DB.reflect.entries.find(x => x.date === date);
  if (e) return rfMigrate(e);
  if (create) { e = { date, blocks: [rfNewText()], updated: Date.now() }; DB.reflect.entries.push(e); }
  return e;
}
function rfSaveSoon() {
  clearTimeout(_rfSaveTimer);
  _rfSaveTimer = setTimeout(saveDB, 400);
}
function rfFilledCount(e) {
  if (!e || !e.blocks) return 0;
  let n = 0;
  e.blocks.forEach(b => {
    if (b.type === 'text') { if (b.text && b.text.trim()) n++; }
    else if (b.type === 'reflect') (b.rows || []).forEach(r => { if (r.text && r.text.trim()) n++; });
  });
  return n;
}

function renderReflect() {
  if (_rfScrollHandler) { window.removeEventListener('scroll', _rfScrollHandler); _rfScrollHandler = null; }

  const isToday = REFLECT_DATE === todayISO();
  // 今天一開啟就給一個可立即打字的段落（未輸入前不會存檔，不留空白紀錄）
  const entry = rfEntry(REFLECT_DATE, isToday);
  const blocks = entry ? entry.blocks : [];

  // 頂部主題：彙整文件裡所有「省思格式」區塊的列
  const topics = [];
  blocks.forEach(b => { if (b.type === 'reflect') (b.rows || []).forEach(r => topics.push({ id: `rfrow-${b.id}-${r.aspectId}`, title: r.title })); });

  const timeStr = entry && entry.updated
    ? new Date(entry.updated).toLocaleTimeString('zh-Hant', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '';
  const dateLine = `${fmtDate(REFLECT_DATE)}${isToday ? ' · 今天' : ''}${timeStr ? ' · ' + timeStr : ''}`;

  const history = [...DB.reflect.entries]
    .filter(e => rfFilledCount(rfMigrate(e)) > 0)
    .sort((a, b) => b.date.localeCompare(a.date));

  view.innerHTML = `
    <div class="page-head"><div><h1>省思</h1><div class="sub">自由書寫 · 隨手插入省思格式</div></div>
      ${isToday ? '' : `<button class="btn ghost sm" id="rf-today">回到今天</button>`}</div>

    ${topics.length ? `<div class="rf-strip" id="rf-strip">
      ${topics.map(t => `<button class="rf-tab" data-target="${t.id}">${esc(t.title)}</button>`).join('')}
    </div>` : ''}

    <div class="rf-datebar">${dateLine}</div>

    <div class="rf-doc" id="rf-doc">
      ${blocks.length ? blocks.map(renderBlock).join('')
        : emptyBox('🪞', '空白的一天', '在下面開始打字，或插入省思格式')}
    </div>

    <div class="rf-insert">
      <button class="chip" id="ins-text">＋ 文字段落</button>
      <button class="chip" id="ins-reflect">＋ 省思格式</button>
      <button class="chip" id="ins-manage">⚙︎ 面向</button>
    </div>

    ${history.length ? `
      <div class="section-title">歷史回顧</div>
      ${history.slice(0, 30).map(e => `
        <div class="li rf-hist${e.date === REFLECT_DATE ? ' on' : ''}" data-date="${e.date}">
          <div class="badge">🪞</div>
          <div class="grow"><b>${fmtDate(e.date)}</b>
            <div class="faint" style="font-size:12px">${rfFilledCount(e)} 則 · ${esc(rfSnippet(e))}</div></div>
          <button class="btn sm danger" data-rfdel="${e.date}">✕</button>
        </div>`).join('')}` : ''}
  `;

  // 自動長高 + 即時儲存（文字段落與省思格式的每一格）
  $$('.rf-text, .rf-cell', view).forEach(ta => {
    autoGrowTA(ta);
    ta.addEventListener('input', () => {
      autoGrowTA(ta);
      const e = rfEntry(REFLECT_DATE, true);
      const blk = e.blocks.find(b => b.id === ta.dataset.bid);
      if (!blk) return;
      if (blk.type === 'text') blk.text = ta.value;
      else { const row = (blk.rows || []).find(r => r.aspectId === ta.dataset.aid); if (row) row.text = ta.value; }
      e.updated = Date.now();
      rfSaveSoon();
    });
  });

  // 頂部主題 → 捲到對應列並聚焦（點上方自動跳到下方編輯區）
  $$('.rf-tab', view).forEach(t => t.addEventListener('click', () => {
    const el = document.getElementById(t.dataset.target);
    if (!el) return;
    const y = window.scrollY + el.getBoundingClientRect().top - window.innerHeight * 0.24;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    const ta = $('.rf-cell', el);
    if (ta) setTimeout(() => ta.focus({ preventScroll: true }), 320);
  }));

  // 移除區塊
  $$('[data-delblock]', view).forEach(b => b.addEventListener('click', () => {
    const e = rfEntry(REFLECT_DATE, false); if (!e) return;
    const blk = e.blocks.find(x => x.id === b.dataset.delblock);
    const hasText = blk && (blk.type === 'text' ? blk.text.trim() : (blk.rows || []).some(r => r.text.trim()));
    if (hasText && !confirm('這個區塊有內容，確定移除？')) return;
    e.blocks = e.blocks.filter(x => x.id !== b.dataset.delblock);
    e.updated = Date.now(); saveDB(); renderReflect();
  }));

  // 插入區塊
  $('#ins-text', view).onclick = () => { const e = rfEntry(REFLECT_DATE, true); e.blocks.push(rfNewText()); e.updated = Date.now(); saveDB(); renderReflect(); rfFocusLast('.rf-text'); };
  $('#ins-reflect', view).onclick = () => { const e = rfEntry(REFLECT_DATE, true); e.blocks.push(rfNewReflect()); e.updated = Date.now(); saveDB(); renderReflect(); rfFocusLast('.rf-block.reflect', true); };
  $('#ins-manage', view).onclick = openReflectAspectSheet;

  // 歷史：回看 / 刪除
  $$('.rf-hist', view).forEach(row => row.addEventListener('click', e => {
    if (e.target.closest('[data-rfdel]')) return;
    REFLECT_DATE = row.dataset.date; renderReflect(); window.scrollTo({ top: 0 });
  }));
  $$('[data-rfdel]', view).forEach(b => b.addEventListener('click', () => {
    if (!confirm(`刪除 ${fmtDate(b.dataset.rfdel)} 這則？`)) return;
    DB.reflect.entries = DB.reflect.entries.filter(e => e.date !== b.dataset.rfdel);
    if (REFLECT_DATE === b.dataset.rfdel) REFLECT_DATE = todayISO();
    saveDB(); renderReflect();
  }));

  if (!isToday) $('#rf-today').onclick = () => { REFLECT_DATE = todayISO(); renderReflect(); window.scrollTo({ top: 0 }); };

  // 捲動時同步頂部主題高亮
  _rfScrollHandler = () => rfSyncActiveChip();
  window.addEventListener('scroll', _rfScrollHandler, { passive: true });
  requestAnimationFrame(rfSyncActiveChip);
}

function renderBlock(b) {
  if (b.type === 'text') {
    return `<div class="rf-block text" data-bid="${b.id}">
      <textarea class="rf-text" data-bid="${b.id}" rows="1" placeholder="寫點什麼…">${esc(b.text || '')}</textarea>
      <button class="rf-del" data-delblock="${b.id}" title="刪除段落">✕</button>
    </div>`;
  }
  return `<div class="rf-block reflect" data-bid="${b.id}">
    <div class="rf-block-head"><span>🪞 每日省思</span><button class="rf-del" data-delblock="${b.id}" title="移除區塊">✕</button></div>
    <div class="rf-table">
      ${(b.rows || []).map(r => `
        <div class="rf-row" id="rfrow-${b.id}-${r.aspectId}">
          <div class="rf-row-topic">${esc(r.title)}</div>
          <textarea class="rf-cell" data-bid="${b.id}" data-aid="${r.aspectId}" rows="1" placeholder="${esc(r.prompt || '')}">${esc(r.text || '')}</textarea>
        </div>`).join('')}
    </div>
  </div>`;
}

function rfFocusLast(sel, scrollOnly) {
  const els = $$(sel, view); const el = els[els.length - 1]; if (!el) return;
  const y = window.scrollY + el.getBoundingClientRect().top - window.innerHeight * 0.30;
  window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  if (!scrollOnly) { const ta = el.matches('textarea') ? el : $('textarea', el); if (ta) setTimeout(() => ta.focus({ preventScroll: true }), 320); }
}

function rfSnippet(e) {
  let s = '';
  for (const b of (e.blocks || [])) {
    if (b.type === 'text' && b.text && b.text.trim()) { s = b.text; break; }
    if (b.type === 'reflect') { const r = (b.rows || []).find(r => r.text && r.text.trim()); if (r) { s = r.text; break; } }
  }
  s = s.trim().replace(/\s+/g, ' ');
  return s.length > 20 ? s.slice(0, 20) + '…' : s;
}

function autoGrowTA(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

// 捲動時，讓最靠近焦點線的主題列對應的頂部 tab 高亮
function rfSyncActiveChip() {
  if (CURRENT !== 'reflect') return;
  const rows = $$('.rf-row', view); if (!rows.length) return;
  const focal = window.innerHeight * 0.32;
  let best = null, bestD = Infinity;
  rows.forEach(r => { const bb = r.getBoundingClientRect(); const c = bb.top + bb.height / 2; const d = Math.abs(c - focal); if (d < bestD) { bestD = d; best = r; } });
  if (best) $$('.rf-tab', view).forEach(t => t.classList.toggle('on', t.dataset.target === best.id));
}

/* 管理面向：新增 / 改標題 / 改問題 / 刪除 */
function openReflectAspectSheet() {
  const draft = DB.reflect.aspects.map(a => ({ ...a }));
  const body = () => `
    <div class="sheet-head"><h2>管理面向</h2></div>
    <div class="muted" style="font-size:13px;margin:0 0 12px">這些是每天都會出現的省思項目與引導問題。</div>
    <div id="rf-asp-list">
      ${draft.map((a, i) => `
        <div class="rf-asp-row" data-i="${i}">
          <div class="rf-asp-top">
            <input class="rf-asp-title" data-i="${i}" value="${esc(a.title)}" placeholder="面向名稱" />
            <button class="btn sm danger" data-del="${i}">✕</button>
          </div>
          <textarea class="rf-asp-prompt" data-i="${i}" rows="2" placeholder="引導問題（選填）">${esc(a.prompt || '')}</textarea>
        </div>`).join('')}
    </div>
    <button class="btn ghost block sm" id="rf-asp-add" style="margin-top:8px">＋ 新增面向</button>
    <button class="btn primary block" id="rf-asp-save" style="margin-top:14px">儲存</button>
  `;
  openSheet(body(), sheet => {
    function wire() {
      $$('.rf-asp-title', sheet).forEach(inp => inp.oninput = () => { draft[+inp.dataset.i].title = inp.value; });
      $$('.rf-asp-prompt', sheet).forEach(inp => inp.oninput = () => { draft[+inp.dataset.i].prompt = inp.value; });
      $$('[data-del]', sheet).forEach(b => b.onclick = () => { draft.splice(+b.dataset.del, 1); rerender(); });
      $('#rf-asp-add', sheet).onclick = () => { draft.push({ id: 'rf_' + uid(), title: '', prompt: '' }); rerender(); };
      $('#rf-asp-save', sheet).onclick = () => {
        const clean = draft.filter(a => a.title.trim());
        DB.reflect.aspects = clean.map(a => ({ id: a.id, title: a.title.trim(), prompt: (a.prompt || '').trim() }));
        saveDB(); closeSheet(); renderReflect(); toast('已更新面向');
      };
    }
    function rerender() { sheet.innerHTML = body(); wire(); }
    wire();
  });
}

/* ============================================================
   啟動
   ============================================================ */
const RENDERERS = { home: renderHome, log: renderLog, skills: renderSkills, pr: renderPR, body: renderBody, review: renderReview, reflect: renderReflect };
go('home');

/* Service Worker（離線 + 加到主畫面）
   本機開發（localhost）不註冊，並清掉殘留的 SW，避免改 CSS 被舊快取卡住；
   正式部署的網址才啟用離線快取。 */
(() => {
  if (!('serviceWorker' in navigator)) return;
  const isDev = ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);
  if (isDev) {
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
    return;
  }
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();

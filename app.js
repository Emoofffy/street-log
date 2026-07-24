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

function seedDB() {
  return {
    version: 1,
    profile: { name: '', unit: 'kg' },
    workouts: [],       // {id,date,name,tags:[],exercises:[{name,type,sets:[{reps,weight,time,done}],note}],note}
    skills: [],         // {id,key,icon,name,levels:[],current,note,updated}
    prs: [],            // {id,name,type:'reps'|'time'|'weight',history:[{date,value,note}]}
    body: [],           // {id,date,weight,bodyfat,notes,measures:{}}
    templates: [],      // {id,name,day,icon,exercises:[{name,type,sets:[{reps,weight,time}]}]}
    program: [],        // (已停用，保留向後相容)
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
  const w = DB.workouts;
  const total = w.length;
  const now = new Date();
  const weekAgo = new Date(now - 6 * 86400000).toISOString().slice(0, 10);
  const thisWeek = w.filter(x => x.date >= weekAgo).length;
  const streak = calcStreak();
  const volume = w.filter(x => x.date >= weekAgo).reduce((s, x) => s + workoutVolume(x), 0);

  const skillsInProgress = DB.skills.filter(s => s.current < s.levels.length - 1).length;
  const last = w[0];

  view.innerHTML = `
    <div class="page-head">
      <div>
        <h1>街健日誌</h1>
        <div class="sub">${greeting()}${DB.profile.name ? '，' + esc(DB.profile.name) : ''} 💪</div>
      </div>
      <button class="btn icon ghost" id="btn-settings" aria-label="設定">⚙️</button>
    </div>

    <div class="stat-grid">
      <div class="stat"><div class="num accent">${streak}</div><div class="lbl">連續訓練天數 🔥</div></div>
      <div class="stat"><div class="num">${thisWeek}</div><div class="lbl">本週訓練次數</div></div>
      <div class="stat"><div class="num green">${total}</div><div class="lbl">累積訓練場次</div></div>
      <div class="stat"><div class="num blue">${Math.round(volume).toLocaleString()}</div><div class="lbl">本週總量 (${DB.profile.unit})</div></div>
    </div>

    <button class="btn primary block" id="quick-start" style="margin:4px 0 6px">＋ 開始今天的訓練</button>

    ${renderWeekPlan()}

    <div class="section-title">最近訓練</div>
    ${last ? workoutCard(last) : emptyBox('🏋️', '還沒有訓練紀錄', '點上面按鈕記錄第一次')}

    <div class="section-title">技能進度</div>
    ${DB.skills.length
      ? DB.skills.slice(0, 3).map(skillMiniCard).join('')
      : `<div class="card tap" id="add-first-skill"><div class="row between"><div><h3>🎯 選擇你要練的技能</h3><div class="muted" style="font-size:13px">前水平、俄挺、國旗、Muscle-up…</div></div><span style="font-size:22px">＋</span></div></div>`}
    ${DB.skills.length ? `<button class="btn ghost block sm" id="more-skills">查看全部技能 →</button>` : ''}

    <div class="section-title">本週亮點</div>
    ${recentPRcard()}
  `;

  $('#btn-settings').onclick = openSettings;
  $('#quick-start').onclick = () => openStartChooser();
  const af = $('#add-first-skill'); if (af) af.onclick = () => go('skills');
  const ms = $('#more-skills'); if (ms) ms.onclick = () => go('skills');
  const sp = $('#setup-plan'); if (sp) sp.onclick = () => go('body');
  $$('.wk-start').forEach(b => b.onclick = () => openWorkoutSheet(null, b.dataset.tpl));
  bindWorkoutCards();
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
   啟動
   ============================================================ */
const RENDERERS = { home: renderHome, log: renderLog, skills: renderSkills, pr: renderPR, body: renderBody };
go('home');

/* Service Worker（離線 + 加到主畫面） */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

/* ============================================================
   備忘錄 Note — 自由書寫（仿 iOS 備忘錄的原生介面感）
   不佔分頁：列表是首頁下方的一個區塊，Journal 卡直接進今天那則的編輯頁。
   自成一檔，對外只露 window.NOTE。
   原生感的三個支點：整頁就是一張紙（點空白處即接著寫）、鍵盤上方浮格式列、
   自動存檔（無存檔鈕）。
   ============================================================ */

'use strict';

(function () {

/* ============================================================
   資料層 — DB.notes: [{id, html, created, updated}]
   （新欄位；舊資料沒有這欄時 all() 就地補上空陣列，不動既有資料）
   ============================================================ */
function all() {
  if (!Array.isArray(DB.notes)) DB.notes = [];
  return DB.notes;
}
function byId(id) { return all().find(n => n.id === id); }
function sorted() { return [...all()].sort((a, b) => b.updated - a.updated); }

/* date 只有從首頁 Journal 卡建立的那則才有（＝那天的日記），用來認出「今天這則」*/
function create(date) {
  const n = { id: 'n' + uid(), html: '', created: Date.now(), updated: Date.now() };
  if (date) n.date = date;
  all().unshift(n);
  saveDB();
  return n;
}
function remove(id) {
  DB.notes = all().filter(n => n.id !== id);
  saveDB();
}

/* 存進 localStorage 的是 HTML；只放行這些標籤與 class，
   貼上的外部內容、舊資料都先過這關（避免存進奇怪的標記）。 */
const OK_TAG = new Set(['DIV', 'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'H2', 'SPAN']);
/* blank／empty／none／on 是每次重算的衍生狀態（見 markReflect），刻意不留在存檔裡 */
const OK_CLASS = new Set(['nt-check', 'nt-box', 'done', 'nt-rf', 'nt-rf-row', 'nt-rf-t', 'nt-rf-a']);
function clean(html) {
  const d = document.createElement('div');
  d.innerHTML = String(html || '');
  [...d.querySelectorAll('*')].forEach(el => {
    if (!OK_TAG.has(el.tagName)) { el.replaceWith(...el.childNodes); return; }
    const cls = [...el.classList].filter(c => OK_CLASS.has(c));
    const ph = el.getAttribute('data-ph');        // 省思格式的引導問題，跟著存
    [...el.attributes].forEach(a => el.removeAttribute(a.name));
    if (cls.length) el.className = cls.join(' ');
    if (ph != null && cls.includes('nt-rf-a')) el.setAttribute('data-ph', ph);
    if (el.classList.contains('nt-box')) el.setAttribute('contenteditable', 'false');
  });
  wrapLegacyReflect(d);
  // 散在最外層的文字包成區塊：存起來的每一行都是區塊，重新打開才吃得到「第一行＝標題」
  [...d.childNodes].forEach(nd => {
    if (nd.nodeType !== 3) return;
    if (!nd.textContent.trim()) { nd.remove(); return; }
    const wrap = document.createElement('div');
    nd.replaceWith(wrap); wrap.appendChild(nd);
  });
  return d.innerHTML;
}

/* 舊版的省思格式是題目與作答格平鋪在文件裡，補上 .nt-rf-row／.nt-rf 兩層外框，
   收合成點列時才有「一列」與「一個範圍」可以操作。 */
function wrapLegacyReflect(d) {
  [...d.querySelectorAll('.nt-rf-t')].forEach(t => {
    if (t.parentElement && t.parentElement.classList.contains('nt-rf-row')) return;
    const a = t.nextElementSibling;
    const row = document.createElement('div');
    row.className = 'nt-rf-row';
    t.replaceWith(row);
    row.appendChild(t);
    if (a && a.classList.contains('nt-rf-a')) row.appendChild(a);
  });
  [...d.querySelectorAll('.nt-rf-row')].forEach(row => {
    if (row.parentElement && row.parentElement.classList.contains('nt-rf')) return;
    const prev = row.previousElementSibling;
    if (prev && prev.classList.contains('nt-rf')) { prev.appendChild(row); return; }
    const box = document.createElement('div');
    box.className = 'nt-rf';
    row.replaceWith(box);
    box.appendChild(row);
  });
}

/* 第一行＝標題，其餘接成摘要（與 iOS 備忘錄的列表一致）*/
function textLines(html) {
  const d = document.createElement('div');
  d.innerHTML = clean(html);
  d.querySelectorAll('.nt-box').forEach(b => b.remove());
  // 還沒作答的省思題目不算內容，免得摘要整排都是題目名
  d.querySelectorAll('.nt-rf-row').forEach(row => { if (!rowWritten(row)) row.remove(); });
  const out = [];
  const push = t => { t = String(t).replace(/\u00a0/g, ' ').trim(); if (t) out.push(t); };
  const walk = nodes => [...nodes].forEach(nd => {
    if (nd.nodeType === 3) push(nd.textContent);
    else if (nd.nodeName === 'UL' || nd.nodeName === 'OL'
      || (nd.classList && (nd.classList.contains('nt-rf') || nd.classList.contains('nt-rf-row')))) {
      walk(nd.childNodes);          // 省思是巢狀的，要走進去才拆得出一行一行
    } else push(nd.textContent);
  });
  walk(d.childNodes);
  return out;
}
const title = n => textLines(n.html)[0] || '';
const preview = n => textLines(n.html).slice(1).join(' ');
/* 插了省思格式但還沒作答，也算「有東西」——離開不會被當空白丟掉 */
const isBlank = n => !textLines(n.html).length && !/nt-rf-t|nt-check/.test(n.html || '');

/* 時間：今天顯示時刻、昨天顯示「昨天」、今年顯示月日、再舊顯示年月日 */
function stamp(ms) {
  const d = new Date(ms), now = new Date();
  const hm = d.toLocaleTimeString('zh-Hant', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return hm;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return '昨天';
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
function stampFull(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 `
    + d.toLocaleTimeString('zh-Hant', { hour: 'numeric', minute: '2-digit' });
}

/* ============================================================
   狀態與進出 — 只有一個畫面（編輯頁）；列表住在首頁區塊
   進入編輯頁時 body 加 .nt-on（藏底部導覽、換底色），離開就回首頁
   ============================================================ */
let CUR = null;             // 正在編輯的備忘錄 id
let EDITING = false;        // 首頁區塊的「編輯」模式（露出刪除鈕，給不方便左滑的裝置）
let EXPAND = false;         // 首頁區塊是否展開全部（預設只列最近幾則）
let saveTimer = null;
let vvHandler = null;
let selHandler = null;
let openBox = null;         // 目前展開中的省思區塊（換塊時要把當下那題捲回視線內）

const SHOW_N = 4;           // 首頁區塊預設列幾則

function teardown() {
  if (selHandler) { document.removeEventListener('selectionchange', selHandler); selHandler = null; }
  if (vvHandler && window.visualViewport) {
    window.visualViewport.removeEventListener('resize', vvHandler);
    window.visualViewport.removeEventListener('scroll', vvHandler);
    vvHandler = null;
  }
}

/* 開一則來編輯（沒給 id 就開今天那則，沒有就建一則今天的）*/
function open(id) {
  CUR = id || todayNote().id;
  document.body.classList.add('nt-on');
  renderEdit(document.getElementById('view'));
}
function close() {
  commit();
  const n = byId(CUR);
  if (n && isBlank(n)) remove(n.id);     // 沒寫東西就離開＝不留空白備忘錄
  teardown();
  CUR = null;
  document.body.classList.remove('nt-on', 'nt-kb');
  go('home');
}

/* 首頁 Journal 卡進來的是「今天這一則」：同一天再點是續寫，不會每次開新的 */
function todayNote() {
  const d = todayISO();
  return all().find(n => n.date === d) || create(d);
}

/* ============================================================
   首頁區塊 — 備忘錄列表住這裡（HTML 由 app.js §首頁 Journal 貼進去）
   ============================================================ */
function homeSection() {
  const list = sorted();
  const shown = EXPAND ? list : list.slice(0, SHOW_N);
  return `
    <div class="nt-sec${EDITING ? ' editing' : ''}" id="nt-sec">
      <div class="nt-sec-head">
        <span class="nt-sec-t">備忘錄</span>
        <span class="nt-sec-act">
          ${list.length ? `<button class="nt-sec-b" id="nt-edit">${EDITING ? '完成' : '編輯'}</button>` : ''}
          <button class="nt-sec-b ico" id="nt-new" aria-label="新增備忘錄">${iconCompose()}</button>
        </span>
      </div>
      <div id="nt-result">${rowsHTML(shown)}</div>
      ${list.length > SHOW_N
        ? `<button class="nt-more" id="nt-more">${EXPAND ? '收起' : `顯示全部 ${list.length} 則`}</button>`
        : ''}
    </div>`;
}

/* 首頁重畫完呼叫一次，把區塊裡的事件接上 */
function wireHome() {
  const sec = document.getElementById('nt-sec');
  if (!sec) return;
  document.getElementById('nt-new').onclick = () => open(create().id);
  const eb = document.getElementById('nt-edit');
  if (eb) eb.onclick = () => { EDITING = !EDITING; paintSection(); };
  const mb = document.getElementById('nt-more');
  if (mb) mb.onclick = () => { EXPAND = !EXPAND; paintSection(); };
  wireRows();
}
function paintSection() {
  const sec = document.getElementById('nt-sec');
  if (!sec) return;
  sec.outerHTML = homeSection();
  wireHome();
}

function rowsHTML(list) {
  if (!list.length) return `<div class="nt-blank">還沒有備忘錄</div>`;
  return `<div class="nt-rows">
    ${list.map(n => `
      <div class="nt-row" data-id="${n.id}">
        <button class="nt-row-del" data-del="${n.id}">刪除</button>
        <div class="nt-row-in">
          <button class="nt-row-minus" data-del="${n.id}" aria-label="刪除">−</button>
          <div class="nt-row-txt">
            <div class="nt-row-t">${esc(title(n) || '新備忘錄')}</div>
            <div class="nt-row-s"><span class="nt-row-d">${stamp(n.updated)}</span>${esc(preview(n) || '沒有其他文字')}</div>
          </div>
        </div>
      </div>`).join('')}
  </div>`;
}

function wireRows() {
  [...document.querySelectorAll('.nt-row')].forEach(row => {
    const swipe = swipeRow(row);
    row.addEventListener('click', e => {
      if (e.target.closest('[data-del]')) return;
      if (swipe.open()) { swipe.reset(); return; }   // 滑開時第一下先收回
      if (EDITING) return;
      open(row.dataset.id);
    });
  });
  [...document.querySelectorAll('[data-del]')].forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const n = byId(b.dataset.del);
    if (n && !isBlank(n) && !confirm(`刪除「${title(n) || '新備忘錄'}」？`)) return;
    remove(b.dataset.del);
    renderHome();                  // 刪掉的可能是今天那則，Journal 卡要一起更新
  }));
}

/* 左滑露出刪除鈕；直向捲動時不攔截 */
function swipeRow(row) {
  const inner = row.querySelector('.nt-row-in');
  const W = 86;
  let x0 = 0, y0 = 0, live = false, decided = false, opened = false;

  row.addEventListener('touchstart', e => {
    const t = e.touches[0];
    x0 = t.clientX; y0 = t.clientY; live = true; decided = false;
    inner.style.transition = 'none';
  }, { passive: true });

  row.addEventListener('touchmove', e => {
    if (!live) return;
    const t = e.touches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    if (!decided) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      decided = true;
      if (Math.abs(dy) > Math.abs(dx)) { live = false; return; }
    }
    inner.style.transform = `translateX(${Math.min(0, Math.max(-W - 24, (opened ? -W : 0) + dx))}px)`;
  }, { passive: true });

  row.addEventListener('touchend', e => {
    if (!live) return;
    live = false;
    const dx = e.changedTouches[0].clientX - x0;
    opened = ((opened ? -W : 0) + dx) < -W / 2;
    snap();
  });

  function snap() {
    inner.style.transition = 'transform .22s cubic-bezier(.32,.72,0,1)';
    inner.style.transform = `translateX(${opened ? -W : 0}px)`;
    row.classList.toggle('swiped', opened);
  }
  return { open: () => opened, reset: () => { opened = false; snap(); } };
}

/* ============================================================
   編輯頁 — 整頁一張紙：第一行自動變標題、點空白處續寫、鍵盤上方格式列
   ============================================================ */
function renderEdit(v) {
  const n = byId(CUR);
  if (!n) { CUR = null; return go('home'); }

  v.innerHTML = `
    <div class="nt nt-edit-page nt-in-fwd">
      <div class="nt-nav">
        <button class="nt-btn back" id="nt-back">${chevL()}首頁</button>
        <div class="nt-nav-t"></div>
        <button class="nt-btn r done" id="nt-done">完成</button>
      </div>

      <div class="nt-strip" id="nt-strip"></div>

      <div class="nt-scroll" id="nt-scroll">
        <div class="nt-doc">
          <div class="nt-stamp">${stampFull(n.updated)}</div>
          <div class="nt-body" id="nt-body" contenteditable="true"
               spellcheck="false" autocorrect="off" autocapitalize="sentences"
               data-ph="開始輸入…">${clean(n.html)}</div>
          <div class="nt-fill" id="nt-fill"></div>
        </div>
      </div>

      <div class="nt-bar" id="nt-bar">
        <button data-cmd="title" class="aa">Aa</button>
        <button data-cmd="check">${iconCheck()}</button>
        <button data-cmd="bullet">${iconBullet()}</button>
        <button data-cmd="bold" class="bold">B</button>
        <button data-cmd="reflect" class="txt">省思</button>
        <span class="nt-bar-gap"></span>
        <button data-cmd="hide">${iconKeyboard()}</button>
      </div>
    </div>`;

  const body = document.getElementById('nt-body');
  normalize(body);

  document.getElementById('nt-back').onclick = close;
  document.getElementById('nt-done').onclick = () => body.blur();

  // 打字：自動長高由瀏覽器負責，這裡只管存檔、空白提示與主題列
  let tops = 0;
  body.addEventListener('input', () => {
    normalize(body);
    const n2 = body.querySelectorAll('.nt-rf-t').length;
    if (n2 !== tops) { tops = n2; paintStrip(body); }   // 題目增減才重畫主題列
    else markFilled(body);
    save();
  });

  // 游標移到哪一題，題目與主題列跟著亮
  selHandler = () => { if (document.activeElement === body) syncActive(body); };
  document.addEventListener('selectionchange', selHandler);

  // 焦點：有焦點才顯示「完成」與格式列
  body.addEventListener('focus', () => document.body.classList.add('nt-kb'));
  body.addEventListener('blur', () => {
    document.body.classList.remove('nt-kb');
    closeReflect(body);      // 離開編輯＝省思收合
    commit();
  });

  // 點文字下方的空白 → 游標接到最後那個普通段落（不會掉進省思裡面）
  const toEnd = e => { e.preventDefault(); normalize(body); caretEnd(body); };
  document.getElementById('nt-fill').addEventListener('mousedown', toEnd);
  document.getElementById('nt-fill').addEventListener('touchend', toEnd);

  // 勾選框：點一下打勾
  body.addEventListener('click', e => {
    const bx = e.target.closest('.nt-box');
    if (!bx) return;
    bx.parentNode.classList.toggle('done');
    save(true);
  });

  // Enter：勾選項接下一個勾選項（空的那項再按一次＝結束清單）；
  //        省思作答格接一個普通段落，不會複製出第二個題目
  body.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    const b = curBlock(body);
    if (!b) return;
    if (b.classList.contains('nt-check')) {
      e.preventDefault();
      if (!b.textContent.trim()) { unCheck(b); return; }
      const d = document.createElement('div');
      d.className = 'nt-check';
      d.appendChild(newBox());
      d.appendChild(document.createElement('br'));
      b.after(d);
      caretIn(d, 1);
      save();
    } else if (b.classList.contains('nt-rf-a')) {
      e.preventDefault();
      const d = document.createElement('div');
      d.appendChild(document.createElement('br'));
      b.after(d);
      caretIn(d, 0);
      save();
    } else if (b.closest('.nt-rf-row') && !b.textContent.trim()) {
      // 在題目底下的空白段落再按一次 Enter＝離開省思，接到整塊後面繼續寫
      e.preventDefault();
      const box = b.closest('.nt-rf');
      b.remove();
      normalize(body);
      const after = box.nextElementSibling;
      if (after) { closeReflect(body); caretIn(after, 0); }
      save();
    }
  });

  // 貼上一律轉純文字（保留原生的 undo/redo）
  body.addEventListener('paste', e => {
    e.preventDefault();
    const t = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, t);
  });

  [...v.querySelectorAll('.nt-bar button')].forEach(b =>
    b.addEventListener('mousedown', e => e.preventDefault()));   // 按格式鈕不要失焦
  [...v.querySelectorAll('.nt-bar button')].forEach(b =>
    b.addEventListener('click', () => cmd(b.dataset.cmd, body)));

  edgeSwipe(v.querySelector('.nt-edit-page'), close);
  reflectTaps(body);
  bindReflectScroll(body);
  attachKeyboard();
  openBox = null;
  paintStrip(body);
  tops = body.querySelectorAll('.nt-rf-t').length;

  if (isBlank(n)) setTimeout(() => caretEnd(body), 120);          // 新建的備忘錄直接可以打字
}

/* 空文件先擺一個空區塊（游標才有地方站）；有內容時只切換佔位提示。
   不在這裡動既有節點——輸入法組字中改 DOM 會把注音／拼音打斷。 */
function normalize(body) {
  if (!body.childNodes.length) body.innerHTML = '<div><br></div>';
  padAroundReflect(body);
  body.classList.toggle('is-empty',
    !body.textContent.trim() && !body.querySelector('.nt-box, .nt-rf-t'));
  markReflect(body);
}

/* 省思是插進文件裡的一塊，不是文件的結尾：
   前後都保證有一個普通段落，游標才停得下來、上下都寫得了字。 */
function padAroundReflect(body) {
  const isRf = el => el && el.classList && el.classList.contains('nt-rf');
  body.querySelectorAll(':scope > .nt-rf').forEach(box => {
    if (!box.nextElementSibling || isRf(box.nextElementSibling)) box.after(emptyLine());
    if (!box.previousElementSibling || isRf(box.previousElementSibling)) box.before(emptyLine());
  });
}
function emptyLine() {
  const d = document.createElement('div');
  d.appendChild(document.createElement('br'));
  return d;
}

/* 這一題寫了東西沒有（題目名不算；在題目底下另起的段落也算）*/
function rowWritten(row) {
  const t = row.querySelector('.nt-rf-t');
  return row.textContent.trim().length > (t ? t.textContent.trim().length : 0);
}

/* 省思格式的衍生狀態（不進存檔，每次重算）：
   blank＝空的作答格要顯示引導問題；nt-off＝這一題（或整塊）還沒寫，收合時跳過。
   類名都帶 nt- 前綴，免得撞到 App 共用 UI 的 .empty 那類通用樣式。 */
function markReflect(root) {
  root.querySelectorAll('.nt-rf-a').forEach(a => a.classList.toggle('blank', !a.textContent.trim()));
  root.querySelectorAll('.nt-rf-row').forEach(row => row.classList.toggle('nt-off', !rowWritten(row)));
  root.querySelectorAll('.nt-rf').forEach(box =>
    box.classList.toggle('nt-off', !box.querySelector('.nt-rf-row:not(.nt-off)')));
}

function curBlock(body) {
  const s = getSelection();
  if (!s.rangeCount) return null;
  let el = s.getRangeAt(0).startContainer;
  if (el.nodeType === 3) el = el.parentNode;
  while (el && el !== body && !/^(DIV|P|H2|LI)$/.test(el.nodeName)) el = el.parentNode;
  return el && el !== body ? el : null;
}
function newBox() {
  const s = document.createElement('span');
  s.className = 'nt-box';
  s.setAttribute('contenteditable', 'false');
  return s;
}
function unCheck(b) {
  b.querySelectorAll('.nt-box').forEach(x => x.remove());
  b.classList.remove('nt-check', 'done');
}

function cmd(name, body) {
  body.focus();
  if (name === 'bold') document.execCommand('bold');
  else if (name === 'bullet') document.execCommand('insertUnorderedList');
  else if (name === 'title') {
    const b = curBlock(body);
    document.execCommand('formatBlock', false, b && b.nodeName === 'H2' ? 'div' : 'h2');
  } else if (name === 'check') {
    const b = curBlock(body);
    if (!b) return;
    if (b.classList.contains('nt-check')) unCheck(b);
    else { b.classList.add('nt-check'); b.insertBefore(newBox(), b.firstChild); }
  } else if (name === 'reflect') { insertReflect(body); return; }
  else if (name === 'hide') { body.blur(); return; }
  normalize(body);
  save(true);
}

/* ============================================================
   省思格式 — 把 §省思 的面向表（DB.reflect.aspects 是權威）整份插進來
   一個面向＝兩個相鄰區塊：.nt-rf-t 題目 ＋ .nt-rf-a 作答（空的時候顯示引導問題）
   面向要增刪改，去省思分頁的「⚙︎ 面向」，這裡永遠拿當下那份
   ============================================================ */
function aspects() {
  return (DB.reflect && DB.reflect.aspects) || [];
}

function insertReflect(body) {
  const list = aspects();
  if (!list.length) { toast('還沒有省思面向，先到省思分頁設定'); return; }
  const hold = document.createElement('div');
  hold.innerHTML = `<div class="nt-rf">${list.map(a =>
    `<div class="nt-rf-row nt-off">` +
      `<div class="nt-rf-t">${esc(a.title)}</div>` +
      `<div class="nt-rf-a blank" data-ph="${esc(a.prompt || '')}"></div>` +
    `</div>`).join('')}</div>`;
  const nodes = [...hold.childNodes];

  // 插在游標所在段落的後面——中間、開頭、結尾都行。
  // 游標若在另一塊省思裡，改插到那整塊後面，不會變成一塊包一塊。
  let at = curBlock(body);
  if (at && at.closest('.nt-rf')) at = at.closest('.nt-rf');
  if (at && at.parentElement === body) {
    let ref = at;
    nodes.forEach(n => { ref.after(n); ref = n; });
  } else {
    nodes.forEach(n => body.appendChild(n));
  }
  normalize(body);      // 前後補上可以打字的段落
  bindReflectScroll(body);
  paintStrip(body);
  focusBlock(body, body.querySelector('.nt-rf-a'));
  save(true);
}

/* 頂欄下方的主題列：文件裡有省思格式才出現，點一下跳到那一題 */
function paintStrip(body) {
  const page = document.querySelector('.nt-edit-page');
  const strip = document.getElementById('nt-strip');
  if (!page || !strip) return;
  const tops = [...body.querySelectorAll('.nt-rf-t')];
  page.classList.toggle('has-rf', tops.length > 0);
  strip.innerHTML = tops.map((t, i) => {
    const a = t.nextElementSibling;
    const filled = a && a.classList.contains('nt-rf-a') && a.textContent.trim();
    return `<button class="nt-tab${filled ? ' filled' : ''}" data-i="${i}">${esc(t.textContent)}</button>`;
  }).join('');
  [...strip.children].forEach(btn => {
    btn.addEventListener('mousedown', e => e.preventDefault());   // 點主題不要失焦
    btn.addEventListener('click', () => {
      const t = tops[+btn.dataset.i];
      const row = t.closest('.nt-rf-row'), box = row.closest('.nt-rf');
      focusBlock(body, t.nextElementSibling);
      scrollRowToTop(box, row, true);                  // 在小視窗裡捲過去
    });
  });
  syncActive(body);
}

/* 游標在哪，省思就開在哪：
   游標在某塊省思裡＝那塊展開，而且只留當下這一題（其餘靠上方主題列或上下滑動切換）；
   游標跑到省思以外的地方（或整個離開編輯）＝那塊自動收合成點列。 */
function syncActive(body) {
  const b = curBlock(body);
  const row = b && b.closest ? b.closest('.nt-rf-row') : null;
  const box = row ? row.closest('.nt-rf') : null;

  body.querySelectorAll('.on').forEach(x => x.classList.remove('on'));
  body.querySelectorAll('.nt-rf.open').forEach(x => {
    if (x !== box) { x.classList.remove('open'); x.removeAttribute('data-pos'); }
  });
  const strip = document.getElementById('nt-strip');
  if (strip) [...strip.children].forEach(x => x.classList.remove('on'));
  const page = document.querySelector('.nt-edit-page');
  if (page) page.classList.toggle('rf-open', !!box);

  if (!row) { openBox = null; return; }

  const first = !box.classList.contains('open');
  box.classList.add('open');
  markRow(body, box, row);

  // 剛展開：先把小視窗本身帶進視線，再把當下這題捲到視窗頂端
  if (openBox !== box || first) {
    openBox = box;
    box.scrollIntoView({ block: 'center', behavior: 'smooth' });
    requestAnimationFrame(() => scrollRowToTop(box, row, false));
  }
}

function closeReflect(body) {
  body.querySelectorAll('.on').forEach(x => x.classList.remove('on'));
  body.querySelectorAll('.nt-rf.open').forEach(x => { x.classList.remove('open'); x.removeAttribute('data-pos'); });
  const strip = document.getElementById('nt-strip');
  if (strip) [...strip.children].forEach(x => x.classList.remove('on'));
  const page = document.querySelector('.nt-edit-page');
  if (page) page.classList.remove('rf-open');
  openBox = null;
}

/* 黏在視窗頂端的「省思 n / N」標籤高度；styles.css 的 scroll-padding-top 與它同值 */
const RF_PAD = 34;

/* 把某一題捲到視窗頂端（只捲省思這個小視窗，不動整頁）
   用 offsetTop 而不是 getBoundingClientRect：整頁可能正在平滑捲動，量畫面座標會量到半路的值。
   （.nt-rf 有 position:relative，所以 offsetTop 就是相對這個視窗的位置）*/
function scrollRowToTop(box, row, smooth) {
  box.scrollTo({ top: Math.max(0, row.offsetTop - RF_PAD), behavior: smooth ? 'smooth' : 'auto' });
}

/* 展開後省思是一個會捲的小視窗：捲停下來時，最靠近頂端的那題變成「當下這題」，
   游標也跟著搬過去——不然打字會跑到已經捲出視野的上一題。
   （元素的 scroll 不冒泡、掛在祖先的捕獲階段也收不到，只能一塊一塊掛）*/
function bindReflectScroll(body) {
  body.querySelectorAll('.nt-rf').forEach(box => {
    if (box.__ntScroll) return;
    box.__ntScroll = true;
    let timer = null;
    box.addEventListener('scroll', () => {
      if (!box.classList.contains('open')) return;
      clearTimeout(timer);
      timer = setTimeout(() => settleRow(body, box), 140);
    }, { passive: true });
  });
}

function settleRow(body, box) {
  const rows = [...box.querySelectorAll('.nt-rf-row')];
  if (!rows.length) return;
  const line = box.scrollTop + RF_PAD;      // 視窗頂端（標籤底下）現在對到內容的哪個位置
  let best = rows[0], bd = Infinity;
  rows.forEach(r => {
    const d = Math.abs(r.offsetTop - line);
    if (d < bd) { bd = d; best = r; }
  });
  if (best.classList.contains('on')) return;
  const a = best.querySelector('.nt-rf-a');
  if (a && document.activeElement === body) caretIn(a, 0);   // 只搬游標，不再捲（會觸發 syncActive 更新高亮）
  else markRow(body, box, best);
}

/* 標記當下這一題：題目、作答格、上方主題列一起亮，並更新「n / N」 */
function markRow(body, box, row) {
  body.querySelectorAll('.on').forEach(x => x.classList.remove('on'));
  const strip = document.getElementById('nt-strip');
  if (strip) [...strip.children].forEach(x => x.classList.remove('on'));
  row.classList.add('on');
  row.querySelectorAll('.nt-rf-t, .nt-rf-a').forEach(x => x.classList.add('on'));
  const rows = [...box.querySelectorAll('.nt-rf-row')];
  box.setAttribute('data-pos', `${rows.indexOf(row) + 1} / ${rows.length}`);
  const i = [...body.querySelectorAll('.nt-rf-t')].indexOf(row.querySelector('.nt-rf-t'));
  const tab = strip && strip.children[i];
  if (tab) { tab.classList.add('on'); tab.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }
}

/* 整塊都還沒寫時收合後沒有列可以點，點標籤本身也能開 */
function reflectTaps(body) {
  body.addEventListener('click', e => {
    const box = e.target.closest ? e.target.closest('.nt-rf') : null;
    if (!box || box.classList.contains('open')) return;
    if (e.target.closest('.nt-rf-row')) return;      // 點在點列上，交給瀏覽器放游標
    focusBlock(body, box.querySelector('.nt-rf-a'));
  });
}

/* 只更新主題列上「已作答」的小點，不重畫整條（打字時每個字都會經過這裡）*/
function markFilled(body) {
  const strip = document.getElementById('nt-strip');
  if (!strip || !strip.children.length) return;
  [...body.querySelectorAll('.nt-rf-t')].forEach((t, i) => {
    const a = t.nextElementSibling, tab = strip.children[i];
    if (tab) tab.classList.toggle('filled', !!(a && a.classList.contains('nt-rf-a') && a.textContent.trim()));
  });
}

function focusBlock(body, el) {
  if (!el) return;
  body.focus();
  caretIn(el, 0);
  syncActive(body);
}

function caretEnd(el) {
  el.focus();
  // 收在最後一個普通段落裡；省思是一整塊，游標不該掉進它裡面
  const last = el.lastElementChild;
  const target = last && !last.classList.contains('nt-rf') ? last : el;
  const r = document.createRange();
  r.selectNodeContents(target);
  r.collapse(false);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
function caretIn(node, offset) {
  const r = document.createRange();
  r.setStart(node, offset); r.collapse(true);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}

/* 自動存檔：打字停 500ms 存一次，離開頁面時立刻存（沒有存檔鈕）*/
function commit() {
  clearTimeout(saveTimer); saveTimer = null;
  const body = document.getElementById('nt-body');
  const n = byId(CUR);
  if (!body || !n) return;
  const html = clean(body.innerHTML);
  if (html === n.html) return;
  n.html = html;
  n.updated = Date.now();
  saveDB();
}
function save(now) {
  clearTimeout(saveTimer);
  if (now) { commit(); return; }
  saveTimer = setTimeout(commit, 500);
}

/* 鍵盤上方浮著的格式列：用 visualViewport 量鍵盤高度，把列頂上去 */
function attachKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  vvHandler = () => {
    const bar = document.getElementById('nt-bar');
    if (!bar) return;
    const gap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    bar.style.transform = `translateY(${-gap}px)`;
  };
  vv.addEventListener('resize', vvHandler);
  vv.addEventListener('scroll', vvHandler);
  vvHandler();
}

/* 從左緣往右拖＝返回（跟系統的返回手勢同一個手感）*/
function edgeSwipe(page, onBack) {
  let x0 = 0, y0 = 0, live = false;
  page.addEventListener('touchstart', e => {
    const t = e.touches[0];
    live = t.clientX < 28; x0 = t.clientX; y0 = t.clientY;
    if (live) page.style.transition = 'none';
  }, { passive: true });
  page.addEventListener('touchmove', e => {
    if (!live) return;
    const t = e.touches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    if (Math.abs(dy) > Math.abs(dx) + 8) { live = false; page.style.transform = ''; return; }
    page.style.transform = `translateX(${Math.max(0, dx)}px)`;
  }, { passive: true });
  page.addEventListener('touchend', e => {
    if (!live) return;
    live = false;
    page.style.transition = 'transform .26s cubic-bezier(.32,.72,0,1)';
    if (e.changedTouches[0].clientX - x0 > 84) {
      page.style.transform = 'translateX(100%)';
      setTimeout(onBack, 180);
    } else page.style.transform = '';
  });
}

/* ============================================================
   圖示 — 內嵌 SVG（不外連、離線也在）
   ============================================================ */
const chevL = () => `<svg viewBox="0 0 12 20" width="11" height="18" aria-hidden="true"><path d="M10.5 1.5 2 10l8.5 8.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const iconCompose = () => `<svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true"><path d="M20.2 3.8a2 2 0 0 1 0 2.8l-9.6 9.6-3.6.8.8-3.6 9.6-9.6a2 2 0 0 1 2.8 0Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M18.5 12.5v6a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const iconCheck = () => `<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m8.2 12.2 2.6 2.6 5-5.4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const iconBullet = () => `<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><g fill="currentColor"><circle cx="5" cy="7" r="1.7"/><circle cx="5" cy="12.5" r="1.7"/><circle cx="5" cy="18" r="1.7"/></g><g stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M10 7h9M10 12.5h9M10 18h9"/></g></svg>`;
const iconKeyboard = () => `<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><rect x="2.6" y="4.5" width="18.8" height="10.6" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.7"/><g fill="currentColor"><rect x="5.6" y="7.3" width="2" height="2" rx=".5"/><rect x="9.2" y="7.3" width="2" height="2" rx=".5"/><rect x="12.8" y="7.3" width="2" height="2" rx=".5"/><rect x="16.4" y="7.3" width="2" height="2" rx=".5"/><rect x="7.6" y="10.9" width="8.8" height="2" rx=".7"/></g><path d="m9.4 18 2.6 2.6L14.6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/* ============================================================
   給首頁 Journal 卡用的摘要 — 卡代表「今天這一則」
   ============================================================ */
function homeSummary() {
  const n = all().find(x => x.date === todayISO());
  if (!n || isBlank(n)) return { written: false };
  const lines = textLines(n.html);
  return {
    written: true,
    first: lines[0],
    chars: lines.join('').length,
    when: stamp(n.updated),
  };
}

window.NOTE = { open, homeSection, wireHome, homeSummary };

})();

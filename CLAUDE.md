# 街健日誌 — 專案導覽（新視窗先讀這份）

## 是什麼
純手寫 PWA（無框架、無建置步驟）：`index.html` 外殼 ＋ `app.js` 全部邏輯 ＋ `styles.css` 樣式。
街頭健身記錄 App，資料全存本機 `localStorage['streetlog.v1']`，離線可用。
使用者是平面設計師：長相（Figma／styles.css 設計變數層）歸使用者，邏輯實作歸 agent——見「慣例 §設計分工」。

## 文件的形狀（垂直三層 × 水平一主題一節；規則詳見 `docs/DOC-STYLE.md`）
內容只准住一層、上層只指路：
1. **入口路由**＝本檔——表格＋一句話＋指針，不放細節。
2. **主題節**＝各檔內以 `====` 分隔的節——一主題一節、一節一標題、節首一行＝職責。
3. **程式本體**＝節內函式——schema／簽名以程式為準，文件不複製。

增＝底層加一節＋本檔加一行；刪＝反向兩筆；搬家＝改一個指針。

## 檔案結構（垂直分割）
| 檔案 | 職責 |
|---|---|
| `index.html` | 外殼＋底部 7 分頁導覽；內容全由 app.js／sadhana.js／note.js 注入 `#view` |
| `app.js` | 分頁邏輯；一分頁一節（見下表），`grep '===='` 得節索引 |
| `sadhana.js` | Sadhana 修練頁（不佔分頁，從首頁卡進入）；對外只露 `window.SADHANA` |
| `note.js` | 備忘錄（列表＝首頁下方區塊，編輯頁不佔分頁）；可插入省思格式（面向讀 `DB.reflect.aspects`，游標在塊內＝縮成可捲的小視窗、在塊外＝收成點列）；對外只露 `window.NOTE` |
| `styles.css` | 頂部 `:root` 設計變數層（改設計從這裡；`--ap-*` 是照抄 iOS HIG 的規格值，不是自由發揮區）＋依元件／分頁分節 |
| `tokens.json` | 設計 token，與 Figma 來回的交換格式 |
| `sw.js`／`manifest.webmanifest`／`icons/` | PWA 離線快取與安裝設定 |

## app.js 節地圖（水平分割；改哪個分頁只讀那節，節標題可 grep 跳達）
| 節 | 現況能力一句 |
|---|---|
| 資料層 | schema 權威＝`seedDB()`；`loadDB()` 負責舊資料相容（已下架欄位 `timeline`／`program`／`calendar`／`goals` 保留為空陣列） |
| 路由 | `go(tab)` 切分頁，查 `RENDERERS` 表呼叫各節的 render |
| 首頁 Journal（封面） | 依 iOS HIG 做：大標題列＋兩個群組列表（今天／本週課表）＋三個入口方塊＋下方備忘錄區塊；規格值住 `styles.css` 的 `--ap-*`，`body[data-tab="home"]` 才套系統群組黑底；目標（`renderGoals()`）全部從既有資料推算、不必另外設定：本日＝修練／今天排的課表／書寫，本週＝課表完成度（`templateDoneThisWeek()`），每列 44pt 可點、`wireGoals()` 決定點下去去哪；Sadhana 卡顯示 `window.SADHANA.homeSummary()` 的即時狀態與 CTA，點卡進修練頁；Journal 卡顯示 `window.NOTE.homeSummary()`（今天那則），點卡直接進編輯頁；備忘錄區塊的 HTML／事件全由 `window.NOTE.homeSection()`＋`wireHome()` 提供；Physics 待接資料；⚙️ 進設定 |
| 訓練日誌 Log | 記錄訓練：範本開場、帶入上次數字、存檔自動更新 PR |
| 技能 Skills | 內建街健技能樹逐階段解鎖＋自訂技能 |
| 紀錄 PR | 個人最佳（次數／秒數／負重）＋成長曲線 |
| 身體 Body & 課表 | 體重體脂趨勢＋每週課表範本（首頁本週計畫的資料來源） |
| 設定／備份 | 匯出／匯入 JSON；從首頁 ⚙️ 進入（無獨立分頁） |
| 回顧 Review | 週／月／年／全部統計、頻率熱力圖、PR 與體重亮點 |
| 共用 UI | Sheet 彈窗、SVG 折線圖、空狀態 |
| 省思 Reflect | 每日書寫編輯器：自由文字＋可插入的互動省思格式表格；`DB.reflect.aspects`＝面向權威，備忘錄的省思格式也讀同一份 |
| 啟動 | 首次渲染＋SW 註冊（localhost 跳過並清掉 SW） |

## 文件地圖（冷讀順序）
1. 本檔 — 開發地圖。
2. `README.md` — 使用者視角：功能、怎麼跑、怎麼裝到手機。
3. `docs/DOC-STYLE.md` — 文件怎麼寫（含三層金字塔規則與學名對照）。

## 主題挖掘表（帶著問題來的用這張，只指路、內容住目的地）
- **改顏色／字體／圓角／陰影（設計）** → `styles.css` 頂部 `:root` 設計變數層（全中文註解，改一個變數全 App 變）。
- **Figma 設計要落地** → 慣例 §設計分工；純色調走 `tokens.json`。
- **改某分頁的功能** → 上方節地圖挑節 → `app.js` grep 該節標題。
- **改 Sadhana 修練頁** → `sadhana.js`（自成一檔，與 `app.js` 只透過 `window.SADHANA` 相接）。
- **改備忘錄／自由書寫頁** → `note.js`（自成一檔，只透過 `window.NOTE` 相接）；長相在 `styles.css` §備忘錄 Note 與 `:root` 的 `--nt-*`。
- **資料存了什麼／格式** → `app.js` §資料層 `seedDB()`（schema 權威）。
- **備份／換手機** → `app.js` §設定／備份；使用者操作說明在 `README.md`。
- **新增分頁** → 慣例 §新增分頁。
- **本機跑不起來／改 CSS 沒生效** → 慣例 §本機開發。
- **要寫／改文件** → `docs/DOC-STYLE.md`。

## 慣例
- **本機開發**：`.claude/launch.json` 跑 `python3 -m http.server $PORT`（`autoPort` 開著＝8734 被佔用就自動換一個 port，實際網址看 preview_start 回傳的）；localhost 自動跳過並清掉 Service Worker，改 CSS 不會被舊快取卡住（正式部署網址才啟用離線快取）。改完前端用瀏覽器 preview 開起來驗證，不叫使用者自己看。
- **設計分工**：使用者在 Figma／`styles.css` 變數層決定長相、動態、跳頁；agent 把它實作成會動的程式碼。`color-mix()` 衍生色必配 `@property` 註冊（`syntax:'<color>'`），不註冊會被算成透明。
- **新增分頁**：`index.html` tabbar 加鈕 → `app.js` §路由 `RENDERERS` 加一項 → 開新節寫 `renderX()` → 本檔節地圖加一行。刪分頁反向操作，並照 DOC-STYLE 清死引用。
- **資料相容**：改 schema 只加欄位不改名；舊欄位下架先保留讀取相容（見 §資料層 timeline 例）。不得毀掉使用者既有的 localStorage 資料。
- **跟使用者講話用完整白話**：使用者是設計師不是工程師；工程詞彙第一次出現當場用一句白話定義，不逼使用者反問。

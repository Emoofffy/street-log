# 街健日誌 — 街頭健身追蹤 App (PWA)

一個離線可用的街頭健身（Street Workout / Calisthenics）記錄工具。資料全部存在你的手機本機，不需要註冊、不需要網路。

## 功能

- **🏋️ 訓練日誌** — 記錄每次訓練：動作、組數、次數/秒數、負重、標籤（推/拉/腿/核心/技能日）
- **🎯 技能進度** — 內建街健技能樹：Muscle-up、前水平、俄挺、人體國旗、倒立、L-sit，逐階段解鎖；也可自訂技能
- **🏆 個人紀錄 PR** — 追蹤最佳成績（最多次數、最長秒數、負重），自動畫成長曲線；訓練日誌會自動更新 PR
- **📈 身體數據 & 課表** — 體重/體脂趨勢圖、每週訓練課表安排
- **💾 備份** — 設定頁可「匯出/匯入 JSON」，換手機或清瀏覽器前記得先備份

## 怎麼在電腦上打開

在這個資料夾執行本機伺服器（Service Worker 需要 http，不能直接雙擊開檔）：

```bash
cd /Users/chuan/Desktop/CODE/training
python3 -m http.server 8734
```

然後瀏覽器打開 <http://localhost:8734>

## 怎麼變成手機 App（加到主畫面）

要在手機上用，需要讓手機連得到這個網頁。兩種方式：

1. **同一個 Wi-Fi**：電腦跑上面的伺服器，手機瀏覽器輸入 `http://<電腦區網IP>:8734`
2. **免費部署上線**（推薦，之後隨時可用）：把這個資料夾丟到 Netlify Drop / GitHub Pages / Vercel，會得到一個網址

打開網頁後：
- **iPhone (Safari)**：分享鈕 → 加入主畫面
- **Android (Chrome)**：右上選單 → 加到主畫面 / 安裝應用程式

加完後桌面會出現 App 圖示，點開就是全螢幕、離線可用，跟原生 App 幾乎一樣。

## 檔案結構

| 檔案 | 說明 |
|------|------|
| `index.html` | App 外殼與底部導覽 |
| `app.js` | 全部邏輯（資料層、五個分頁、彈窗、圖表） |
| `styles.css` | 深色系街頭風樣式 |
| `manifest.webmanifest` | PWA 設定（名稱、圖示、顏色） |
| `sw.js` | Service Worker（離線快取） |
| `icons/` | App 圖示 |

資料儲存 key：`localStorage['streetlog.v1']`

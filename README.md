# 行程同步・技術驗證雛形

用真的手機驗證規格文件裡風險最高的三件事：

1. QR Code 的容量和掃描速度（iPhone 與 Android 互掃）
2. iPhone 加入主畫面後能不能離線開啟、用相機、把資料保存一週
3. 簽章能不能擋下被竄改的 QR Code

這不是正式版。它沒有 PIN 碼、沒有合併邏輯，配對 QR 也直接帶著旅程金鑰，只用來測試。

## 已在電腦上確認

- 18 項單元測試通過（base45、分段、封包、竄改、白名單、金鑰錯誤、配對）
- 用 Chrome 模擬兩支手機，走一般的相機掃描流程：配對成功、2 張動態 QR 的更新驗證通過、竄改版被拒絕、斷網後重開仍可使用，沒有任何 CSP 違規或錯誤

## 網址

https://larryfromdowningstreet.github.io/trip-spike/

GitHub Pages 從 `gh-pages` 分支發布，那個分支只放建置好的網站檔案；原始碼在 `main`。相機和離線功能都需要 HTTPS，GitHub Pages 預設就是 HTTPS。

測完就關掉 Pages，符合「網站只在發版時上線」的原則。

## 重新發布

```sh
npm install
npm run build
cd dist
touch .nojekyll
git init -b gh-pages
git add -A
git commit -m "發布"
git push -f https://github.com/larryfromdowningstreet/trip-spike.git gh-pages
```

## 手機測試步驟

準備兩支手機，最好一支 iPhone、一支 Android。

1. 兩支都打開網址。iPhone 用 Safari 的分享選單「加入主畫面」，之後都從主畫面開啟。
2. 各自關掉 App 再開一次，確認「離線」顯示「✓ 已可離線使用」。
3. 各自輸入暱稱，按「建立身分」。
4. 配對：A 按「顯示我的配對 QR」，B 按「開始掃描」對準它；再反過來做一次。
5. A 按「產生」，B 掃描，記下畫面顯示的秒數。換方向再做一次。
6. A 按「產生竄改版」，B 掃描，應該顯示「簽章不符」。
7. 兩支都開飛航模式，從主畫面重開 App，重做第 5 步。
8. 一週不開 App，之後打開，確認「資料保留」的天數和「收到的更新」都還在。

第 5 步可以調整糾錯等級（L 或 M）、每張字元數和播放間隔，找出掃得最穩的組合。也可以在昏暗的室內和戶外強光下各測一次。

## 通過標準

| 測試項目 | 通過標準 |
| --- | --- |
| QR Code 容量 | 一天份的行程能用 1～2 張 QR Code 傳完 |
| 跨平台掃描 | iPhone 和 Android 互掃，室內昏暗和戶外強光下都在 3 秒內完成 |
| 動態 QR Code | 多張 QR Code 能連續掃描並完整還原 |
| iPhone 離線開啟 | 加入主畫面後開飛航模式，能開啟、能用相機 |
| iPhone 資料保留 | 放一週不開啟，資料還在 |
| 簽章 | 竄改版一律被拒絕 |

## 電腦上的量測

範例資料是一整天 8 個新增項目（`src/sample.ts`）：JSON 2,249 bytes，壓縮後 794 bytes，加密加簽章後 895 bytes，轉成 QR 文字是 1,343 個字元。

| 糾錯等級 | 每張字元數 | QR 張數 | 最大 QR 版本 |
| --- | --- | --- | --- |
| L | 400 | 4 | 11 |
| L | 700 | 2 | 15 |
| L | 1000 | 2 | 18 |
| L | 2000 | 1 | 21 |
| M | 400 | 4 | 12 |
| M | 700 | 2 | 17 |
| M | 1000 | 2 | 21 |
| M | 2000 | 1 | 25 |

平常的更新通常只有幾筆變更，會比這個小很多。版本越高，QR Code 越密、越難掃，所以要在手機上實測哪個版本還穩定。

## 開發

```sh
npm install
npm run dev     # 開發伺服器（不含離線快取和 CSP）
npm test        # 單元測試與 QR 產生解碼測試
npm run build   # 輸出到 dist/
```

## 程式結構

| 位置 | 內容 |
| --- | --- |
| `src/core/` | 純函式，不碰畫面和瀏覽器：base45、動態 QR 分段、金鑰、封包格式 |
| `src/platform/` | 瀏覽器相關：畫 QR Code、相機掃描、IndexedDB |
| `src/main.ts` | 測試畫面 |
| `test/` | 單元測試，以及「產生 QR Code → 解碼 → 驗證」的完整測試 |
| `vite.config.ts` | 建置時加上 CSP，並產生離線用的 service worker |

依賴只有三個：`qrcode-generator`（產生 QR）、`jsqr`（iPhone 上解碼）、`fflate`（壓縮）。簽章和加密都用瀏覽器內建的 Web Crypto。

## 封包格式

```
更新包：[種類 1][作者金鑰代碼 8][IV 12][AES-GCM 密文][ECDSA P-256 簽章 64]
```

簽章涵蓋前面所有內容，App 先驗證簽章，通過才解密、解壓縮、讀取 JSON。QR Code 裡放的是 base45 文字（RFC 9285），密度和二進位模式相同，但任何掃描器都能當一般文字讀出。

## 這個雛形沒有測到的

- Android 用 Capacitor 包裝、拿掉網路權限後能否運作，需要另外建置 Android 專案測試。
- `jsqr` 佔了大部分的程式大小（約 170 KB，壓縮傳輸約 65 KB）。正式版可以再評估更輕的掃描方式。

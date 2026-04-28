import { _electron as electron } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const screenshotDir = path.join(projectRoot, "screenshots");
const userDataDir = path.join("/tmp", "markview-pulse-screenshot-userdata");
const sampleSourcePath = "/tmp/markdown-sample.md";

// 隔離した userData ディレクトリを使用（実機の recent-files.json を汚さない）
if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
fs.mkdirSync(userDataDir, { recursive: true });

if (!fs.existsSync(sampleSourcePath)) {
  console.error(`Sample markdown not found at ${sampleSourcePath}.`);
  console.error(`Run: curl -fsSL https://raw.githubusercontent.com/mxstbr/markdown-test-file/master/TEST.md -o ${sampleSourcePath}`);
  process.exit(1);
}

// fetched サンプルから本文部分を抜粋（先頭の TOC を飛ばし、h1 + 実コンテンツのみ使う）
const sampleSource = fs.readFileSync(sampleSourcePath, "utf-8");
const sampleLines = sampleSource.split("\n");
const sampleHeading = sampleLines[0];
const sampleBody = sampleLines.slice(22, 95).join("\n");
const sampleTrimmed = `${sampleHeading}\n\n${sampleBody}`.trim() + "\n";

// 撮影用ファイル群
const fileMain = path.join(projectRoot, "test.md");
const fileNotes = path.join("/tmp", "markview-pulse-notes.md");
const fileDraft = path.join("/tmp", "markview-pulse-draft.md");
const fileBefore = path.join("/tmp", "markview-pulse-before.md");
const fileAfter = path.join("/tmp", "markview-pulse-after.md");

fs.writeFileSync(fileMain, sampleTrimmed);

fs.writeFileSync(
  fileNotes,
  `# 開発メモ\n\n## 今週のタスク\n\n- [x] README更新\n- [ ] スクリーンショット差し替え\n- [ ] リリースノート作成\n\n## メモ\n\n> Markdownのプレビューが速いと作業がはかどる。\n\n\`\`\`ts\nfunction greet(name: string): string {\n  return \`こんにちは、\${name}さん\`;\n}\n\`\`\`\n`
);

fs.writeFileSync(
  fileDraft,
  `# ブログ下書き\n\nこの記事では、Markdownリアルタイムプレビューの活用方法を紹介します。\n\n## 主なメリット\n\n1. 編集と確認の往復が減る\n2. 差分が一目でわかる\n3. PDF書き出しまでワンストップ\n`
);

const beforeContent = `# 機能比較\n\n## 概要\n\nMarkview Pulseは軽量なMarkdownプレビューアです。\n\n## 特徴\n\n- リアルタイムプレビュー\n- ダークモード対応\n- 印刷対応\n\n## 対応OS\n\nmacOS / Windows / Linux\n`;

const afterContent = `# 機能比較\n\n## 概要\n\nMarkview Pulseは軽量で高速なMarkdownプレビューアです。\n\n## 特徴\n\n- リアルタイムプレビュー\n- ダークモード対応\n- インライン差分表示\n- PDF書き出し\n\n## 対応OS\n\nmacOS / Windows / Linux\n`;

fs.writeFileSync(fileBefore, beforeContent);
fs.writeFileSync(fileAfter, afterContent);

// recent-files.json を事前投入（ウェルカムタブの「最近開いたファイル」を絵的に出すため）
const recentFiles = [fileMain, fileNotes, fileDraft, fileBefore, fileAfter];
fs.writeFileSync(path.join(userDataDir, "recent-files.json"), JSON.stringify(recentFiles));

const VIEWPORT = { width: 1100, height: 720 };

console.log("Launching electron...");
const electronApp = await electron.launch({
  args: [".", `--user-data-dir=${userDataDir}`, fileMain],
  cwd: projectRoot,
});

const page = await electronApp.firstWindow();
await page.setViewportSize(VIEWPORT);

// 最大化を解除して固定サイズにする
await electronApp.evaluate(({ BrowserWindow }, size) => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.unmaximize();
    win.setContentSize(size.width, size.height);
  }
}, VIEWPORT);

await page.waitForSelector("#content h1", { timeout: 10000 });
await page.waitForTimeout(400);

// === 1. ライトモード ===
await page.emulateMedia({ colorScheme: "light" });
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(screenshotDir, "light.png") });
console.log("light.png saved");

// === 2. ダークモード ===
await page.emulateMedia({ colorScheme: "dark" });
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(screenshotDir, "dark.png") });
console.log("dark.png saved");

// 以降はライトモードに戻して撮影
await page.emulateMedia({ colorScheme: "light" });
await page.waitForTimeout(200);

// === 3. 自動更新による差分表示 ===
// 表示領域内に差分が映るよう、見えやすい段落を書き換える
const modified = sampleTrimmed
  .replace(
    "Markdown is intended to be as easy-to-read and easy-to-write as is feasible.",
    "Markdown は **読みやすさと書きやすさ** を最優先に設計されています。"
  )
  .replace(
    "Readability, however, is emphasized above all else.",
    "とりわけ可読性は、他のあらゆる要素より重視されています。"
  );
fs.writeFileSync(fileMain, modified);
// mtime ポーリング (1秒間隔) を待つ
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(screenshotDir, "diff.png") });
console.log("diff.png saved");

// === 4. 複数タブ表示 ===
await page.evaluate(({ filePath }) => {
  window.api.openFile(filePath);
}, { filePath: fileNotes });
await page.waitForTimeout(400);
await page.evaluate(({ filePath }) => {
  window.api.openFile(filePath);
}, { filePath: fileDraft });
await page.waitForTimeout(400);
// 1番目のタブに戻して、複数タブが見える状態で撮影（アクティブタブはサンプル）
await page.evaluate(() => {
  const firstTab = document.querySelector(".tab-item");
  if (firstTab) firstTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(screenshotDir, "tabs.png") });
console.log("tabs.png saved");

// === 5. ウェルカムタブ（ファイルを開く モード） ===
await page.evaluate(() => {
  window.api.openWelcomeTab();
});
await page.waitForSelector(".welcome-wrapper", { timeout: 5000 });
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(screenshotDir, "welcome.png") });
console.log("welcome.png saved");

// === 6. ウェルカムタブ（差分を比較 モード） ===
await page.evaluate(() => {
  const diffTab = document.querySelector('.welcome-mode-tab[data-mode="diff"]');
  if (diffTab) diffTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await page.waitForTimeout(300);
// 両スロットに値を入れて compare ボタンを有効化した状態を見せる
await page.evaluate(({ before, after }) => {
  const beforeSlot = document.querySelector('[data-slot="before"]');
  const afterSlot = document.querySelector('[data-slot="after"]');
  const beforeText = beforeSlot?.querySelector(".welcome-drop-text");
  const afterText = afterSlot?.querySelector(".welcome-drop-text");
  if (beforeSlot && beforeText) {
    beforeSlot.classList.add("welcome-drop-zone-filled");
    beforeText.textContent = before;
  }
  if (afterSlot && afterText) {
    afterSlot.classList.add("welcome-drop-zone-filled");
    afterText.textContent = after;
  }
  const compareBtn = document.querySelector(".welcome-diff-compare-btn");
  if (compareBtn) compareBtn.disabled = false;
}, { before: path.basename(fileBefore), after: path.basename(fileAfter) });
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(screenshotDir, "welcome-diff.png") });
console.log("welcome-diff.png saved");

await electronApp.close();
console.log("Done!");

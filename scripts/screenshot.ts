import { _electron as electron } from "playwright";
import * as fs from "fs";
import * as path from "path";

const testMdPath = path.join(__dirname, "..", "test.md");
const screenshotDir = path.join(__dirname, "..", "screenshots");

async function main() {
  // 1. 通常表示（ライトモード）
  fs.writeFileSync(
    testMdPath,
    `# Markview Pulse

Markdownファイルをリアルタイムにプレビューするデスクトップアプリです。

## 機能

- ファイル変更の自動検知・表示更新
- インライン差分表示
- ダークモード対応

## テーブル表示

| 機能 | ショートカット | 説明 |
|---|---|---|
| 印刷 | Cmd + P | 表示中のページを印刷 |
| PDF書き出し | Cmd + Shift + S | PDFファイルとして保存 |
| 拡大 | Cmd + + | 表示を拡大 |

> 引用テキストのサンプルです。

\`\`\`
コードブロックのサンプル
const app = new Application();
\`\`\`
`
  );

  const app = await electron.launch({
    args: [".", testMdPath],
    cwd: path.join(__dirname, ".."),
  });
  const page = await app.firstWindow();
  await page.waitForSelector("#content h1", { timeout: 5000 });
  await page.setViewportSize({ width: 900, height: 650 });

  // ライトモード
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(screenshotDir, "light.png") });
  console.log("light.png saved");

  // ダークモード
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(screenshotDir, "dark.png") });
  console.log("dark.png saved");

  // 差分表示
  await page.emulateMedia({ colorScheme: "light" });
  fs.writeFileSync(
    testMdPath,
    `# Markview Pulse

Markdownファイルをリアルタイムにプレビューするデスクトップアプリです。

## 機能

- ファイル変更の自動検知・表示更新
- インライン差分表示
- ダークモード対応
- **NEW: ドラッグ&ドロップ対応**

## テーブル表示

| 機能 | ショートカット | 説明 |
|---|---|---|
| 印刷 | Cmd + P | 表示中のページを印刷 |
| PDF書き出し | Cmd + Shift + S | PDFファイルとして保存 |
| 拡大 | Cmd + + | 表示を拡大 |
| 縮小 | Cmd + - | 表示を縮小 |

> 引用テキストが更新されました。

\`\`\`
コードブロックのサンプル
const app = new Application();
app.start();
\`\`\`
`
  );

  await page.waitForFunction(
    () => document.getElementById("diff-toggle")?.style.display !== "none",
    { timeout: 5000 }
  );
  await page.click("#diff-toggle");
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(screenshotDir, "diff.png") });
  console.log("diff.png saved");

  await app.close();
  console.log("Done!");
}

main().catch(console.error);

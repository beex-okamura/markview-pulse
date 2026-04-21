import { test, expect } from "@playwright/test";
import { _electron as electron, ElectronApplication, Page } from "playwright";
import * as fs from "fs";
import * as path from "path";

const testMdPath = path.join(__dirname, "..", "test.md");

let app: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  fs.writeFileSync(
    testMdPath,
    "# テスト見出し\n\nこれはテスト本文です。\n\n- リスト1\n- リスト2\n"
  );

  app = await electron.launch({
    args: [".", testMdPath],
    cwd: path.join(__dirname, ".."),
  });
  page = await app.firstWindow();
  await page.waitForSelector("#content h1", { timeout: 5000 });
});

test.afterEach(async () => {
  await app.close();
});

test("Markdownが正しくレンダリングされる", async () => {
  const h1Text = await page.textContent("#content h1");
  expect(h1Text).toBe("テスト見出し");

  const pText = await page.textContent("#content p");
  expect(pText).toBe("これはテスト本文です。");

  const listItems = await page.$$eval("#content li", (items) =>
    items.map((item) => item.textContent)
  );
  expect(listItems).toEqual(["リスト1", "リスト2"]);
});

test("ファイル変更でリアルタイム更新される", async () => {
  fs.writeFileSync(
    testMdPath,
    "# 更新後の見出し\n\n更新後の本文です。\n"
  );

  await page.waitForFunction(
    () => document.querySelector("#content h1")?.textContent === "更新後の見出し",
    { timeout: 5000 }
  );

  const h1Text = await page.textContent("#content h1");
  expect(h1Text).toBe("更新後の見出し");

  const pText = await page.textContent("#content p");
  expect(pText).toBe("更新後の本文です。");
});

test("テーブルが罫線付きでレンダリングされる", async () => {
  fs.writeFileSync(
    testMdPath,
    "# テーブル\n\n| 列A | 列B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n"
  );

  await page.waitForFunction(
    () => document.querySelector("#content table") !== null,
    { timeout: 5000 }
  );

  // テーブル要素が存在する
  const table = await page.$("#content table");
  expect(table).not.toBeNull();

  // ヘッダーの検証
  const headers = await page.$$eval("#content th", (ths) =>
    ths.map((th) => th.textContent)
  );
  expect(headers).toEqual(["列A", "列B"]);

  // セルの検証
  const cells = await page.$$eval("#content td", (tds) =>
    tds.map((td) => td.textContent)
  );
  expect(cells).toEqual(["1", "2", "3", "4"]);

  // 罫線スタイルの検証
  const borderStyle = await page.$eval("#content td", (td) => {
    const style = window.getComputedStyle(td);
    return style.borderWidth;
  });
  expect(borderStyle).toBe("1px");
});

test("ファイル更新後にスクロール位置が保持される", async () => {
  // 長いコンテンツを書き込み
  const longContent = "# 長いドキュメント\n\n" + Array(50).fill("テスト行です。\n\n").join("");
  fs.writeFileSync(testMdPath, longContent);

  await page.waitForFunction(
    () => document.querySelector("#content h1")?.textContent === "長いドキュメント",
    { timeout: 5000 }
  );

  // スクロールを実行
  await page.evaluate(() => { document.documentElement.scrollTop = 200; });
  const scrollBefore = await page.evaluate(() => document.documentElement.scrollTop);
  expect(scrollBefore).toBe(200);

  // ファイルを更新
  const updatedContent = "# 長いドキュメント（更新）\n\n" + Array(50).fill("更新された行です。\n\n").join("");
  fs.writeFileSync(testMdPath, updatedContent);

  await page.waitForFunction(
    () => document.querySelector("#content h1")?.textContent === "長いドキュメント（更新）",
    { timeout: 5000 }
  );

  // スクロール位置が保持されている
  const scrollAfter = await page.evaluate(() => document.documentElement.scrollTop);
  expect(scrollAfter).toBe(200);
});

test("ダークモード時に背景色が暗くなる", async () => {
  // ダークモードをエミュレート
  await page.emulateMedia({ colorScheme: "dark" });

  const bgColor = await page.evaluate(() => {
    return window.getComputedStyle(document.body).backgroundColor;
  });
  // #1e1e1e = rgb(30, 30, 30)
  expect(bgColor).toBe("rgb(30, 30, 30)");

  const textColor = await page.evaluate(() => {
    return window.getComputedStyle(document.body).color;
  });
  // #d4d4d4 = rgb(212, 212, 212)
  expect(textColor).toBe("rgb(212, 212, 212)");
});

test("IPC経由でファイルを開ける（ドラッグ&ドロップ相当）", async () => {
  const anotherMd = path.join(__dirname, "..", "another.md");
  fs.writeFileSync(anotherMd, "# ドロップされたファイル\n\nドロップテスト。\n");

  // レンダラーからIPC送信をシミュレート
  await app.evaluate(({ ipcMain }, mdPath) => {
    ipcMain.emit("open-file", {}, mdPath);
  }, anotherMd);

  await page.waitForFunction(
    () => document.querySelector("#content h1")?.textContent === "ドロップされたファイル",
    { timeout: 5000 }
  );

  const h1Text = await page.textContent("#content h1");
  expect(h1Text).toBe("ドロップされたファイル");

  fs.unlinkSync(anotherMd);
});

test("ライトモード時に背景色が白になる", async () => {
  await page.emulateMedia({ colorScheme: "light" });

  const bgColor = await page.evaluate(() => {
    return window.getComputedStyle(document.body).backgroundColor;
  });
  expect(bgColor).toBe("rgb(255, 255, 255)");
});

test("最近開いたファイルに履歴が保存される", async () => {
  const userDataPath = await app.evaluate(async ({ app: electronApp }) => {
    return electronApp.getPath("userData");
  });
  const recentFilesPath = path.join(userDataPath, "recent-files.json");

  const recentFiles = JSON.parse(fs.readFileSync(recentFilesPath, "utf-8"));
  expect(recentFiles).toContain(testMdPath);
});

test("PDF書き出しができる", async () => {
  const pdfPath = path.join(__dirname, "..", "test-output.pdf");

  const pdfData = await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const data = await win.webContents.printToPDF({});
    return data.toString("base64");
  });

  // PDFデータが生成されている
  const buffer = Buffer.from(pdfData, "base64");
  expect(buffer.length).toBeGreaterThan(0);
  // PDFヘッダーの確認
  expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
});

test("テーブルが横スクロール可能なラッパーで囲まれる", async () => {
  fs.writeFileSync(
    testMdPath,
    "# テーブル\n\n| A | B | C | D | E | F | G | H |\n|---|---|---|---|---|---|---|---|\n| 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |\n"
  );

  await page.waitForFunction(
    () => document.querySelector("#content .table-wrapper table") !== null,
    { timeout: 5000 }
  );

  const wrapperOverflow = await page.$eval("#content .table-wrapper", (el) => {
    return window.getComputedStyle(el).overflowX;
  });
  expect(wrapperOverflow).toBe("auto");
});

test("差分表示に切り替えられる", async () => {
  // 初回はボタン非表示（差分なし）
  const btnDisplay = await page.$eval("#diff-toggle", (el) => {
    return window.getComputedStyle(el).display;
  });
  expect(btnDisplay).toBe("none");

  // ファイルを更新して差分を発生させる
  fs.writeFileSync(testMdPath, "# 変更後の見出し\n\n追加された行。\n");

  await page.waitForFunction(
    () => document.querySelector("#content h1")?.textContent === "変更後の見出し",
    { timeout: 5000 }
  );

  // ボタンが表示される
  await page.waitForFunction(
    () => window.getComputedStyle(document.getElementById("diff-toggle")!).display !== "none",
    { timeout: 5000 }
  );
  const btnTitle = await page.$eval("#diff-toggle", (el) => el.getAttribute("title"));
  expect(btnTitle).toBe("差分を表示");

  // ボタンをクリックして差分表示に切り替え
  await page.click("#diff-toggle");

  // 差分要素が表示される
  const hasDiffAdded = await page.$(".diff-added");
  const hasDiffRemoved = await page.$(".diff-removed");
  expect(hasDiffAdded).not.toBeNull();
  expect(hasDiffRemoved).not.toBeNull();

  // ボタンのtitleが切り替わる
  const btnTitleAfter = await page.$eval("#diff-toggle", (el) => el.getAttribute("title"));
  expect(btnTitleAfter).toBe("通常表示に戻す");

  // もう一度クリックして通常表示に戻る
  await page.click("#diff-toggle");
  const hasDiffAfterToggle = await page.$(".diff-added");
  expect(hasDiffAfterToggle).toBeNull();
});

import { app, BrowserWindow, ipcMain, Menu, dialog } from "electron";
import * as fs from "fs";
import * as path from "path";
import { marked } from "marked";
import { diffArrays } from "diff";

let mainWindow: BrowserWindow | null = null;
let watcher: fs.FSWatcher | null = null;
let previousContent: string = "";

const MAX_RECENT_FILES = 10;
const recentFilesPath = path.join(app.getPath("userData"), "recent-files.json");

function getRecentFiles(): string[] {
  try {
    const data = fs.readFileSync(recentFilesPath, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function addRecentFile(filePath: string): void {
  let recent = getRecentFiles();
  recent = recent.filter((f) => f !== filePath);
  recent.unshift(filePath);
  recent = recent.slice(0, MAX_RECENT_FILES);
  fs.writeFileSync(recentFilesPath, JSON.stringify(recent));
  buildMenu();
}

function isTableBlock(block: string): boolean {
  const lines = block.split("\n").filter(Boolean);
  return lines.length >= 2 && lines[0].includes("|") && /^\|?[\s-:|]+\|?$/.test(lines[1]);
}

function parseCells(line: string): string[] {
  return line.split("|").map((c) => c.trim()).filter(Boolean);
}

function findChangedCells(oldLine: string, newLine: string): Set<number> {
  const oldCells = parseCells(oldLine);
  const newCells = parseCells(newLine);
  const changed = new Set<number>();
  const maxLen = Math.max(oldCells.length, newCells.length);
  for (let i = 0; i < maxLen; i++) {
    if ((oldCells[i] || "") !== (newCells[i] || "")) {
      changed.add(i);
    }
  }
  return changed;
}

type RowInfo = {
  line: string;
  mark: "same" | "added" | "removed";
  oldLine?: string; // 変更行の場合、対応する旧行
};

function diffTableBlock(oldBlock: string, newBlock: string): string {
  const oldLines = oldBlock.split("\n").filter(Boolean);
  const newLines = newBlock.split("\n").filter(Boolean);

  const headerLines = newLines.slice(0, 2);
  const oldDataLines = oldLines.slice(2);
  const newDataLines = newLines.slice(2);

  // diffArraysで行内容ベースの差分を取得
  const changes = diffArrays(oldDataLines, newDataLines);

  // removed行とadded行のペアを検出して「変更」行を特定
  const rows: RowInfo[] = [];
  for (let ci = 0; ci < changes.length; ci++) {
    const part = changes[ci];
    if (part.removed && ci + 1 < changes.length && changes[ci + 1].added) {
      // removed + added のペア = 変更行
      const nextPart = changes[ci + 1];
      const maxPair = Math.max(part.value.length, nextPart.value.length);
      for (let i = 0; i < maxPair; i++) {
        if (i < nextPart.value.length && i < part.value.length) {
          // 変更行: 新行を表示し、旧行情報を保持
          rows.push({ line: nextPart.value[i], mark: "added", oldLine: part.value[i] });
        } else if (i < nextPart.value.length) {
          // 追加行
          rows.push({ line: nextPart.value[i], mark: "added" });
        } else {
          // 削除行
          rows.push({ line: part.value[i], mark: "removed" });
        }
      }
      ci++; // addedパートをスキップ
    } else {
      for (const line of part.value) {
        if (part.added) {
          rows.push({ line, mark: "added" });
        } else if (part.removed) {
          rows.push({ line, mark: "removed" });
        } else {
          rows.push({ line, mark: "same" });
        }
      }
    }
  }

  // 統合テーブルをHTMLに変換
  const allLines = [...headerLines, ...rows.map((r) => r.line)];
  const combinedTable = allLines.join("\n") + "\n";
  const fullHtml = marked.parse(combinedTable) as string;

  // tr要素にクラスを付与、変更行はセル単位でマーキング
  let rowIndex = 0;
  let markedHtml = fullHtml.replace(/<tr>/g, () => {
    const current = rowIndex++;
    if (current === 0) return "<tr>"; // ヘッダー行
    const dataRowIndex = current - 1;
    const row = rows[dataRowIndex];
    if (!row) return "<tr>";
    if (row.mark === "removed") {
      return `<tr class="diff-removed-row">`;
    }
    if (row.mark === "added") {
      return `<tr class="diff-modified-row" data-row-index="${dataRowIndex}">`;
    }
    return "<tr>";
  });

  // 変更行のセルにクラスを付与
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.mark === "added" && row.oldLine) {
      const changedCells = findChangedCells(row.oldLine, row.line);
      if (changedCells.size > 0) {
        // この行のtdにセル単位のマーキングを適用
        let cellIndex = 0;
        markedHtml = markedHtml.replace(
          new RegExp(`<tr class="diff-modified-row" data-row-index="${i}">([\\s\\S]*?)</tr>`),
          (match, inner) => {
            const markedInner = inner.replace(/<td>/g, () => {
              const ci = cellIndex++;
              if (changedCells.has(ci)) {
                return `<td class="diff-changed-cell">`;
              }
              return "<td>";
            });
            return `<tr class="diff-modified-row">${markedInner}</tr>`;
          }
        );
      }
    }
  }

  // 変更なしの変更行マーカーをクリーンアップ（oldLineがない追加行）
  markedHtml = markedHtml.replace(/<tr class="diff-modified-row"[^>]*>/g, (match) => {
    if (match.includes("data-row-index")) {
      return `<tr class="diff-added-row">`;
    }
    return match;
  });

  return markedHtml;
}

function buildDiffHtml(oldContent: string, newContent: string): string {
  // 段落（空行区切り）ブロック単位で比較し、各ブロックを完全な状態でHTMLに変換する
  const oldBlocks = oldContent.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  const newBlocks = newContent.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);

  let html = "";

  // 新ブロックを処理
  for (let i = 0; i < newBlocks.length; i++) {
    const block = newBlocks[i];
    if (i >= oldBlocks.length) {
      // 新規ブロック
      const rendered = marked.parse(block + "\n") as string;
      html += `<div class="diff-added">${rendered}</div>`;
    } else if (oldBlocks[i] === block) {
      // 変更なし
      html += marked.parse(block + "\n") as string;
    } else if (isTableBlock(block) && isTableBlock(oldBlocks[i])) {
      // テーブルブロック: 行単位で差分表示
      html += diffTableBlock(oldBlocks[i], block);
    } else {
      // 非テーブルブロック: ブロック全体をマーキング
      const rendered = marked.parse(block + "\n") as string;
      html += `<div class="diff-added">${rendered}</div>`;
    }
  }

  // 削除されたブロック
  for (let i = newBlocks.length; i < oldBlocks.length; i++) {
    const rendered = marked.parse(oldBlocks[i] + "\n") as string;
    html += `<div class="diff-removed">${rendered}</div>`;
  }

  return html;
}

function buildMenu(): void {
  const recentFiles = getRecentFiles();
  const recentSubmenu = recentFiles.length > 0
    ? recentFiles.map((filePath) => ({
        label: filePath,
        click: () => {
          if (fs.existsSync(filePath)) {
            loadMarkdown(filePath);
          }
        },
      }))
    : [{ label: "なし", enabled: false }];

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "ファイル",
      submenu: [
        {
          label: "最近開いたファイル",
          submenu: recentSubmenu,
        },
        { type: "separator" },
        {
          label: "印刷...",
          accelerator: "CmdOrCtrl+P",
          click: () => {
            mainWindow?.webContents.print();
          },
        },
        {
          label: "PDFとして書き出し...",
          accelerator: "CmdOrCtrl+Shift+S",
          click: async () => {
            if (!mainWindow) return;
            const result = await dialog.showSaveDialog(mainWindow, {
              filters: [{ name: "PDF", extensions: ["pdf"] }],
            });
            if (!result.canceled && result.filePath) {
              const pdfData = await mainWindow.webContents.printToPDF({});
              fs.writeFileSync(result.filePath, pdfData);
            }
          },
        },
        { type: "separator" },
        { role: "quit", label: "終了" },
      ],
    },
    {
      label: "編集",
      submenu: [
        { role: "copy", label: "コピー" },
        { role: "selectAll", label: "すべて選択" },
      ],
    },
    {
      label: "表示",
      submenu: [
        { role: "reload", label: "再読み込み" },
        { role: "toggleDevTools", label: "開発者ツール" },
        { type: "separator" },
        { role: "zoomIn", label: "拡大" },
        { role: "zoomOut", label: "縮小" },
        { role: "resetZoom", label: "実際のサイズ" },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function getMarkdownPath(): string | null {
  const args = process.argv.slice(app.isPackaged ? 1 : 2);
  for (const arg of args) {
    if (arg.startsWith("--")) continue;
    const resolved = path.resolve(process.cwd(), arg);
    if (arg.endsWith(".md") && fs.existsSync(resolved)) {
      return resolved;
    }
  }
  return null;
}

let pendingFilePath: string | null = null;

// macOSのファイル関連付けで呼ばれるイベント
app.on("open-file", (event, filePath) => {
  event.preventDefault();
  if (mainWindow) {
    loadMarkdown(filePath);
  } else {
    pendingFilePath = filePath;
  }
});

function sendContent(content: string): void {
  if (!mainWindow) return;
  const html = marked.parse(content) as string;
  const diffHtml = previousContent ? buildDiffHtml(previousContent, content) : "";
  mainWindow.webContents.send("load-html", html, diffHtml);
  previousContent = content;
}

function loadMarkdown(filePath: string): void {
  if (!mainWindow) return;

  // 既存のwatcherを閉じる
  if (watcher) {
    watcher.close();
    watcher = null;
  }

  previousContent = "";
  const content = fs.readFileSync(filePath, "utf-8");
  sendContent(content);
  mainWindow.setTitle(path.basename(filePath));

  // 最近開いたファイルに追加
  addRecentFile(filePath);

  // ファイル変更を監視
  // エディタによってはrename(一時ファイル→リネーム)で保存するため両方処理する
  let debounceTimer: NodeJS.Timeout | null = null;
  const handleChange = () => {
    // 短時間に複数イベントが発火するのを防ぐ
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try {
        if (!fs.existsSync(filePath)) return;
        const updated = fs.readFileSync(filePath, "utf-8");
        if (updated !== previousContent) {
          sendContent(updated);
        }
      } catch {
        // ファイルが一時的に読めない場合は無視
      }
    }, 100);
  };

  watcher = fs.watch(filePath, handleChange);

  // renameでwatcherが壊れる場合があるため、再監視する
  watcher.on("error", () => {
    if (watcher) {
      watcher.close();
      watcher = null;
    }
    // 少し待ってから再監視
    setTimeout(() => {
      if (fs.existsSync(filePath)) {
        watcher = fs.watch(filePath, handleChange);
      }
    }, 500);
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "..", "src", "index.html"));

  const isHidden = process.argv.includes("--hidden");
  if (!isHidden) {
    mainWindow.maximize();
    mainWindow.show();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
    if (watcher) {
      watcher.close();
      watcher = null;
    }
  });

  mainWindow.webContents.on("did-finish-load", () => {
    const filePath = pendingFilePath || getMarkdownPath();
    if (filePath) {
      loadMarkdown(filePath);
      pendingFilePath = null;
    }
  });
}

// レンダラーからのファイルオープン要求（ドラッグ&ドロップ）
ipcMain.on("open-file", (_event, filePath: string) => {
  if (filePath.endsWith(".md") && fs.existsSync(filePath)) {
    loadMarkdown(filePath);
  }
});

app.whenReady().then(() => {
  buildMenu();
  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

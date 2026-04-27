import { app, BrowserWindow, ipcMain, Menu, dialog } from "electron";
import * as fs from "fs";
import * as path from "path";
import { marked } from "marked";
import { diffArrays } from "diff";

// CJK括弧（「」など）隣接時に**強調**が効かないmarkedの制限を回避
marked.use({
  extensions: [{
    name: "cjkStrong",
    level: "inline",
    start(src: string) {
      return src.match(/\*\*/)?.index;
    },
    tokenizer(src: string) {
      const match = src.match(/^\*\*([^*]+)\*\*/);
      if (match) {
        return {
          type: "cjkStrong",
          raw: match[0],
          text: match[1],
          tokens: this.lexer.inlineTokens(match[1]),
        };
      }
    },
    renderer(this: any, token: any) {
      return "<strong>" + this.parser.parseInline(token.tokens) + "</strong>";
    },
  }],
});

let mainWindow: BrowserWindow | null = null;
let watchTimer: NodeJS.Timeout | null = null;

type Tab = {
  id: string;
  filePath: string;
  previousContent: string;
};

let tabs: Tab[] = [];
let activeTabId: string | null = null;
let nextTabId = 1;

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

function parseCells(line: string): string[] {
  return line.split("|").map((c) => c.trim()).filter(Boolean);
}

function diffTableBlock(oldBlock: string, newBlock: string): string {
  const oldLines = oldBlock.split("\n").filter(Boolean);
  const newLines = newBlock.split("\n").filter(Boolean);

  const oldDataLines = oldLines.slice(2);
  const newDataLines = newLines.slice(2);

  // 行単位でセルの変更を検出
  const maxRows = Math.max(oldDataLines.length, newDataLines.length);
  const oldChangedCells: Set<number>[] = [];
  const newChangedCells: Set<number>[] = [];

  for (let i = 0; i < maxRows; i++) {
    if (i >= oldDataLines.length) {
      // 新規追加行: 全セルをマーク
      const cells = parseCells(newDataLines[i]);
      newChangedCells.push(new Set(cells.map((_, ci) => ci)));
    } else if (i >= newDataLines.length) {
      // 削除行: 全セルをマーク
      const cells = parseCells(oldDataLines[i]);
      oldChangedCells.push(new Set(cells.map((_, ci) => ci)));
    } else if (oldDataLines[i] !== newDataLines[i]) {
      // 変更行: 変更セルを検出
      const oldCells = parseCells(oldDataLines[i]);
      const newCells = parseCells(newDataLines[i]);
      const maxCells = Math.max(oldCells.length, newCells.length);
      const changed = new Set<number>();
      for (let ci = 0; ci < maxCells; ci++) {
        if ((oldCells[ci] || "") !== (newCells[ci] || "")) {
          changed.add(ci);
        }
      }
      oldChangedCells.push(changed);
      newChangedCells.push(changed);
    } else {
      oldChangedCells.push(new Set());
      newChangedCells.push(new Set());
    }
  }

  // 変更がなければ通常表示
  const hasChanges = [...oldChangedCells, ...newChangedCells].some((s) => s.size > 0);
  if (!hasChanges) {
    return marked.parse(newBlock + "\n") as string;
  }

  // 変更前テーブル（変更セルを赤）
  const oldHtml = marked.parse(oldBlock + "\n") as string;
  const oldMarked = applyDiffCellClass(oldHtml, oldChangedCells, "diff-cell-removed");

  // 変更後テーブル（変更セルを緑）
  const newHtml = marked.parse(newBlock + "\n") as string;
  const newMarked = applyDiffCellClass(newHtml, newChangedCells, "diff-cell-added");

  return `<div class="diff-removed">${oldMarked}</div>${newMarked}`;
}

function applyDiffCellClass(tableHtml: string, changedCells: Set<number>[], cssClass: string): string {
  let dataRowIndex = -1; // -1 = ヘッダー行
  let cellIndex = 0;

  return tableHtml.replace(/<tr>|<td>/g, (match) => {
    if (match === "<tr>") {
      dataRowIndex++;
      cellIndex = 0;
      return "<tr>";
    }
    // <td> — dataRowIndex 0 はヘッダー行(thなので到達しない)
    const row = changedCells[dataRowIndex - 1];
    const ci = cellIndex++;
    if (row && row.has(ci)) {
      return `<td class="${cssClass}">`;
    }
    return "<td>";
  });
}

function buildDiffHtml(oldContent: string, newContent: string): string {
  const oldBlocks = oldContent.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  const newBlocks = newContent.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);

  const changes = diffArrays(oldBlocks, newBlocks);

  let html = "";

  for (let ci = 0; ci < changes.length; ci++) {
    const part = changes[ci];

    if (!part.added && !part.removed) {
      for (const block of part.value) {
        html += marked.parse(block + "\n") as string;
      }
    } else if (part.removed && ci + 1 < changes.length && changes[ci + 1].added) {
      const nextPart = changes[ci + 1];
      const oldParts = part.value;
      const newParts = nextPart.value;
      const maxLen = Math.max(oldParts.length, newParts.length);

      for (let i = 0; i < maxLen; i++) {
        if (i < oldParts.length && i < newParts.length) {
          if (isTableBlock(oldParts[i]) && isTableBlock(newParts[i])) {
            html += diffTableBlock(oldParts[i], newParts[i]);
          } else {
            const oldRendered = marked.parse(oldParts[i] + "\n") as string;
            html += `<div class="diff-removed">${oldRendered}</div>`;
            const newRendered = marked.parse(newParts[i] + "\n") as string;
            html += `<div class="diff-added">${newRendered}</div>`;
          }
        } else if (i < newParts.length) {
          const rendered = marked.parse(newParts[i] + "\n") as string;
          html += `<div class="diff-added">${rendered}</div>`;
        } else {
          const rendered = marked.parse(oldParts[i] + "\n") as string;
          html += `<div class="diff-removed">${rendered}</div>`;
        }
      }
      ci++;
    } else if (part.added) {
      for (const block of part.value) {
        const rendered = marked.parse(block + "\n") as string;
        html += `<div class="diff-added">${rendered}</div>`;
      }
    } else {
      for (const block of part.value) {
        const rendered = marked.parse(block + "\n") as string;
        html += `<div class="diff-removed">${rendered}</div>`;
      }
    }
  }

  return html;
}

function isTableBlock(block: string): boolean {
  const lines = block.split("\n").filter(Boolean);
  return lines.length >= 2 && lines[0].includes("|") && /^\|?[\s-:|]+\|?$/.test(lines[1]);
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
        {
          label: "タブを閉じる",
          accelerator: "CmdOrCtrl+W",
          click: () => {
            if (activeTabId) closeTab(activeTabId);
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
        { type: "separator" },
        {
          label: "次のタブ",
          accelerator: "Ctrl+Tab",
          click: () => {
            if (tabs.length <= 1) return;
            const idx = tabs.findIndex((t) => t.id === activeTabId);
            const next = (idx + 1) % tabs.length;
            activateTab(tabs[next]);
          },
        },
        {
          label: "前のタブ",
          accelerator: "Ctrl+Shift+Tab",
          click: () => {
            if (tabs.length <= 1) return;
            const idx = tabs.findIndex((t) => t.id === activeTabId);
            const prev = (idx - 1 + tabs.length) % tabs.length;
            activateTab(tabs[prev]);
          },
        },
        ...Array.from({ length: 9 }, (_, i) => ({
          label: `タブ ${i + 1}`,
          accelerator: `CmdOrCtrl+${i + 1}`,
          click: () => {
            if (i < tabs.length) activateTab(tabs[i]);
          },
          visible: false,
        })),
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

function getActiveTab(): Tab | undefined {
  return tabs.find((t) => t.id === activeTabId);
}

function sendTabsToRenderer(): void {
  if (!mainWindow) return;
  const tabInfos = tabs.map((t) => ({ id: t.id, name: path.basename(t.filePath), path: t.filePath }));
  mainWindow.webContents.send("update-tabs", tabInfos, activeTabId);
}

function sendContent(tab: Tab, content: string): void {
  if (!mainWindow) return;
  const html = marked.parse(content) as string;
  const diffHtml = tab.previousContent ? buildDiffHtml(tab.previousContent, content) : "";
  mainWindow.webContents.send("load-html", html, diffHtml);
  tab.previousContent = content;
}

function startWatching(tab: Tab): void {
  if (watchTimer) {
    clearInterval(watchTimer);
    watchTimer = null;
  }

  let lastMtime = fs.statSync(tab.filePath).mtimeMs;
  watchTimer = setInterval(() => {
    try {
      const stat = fs.statSync(tab.filePath);
      if (stat.mtimeMs !== lastMtime) {
        lastMtime = stat.mtimeMs;
        const updated = fs.readFileSync(tab.filePath, "utf-8");
        if (updated !== tab.previousContent) {
          sendContent(tab, updated);
        }
      }
    } catch {
      // ファイルが一時的に読めない場合は無視
    }
  }, 1000);
}

function activateTab(tab: Tab): void {
  if (!mainWindow) return;
  activeTabId = tab.id;

  // ファイルを再読み込みして表示
  tab.previousContent = "";
  const content = fs.readFileSync(tab.filePath, "utf-8");
  sendContent(tab, content);
  mainWindow.setTitle(path.basename(tab.filePath));

  startWatching(tab);
  sendTabsToRenderer();
}

function loadMarkdown(filePath: string): void {
  if (!mainWindow) return;

  // 既にタブに存在する場合はそのタブに切り替え
  const existing = tabs.find((t) => t.filePath === filePath);
  if (existing) {
    activateTab(existing);
    return;
  }

  // 新しいタブを追加
  const tab: Tab = {
    id: String(nextTabId++),
    filePath,
    previousContent: "",
  };
  tabs.push(tab);

  // 最近開いたファイルに追加
  addRecentFile(filePath);

  activateTab(tab);
}

function switchTab(tabId: string): void {
  const tab = tabs.find((t) => t.id === tabId);
  if (tab) {
    activateTab(tab);
  }
}

function closeTab(tabId: string): void {
  const index = tabs.findIndex((t) => t.id === tabId);
  if (index === -1) return;

  tabs.splice(index, 1);

  if (tabs.length === 0) {
    // 全タブ閉じた
    activeTabId = null;
    if (watchTimer) {
      clearInterval(watchTimer);
      watchTimer = null;
    }
    if (mainWindow) {
      mainWindow.webContents.send("load-html", "<p>Markdownファイルを開いてください。</p>", "");
      mainWindow.setTitle("Markview Pulse");
      sendTabsToRenderer();
    }
    return;
  }

  // 閉じたタブがアクティブだった場合、隣のタブをアクティブに
  if (activeTabId === tabId) {
    const newIndex = Math.min(index, tabs.length - 1);
    activateTab(tabs[newIndex]);
  } else {
    sendTabsToRenderer();
  }
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
    if (watchTimer) {
      clearInterval(watchTimer);
      watchTimer = null;
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

ipcMain.on("switch-tab", (_event, tabId: string) => {
  switchTab(tabId);
});

ipcMain.on("close-tab", (_event, tabId: string) => {
  closeTab(tabId);
});

ipcMain.on("open-file-dialog", async () => {
  if (!mainWindow) return;
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: "Markdown", extensions: ["md"] }],
    properties: ["openFile"],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    loadMarkdown(result.filePaths[0]);
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

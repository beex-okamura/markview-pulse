import { app, BrowserWindow, ipcMain, Menu, dialog } from "electron";
import * as fs from "fs";
import * as path from "path";
import { marked } from "marked";
import { diffLines } from "diff";

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

function buildDiffHtml(oldContent: string, newContent: string): string {
  const changes = diffLines(oldContent, newContent);
  let html = "";
  for (const part of changes) {
    const rendered = marked.parse(part.value) as string;
    if (part.added) {
      html += `<div class="diff-added">${rendered}</div>`;
    } else if (part.removed) {
      html += `<div class="diff-removed">${rendered}</div>`;
    } else {
      html += rendered;
    }
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
  mainWindow.maximize();
  mainWindow.show();

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

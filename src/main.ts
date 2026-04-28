import { app, BrowserWindow, ipcMain, Menu, dialog } from "electron";
import * as fs from "fs";
import * as path from "path";
import { marked } from "marked";
import { buildDiffHtml } from "./diff";

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
  const tabInfos = tabs.map((t) => {
    const welcomeMatch = t.filePath.match(/^__welcome_(\d+)__$/);
    return {
      id: t.id,
      name: welcomeMatch ? `新規タブ${welcomeMatch[1]}` : path.basename(t.filePath),
      path: t.filePath,
    };
  });
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

  if (tab.filePath.startsWith("__welcome_")) {
    if (watchTimer) {
      clearInterval(watchTimer);
      watchTimer = null;
    }
    mainWindow.webContents.send("show-welcome");
    const num = tab.filePath.match(/^__welcome_(\d+)__$/)?.[1] || "";
    mainWindow.setTitle(`新規タブ${num} - Markview Pulse`);
    sendTabsToRenderer();
    return;
  }

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

  // アクティブタブがウェルカムタブなら置き換える
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const welcomeTab = activeTab?.filePath.startsWith("__welcome_") ? activeTab : undefined;
  if (welcomeTab) {
    welcomeTab.filePath = filePath;
    welcomeTab.previousContent = "";
    activateTab(welcomeTab);
    addRecentFile(filePath);
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
      mainWindow.webContents.send("show-welcome");
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
    } else {
      mainWindow!.webContents.send("show-welcome");
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

ipcMain.handle("get-recent-files", () => {
  return getRecentFiles();
});

let nextWelcomeNum = 1;

ipcMain.on("open-welcome-tab", () => {
  if (!mainWindow) return;
  const num = nextWelcomeNum++;
  const tab: Tab = {
    id: String(nextTabId++),
    filePath: `__welcome_${num}__`,
    previousContent: "",
  };
  tabs.push(tab);
  activeTabId = tab.id;
  sendTabsToRenderer();
  mainWindow.webContents.send("show-welcome");
  mainWindow.setTitle(`新規タブ${num} - Markview Pulse`);
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

let currentHtml = "";
let currentDiffHtml = "";
let showDiff = false;

const WIDTH_MODES = ["width-max", "width-fit"] as const;
const WIDTH_DISPLAY = ["max", "fit"];
let widthIndex = 1;

// タブバー
const tabBar = document.createElement("div");
tabBar.id = "tab-bar";
document.body.prepend(tabBar);

// ステータスバー
const statusBar = document.createElement("div");
statusBar.id = "status-bar";
document.body.appendChild(statusBar);

type TabInfo = { id: string; name: string; path: string };

function renderTabs(tabList: TabInfo[], activeTabId: string | null): void {
  tabBar.innerHTML = "";
  for (const tab of tabList) {
    const tabEl = document.createElement("div");
    tabEl.className = "tab-item" + (tab.id === activeTabId ? " tab-active" : "");
    tabEl.addEventListener("click", () => {
      (window as any).api.switchTab(tab.id);
    });

    const nameSpan = document.createElement("span");
    nameSpan.className = "tab-name";
    nameSpan.textContent = tab.name;

    const closeBtn = document.createElement("span");
    closeBtn.className = "tab-close";
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      (window as any).api.closeTab(tab.id);
    });

    tabEl.appendChild(nameSpan);
    tabEl.appendChild(closeBtn);
    tabBar.appendChild(tabEl);
  }

  // ＋ボタン
  const addBtn = document.createElement("div");
  addBtn.className = "tab-add";
  addBtn.textContent = "+";
  addBtn.title = "ファイルを開く";
  addBtn.addEventListener("click", () => {
    (window as any).api.openFileDialog();
  });
  tabBar.appendChild(addBtn);

  // ステータスバーにアクティブタブのパスを表示
  const activeTab = tabList.find((t) => t.id === activeTabId);
  statusBar.textContent = activeTab ? activeTab.path : "";
}

function render(): void {
  const container = document.getElementById("content");
  if (!container) return;

  const scrollTop = document.documentElement.scrollTop;
  const html = showDiff && currentDiffHtml ? currentDiffHtml : currentHtml;
  container.innerHTML = html;

  // テーブルを横スクロール可能なラッパーで囲む
  container.querySelectorAll("table").forEach((table) => {
    const wrapper = document.createElement("div");
    wrapper.className = "table-wrapper";
    table.parentNode?.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  });

  // コンテンツ幅のクラスを適用
  document.body.className = WIDTH_MODES[widthIndex];
  updateWidthButton();

  document.documentElement.scrollTop = scrollTop;
  updateToggleButton();
}

// SVGアイコン
const ICON_DIFF = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="3" width="7" height="14" rx="1" stroke="currentColor" stroke-width="1.5" fill="#ffebe9"/>
  <rect x="11" y="3" width="7" height="14" rx="1" stroke="currentColor" stroke-width="1.5" fill="#e6ffec"/>
  <line x1="4" y1="7" x2="7" y2="7" stroke="currentColor" stroke-width="1.5"/>
  <line x1="13" y1="9" x2="16" y2="9" stroke="currentColor" stroke-width="1.5"/>
  <line x1="14.5" y1="7.5" x2="14.5" y2="10.5" stroke="currentColor" stroke-width="1.5"/>
</svg>`;

const ICON_NORMAL = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="3" width="14" height="14" rx="1" stroke="currentColor" stroke-width="1.5"/>
  <line x1="6" y1="7" x2="14" y2="7" stroke="currentColor" stroke-width="1.5"/>
  <line x1="6" y1="10" x2="14" y2="10" stroke="currentColor" stroke-width="1.5"/>
  <line x1="6" y1="13" x2="11" y2="13" stroke="currentColor" stroke-width="1.5"/>
</svg>`;

function updateToggleButton(): void {
  const btn = document.getElementById("diff-toggle");
  if (!btn) return;
  if (!currentDiffHtml) {
    btn.style.display = "none";
  } else {
    btn.style.display = "";
    btn.innerHTML = showDiff ? ICON_NORMAL : ICON_DIFF;
    btn.title = showDiff ? "通常表示に戻す" : "差分を表示";
  }
}

function updateWidthButton(): void {
  const wbtn = document.getElementById("width-toggle");
  if (!wbtn) return;
  wbtn.textContent = WIDTH_DISPLAY[widthIndex];
  wbtn.title = `幅: ${WIDTH_DISPLAY[widthIndex]}`;
}

const widthBtn = document.createElement("button");
widthBtn.id = "width-toggle";
widthBtn.className = "hover-btn";
widthBtn.addEventListener("click", () => {
  widthIndex = (widthIndex + 1) % WIDTH_MODES.length;
  render();
});
document.body.appendChild(widthBtn);

// 差分トグルボタンの作成
const btn = document.createElement("button");
btn.id = "diff-toggle";
btn.className = "hover-btn";
btn.style.display = "none";
btn.addEventListener("click", () => {
  showDiff = !showDiff;
  render();
});
document.body.appendChild(btn);

// @ts-ignore: Window.api is defined by preload
(window as any).api.onLoadHtml((html: string, diffHtml: string) => {
  currentHtml = html;
  currentDiffHtml = diffHtml;
  // 差分がある場合は自動的に差分表示、なければ通常表示
  showDiff = !!diffHtml;
  render();
});

(window as any).api.onUpdateTabs((tabList: TabInfo[], activeTabId: string | null) => {
  renderTabs(tabList, activeTabId);
});

// ドラッグ&ドロップ
document.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.stopPropagation();
});

document.addEventListener("drop", (e) => {
  e.preventDefault();
  e.stopPropagation();
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    const file = files[0];
    if (file.name.endsWith(".md")) {
      const filePath = (window as any).api.getPathForFile(file);
      (window as any).api.openFile(filePath);
    }
  }
});

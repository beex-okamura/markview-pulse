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
  addBtn.title = "新しいタブを開く";
  addBtn.addEventListener("click", () => {
    (window as any).api.openWelcomeTab();
  });
  tabBar.appendChild(addBtn);

  // ステータスバーにアクティブタブのパスを表示
  const activeTab = tabList.find((t) => t.id === activeTabId);
  const isVirtualTab = activeTab && (activeTab.path.startsWith("__welcome_") || activeTab.path.startsWith("__diff_"));
  statusBar.textContent = activeTab && !isVirtualTab ? activeTab.path : "";
}

function render(): void {
  const container = document.getElementById("content");
  if (!container) return;

  showFloatButtons();
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
  const wbtn = document.getElementById("width-toggle");
  if (!btn) return;
  if (!currentDiffHtml) {
    btn.style.display = "none";
    if (wbtn) wbtn.style.bottom = "44px";
  } else {
    btn.style.display = "";
    btn.innerHTML = showDiff ? ICON_NORMAL : ICON_DIFF;
    btn.title = showDiff ? "通常表示に戻す" : "差分を表示";
    if (wbtn) wbtn.style.bottom = "98px";
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

// ウェルカム画面表示
function hideFloatButtons(): void {
  const wbtn = document.getElementById("width-toggle");
  const dbtn = document.getElementById("diff-toggle");
  if (wbtn) wbtn.style.display = "none";
  if (dbtn) dbtn.style.display = "none";
}

function showFloatButtons(): void {
  const wbtn = document.getElementById("width-toggle");
  if (wbtn) wbtn.style.display = "";
}

async function showWelcome(): Promise<void> {
  const container = document.getElementById("content");
  if (!container) return;

  hideFloatButtons();

  const recentFiles: string[] = await (window as any).api.getRecentFiles();

  container.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.className = "welcome-wrapper";

  // モード切り替えタブ
  const modeTabs = document.createElement("div");
  modeTabs.className = "welcome-mode-tabs";
  modeTabs.innerHTML = `
    <button class="welcome-mode-tab welcome-mode-tab-active" data-mode="open">ファイルを開く</button>
    <button class="welcome-mode-tab" data-mode="diff">差分を比較</button>
  `;
  wrapper.appendChild(modeTabs);

  // モード別パネルのコンテナ
  const panels = document.createElement("div");
  panels.className = "welcome-mode-panels";
  wrapper.appendChild(panels);

  // 「ファイルを開く」モード（既存のドロップゾーン）
  const openPanel = document.createElement("div");
  openPanel.className = "welcome-mode-panel welcome-mode-panel-active";
  openPanel.dataset.mode = "open";

  const dropZone = document.createElement("div");
  dropZone.className = "welcome-drop-zone";
  dropZone.innerHTML = `
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="6" width="32" height="36" rx="3" stroke="currentColor" stroke-width="2" fill="none"/>
      <line x1="16" y1="18" x2="32" y2="18" stroke="currentColor" stroke-width="2"/>
      <line x1="16" y1="24" x2="32" y2="24" stroke="currentColor" stroke-width="2"/>
      <line x1="16" y1="30" x2="26" y2="30" stroke="currentColor" stroke-width="2"/>
    </svg>
    <p class="welcome-drop-text">Markdownファイルをここにドラッグ&ドロップ</p>
    <button class="welcome-browse-btn">ファイルを選択</button>
  `;

  dropZone.querySelector(".welcome-browse-btn")!.addEventListener("click", () => {
    (window as any).api.openFileDialog();
  });

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add("welcome-drop-hover");
  });
  dropZone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove("welcome-drop-hover");
  });
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove("welcome-drop-hover");
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.endsWith(".md")) {
        const filePath = (window as any).api.getPathForFile(file);
        (window as any).api.openFile(filePath);
      }
    }
  });

  openPanel.appendChild(dropZone);
  panels.appendChild(openPanel);

  // 「差分を比較」モード
  const diffPanel = document.createElement("div");
  diffPanel.className = "welcome-mode-panel";
  diffPanel.dataset.mode = "diff";
  diffPanel.innerHTML = `
    <div class="welcome-diff-zones">
      <div class="welcome-drop-zone welcome-drop-zone-half" data-slot="before">
        <svg width="40" height="40" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="8" y="6" width="32" height="36" rx="3" stroke="currentColor" stroke-width="2" fill="none"/>
          <line x1="16" y1="18" x2="32" y2="18" stroke="currentColor" stroke-width="2"/>
          <line x1="16" y1="24" x2="32" y2="24" stroke="currentColor" stroke-width="2"/>
          <line x1="16" y1="30" x2="26" y2="30" stroke="currentColor" stroke-width="2"/>
        </svg>
        <p class="welcome-drop-text">変更前のファイル</p>
        <button class="welcome-browse-btn">ファイルを選択</button>
      </div>
      <div class="welcome-diff-vs">vs</div>
      <div class="welcome-drop-zone welcome-drop-zone-half" data-slot="after">
        <svg width="40" height="40" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="8" y="6" width="32" height="36" rx="3" stroke="currentColor" stroke-width="2" fill="none"/>
          <line x1="16" y1="18" x2="32" y2="18" stroke="currentColor" stroke-width="2"/>
          <line x1="16" y1="24" x2="32" y2="24" stroke="currentColor" stroke-width="2"/>
          <line x1="16" y1="30" x2="26" y2="30" stroke="currentColor" stroke-width="2"/>
        </svg>
        <p class="welcome-drop-text">変更後のファイル</p>
        <button class="welcome-browse-btn">ファイルを選択</button>
      </div>
    </div>
    <button class="welcome-diff-compare-btn" disabled>差分を表示</button>
  `;
  panels.appendChild(diffPanel);

  type SlotKey = "before" | "after";
  const diffSlots: Record<SlotKey, { zone: HTMLDivElement; text: HTMLParagraphElement; browseBtn: HTMLButtonElement; placeholder: string }> = {
    before: {
      zone: diffPanel.querySelector<HTMLDivElement>('[data-slot="before"]')!,
      text: diffPanel.querySelector<HTMLParagraphElement>('[data-slot="before"] .welcome-drop-text')!,
      browseBtn: diffPanel.querySelector<HTMLButtonElement>('[data-slot="before"] .welcome-browse-btn')!,
      placeholder: "変更前のファイル",
    },
    after: {
      zone: diffPanel.querySelector<HTMLDivElement>('[data-slot="after"]')!,
      text: diffPanel.querySelector<HTMLParagraphElement>('[data-slot="after"] .welcome-drop-text')!,
      browseBtn: diffPanel.querySelector<HTMLButtonElement>('[data-slot="after"] .welcome-browse-btn')!,
      placeholder: "変更後のファイル",
    },
  };
  const compareBtn = diffPanel.querySelector<HTMLButtonElement>(".welcome-diff-compare-btn")!;
  const diffPaths: Record<SlotKey, string | null> = { before: null, after: null };

  function renderSlot(key: SlotKey) {
    const slot = diffSlots[key];
    const filePath = diffPaths[key];
    if (filePath) {
      const fileName = filePath.split("/").pop() || filePath;
      slot.text.textContent = fileName;
      slot.zone.classList.add("welcome-drop-zone-filled");
    } else {
      slot.text.textContent = slot.placeholder;
      slot.zone.classList.remove("welcome-drop-zone-filled");
    }
  }

  function updateCompareBtn() {
    compareBtn.disabled = !(diffPaths.before && diffPaths.after);
  }

  function setDiffSlot(key: SlotKey, filePath: string) {
    diffPaths[key] = filePath;
    renderSlot(key);
    updateCompareBtn();
  }

  function resetDiffSlots() {
    diffPaths.before = null;
    diffPaths.after = null;
    renderSlot("before");
    renderSlot("after");
    updateCompareBtn();
  }

  // ロジックの source of truth: src/diff-slots.ts (renderer はバンドル未対応のため import 不可、同期はテスト test/diff-slots.test.ts で担保)
  function fillNextDiffSlot(filePath: string) {
    if (!diffPaths.before) {
      setDiffSlot("before", filePath);
    } else if (!diffPaths.after) {
      setDiffSlot("after", filePath);
    } else {
      diffPaths.before = diffPaths.after;
      diffPaths.after = filePath;
      renderSlot("before");
      renderSlot("after");
    }
  }

  // 各スロットのドラッグ&ドロップとファイル選択ボタン
  (Object.keys(diffSlots) as SlotKey[]).forEach((key) => {
    const slot = diffSlots[key];
    slot.zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      slot.zone.classList.add("welcome-drop-hover");
    });
    slot.zone.addEventListener("dragleave", (e) => {
      e.preventDefault();
      e.stopPropagation();
      slot.zone.classList.remove("welcome-drop-hover");
    });
    slot.zone.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      slot.zone.classList.remove("welcome-drop-hover");
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.name.endsWith(".md")) {
          const filePath = (window as any).api.getPathForFile(file);
          setDiffSlot(key, filePath);
        }
      }
    });
    slot.browseBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const filePath: string | null = await (window as any).api.pickMarkdownFile();
      if (filePath) {
        setDiffSlot(key, filePath);
      }
    });
  });

  compareBtn.addEventListener("click", () => {
    if (diffPaths.before && diffPaths.after) {
      (window as any).api.openDiffTab(diffPaths.before, diffPaths.after);
    }
  });

  // 現在のモード（最近ファイルクリック時の分岐に使用）
  let currentMode: "open" | "diff" = "open";

  // タブ切り替え
  modeTabs.querySelectorAll<HTMLButtonElement>(".welcome-mode-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const mode = tab.dataset.mode as "open" | "diff";
      currentMode = mode;
      modeTabs.querySelectorAll(".welcome-mode-tab").forEach((t) => {
        t.classList.toggle("welcome-mode-tab-active", t === tab);
      });
      panels.querySelectorAll<HTMLDivElement>(".welcome-mode-panel").forEach((p) => {
        p.classList.toggle("welcome-mode-panel-active", p.dataset.mode === mode);
      });
      if (mode === "diff") {
        resetDiffSlots();
      }
    });
  });

  // 最近開いたファイルリスト
  if (recentFiles.length > 0) {
    const recentSection = document.createElement("div");
    recentSection.className = "welcome-recent";
    const heading = document.createElement("h3");
    heading.className = "welcome-recent-heading";
    heading.textContent = "最近開いたファイル";
    recentSection.appendChild(heading);

    const list = document.createElement("ul");
    list.className = "welcome-recent-list";
    for (const filePath of recentFiles) {
      const li = document.createElement("li");
      li.className = "welcome-recent-item";
      const fileName = filePath.split("/").pop() || filePath;
      const dirPath = filePath.substring(0, filePath.length - fileName.length);
      li.innerHTML = `<span class="welcome-recent-name">${fileName}</span><span class="welcome-recent-path">${dirPath}</span>`;
      li.addEventListener("click", () => {
        if (currentMode === "diff") {
          fillNextDiffSlot(filePath);
        } else {
          (window as any).api.openFile(filePath);
        }
      });
      list.appendChild(li);
    }
    recentSection.appendChild(list);
    wrapper.appendChild(recentSection);
  }

  container.appendChild(wrapper);
}

(window as any).api.onShowWelcome(() => {
  showWelcome();
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

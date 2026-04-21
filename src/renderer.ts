let currentHtml = "";
let currentDiffHtml = "";
let showDiff = false;

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

// トグルボタンの作成
const btn = document.createElement("button");
btn.id = "diff-toggle";
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
  if (showDiff && !diffHtml) {
    showDiff = false;
  }
  render();
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
      // @ts-ignore
      (window as any).api.openFile(file.path);
    }
  }
});

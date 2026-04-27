import { describe, test, expect } from "vitest";
import { marked } from "marked";
import {
  buildDiffHtml,
  diffTableBlock,
  isTableBlock,
  parseCells,
  markAllCells,
  applyDiffCellClass,
} from "../src/diff";

// ヘルパー: HTML文字列から特定クラスのtd要素のテキストを抽出
function extractCellTexts(html: string, cssClass: string): string[] {
  const regex = new RegExp(`<td class="${cssClass}">([^<]*)</td>`, "g");
  const results: string[] = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    results.push(match[1]);
  }
  return results;
}

// ヘルパー: HTML文字列から通常のtd要素（クラスなし）のテキストを抽出
function extractNormalCellTexts(html: string): string[] {
  const regex = /<td>([^<]*)<\/td>/g;
  const results: string[] = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    results.push(match[1]);
  }
  return results;
}

// ヘルパー: HTML文字列から特定クラスのdiv内のテキストを抽出
function extractDivTexts(html: string, cssClass: string): string[] {
  const regex = new RegExp(`<div class="${cssClass}">([\\s\\S]*?)</div>`, "g");
  const results: string[] = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    results.push(match[1].replace(/<[^>]+>/g, "").trim());
  }
  return results;
}

// --- ユーティリティ関数のテスト ---

describe("parseCells", () => {
  test("パイプ区切りのセルを配列で返す", () => {
    expect(parseCells("| a | b | c |")).toEqual(["a", "b", "c"]);
  });

  test("空白をトリムする", () => {
    expect(parseCells("|  hello  |  world  |")).toEqual(["hello", "world"]);
  });
});

describe("markAllCells", () => {
  test("全セルのインデックスをSetで返す", () => {
    const result = markAllCells("| a | b | c |");
    expect(result).toEqual(new Set([0, 1, 2]));
  });
});

describe("isTableBlock", () => {
  test("テーブルブロックを正しく判定する", () => {
    expect(isTableBlock("| A | B |\n|---|---|\n| 1 | 2 |")).toBe(true);
  });

  test("段落をテーブルでないと判定する", () => {
    expect(isTableBlock("これは段落です。")).toBe(false);
  });

  test("1行だけではテーブルでないと判定する", () => {
    expect(isTableBlock("| A | B |")).toBe(false);
  });
});

describe("applyDiffCellClass", () => {
  test("指定したセルにCSSクラスを付与する", () => {
    const tableHtml = "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>";
    const changedCells = [new Set([1])]; // 1行目の2番目のセル
    const result = applyDiffCellClass(tableHtml, changedCells, "diff-cell-added");
    expect(result).toContain('<td class="diff-cell-added">2</td>');
    expect(result).toContain("<td>1</td>");
  });
});

// --- Markdownレンダリングのテスト ---

describe("Markdownレンダリング", () => {
  test("見出し・段落・リストが正しくHTMLに変換される", () => {
    const md = "# テスト見出し\n\nこれはテスト本文です。\n\n- リスト1\n- リスト2\n";
    const html = marked.parse(md) as string;
    expect(html).toContain("<h1>テスト見出し</h1>");
    expect(html).toContain("<p>これはテスト本文です。</p>");
    expect(html).toContain("<li>リスト1</li>");
    expect(html).toContain("<li>リスト2</li>");
  });

  test("テーブルがHTMLのtable要素に変換される", () => {
    const md = "| 列A | 列B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n";
    const html = marked.parse(md) as string;
    expect(html).toContain("<table>");
    expect(html).toContain("<th>列A</th>");
    expect(html).toContain("<th>列B</th>");
    expect(html).toContain("<td>1</td>");
    expect(html).toContain("<td>2</td>");
    expect(html).toContain("<td>3</td>");
    expect(html).toContain("<td>4</td>");
  });
});

// --- 差分表示の基本テスト ---

describe("buildDiffHtml - 基本", () => {
  test("変更がない場合はdiffクラスが付かない", () => {
    const content = "# タイトル\n\n段落です。\n";
    const html = buildDiffHtml(content, content);
    expect(html).not.toContain("diff-added");
    expect(html).not.toContain("diff-removed");
  });

  test("段落の変更でdiff-added/diff-removedが付く", () => {
    const oldContent = "# タイトル\n\nこれはテスト本文です。\n";
    const newContent = "# 変更後の見出し\n\n追加された行。\n";
    const html = buildDiffHtml(oldContent, newContent);
    expect(html).toContain('class="diff-added"');
    expect(html).toContain('class="diff-removed"');
  });

  test("diffHtmlが空文字列の場合は差分なし", () => {
    const content = "# テスト\n\n本文です。\n";
    const html = buildDiffHtml(content, content);
    expect(html).not.toContain("diff-");
  });
});

// --- テーブル差分: 行追加 ---

describe("テーブル差分 - 行追加", () => {
  test("追加行の全セルがdiff-cell-addedになる", () => {
    const oldContent = "# テスト\n\n| A | B |\n|---|---|\n| 1 | 2 |\n";
    const newContent = "# テスト\n\n| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n";
    const html = buildDiffHtml(oldContent, newContent);

    const addedCells = extractCellTexts(html, "diff-cell-added");
    expect(addedCells).toContain("3");
    expect(addedCells).toContain("4");

    // 既存行にはハイライトなし
    const normalCells = extractNormalCellTexts(html);
    expect(normalCells).toContain("1");
    expect(normalCells).toContain("2");
  });
});

// --- テーブル差分: 行削除 ---

describe("テーブル差分 - 行削除", () => {
  test("削除行がdiff-cell-removedで表示される", () => {
    const oldContent = "# テスト\n\n| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n";
    const newContent = "# テスト\n\n| A | B |\n|---|---|\n| 1 | 2 |\n";
    const html = buildDiffHtml(oldContent, newContent);

    const removedCells = extractCellTexts(html, "diff-cell-removed");
    expect(removedCells).toContain("3");
    expect(removedCells).toContain("4");

    // diff-removedで囲まれている
    expect(html).toContain('class="diff-removed"');
  });
});

// --- テーブル差分: セル変更 ---

describe("テーブル差分 - セル変更", () => {
  test("変更セルだけがハイライトされる", () => {
    const oldContent = "# テスト\n\n| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n";
    const newContent = "# テスト\n\n| A | B | C |\n|---|---|---|\n| 1 | X | 3 |\n| 4 | 5 | 6 |\n";
    const html = buildDiffHtml(oldContent, newContent);

    const addedCells = extractCellTexts(html, "diff-cell-added");
    expect(addedCells).toEqual(["X"]);

    const removedCells = extractCellTexts(html, "diff-cell-removed");
    expect(removedCells).toEqual(["2"]);

    // 変更されていないセル
    const normalCells = extractNormalCellTexts(html);
    expect(normalCells).toContain("1");
    expect(normalCells).toContain("3");
    expect(normalCells).toContain("4");
    expect(normalCells).toContain("5");
    expect(normalCells).toContain("6");
  });

  test("複数セル同時変更時にそれぞれがハイライトされる", () => {
    const oldContent = "# テスト\n\n| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n";
    const newContent = "# テスト\n\n| A | B |\n|---|---|\n| X | 2 |\n| 3 | Y |\n";
    const html = buildDiffHtml(oldContent, newContent);

    const addedCells = extractCellTexts(html, "diff-cell-added");
    expect(addedCells).toContain("X");
    expect(addedCells).toContain("Y");
    expect(addedCells).not.toContain("2");
    expect(addedCells).not.toContain("3");

    const removedCells = extractCellTexts(html, "diff-cell-removed");
    expect(removedCells).toContain("1");
    expect(removedCells).toContain("4");
  });

  test("テーブル更新時にtable要素が崩れない", () => {
    const oldContent = "# テスト\n\n| A | B |\n|---|---|\n| 1 | 2 |\n";
    const newContent = "# テスト\n\n| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n";
    const html = buildDiffHtml(oldContent, newContent);
    expect(html).toContain("<table>");
    expect(html).toContain("<th>A</th>");
    expect(html).toContain("<th>B</th>");
  });

  test("セル変更時にヘッダーが正しい", () => {
    const oldContent = "# テスト\n\n| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n";
    const newContent = "# テスト\n\n| A | B |\n|---|---|\n| 1 | 修正 |\n| 3 | 4 |\n";
    const html = buildDiffHtml(oldContent, newContent);
    expect(html).toContain("<th>A</th>");
    expect(html).toContain("<th>B</th>");
    expect(html).toContain("修正");
  });
});

// --- テーブル差分: 行入れ替え ---

describe("テーブル差分 - 行入れ替え", () => {
  test("行入れ替え時に差分が検出される", () => {
    const oldContent = "# テスト\n\n| 名前 | 値 |\n|---|---|\n| alpha | 10 |\n| beta | 20 |\n| gamma | 30 |\n";
    const newContent = "# テスト\n\n| 名前 | 値 |\n|---|---|\n| gamma | 30 |\n| beta | 20 |\n| alpha | 10 |\n";
    const html = buildDiffHtml(oldContent, newContent);

    // 差分が検出されている
    const hasHighlight = html.includes("diff-cell-added") || html.includes("diff-cell-removed") || html.includes("diff-removed");
    expect(hasHighlight).toBe(true);

    // テーブルが正しくレンダリングされている
    expect(html).toContain("<table>");
  });
});

// --- 混在パターン: 段落→テーブル→段落 ---

describe("混在パターン - 段落→テーブル→段落", () => {
  test("テーブルだけ変更した場合、段落にはdiffが付かない", () => {
    const oldContent = "# タイトル\n\n前置きの段落。\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n後書きの段落。\n";
    const newContent = "# タイトル\n\n前置きの段落。\n\n| A | B |\n|---|---|\n| 1 | X |\n\n後書きの段落。\n";
    const html = buildDiffHtml(oldContent, newContent);

    // テーブルのセルだけがハイライト
    const addedCells = extractCellTexts(html, "diff-cell-added");
    expect(addedCells).toEqual(["X"]);

    // 前後の段落にdiffクラスが付いていない
    const diffAddedTexts = extractDivTexts(html, "diff-added");
    const diffRemovedTexts = extractDivTexts(html, "diff-removed");
    for (const text of [...diffAddedTexts, ...diffRemovedTexts]) {
      expect(text).not.toContain("前置きの段落");
      expect(text).not.toContain("後書きの段落");
    }
  });
});

// --- 混在パターン: テーブル→段落→テーブル ---

describe("混在パターン - テーブル→段落→テーブル", () => {
  test("片方のテーブルだけ変更した場合、もう片方にはdiffが付かない", () => {
    const oldContent = "| A | B |\n|---|---|\n| 1 | 2 |\n\n中間の段落。\n\n| C | D |\n|---|---|\n| 3 | 4 |\n";
    const newContent = "| A | B |\n|---|---|\n| 1 | 2 |\n\n中間の段落。\n\n| C | D |\n|---|---|\n| 3 | Y |\n";
    const html = buildDiffHtml(oldContent, newContent);

    // 2つ目のテーブルのセルだけがハイライト
    const addedCells = extractCellTexts(html, "diff-cell-added");
    expect(addedCells).toEqual(["Y"]);

    const removedCells = extractCellTexts(html, "diff-cell-removed");
    expect(removedCells).toEqual(["4"]);

    // 1つ目のテーブルのセルにはハイライトなし
    const normalCells = extractNormalCellTexts(html);
    expect(normalCells).toContain("1");
    expect(normalCells).toContain("2");
    expect(normalCells).toContain("3");
  });

  test("両方のテーブルを変更した場合、両方にdiffが付く", () => {
    const oldContent = "| A | B |\n|---|---|\n| 1 | 2 |\n\n中間の段落。\n\n| C | D |\n|---|---|\n| 3 | 4 |\n";
    const newContent = "| A | B |\n|---|---|\n| X | 2 |\n\n中間の段落。\n\n| C | D |\n|---|---|\n| 3 | Y |\n";
    const html = buildDiffHtml(oldContent, newContent);

    const addedCells = extractCellTexts(html, "diff-cell-added");
    expect(addedCells).toContain("X");
    expect(addedCells).toContain("Y");
    expect(addedCells).toHaveLength(2);

    const removedCells = extractCellTexts(html, "diff-cell-removed");
    expect(removedCells).toContain("1");
    expect(removedCells).toContain("4");
    expect(removedCells).toHaveLength(2);
  });
});

// --- 混在パターン: 段落の追加/変更 ---

describe("混在パターン - 段落の追加・変更", () => {
  test("テーブルと段落の間に段落を追加した場合、テーブルにはdiffが付かない", () => {
    const oldContent = "# タイトル\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n末尾の段落。\n";
    const newContent = "# タイトル\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n新しい段落が追加されました。\n\n末尾の段落。\n";
    const html = buildDiffHtml(oldContent, newContent);

    // 追加された段落がdiff-addedとして表示
    const addedTexts = extractDivTexts(html, "diff-added");
    expect(addedTexts.some((t) => t.includes("新しい段落が追加されました"))).toBe(true);

    // テーブルのセルにはハイライトなし
    const addedCells = extractCellTexts(html, "diff-cell-added");
    const removedCells = extractCellTexts(html, "diff-cell-removed");
    expect(addedCells).toHaveLength(0);
    expect(removedCells).toHaveLength(0);

    // テーブルが正しい
    expect(html).toContain("<td>1</td>");
    expect(html).toContain("<td>2</td>");
  });

  test("段落変更とテーブル変更が同時に起きた場合", () => {
    const oldContent = "# タイトル\n\n説明文です。\n\n| A | B |\n|---|---|\n| 1 | 2 |\n";
    const newContent = "# タイトル\n\n説明文を修正しました。\n\n| A | B |\n|---|---|\n| 1 | X |\n";
    const html = buildDiffHtml(oldContent, newContent);

    // 段落の変更
    const addedTexts = extractDivTexts(html, "diff-added");
    expect(addedTexts.some((t) => t.includes("説明文を修正しました"))).toBe(true);
    const removedTexts = extractDivTexts(html, "diff-removed");
    expect(removedTexts.some((t) => t.includes("説明文です"))).toBe(true);

    // テーブルのセル変更もハイライト
    const addedCells = extractCellTexts(html, "diff-cell-added");
    expect(addedCells).toEqual(["X"]);
  });
});

// --- 混在パターン: 行追加・表変更・行変更の同時発生 ---

describe("混在パターン - 行追加・表変更・行変更", () => {
  test("差分の表示順が正しい（行追加→表削除→表追加→行削除→行追加）", () => {
    const oldContent = "段落1\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n段落2\n";
    const newContent = "段落1\n\n新しい段落\n\n| A | B |\n|---|---|\n| 1 | X |\n\n段落2を修正\n";
    const html = buildDiffHtml(oldContent, newContent);

    // 各要素の出現位置を確認して順序を検証
    const addedParagraphPos = html.indexOf("新しい段落");
    const removedTablePos = html.indexOf('class="diff-removed"');
    const addedCellPos = html.indexOf('class="diff-cell-added"');
    const removedParagraphPos = html.indexOf("段落2</p>");
    const modifiedParagraphPos = html.indexOf("段落2を修正");

    // 全て存在する
    expect(addedParagraphPos).toBeGreaterThan(-1);
    expect(removedTablePos).toBeGreaterThan(-1);
    expect(addedCellPos).toBeGreaterThan(-1);
    expect(removedParagraphPos).toBeGreaterThan(-1);
    expect(modifiedParagraphPos).toBeGreaterThan(-1);

    // 順序: 行追加 → 表削除 → 表追加(セルハイライト) → 行削除 → 行追加
    expect(addedParagraphPos).toBeLessThan(removedTablePos);
    expect(removedTablePos).toBeLessThan(addedCellPos);
    expect(addedCellPos).toBeLessThan(removedParagraphPos);
    expect(removedParagraphPos).toBeLessThan(modifiedParagraphPos);
  });

  test("テーブルのセル差分が正しくハイライトされる", () => {
    const oldContent = "段落1\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n段落2\n";
    const newContent = "段落1\n\n新しい段落\n\n| A | B |\n|---|---|\n| 1 | X |\n\n段落2を修正\n";
    const html = buildDiffHtml(oldContent, newContent);

    // テーブルのセル変更が正しい
    const addedCells = extractCellTexts(html, "diff-cell-added");
    expect(addedCells).toEqual(["X"]);

    const removedCells = extractCellTexts(html, "diff-cell-removed");
    expect(removedCells).toEqual(["2"]);
  });
});

import { marked } from "marked";
import { diffArrays } from "diff";

export function parseCells(line: string): string[] {
  return line.split("|").map((c) => c.trim()).filter(Boolean);
}

export function markAllCells(line: string): Set<number> {
  return new Set(parseCells(line).map((_, i) => i));
}

export function applyDiffCellClass(tableHtml: string, changedCells: Set<number>[], cssClass: string): string {
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

export function diffTableBlock(oldBlock: string, newBlock: string): string {
  const oldLines = oldBlock.split("\n").filter(Boolean);
  const newLines = newBlock.split("\n").filter(Boolean);

  const oldDataLines = oldLines.slice(2);
  const newDataLines = newLines.slice(2);

  // diffArraysで行単位の差分を取得
  const changes = diffArrays(oldDataLines, newDataLines);

  const oldChangedCells: Set<number>[] = oldDataLines.map(() => new Set());
  const newChangedCells: Set<number>[] = newDataLines.map(() => new Set());

  let oldRowIdx = 0;
  let newRowIdx = 0;

  for (let ci = 0; ci < changes.length; ci++) {
    const part = changes[ci];

    if (!part.added && !part.removed) {
      oldRowIdx += part.value.length;
      newRowIdx += part.value.length;
    } else if (part.removed && ci + 1 < changes.length && changes[ci + 1].added) {
      // removed + added のペア = 変更行
      const nextPart = changes[ci + 1];
      const minLen = Math.min(part.value.length, nextPart.value.length);

      for (let i = 0; i < minLen; i++) {
        const oldCells = parseCells(part.value[i]);
        const newCells = parseCells(nextPart.value[i]);
        const maxCells = Math.max(oldCells.length, newCells.length);
        for (let c = 0; c < maxCells; c++) {
          if ((oldCells[c] || "") !== (newCells[c] || "")) {
            oldChangedCells[oldRowIdx + i].add(c);
            newChangedCells[newRowIdx + i].add(c);
          }
        }
      }
      for (let i = minLen; i < part.value.length; i++) {
        oldChangedCells[oldRowIdx + i] = markAllCells(part.value[i]);
      }
      for (let i = minLen; i < nextPart.value.length; i++) {
        newChangedCells[newRowIdx + i] = markAllCells(nextPart.value[i]);
      }

      oldRowIdx += part.value.length;
      newRowIdx += nextPart.value.length;
      ci++;
    } else if (part.removed) {
      for (let i = 0; i < part.value.length; i++) {
        oldChangedCells[oldRowIdx + i] = markAllCells(part.value[i]);
      }
      oldRowIdx += part.value.length;
    } else {
      for (let i = 0; i < part.value.length; i++) {
        newChangedCells[newRowIdx + i] = markAllCells(part.value[i]);
      }
      newRowIdx += part.value.length;
    }
  }

  const hasChanges = [...oldChangedCells, ...newChangedCells].some((s) => s.size > 0);
  if (!hasChanges) {
    return marked.parse(newBlock + "\n") as string;
  }

  const oldHtml = marked.parse(oldBlock + "\n") as string;
  const oldMarked = applyDiffCellClass(oldHtml, oldChangedCells, "diff-cell-removed");

  const newHtml = marked.parse(newBlock + "\n") as string;
  const newMarked = applyDiffCellClass(newHtml, newChangedCells, "diff-cell-added");

  return `<div class="diff-removed">${oldMarked}</div>${newMarked}`;
}

export function isTableBlock(block: string): boolean {
  const lines = block.split("\n").filter(Boolean);
  return lines.length >= 2 && lines[0].includes("|") && /^\|?[\s-:|]+\|?$/.test(lines[1]);
}

export function buildDiffHtml(oldContent: string, newContent: string): string {
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

      // ブロック種類（テーブル/段落）でアラインメントを取る
      const oldTypes = oldParts.map((b) => isTableBlock(b) ? "T" : "P");
      const newTypes = newParts.map((b) => isTableBlock(b) ? "T" : "P");
      const typeChanges = diffArrays(oldTypes, newTypes);

      let oi = 0;
      let ni = 0;
      for (const sub of typeChanges) {
        if (!sub.added && !sub.removed) {
          for (let k = 0; k < sub.value.length; k++) {
            const oldBlock = oldParts[oi++];
            const newBlock = newParts[ni++];
            if (oldBlock === newBlock) {
              html += marked.parse(newBlock + "\n") as string;
            } else if (isTableBlock(oldBlock) && isTableBlock(newBlock)) {
              html += diffTableBlock(oldBlock, newBlock);
            } else {
              html += `<div class="diff-removed">${marked.parse(oldBlock + "\n") as string}</div>`;
              html += `<div class="diff-added">${marked.parse(newBlock + "\n") as string}</div>`;
            }
          }
        } else if (sub.removed) {
          for (let k = 0; k < sub.value.length; k++) {
            html += `<div class="diff-removed">${marked.parse(oldParts[oi++] + "\n") as string}</div>`;
          }
        } else {
          for (let k = 0; k < sub.value.length; k++) {
            html += `<div class="diff-added">${marked.parse(newParts[ni++] + "\n") as string}</div>`;
          }
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

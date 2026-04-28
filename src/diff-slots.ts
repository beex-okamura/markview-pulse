export type DiffSlots = { before: string | null; after: string | null };

// 「最近開いたファイル」クリック時の差分スロット遷移ロジック（純粋関数）
// before が空 → before に入れる
// after が空 → after に入れる
// 両方埋まっている → 古い after を before に押し出し、新しいファイルを after に入れる
export function fillNextDiffSlot(slots: DiffSlots, filePath: string): DiffSlots {
  if (!slots.before) {
    return { before: filePath, after: slots.after };
  }
  if (!slots.after) {
    return { before: slots.before, after: filePath };
  }
  return { before: slots.after, after: filePath };
}

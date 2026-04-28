import { describe, test, expect } from "vitest";
import { fillNextDiffSlot } from "../src/diff-slots";

describe("fillNextDiffSlot", () => {
  test("両方空のとき、beforeに新しいファイルを入れる", () => {
    expect(fillNextDiffSlot({ before: null, after: null }, "a.md")).toEqual({
      before: "a.md",
      after: null,
    });
  });

  test("beforeのみ埋まっているとき、afterに新しいファイルを入れる", () => {
    expect(fillNextDiffSlot({ before: "a.md", after: null }, "b.md")).toEqual({
      before: "a.md",
      after: "b.md",
    });
  });

  test("両方埋まっているとき、afterの内容をbeforeにシフトし、新しいファイルをafterに入れる", () => {
    expect(fillNextDiffSlot({ before: "a.md", after: "b.md" }, "c.md")).toEqual({
      before: "b.md",
      after: "c.md",
    });
  });

  test("afterのみ埋まっている場合、beforeに新しいファイルを入れる（after保持）", () => {
    expect(fillNextDiffSlot({ before: null, after: "b.md" }, "a.md")).toEqual({
      before: "a.md",
      after: "b.md",
    });
  });

  test("引数を変更しない（イミュータブル）", () => {
    const original = { before: "a.md", after: "b.md" };
    fillNextDiffSlot(original, "c.md");
    expect(original).toEqual({ before: "a.md", after: "b.md" });
  });

  test("シフト3連続：a→b→c→d で最新2つだけ残る", () => {
    let state: { before: string | null; after: string | null } = { before: null, after: null };
    state = fillNextDiffSlot(state, "a.md");
    state = fillNextDiffSlot(state, "b.md");
    state = fillNextDiffSlot(state, "c.md");
    state = fillNextDiffSlot(state, "d.md");
    expect(state).toEqual({ before: "c.md", after: "d.md" });
  });
});

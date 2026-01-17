import { expect, test } from "bun:test";

import { encodeKey } from "../src/terminal/keys";

test("encodeKey: Shift+Tab (backtab)", () => {
  expect(encodeKey("tab")).toBe("\t");
  expect(encodeKey("shift+tab")).toBe("\x1b[Z");
  expect(encodeKey("Shift+Tab")).toBe("\x1b[Z");
  expect(encodeKey("backtab")).toBe("\x1b[Z");
});

test("encodeKey: Ctrl/Alt combos for single letters", () => {
  expect(encodeKey("ctrl+c")).toBe("\x03");
  expect(encodeKey("control+C")).toBe("\x03");
  expect(encodeKey("alt+a")).toBe("\x1ba");
  expect(encodeKey("meta+a")).toBe("\x1ba");
  expect(encodeKey("c-c")).toBe("\x03");
});

test("encodeKey: arrow keys with modifiers", () => {
  expect(encodeKey("up")).toBe("\x1b[A");
  expect(encodeKey("ctrl+up")).toBe("\x1b[1;5A");
  expect(encodeKey("alt+up")).toBe("\x1b[1;3A");
  expect(encodeKey("shift+up")).toBe("\x1b[1;2A");
  expect(encodeKey("ctrl+shift+left")).toBe("\x1b[1;6D");
});

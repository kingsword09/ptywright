const CSI = "\x1b[";
const SS3 = "\x1bO";

function ctrlChar(letter: string): string {
  const upper = letter.toUpperCase();
  const code = upper.charCodeAt(0);
  if (code < 65 || code > 90) {
    throw new Error(`Unsupported ctrl key: ${letter}`);
  }
  return String.fromCharCode(code - 64);
}

export function encodeKey(key: string): string {
  const normalized = key.trim();

  if (normalized.length === 1) {
    return normalized;
  }

  // Back-compat: "c-x" style.
  const ctrlMatch = /^c-(.)$/i.exec(normalized);
  if (ctrlMatch) {
    return ctrlChar(ctrlMatch[1] ?? "");
  }

  const parsed = parseKeySpec(normalized);
  const mod = modifierParam(parsed.modifiers);

  const keyName = parsed.key.toLowerCase();

  if (keyName === "enter" || keyName === "return") return "\r";
  if (keyName === "esc" || keyName === "escape") return "\x1b";
  if (keyName === "backspace") return "\x7f";

  if (keyName === "space") return " ";

  if (keyName === "tab") {
    return parsed.modifiers.shift ? `${CSI}Z` : "\t";
  }

  if (keyName === "backtab" || keyName === "btab") {
    return `${CSI}Z`;
  }

  const arrowFinal = arrowKeyFinal(keyName);
  if (arrowFinal) {
    if (mod === null) return `${CSI}${arrowFinal}`;
    return `${CSI}1;${mod}${arrowFinal}`;
  }

  const homeEndFinal = homeEndFinalChar(keyName);
  if (homeEndFinal) {
    if (mod === null) return `${CSI}${homeEndFinal}`;
    return `${CSI}1;${mod}${homeEndFinal}`;
  }

  const tildeCode = tildeKeyCode(keyName);
  if (tildeCode) {
    if (mod === null) return `${CSI}${tildeCode}~`;
    return `${CSI}${tildeCode};${mod}~`;
  }

  const functionKey = functionKeySpec(keyName);
  if (functionKey) {
    if (mod === null) return functionKey.base;
    return functionKey.modified(mod);
  }

  // Ctrl/Alt modifiers for single characters.
  if (parsed.key.length === 1) {
    let outChar = parsed.key;
    if (parsed.modifiers.shift && /^[a-z]$/i.test(outChar)) {
      outChar = outChar.toUpperCase();
    }

    let encoded = outChar;
    if (parsed.modifiers.ctrl && /^[a-z]$/i.test(outChar)) {
      encoded = ctrlChar(outChar);
    }
    if (parsed.modifiers.alt) {
      encoded = `\x1b${encoded}`;
    }
    return encoded;
  }

  throw new Error(`Unsupported key: ${key}`);
}

type KeyModifiers = { shift: boolean; alt: boolean; ctrl: boolean };

function parseKeySpec(spec: string): { modifiers: KeyModifiers; key: string } {
  const tokens = spec
    .trim()
    .split(/[+-]/g)
    .map((t) => t.trim())
    .filter(Boolean);

  const modifiers: KeyModifiers = { shift: false, alt: false, ctrl: false };
  const keys: string[] = [];

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (lower === "shift") {
      modifiers.shift = true;
      continue;
    }
    if (lower === "alt" || lower === "meta") {
      modifiers.alt = true;
      continue;
    }
    if (lower === "ctrl" || lower === "control") {
      modifiers.ctrl = true;
      continue;
    }
    keys.push(token);
  }

  const key = keys.join("+").trim();
  if (!key) throw new Error(`Unsupported key: ${spec}`);
  return { modifiers, key };
}

function modifierParam(mods: KeyModifiers): number | null {
  if (!mods.shift && !mods.alt && !mods.ctrl) return null;
  return 1 + (mods.shift ? 1 : 0) + (mods.alt ? 2 : 0) + (mods.ctrl ? 4 : 0);
}

function arrowKeyFinal(key: string): "A" | "B" | "C" | "D" | null {
  if (key === "up") return "A";
  if (key === "down") return "B";
  if (key === "right") return "C";
  if (key === "left") return "D";
  return null;
}

function homeEndFinalChar(key: string): "H" | "F" | null {
  if (key === "home") return "H";
  if (key === "end") return "F";
  return null;
}

function tildeKeyCode(key: string): "5" | "6" | "2" | "3" | null {
  if (key === "pageup" || key === "pgup") return "5";
  if (key === "pagedown" || key === "pgdn") return "6";
  if (key === "insert" || key === "ins") return "2";
  if (key === "delete" || key === "del") return "3";
  return null;
}

function functionKeySpec(key: string): { base: string; modified: (mod: number) => string } | null {
  const match = /^f(\d{1,2})$/.exec(key);
  if (!match) return null;

  const n = Number(match[1]);
  if (!Number.isFinite(n) || n < 1 || n > 12) return null;

  // F1..F4
  if (n === 1) return { base: `${SS3}P`, modified: (m) => `${CSI}1;${m}P` };
  if (n === 2) return { base: `${SS3}Q`, modified: (m) => `${CSI}1;${m}Q` };
  if (n === 3) return { base: `${SS3}R`, modified: (m) => `${CSI}1;${m}R` };
  if (n === 4) return { base: `${SS3}S`, modified: (m) => `${CSI}1;${m}S` };

  const tildeCodes: Record<number, string> = {
    5: "15",
    6: "17",
    7: "18",
    8: "19",
    9: "20",
    10: "21",
    11: "23",
    12: "24",
  };
  const code = tildeCodes[n];
  if (!code) return null;

  return {
    base: `${CSI}${code}~`,
    modified: (m) => `${CSI}${code};${m}~`,
  };
}

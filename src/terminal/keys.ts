const CSI = "\x1b[";

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

  const lower = normalized.toLowerCase();
  if (lower === "enter" || lower === "return") return "\r";
  if (lower === "tab") return "\t";
  if (lower === "escape" || lower === "esc") return "\x1b";
  if (lower === "backspace") return "\x7f";

  if (lower === "up") return `${CSI}A`;
  if (lower === "down") return `${CSI}B`;
  if (lower === "right") return `${CSI}C`;
  if (lower === "left") return `${CSI}D`;

  if (lower === "home") return `${CSI}H`;
  if (lower === "end") return `${CSI}F`;
  if (lower === "pageup") return `${CSI}5~`;
  if (lower === "pagedown") return `${CSI}6~`;
  if (lower === "insert") return `${CSI}2~`;
  if (lower === "delete") return `${CSI}3~`;

  const ctrlMatch = /^c-(.)$/i.exec(normalized);
  if (ctrlMatch) {
    return ctrlChar(ctrlMatch[1] ?? "");
  }

  throw new Error(`Unsupported key: ${key}`);
}

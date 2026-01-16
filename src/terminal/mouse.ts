const ESC = "\x1b";

export type MouseButton = "left" | "middle" | "right";

export type MouseAction = "down" | "up" | "move" | "click" | "scroll_up" | "scroll_down";

export type MouseModifiers = {
  shift?: boolean;
  alt?: boolean;
  ctrl?: boolean;
};

export type MouseEvent = {
  action: MouseAction;
  x: number;
  y: number;
  button?: MouseButton;
  modifiers?: MouseModifiers;
};

export function encodeSgrMouse(event: MouseEvent): string {
  const x = clampInt(event.x, 1, 500);
  const y = clampInt(event.y, 1, 300);

  if (event.action === "click") {
    const press = encodeSingleSgrMouse({ ...event, action: "down" }, x, y);
    const release = encodeSingleSgrMouse({ ...event, action: "up" }, x, y);
    return `${press}${release}`;
  }

  return encodeSingleSgrMouse(event, x, y);
}

function encodeSingleSgrMouse(event: MouseEvent, x: number, y: number): string {
  const modifiers = event.modifiers;
  const modifierBits =
    (modifiers?.shift ? 4 : 0) + (modifiers?.alt ? 8 : 0) + (modifiers?.ctrl ? 16 : 0);

  const buttonCode = buttonToCode(event.button ?? "left");

  if (event.action === "down") {
    return `${ESC}[<${buttonCode + modifierBits};${x};${y}M`;
  }

  if (event.action === "up") {
    return `${ESC}[<${buttonCode + modifierBits};${x};${y}m`;
  }

  if (event.action === "scroll_up") {
    return `${ESC}[<${64 + modifierBits};${x};${y}M`;
  }

  if (event.action === "scroll_down") {
    return `${ESC}[<${65 + modifierBits};${x};${y}M`;
  }

  // move
  // 32 indicates motion. When no button is pressed, use "3".
  const motionButton = event.button ? buttonCode : 3;
  return `${ESC}[<${32 + motionButton + modifierBits};${x};${y}M`;
}

function buttonToCode(button: MouseButton): number {
  if (button === "left") return 0;
  if (button === "middle") return 1;
  return 2;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const int = Math.trunc(value);
  if (int < min) return min;
  if (int > max) return max;
  return int;
}

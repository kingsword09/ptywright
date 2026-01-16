export type AsciicastHeader = {
  version: 2;
  width: number;
  height: number;
  timestamp?: number;
  env?: Record<string, string>;
  title?: string;
  command?: string;
};

export type AsciicastEvent = [timeSeconds: number, type: "o" | "i" | "m" | "r", data: string];

export function encodeAsciicast(header: AsciicastHeader, events: AsciicastEvent[]): string {
  const lines: string[] = [JSON.stringify(header)];
  for (const event of events) {
    lines.push(JSON.stringify(event));
  }
  return `${lines.join("\n")}\n`;
}

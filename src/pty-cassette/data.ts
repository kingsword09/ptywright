import { Buffer } from "node:buffer";

export type PtyCassetteData = string | Uint8Array | ArrayBuffer;

export function dataToBytes(data: PtyCassetteData): Uint8Array {
  if (typeof data === "string") return Buffer.from(data, "utf8");
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return data;
}

export function dataToBase64(data: PtyCassetteData): string {
  return Buffer.from(dataToBytes(data)).toString("base64");
}

export function base64ToBytes(dataBase64: string): Uint8Array {
  return Buffer.from(dataBase64, "base64");
}

export function byteLength(data: PtyCassetteData): number {
  return dataToBytes(data).byteLength;
}

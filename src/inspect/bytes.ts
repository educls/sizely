/** Tiny readers for binary headers: ASCII text and big/little-endian integers. */

export const ascii = (b: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...b.subarray(start, start + length))

export const be16 = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!

export const le16 = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8)

export const be32 = (b: Uint8Array, i: number) =>
  ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0

export const le32 = (b: Uint8Array, i: number) =>
  (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24)) >>> 0

/**
 * `crypto.randomUUID` is only defined in a secure context, and the dev server opened from a
 * phone by its address on the network is not one, so the map would stop making rooms in
 * exactly the situation FR-10 asks to be tested. `getRandomValues` is available everywhere,
 * and version 4 is four bits and two bits away from the bytes it hands out.
 */
export function randomUuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes, (byte, index) => {
    if (index === 6) return (((byte & 0x0f) | 0x40) >>> 0).toString(16).padStart(2, "0");
    if (index === 8) return (((byte & 0x3f) | 0x80) >>> 0).toString(16).padStart(2, "0");
    return byte.toString(16).padStart(2, "0");
  }).join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

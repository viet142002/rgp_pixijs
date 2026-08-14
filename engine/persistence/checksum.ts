/**
 * SHA-256 payload checksum (spec/03 E1).
 * Used to verify save integrity on load.
 */

export async function sha256Hex(input: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const bytes = new TextEncoder().encode(input);
    const buf = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Node fallback (vitest, scripts).
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(input, "utf-8").digest("hex");
}

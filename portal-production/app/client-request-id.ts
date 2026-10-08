type RandomSource = Pick<Crypto, "getRandomValues"> & Partial<Pick<Crypto, "randomUUID">>;

/** Retry identifier only; no patient information and no persistent storage. */
export function createClientRequestId(source: RandomSource = crypto): string {
  if (typeof source.randomUUID === "function") return source.randomUUID();
  // Older browsers may have secure randomness without randomUUID().
  const bytes = source.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

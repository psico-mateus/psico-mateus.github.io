const encoder = new TextEncoder();
const decoder = new TextDecoder();
const BASE32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PASSWORD_ITERATIONS = 310_000;

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function randomToken(length = 32): string {
  return bytesToBase64Url(randomBytes(length));
}

export function identifier(prefix: string): string {
  return `${prefix}_${randomToken(18)}`;
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function hmacBytes(secret: string, value: string, algorithm = "SHA-256") {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return new Uint8Array(signature);
}

export async function hmac(secret: string, value: string): Promise<string> {
  return bytesToBase64Url(await hmacBytes(secret, value));
}

export async function derivePassword(
  password: string,
  salt = randomToken(18),
  iterations = PASSWORD_ITERATIONS,
): Promise<{ salt: string; hash: string; iterations: number }> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64UrlToBytes(salt),
      iterations,
    },
    key,
    256,
  );
  return { salt, hash: bytesToBase64Url(new Uint8Array(derived)), iterations };
}

function constantTimeEqual(first: string, second: string): boolean {
  const left = encoder.encode(first);
  const right = encoder.encode(second);
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export async function passwordMatches(
  password: string,
  salt: string,
  expectedHash: string,
  iterations: number,
): Promise<boolean> {
  const candidate = await derivePassword(password, salt, iterations);
  return constantTimeEqual(candidate.hash, expectedHash);
}

export function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase("pt-BR");
}

export async function emailHash(appSecret: string, email: string): Promise<string> {
  return hmac(appSecret, `email:${normalizeEmail(email)}`);
}

export async function codeHash(appSecret: string, code: string, purpose: string): Promise<string> {
  return hmac(appSecret, `${purpose}:${String(code).replace(/[^A-Za-z0-9]/gu, "").toUpperCase()}`);
}

function randomBase32(length: number): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => BASE32[byte % BASE32.length]).join("");
}

export function createInvitationCode(): string {
  const value = randomBase32(16);
  return value.match(/.{1,4}/gu)?.join("-") ?? value;
}

export function createRecoveryCode(): string {
  const value = randomBase32(20);
  return value.match(/.{1,5}/gu)?.join("-") ?? value;
}

function base32Encode(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(value: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = value.toUpperCase().replace(/[^A-Z2-7]/gu, "");
  let bits = 0;
  let buffer = 0;
  const output: number[] = [];
  for (const character of clean) {
    const index = alphabet.indexOf(character);
    if (index < 0) continue;
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(output);
}

export function createTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

async function totpAt(secret: string, counter: number): Promise<string> {
  const message = new Uint8Array(8);
  let remaining = counter;
  for (let index = 7; index >= 0; index -= 1) {
    message[index] = remaining & 255;
    remaining = Math.floor(remaining / 256);
  }
  const key = await crypto.subtle.importKey(
    "raw",
    base32Decode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  const offset = signature[signature.length - 1] & 15;
  const binary =
    ((signature[offset] & 127) << 24) |
    ((signature[offset + 1] & 255) << 16) |
    ((signature[offset + 2] & 255) << 8) |
    (signature[offset + 3] & 255);
  return String(binary % 1_000_000).padStart(6, "0");
}

export async function verifyTotp(
  secret: string,
  candidate: string,
  lastCounter: number | null,
  timestamp = Date.now(),
): Promise<{ valid: boolean; counter: number | null }> {
  const clean = candidate.replace(/\D/gu, "");
  if (clean.length !== 6) return { valid: false, counter: null };
  const current = Math.floor(timestamp / 30_000);
  for (const offset of [-1, 0, 1]) {
    const counter = current + offset;
    if (lastCounter !== null && counter <= lastCounter) continue;
    if (constantTimeEqual(await totpAt(secret, counter), clean)) return { valid: true, counter };
  }
  return { valid: false, counter: null };
}

export function totpUri(secret: string, email: string): string {
  const issuer = "Mateus Ribeiro Marcos";
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`portal-encryption:${secret}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encrypt(appSecret: string, value: string): Promise<string> {
  const iv = randomBytes(12);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(appSecret),
    encoder.encode(value),
  );
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(encrypted))}`;
}

export async function decrypt(appSecret: string, value: string): Promise<string> {
  const [iv, encrypted] = value.split(".");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(iv) },
    await encryptionKey(appSecret),
    base64UrlToBytes(encrypted),
  );
  return decoder.decode(decrypted);
}

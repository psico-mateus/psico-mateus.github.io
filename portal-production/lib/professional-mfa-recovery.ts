import {
  base64UrlToBytes,
  bytesToBase64Url,
  codeHash,
  createTotpSecret,
  encrypt,
  decrypt,
  identifier,
  randomBytes,
} from "./crypto.ts";

export const PROFESSIONAL_MFA_RECOVERY_CODE_COUNT = 8;
export const PROFESSIONAL_MFA_RECOVERY_TICKET_TTL_MS = 10 * 60 * 1_000;

const RECOVERY_CODE_PURPOSE = "professional-mfa-recovery";
const TICKET_PURPOSE = "professional-mfa-recovery-ticket";
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const MAX_TICKET_LENGTH = 8_000;

export type ProfessionalMfaRecoveryCodeRecord = {
  id: string;
  position: number;
  codeHash: string;
};

export type ProfessionalMfaRecoverySet = {
  setId: string;
  generatedAt: string;
  codes: string[];
  records: ProfessionalMfaRecoveryCodeRecord[];
};

type ProfessionalMfaRecoveryTicketPayload = {
  version: 1;
  purpose: typeof TICKET_PURPOSE;
  jti: string;
  userId: string;
  recoveryCodeId: string;
  expectedRecoverySetId: string;
  expectedCodeHash: string;
  expectedPasswordHash: string;
  expectedOldTotpCiphertext: string;
  newTotpSecret: string;
  replacementTotpCiphertext: string;
  issuedAt: string;
  expiresAt: string;
};

export type ProfessionalMfaRecoveryTicketBinding = Pick<
  ProfessionalMfaRecoveryTicketPayload,
  | "userId"
  | "recoveryCodeId"
  | "expectedRecoverySetId"
  | "expectedCodeHash"
  | "expectedPasswordHash"
  | "expectedOldTotpCiphertext"
>;

export type OpenProfessionalMfaRecoveryTicket = Readonly<
  ProfessionalMfaRecoveryTicketPayload
>;

function base32Encode(bytes: Uint8Array): string {
  let buffer = 0;
  let bits = 0;
  let output = "";
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  return output;
}

function createEmergencyCode(): string {
  // Dez bytes produzem exatamente 16 símbolos base32: 80 bits de entropia.
  const value = base32Encode(randomBytes(10));
  return value.match(/.{1,4}/gu)?.join("-") ?? value;
}

export async function hashProfessionalMfaRecoveryCode(
  appSecret: string,
  userId: string,
  code: unknown,
): Promise<string> {
  return codeHash(
    appSecret,
    String(code ?? ""),
    `${RECOVERY_CODE_PURPOSE}:${userId}`,
  );
}

export async function createProfessionalMfaRecoverySet(
  appSecret: string,
  userId: string,
  instant = Date.now(),
): Promise<ProfessionalMfaRecoverySet> {
  const codes = new Set<string>();
  while (codes.size < PROFESSIONAL_MFA_RECOVERY_CODE_COUNT) {
    codes.add(createEmergencyCode());
  }
  const plaintextCodes = [...codes];
  const records = await Promise.all(
    plaintextCodes.map(async (code, index) => ({
      id: identifier("mfa_recovery"),
      position: index + 1,
      codeHash: await hashProfessionalMfaRecoveryCode(appSecret, userId, code),
    })),
  );
  return {
    setId: identifier("mfa_set"),
    generatedAt: new Date(instant).toISOString(),
    codes: plaintextCodes,
    records,
  };
}

export async function createProfessionalMfaRecoveryTicket(
  appSecret: string,
  binding: ProfessionalMfaRecoveryTicketBinding,
  instant = Date.now(),
): Promise<{
  ticket: string;
  totpSecret: string;
  expiresAt: string;
}> {
  const issuedAt = new Date(instant).toISOString();
  const expiresAt = new Date(
    instant + PROFESSIONAL_MFA_RECOVERY_TICKET_TTL_MS,
  ).toISOString();
  const newTotpSecret = createTotpSecret();
  const payload: ProfessionalMfaRecoveryTicketPayload = {
    version: 1,
    purpose: TICKET_PURPOSE,
    jti: identifier("mfa_recovery_ticket"),
    ...binding,
    newTotpSecret,
    replacementTotpCiphertext: await encrypt(appSecret, newTotpSecret),
    issuedAt,
    expiresAt,
  };
  return {
    ticket: await encrypt(appSecret, JSON.stringify(payload)),
    totpSecret: newTotpSecret,
    expiresAt,
  };
}

function isBoundedString(
  value: unknown,
  minimum: number,
  maximum: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length >= minimum &&
    value.length <= maximum
  );
}

function isCanonicalCiphertext(value: string): boolean {
  // Não aceite sufixos, padding nem aliases dos bits finais do base64. Além de
  // falhar fechado, isso impede representações diferentes do mesmo ticket.
  if (!/^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/u.test(value)) return false;
  return value.split(".").every(
    (part) => bytesToBase64Url(base64UrlToBytes(part)) === part,
  );
}

export async function openProfessionalMfaRecoveryTicket(
  appSecret: string,
  ticket: unknown,
  instant = Date.now(),
): Promise<OpenProfessionalMfaRecoveryTicket | null> {
  if (
    !isBoundedString(ticket, 200, MAX_TICKET_LENGTH) ||
    !ticket.includes(".")
  ) {
    return null;
  }

  try {
    if (!isCanonicalCiphertext(ticket)) return null;
    const payload = JSON.parse(
      await decrypt(appSecret, ticket),
    ) as Partial<ProfessionalMfaRecoveryTicketPayload>;
    const issuedAt = Date.parse(String(payload.issuedAt ?? ""));
    const expiresAt = Date.parse(String(payload.expiresAt ?? ""));
    const valid =
      payload.version === 1 &&
      payload.purpose === TICKET_PURPOSE &&
      isBoundedString(payload.jti, 16, 160) &&
      isBoundedString(payload.userId, 8, 160) &&
      isBoundedString(payload.recoveryCodeId, 8, 160) &&
      isBoundedString(payload.expectedRecoverySetId, 8, 160) &&
      isBoundedString(payload.expectedCodeHash, 32, 160) &&
      isBoundedString(payload.expectedPasswordHash, 32, 160) &&
      isBoundedString(payload.expectedOldTotpCiphertext, 32, 1_000) &&
      isBoundedString(payload.newTotpSecret, 32, 64) &&
      /^[A-Z2-7]+$/u.test(payload.newTotpSecret) &&
      isBoundedString(payload.replacementTotpCiphertext, 32, 1_000) &&
      Number.isFinite(issuedAt) &&
      Number.isFinite(expiresAt) &&
      issuedAt <= instant &&
      expiresAt > instant &&
      expiresAt - issuedAt > 0 &&
      expiresAt - issuedAt <= PROFESSIONAL_MFA_RECOVERY_TICKET_TTL_MS;
    if (!valid || !isCanonicalCiphertext(payload.replacementTotpCiphertext!)) {
      return null;
    }
    if (
      (await decrypt(appSecret, payload.replacementTotpCiphertext!)) !==
      payload.newTotpSecret
    ) return null;
    return payload as ProfessionalMfaRecoveryTicketPayload;
  } catch {
    return null;
  }
}

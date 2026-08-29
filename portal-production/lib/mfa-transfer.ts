import { decrypt, encrypt } from "./crypto.ts";

export const MFA_TRANSFER_TICKET_TTL_MS = 15 * 60 * 1_000;

const MFA_TRANSFER_PURPOSE = "professional-mfa-transfer";
const MAX_TICKET_LENGTH = 4_000;

type MfaTransferTicketPayload = {
  version: 1;
  purpose: typeof MFA_TRANSFER_PURPOSE;
  userId: string;
  sessionTokenHash: string;
  expectedTotpCiphertext: string;
  expiresAt: string;
};

export type MfaTransferTicketBinding = {
  userId: string;
  sessionTokenHash: string;
  expectedTotpCiphertext: string;
};

export async function createMfaTransferTicket(
  appSecret: string,
  binding: MfaTransferTicketBinding,
  instant = Date.now(),
): Promise<{ ticket: string; expiresAt: string }> {
  const expiresAt = new Date(instant + MFA_TRANSFER_TICKET_TTL_MS).toISOString();
  const payload: MfaTransferTicketPayload = {
    version: 1,
    purpose: MFA_TRANSFER_PURPOSE,
    userId: binding.userId,
    sessionTokenHash: binding.sessionTokenHash,
    expectedTotpCiphertext: binding.expectedTotpCiphertext,
    expiresAt,
  };
  return {
    ticket: await encrypt(appSecret, JSON.stringify(payload)),
    expiresAt,
  };
}

export async function isValidMfaTransferTicket(
  appSecret: string,
  ticket: unknown,
  binding: MfaTransferTicketBinding,
  instant = Date.now(),
): Promise<boolean> {
  if (typeof ticket !== "string" || ticket.length < 80 || ticket.length > MAX_TICKET_LENGTH) {
    return false;
  }

  try {
    const payload = JSON.parse(
      await decrypt(appSecret, ticket),
    ) as Partial<MfaTransferTicketPayload>;
    const expiresAt = Date.parse(String(payload.expiresAt ?? ""));
    return (
      payload.version === 1 &&
      payload.purpose === MFA_TRANSFER_PURPOSE &&
      payload.userId === binding.userId &&
      payload.sessionTokenHash === binding.sessionTokenHash &&
      payload.expectedTotpCiphertext === binding.expectedTotpCiphertext &&
      Number.isFinite(expiresAt) &&
      expiresAt > instant &&
      expiresAt <= instant + MFA_TRANSFER_TICKET_TTL_MS
    );
  } catch {
    return false;
  }
}

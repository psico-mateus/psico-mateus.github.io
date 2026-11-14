/**
 * Decide se a pessoa precisa ser avisada de que o aviso de privacidade mudou.
 *
 * Só pacientes aceitam o aviso no cadastro. A versão aceita fica em
 * `users.privacy_version`; a ciência de uma versão nova atualiza esse campo.
 */
export function privacyNoticePending(
  role: "patient" | "therapist",
  storedVersion: string | null | undefined,
  currentVersion: string,
): boolean {
  return role === "patient" && storedVersion !== currentVersion;
}

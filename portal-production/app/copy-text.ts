function copyWithSelection(text: string) {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") {
    throw new Error("A cópia não é compatível com este navegador.");
  }

  const activeElement =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const selection = document.getSelection();
  const previousRanges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) =>
        selection.getRangeAt(index).cloneRange(),
      )
    : [];
  const textArea = document.createElement("textarea");

  textArea.value = text;
  textArea.readOnly = true;
  textArea.setAttribute("aria-hidden", "true");
  Object.assign(textArea.style, {
    position: "fixed",
    inset: "0 auto auto 0",
    width: "1px",
    height: "1px",
    padding: "0",
    border: "0",
    fontSize: "16px",
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.appendChild(textArea);

  try {
    textArea.focus({ preventScroll: true });
    textArea.select();
    textArea.setSelectionRange(0, text.length);
    if (!document.execCommand("copy")) {
      throw new Error("O navegador recusou a cópia.");
    }
  } finally {
    textArea.remove();
    if (selection) {
      selection.removeAllRanges();
      previousRanges.forEach((range) => selection.addRange(range));
    }
    activeElement?.focus({ preventScroll: true });
  }
}

export async function copyText(text: string) {
  if (!text) throw new Error("Não há conteúdo para copiar.");

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Safari and installed web apps may reject Clipboard API access.
    }
  }

  copyWithSelection(text);
}

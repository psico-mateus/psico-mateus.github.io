import assert from "node:assert/strict";
import test from "node:test";
import { copyText } from "../app/copy-text.ts";

const COPY_TEXT = "SYNTHETIC-COPY-1234";

async function withFakeClipboardDom(options, run) {
  const originalDescriptors = new Map(
    ["navigator", "document", "HTMLElement"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  const state = {
    nativeAttempts: [],
    appendTargets: [],
    focusAttempts: [],
    execAttempts: [],
    removed: [],
    selectionRestores: [],
    temporary: null,
  };
  const previousRanges = ["first-range", "second-range"].map((id) => ({
    id,
    cloneRange() { return { id, cloned: true }; },
  }));
  const selection = {
    ranges: [...previousRanges],
    get rangeCount() { return this.ranges.length; },
    getRangeAt(index) { return this.ranges[index]; },
    removeAllRanges() { this.ranges = []; },
    addRange(range) {
      this.ranges.push(range);
      state.selectionRestores.push(range);
    },
  };
  let document;
  let modal;

  class FakeElement {
    constructor(kind) {
      this.kind = kind;
      this.parentElement = null;
      this.children = [];
    }
    appendChild(element) {
      this.children.push(element);
      element.parentElement = this;
      state.appendTargets.push(this);
      return element;
    }
    contains(element) {
      for (let current = element; current; current = current.parentElement) {
        if (current === this) return true;
      }
      return false;
    }
    closest(selector) {
      assert.match(selector, /\[role=["']dialog["']\]/u);
      assert.match(selector, /(?:^|,)\s*dialog(?:$|,)/u);
      if (["dialog", "role-dialog"].includes(this.kind)) return this;
      for (let current = this.parentElement; current; current = current.parentElement) {
        if (["dialog", "role-dialog"].includes(current.kind)) return current;
      }
      return null;
    }
    focus(focusOptions) {
      state.focusAttempts.push({ element: this, options: focusOptions });
      // The modal's focus trap rejects elements mounted elsewhere in the page.
      document.activeElement = modal && !modal.contains(this) ? state.originalActive : this;
    }
  }

  class FakeTextArea extends FakeElement {
    constructor() {
      super("textarea");
      this.value = "";
      this.readOnly = false;
      this.style = {};
      this.attributes = new Map();
      this.selectedRange = null;
    }
    setAttribute(key, value) { this.attributes.set(key, value); }
    select() {
      this.selectedRange = [0, this.value.length];
      selection.ranges = [{ id: "temporary-selection" }];
    }
    setSelectionRange(start, end) { this.selectedRange = [start, end]; }
    remove() {
      state.removed.push(this);
      if (this.parentElement) {
        this.parentElement.children = this.parentElement.children.filter((element) => element !== this);
      }
      this.parentElement = null;
    }
  }

  const body = new FakeElement("body");
  modal = options.modal ? new FakeElement(options.modal) : null;
  if (modal) {
    modal.parentElement = body;
    body.children.push(modal);
  }
  const activeElement = options.active === false ? null : new FakeElement("copy-button");
  if (activeElement) {
    activeElement.parentElement = modal ?? body;
    (modal ?? body).children.push(activeElement);
  }
  state.originalActive = activeElement;
  document = {
    activeElement,
    body,
    getSelection: () => selection,
    createElement(tag) {
      assert.equal(tag, "textarea");
      state.temporary = new FakeTextArea();
      return state.temporary;
    },
    execCommand(command) {
      assert.equal(command, "copy");
      const textarea = state.temporary;
      const focusedAndSelected = this.activeElement === textarea
        && textarea.selectedRange?.[0] === 0
        && textarea.selectedRange?.[1] === COPY_TEXT.length;
      state.execAttempts.push({ command, focusedAndSelected, parent: textarea.parentElement });
      if (options.execThrows) throw new Error("Synthetic copy exception");
      return focusedAndSelected && options.execResult !== false;
    },
  };
  const navigator = options.clipboard === "absent" ? {} : {
    clipboard: {
      async writeText(text) {
        state.nativeAttempts.push(text);
        if (options.clipboard !== "success") throw new Error("Synthetic NotAllowedError");
      },
    },
  };

  try {
    for (const [key, value] of [["navigator", navigator], ["document", document], ["HTMLElement", FakeElement]]) {
      Object.defineProperty(globalThis, key, { configurable: true, value });
    }
    await run({ state, document, body, modal, selection, previousRanges });
  } finally {
    for (const [key, descriptor] of originalDescriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

function assertFallbackCleanup({ state, document, selection, previousRanges }) {
  assert.deepEqual(state.removed, [state.temporary]);
  assert.equal(state.temporary.parentElement, null);
  assert.equal(document.activeElement, state.originalActive);
  assert.deepEqual(selection.ranges, previousRanges.map(({ id }) => ({ id, cloned: true })));
  assert.equal(state.selectionRestores.length, previousRanges.length);
  if (state.originalActive) {
    assert.deepEqual(state.focusAttempts.at(-1), {
      element: state.originalActive,
      options: { preventScroll: true },
    });
  }
  assert.equal(state.temporary.readOnly, true);
  assert.equal(state.temporary.attributes.get("aria-hidden"), "true");
}

for (const [modal, clipboard] of [["role-dialog", "blocked"], ["dialog", "absent"]]) {
  test(`clipboard fallback stays focused and selected inside ${modal}`, async () => {
    await withFakeClipboardDom({ modal, clipboard }, async (fixture) => {
      await copyText(COPY_TEXT);
      assert.deepEqual(fixture.state.appendTargets, [fixture.modal]);
      assert.deepEqual(fixture.state.execAttempts, [{ command: "copy", focusedAndSelected: true, parent: fixture.modal }]);
      assert.deepEqual(fixture.state.focusAttempts[0].options, { preventScroll: true });
      assert.equal(fixture.body.children.includes(fixture.state.temporary), false);
      assertFallbackCleanup(fixture);
    });
  });
}

test("the focus-trap fixture rejects an incorrectly body-mounted modal textarea", async () => {
  await withFakeClipboardDom({ modal: "dialog", clipboard: "absent" }, async (fixture) => {
    fixture.state.originalActive.closest = () => null;
    await assert.rejects(copyText(COPY_TEXT), /O navegador recusou a cópia/u);
    assert.deepEqual(fixture.state.appendTargets, [fixture.body]);
    assert.equal(fixture.state.execAttempts[0].focusedAndSelected, false);
    assertFallbackCleanup(fixture);
  });
});

test("clipboard fallback outside a modal still mounts in body and restores focus/ranges", async () => {
  await withFakeClipboardDom({ clipboard: "blocked" }, async (fixture) => {
    await copyText(COPY_TEXT);
    assert.deepEqual(fixture.state.nativeAttempts, [COPY_TEXT]);
    assert.deepEqual(fixture.state.appendTargets, [fixture.body]);
    assert.deepEqual(fixture.state.execAttempts, [{ command: "copy", focusedAndSelected: true, parent: fixture.body }]);
    assertFallbackCleanup(fixture);
  });
});

test("execCommand refusal rejects but removes temporary modal node and restores focus/ranges", async () => {
  await withFakeClipboardDom({ modal: "dialog", clipboard: "blocked", execResult: false }, async (fixture) => {
    await assert.rejects(copyText(COPY_TEXT), /O navegador recusou a cópia/u);
    assert.deepEqual(fixture.state.appendTargets, [fixture.modal]);
    assert.equal(fixture.state.execAttempts[0].focusedAndSelected, true);
    assertFallbackCleanup(fixture);
  });
});

test("execCommand exception also cleans up its modal selection", async () => {
  await withFakeClipboardDom({ modal: "role-dialog", clipboard: "absent", execThrows: true }, async (fixture) => {
    await assert.rejects(copyText(COPY_TEXT), /Synthetic copy exception/u);
    assertFallbackCleanup(fixture);
  });
});

test("clipboard fallback works with no previously focused element", async () => {
  await withFakeClipboardDom({ active: false, clipboard: "absent" }, async (fixture) => {
    await copyText(COPY_TEXT);
    assert.deepEqual(fixture.state.appendTargets, [fixture.body]);
    assert.deepEqual(fixture.state.removed, [fixture.state.temporary]);
    assert.equal(fixture.state.temporary.parentElement, null);
    assert.deepEqual(fixture.selection.ranges, fixture.previousRanges.map(({ id }) => ({ id, cloned: true })));
  });
});

test("successful native Clipboard API does not mount a textarea or alter focus/selection", async () => {
  await withFakeClipboardDom({ modal: "dialog", clipboard: "success" }, async (fixture) => {
    await copyText(COPY_TEXT);
    assert.deepEqual(fixture.state.nativeAttempts, [COPY_TEXT]);
    assert.deepEqual(fixture.state.appendTargets, []);
    assert.deepEqual(fixture.state.execAttempts, []);
    assert.equal(fixture.document.activeElement, fixture.state.originalActive);
    assert.deepEqual(fixture.selection.ranges, fixture.previousRanges);
  });
});

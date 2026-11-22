import { describe, expect, it } from "vitest"
import { shortcutKey } from "./keys"

describe("shortcutKey", () => {
  it("takes a Latin letter as typed, whatever the physical key", () => {
    expect(shortcutKey({ key: "z", code: "KeyZ" })).toBe("z")
    expect(shortcutKey({ key: "Z", code: "KeyZ" })).toBe("z")
    // QWERTZ: the key labelled Z sits where QWERTY has Y — ⌘Z must stay undo, not become redo.
    expect(shortcutKey({ key: "z", code: "KeyY" })).toBe("z")
    // AZERTY: A sits on the QWERTY Q key.
    expect(shortcutKey({ key: "a", code: "KeyQ" })).toBe("a")
  })

  it("falls back to the physical key when the press types no Latin letter", () => {
    // Russian layout: the Z key types «я», G types «п».
    expect(shortcutKey({ key: "я", code: "KeyZ" })).toBe("z")
    expect(shortcutKey({ key: "П", code: "KeyG" })).toBe("g")
    // ⌥G on a Mac types ©.
    expect(shortcutKey({ key: "©", code: "KeyG" })).toBe("g")
  })

  it("passes other keys through", () => {
    expect(shortcutKey({ key: "Delete", code: "Delete" })).toBe("delete")
    expect(shortcutKey({ key: "]", code: "BracketRight" })).toBe("]")
    expect(shortcutKey({ key: "F2", code: "F2" })).toBe("f2")
  })
})

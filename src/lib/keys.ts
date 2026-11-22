// Keyboard shortcuts: which letter a key press means.

type KeyLike = Pick<KeyboardEvent, "key" | "code">

/**
 * The shortcut key of a press, lower case. A Latin letter is taken as typed,
 * so AZERTY, QWERTZ and Dvorak keep their own Z, A, Y…; when the press types
 * no Latin letter (a Russian layout, or ⌥ turning G into ©) the physical key
 * decides. Other keys ("Delete", "]", "F2") come from `key`.
 */
export function shortcutKey(e: KeyLike): string {
  if (/^[a-z]$/i.test(e.key)) return e.key.toLowerCase()
  return e.code.startsWith("Key") ? e.code.slice(3).toLowerCase() : e.key.toLowerCase()
}

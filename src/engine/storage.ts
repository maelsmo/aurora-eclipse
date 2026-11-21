// Browser storage. Every access is guarded: private windows, full quotas and
// blocked storage must never break the app.

/** Current keys. Everything is written here only. */
export const KEYS = {
  draft: "ae:v3:draft",
  collection: "ae:v3:collection",
  sets: "ae:v3:sets",
  ui: "ae:v3:ui",
} as const

/** Keys of the v2 app: read once for migration, never written. */
export const KEYS_V2 = {
  draft: "ae:v2:draft",
  collection: "ae:v2:collection",
  alphabets: "ae:v2:alphabets",
  currentAlphabet: "ae:v2:alphabet-current",
  ui: "ae:v2:ui",
} as const

export function readJSON<T = unknown>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

/** Returns false when the value could not be written. */
export function writeJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function readFileText(file: File): Promise<string> {
  return file.text()
}

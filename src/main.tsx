import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { useStore } from "./state/store"
import { runtime } from "./state/runtime"
import * as presets from "./engine/presets"
import "./index.css"

// The interface follows the system theme; the canvas keeps the scene's own background.
const darkQuery = window.matchMedia?.("(prefers-color-scheme: dark)")
const applyTheme = () => document.documentElement.classList.toggle("dark", !!darkQuery?.matches)
applyTheme()
darkQuery?.addEventListener("change", applyTheme)

if (import.meta.env.DEV) {
  Object.assign(window, { __ae: { store: useStore, runtime, presets } })
  // ?debug=parity compares the GPU interpreter with the CPU reference on every preset.
  if (new URLSearchParams(location.search).get("debug") === "parity")
    import("./engine/parity").then(({ parityAll }) => {
      const st = useStore.getState()
      const rows = parityAll(st.library)
      console.table(rows)
      const pre = document.createElement("pre")
      pre.className = "fixed right-3 bottom-3 z-50 max-w-md rounded-lg border bg-background p-3 text-xs shadow-lg"
      pre.textContent =
        "GPU ↔ CPU parity\n" +
        rows.map((r) => `${r.flipped === 0 ? "✓" : "✗"} ${r.name}: flipped ${r.flipped} / edge ${r.edge}, max Δα ${r.maxDelta}`).join("\n")
      document.body.appendChild(pre)
    })
}

// ?preset=<id> opens a starter scene or pattern: links to live examples. The scene it replaces
// stays one undo away, and the address is cleaned so a reload keeps the edits.
const wanted = new URLSearchParams(location.search).get("preset")
const linked = wanted ? [...presets.presets, ...presets.patternPresets].find((p) => p.id === wanted) : undefined
if (linked) {
  const st = useStore.getState()
  st.setTab("studio")
  st.replaceScene(linked.make())
  st.select(null)
  history.replaceState(null, "", location.pathname)
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

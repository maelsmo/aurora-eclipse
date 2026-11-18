import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { useStore } from "./state/store"
import { runtime } from "./state/runtime"
import * as presets from "./engine/presets"
import "./index.css"

if (import.meta.env.DEV) {
  Object.assign(window, { __ae: { store: useStore, runtime, presets } })
  // ?debug=parity compares the GPU interpreter with the CPU reference on every preset.
  if (new URLSearchParams(location.search).get("debug") === "parity")
    import("./engine/parity").then(({ parityAll }) => {
      const st = useStore.getState()
      const rows = parityAll(st.alphabet, st.revision)
      console.table(rows)
      const pre = document.createElement("pre")
      pre.className = "fixed right-3 bottom-3 z-50 max-w-md rounded-lg border bg-background p-3 text-xs shadow-lg"
      pre.textContent =
        "GPU ↔ CPU parity\n" +
        rows.map((r) => `${r.flipped === 0 ? "✓" : "✗"} ${r.name}: flipped ${r.flipped} / edge ${r.edge}, max Δα ${r.maxDelta}`).join("\n")
      document.body.appendChild(pre)
    })
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

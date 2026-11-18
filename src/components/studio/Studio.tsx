import { LayersPanel } from "./LayersPanel"
import { StudioCanvas } from "./StudioCanvas"
import { Inspector } from "./Inspector"
import { VariationsStrip } from "./VariationsStrip"

export function Studio() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
      <div className="order-2 flex h-80 lg:order-1 lg:h-auto">
        <LayersPanel />
      </div>
      <div className="order-1 flex min-h-[60dvh] min-w-0 flex-1 flex-col gap-3 lg:order-2 lg:min-h-0">
        <StudioCanvas />
        <VariationsStrip />
      </div>
      <div className="order-3 flex h-[32rem] lg:h-auto">
        <Inspector />
      </div>
    </div>
  )
}

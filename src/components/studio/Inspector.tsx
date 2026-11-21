import { useEffect, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { isGroup, mergeParent } from "@/engine/scene"
import { selectedIds, useStore } from "@/state/store"
import { ClonerTab } from "./ClonerTab"
import { CombineTab } from "./CombineTab"
import { MotionTab } from "./MotionTab"
import { MaterialTab } from "./MaterialTab"
import { LookTab } from "./LookTab"
import { ObjectTab, SceneTab } from "./ObjectTab"
import { PhysicsTab } from "./PhysicsTab"

type TabDef = { value: string; label: string; Body: () => React.ReactNode }

const sceneTabs: TabDef[] = [
  { value: "scene", label: "Сцена", Body: SceneTab },
  { value: "look", label: "Вид", Body: LookTab },
  { value: "material", label: "Материал", Body: MaterialTab },
  { value: "motion", label: "Движение", Body: () => <MotionTab scope="scene" /> },
  { value: "physics", label: "Физика", Body: PhysicsTab },
]

/** The tab set follows the selection: the scene when nothing is selected, the object otherwise. */
export function Inspector() {
  const ids = useStore(useShallow(selectedIds))
  const kind = useStore((s) => {
    const n = s.scene.layers.find((l) => l.id === s.selected[s.selected.length - 1])
    if (!n) return "scene"
    if (isGroup(n)) return n.mode === "merge" ? "merge" : "group"
    return mergeParent(s.scene.layers, n.id) ? "in-merge" : "leaf"
  })
  const tabs: TabDef[] =
    kind === "scene"
      ? sceneTabs
      : [
          { value: "object", label: "Объект", Body: ObjectTab },
          { value: "look", label: "Вид", Body: LookTab },
          ...(kind === "in-merge" || kind === "merge" ? [{ value: "combine", label: "Сочетание", Body: CombineTab }] : []),
          ...(kind === "group" && ids.length === 1 ? [{ value: "cloner", label: "Клонер", Body: ClonerTab }] : []),
          { value: "motion", label: "Движение", Body: () => <MotionTab scope="object" /> },
        ]
  const [tab, setTab] = useState(tabs[0].value)
  // Keep the open tab when it exists in the new set, otherwise open the first one.
  useEffect(() => {
    if (!tabs.some((t) => t.value === tab)) setTab(tabs[0].value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, ids.length])
  const current = tabs.some((t) => t.value === tab) ? tab : tabs[0].value

  return (
    <aside className="flex min-h-0 w-full flex-col rounded-xl border bg-card lg:w-[22rem] lg:shrink-0" aria-label="Параметры">
      <Tabs value={current} onValueChange={(v) => setTab(String(v))} className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="border-b p-2">
          <TabsList className="w-full">
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {tabs.map(({ value, Body }) => (
          <TabsContent key={value} value={value} className="min-h-0 flex-1">
            <ScrollArea className="h-full">
              <Body />
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>
    </aside>
  )
}

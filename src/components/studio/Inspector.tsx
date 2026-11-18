import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FormTab } from "./FormTab"
import { CombineTab } from "./CombineTab"
import { MotionTab } from "./MotionTab"
import { MaterialTab } from "./MaterialTab"

const tabs = [
  { value: "form", label: "Форма", Body: FormTab },
  { value: "combine", label: "Сочетание", Body: CombineTab },
  { value: "motion", label: "Движение", Body: MotionTab },
  { value: "material", label: "Материал", Body: MaterialTab },
]

export function Inspector() {
  return (
    <aside className="flex min-h-0 w-full flex-col rounded-xl border bg-card lg:w-[22rem] lg:shrink-0" aria-label="Параметры">
      <Tabs defaultValue="form" className="flex min-h-0 flex-1 flex-col gap-0">
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

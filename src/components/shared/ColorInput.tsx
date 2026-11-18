import { useId } from "react"
import { cn } from "@/lib/utils"

/** Swatch button backed by the native colour picker. */
export function ColorInput({
  value,
  onChange,
  label,
  className,
  showValue = false,
}: {
  value: string
  onChange: (hex: string) => void
  label: string
  className?: string
  showValue?: boolean
}) {
  const id = useId()
  return (
    <label
      htmlFor={id}
      title={label}
      className={cn(
        "relative inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-input px-1.5 text-xs transition-colors hover:bg-muted focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        showValue ? "pr-2.5" : "w-8 justify-center",
        className,
      )}
    >
      <span className="size-5 rounded-md ring-1 ring-foreground/15" style={{ background: value }} />
      {showValue && <span className="font-mono uppercase tabular-nums">{value}</span>}
      <input
        id={id}
        type="color"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
    </label>
  )
}

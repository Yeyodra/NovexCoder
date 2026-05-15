import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Inline Slot (replaces @radix-ui/react-slot)
// ---------------------------------------------------------------------------
type AnyProps = Record<string, unknown>

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (value: T) => {
    for (const ref of refs) {
      if (!ref) continue
      if (typeof ref === "function") ref(value)
      else (ref as React.MutableRefObject<T | null>).current = value
    }
  }
}

function mergeProps(childProps: AnyProps, slotProps: AnyProps): AnyProps {
  const merged: AnyProps = { ...slotProps }
  for (const key in childProps) {
    const slotValue = slotProps[key]
    const childValue = childProps[key]
    if (/^on[A-Z]/.test(key) && typeof slotValue === "function" && typeof childValue === "function") {
      merged[key] = (...args: unknown[]) => {
        (childValue as (...a: unknown[]) => unknown)(...args);
        (slotValue as (...a: unknown[]) => unknown)(...args)
      }
    } else if (key === "className" && typeof slotValue === "string" && typeof childValue === "string") {
      merged[key] = `${childValue} ${slotValue}`
    } else if (key === "style" && typeof slotValue === "object" && typeof childValue === "object") {
      merged[key] = { ...(childValue as object), ...(slotValue as object) }
    } else {
      merged[key] = childValue
    }
  }
  return merged
}

interface SlotProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode
}

const Slot = React.forwardRef<HTMLElement, SlotProps>(function Slot(
  { children, ...slotProps },
  ref,
) {
  if (!React.isValidElement(children)) return null
  const child = children as React.ReactElement<AnyProps & { ref?: React.Ref<unknown> }>
  return React.cloneElement(child, {
    ...mergeProps(child.props as AnyProps, slotProps as AnyProps),
    ref: mergeRefs(ref as React.Ref<unknown>, (child as unknown as { ref?: React.Ref<unknown> }).ref),
  } as AnyProps)
})

// ---------------------------------------------------------------------------
// Tinted color system using color-mix()
// ---------------------------------------------------------------------------
const TINT_PRIMARY = [
  "bg-[color-mix(in_srgb,var(--primary-base)_10%,var(--background))]",
  "text-[var(--primary-base)]",
  "border border-[color-mix(in_srgb,var(--primary-base)_12%,transparent)]",
  "hover:bg-[color-mix(in_srgb,var(--primary-base)_16%,var(--background))]",
  "active:bg-[color-mix(in_srgb,var(--primary-base)_22%,var(--background))]",
  "dark:bg-[color-mix(in_srgb,var(--primary-base)_16%,transparent)]",
  "dark:border-[color-mix(in_srgb,var(--primary-base)_20%,transparent)]",
  "dark:hover:bg-[color-mix(in_srgb,var(--primary-base)_22%,transparent)]",
  "dark:active:bg-[color-mix(in_srgb,var(--primary-base)_30%,transparent)]",
].join(" ")

const TINT_DESTRUCTIVE = [
  "bg-[color-mix(in_srgb,var(--status-error)_7%,var(--background))]",
  "text-[var(--status-error)]",
  "border border-[color-mix(in_srgb,var(--status-error)_9%,transparent)]",
  "hover:bg-[color-mix(in_srgb,var(--status-error)_11%,var(--background))]",
  "active:bg-[color-mix(in_srgb,var(--status-error)_16%,var(--background))]",
  "dark:bg-[color-mix(in_srgb,var(--status-error)_9%,transparent)]",
  "dark:border-[color-mix(in_srgb,var(--status-error)_14%,transparent)]",
  "dark:hover:bg-[color-mix(in_srgb,var(--status-error)_14%,transparent)]",
  "dark:active:bg-[color-mix(in_srgb,var(--status-error)_20%,transparent)]",
].join(" ")

// ---------------------------------------------------------------------------
// Button variants (CVA)
// ---------------------------------------------------------------------------
const buttonVariants = cva(
  [
    "group relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] [corner-shape:squircle] supports-[corner-shape:squircle]:rounded-[50px] font-medium lowercase tracking-[0.01em] shrink-0 select-none",
    "transition-[background-color,border-color,color,opacity] duration-150 ease-out outline-none",
    "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
    "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default: TINT_PRIMARY,
        destructive: cn(
          TINT_DESTRUCTIVE,
          "focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        ),
        neutral:
          "bg-interactive-hover text-foreground border border-border/60 hover:bg-interactive-active",
        outline:
          "bg-[var(--surface-elevated)] text-foreground border border-border/60 hover:bg-interactive-hover hover:text-foreground",
        chip: cn(
          "border border-border/60 bg-transparent text-foreground hover:bg-interactive-hover hover:text-foreground",
          "aria-pressed:bg-[color-mix(in_srgb,var(--primary-base)_10%,var(--background))]",
          "aria-pressed:text-[var(--primary-base)]",
          "aria-pressed:border-[color-mix(in_srgb,var(--primary-base)_12%,transparent)]",
          "aria-pressed:hover:bg-[color-mix(in_srgb,var(--primary-base)_16%,var(--background))]",
          "aria-pressed:hover:text-[var(--primary-base)]",
          "dark:aria-pressed:bg-[color-mix(in_srgb,var(--primary-base)_16%,transparent)]",
          "dark:aria-pressed:border-[color-mix(in_srgb,var(--primary-base)_20%,transparent)]",
          "dark:aria-pressed:hover:bg-[color-mix(in_srgb,var(--primary-base)_22%,transparent)]",
        ),
        secondary:
          "bg-interactive-hover text-foreground hover:bg-interactive-active",
        ghost:
          "text-foreground hover:bg-interactive-hover hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        xs: "h-6 gap-1 px-2 text-xs has-[>svg]:px-1.5 rounded-[7px] supports-[corner-shape:squircle]:rounded-[50px]",
        sm: "h-8 gap-1.5 px-2.5 text-sm has-[>svg]:px-2 rounded-[9px] supports-[corner-shape:squircle]:rounded-[50px]",
        default: "h-9 px-3.5 text-sm has-[>svg]:px-3",
        lg: "h-10 px-4 has-[>svg]:px-3.5 rounded-[12px] supports-[corner-shape:squircle]:rounded-[50px]",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

// ---------------------------------------------------------------------------
// Button component
// ---------------------------------------------------------------------------
type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    tintColor?: string
  }

function Button({
  className,
  variant,
  size,
  asChild = false,
  tintColor,
  type,
  style,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button"
  const typeProps = asChild
    ? (type === undefined ? {} : { type })
    : { type: type ?? "button" }

  const tintStyle = tintColor
    ? {
        ...style,
        "--primary-base": tintColor,
      } as React.CSSProperties
    : style

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      style={tintStyle}
      {...typeProps}
      {...props}
    />
  )
}

export { Button, buttonVariants }

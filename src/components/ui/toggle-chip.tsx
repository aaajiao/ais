/**
 * ToggleChip - 可切换的芯片/标签按钮
 * 用于筛选标签、多选选项等场景
 * 符合 Apple HIG 44px 最小触控目标
 */

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const toggleChipVariants = cva(
  [
    "inline-flex items-center justify-center gap-1.5",
    "whitespace-nowrap font-medium",
    "transition-colors duration-150",
    "disabled:pointer-events-none disabled:opacity-50",
    "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "shrink-0 select-none cursor-pointer",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-3.5",
  ],
  {
    variants: {
      variant: {
        // 默认: 选中时反色
        default: [
          "data-[selected=true]:bg-foreground data-[selected=true]:text-background",
          "data-[selected=false]:bg-muted data-[selected=false]:text-muted-foreground",
          "data-[selected=false]:hover:bg-accent",
        ],
        // 主色: 选中时使用 primary 色
        primary: [
          "border",
          "data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground data-[selected=true]:border-primary",
          "data-[selected=false]:bg-background data-[selected=false]:border-border",
          "data-[selected=false]:hover:border-primary/50",
        ],
        // 轮廓: 选中时显示边框高亮
        outline: [
          "border",
          "data-[selected=true]:border-primary data-[selected=true]:text-primary data-[selected=true]:bg-primary/5",
          "data-[selected=false]:border-border data-[selected=false]:text-muted-foreground",
          "data-[selected=false]:hover:border-primary/50",
        ],
      },
      size: {
        // small: 移动端 36px, 桌面端 32px
        small: "h-9 md:h-8 px-3 text-sm rounded-lg",
        // default: 移动端 44px, 桌面端 36px (Apple HIG 标准)
        default: "h-11 md:h-9 px-4 text-sm rounded-full",
        // large: 移动端 52px, 桌面端 44px
        large: "h-13 md:h-11 px-6 text-base rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ToggleChipProps
  extends Omit<React.ComponentProps<"button">, "onChange">,
    VariantProps<typeof toggleChipVariants> {
  selected?: boolean
  onChange?: (selected: boolean) => void
}

function ToggleChip({
  className,
  variant,
  size,
  selected = false,
  onChange,
  onClick,
  children,
  ...props
}: ToggleChipProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    onChange?.(!selected)
    onClick?.(e)
  }

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      data-selected={selected}
      className={cn(toggleChipVariants({ variant, size, className }))}
      onClick={handleClick}
      {...props}
    >
      {children}
    </button>
  )
}

export { ToggleChip, toggleChipVariants }

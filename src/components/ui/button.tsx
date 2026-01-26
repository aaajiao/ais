import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2",
    "whitespace-nowrap rounded-lg font-medium",
    "transition-all duration-150",
    "disabled:pointer-events-none disabled:opacity-50",
    "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "shrink-0",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        // Primary: 主要操作按钮 (Apple HIG: prominent style)
        default: [
          "bg-primary text-primary-foreground",
          "hover:bg-primary/90 active:bg-primary/80",
        ],
        primary: [
          "bg-primary text-primary-foreground",
          "hover:bg-primary/90 active:bg-primary/80",
        ],
        // Secondary: 次要操作
        secondary: [
          "bg-secondary text-secondary-foreground",
          "hover:bg-secondary/80 active:bg-secondary/70",
        ],
        // Outline: 边框样式
        outline: [
          "border border-border bg-transparent",
          "hover:bg-accent hover:text-accent-foreground",
          "active:bg-accent/80",
        ],
        // Ghost: 无边框无背景
        ghost: [
          "hover:bg-accent hover:text-accent-foreground",
          "active:bg-accent/80",
        ],
        // Destructive: 危险操作 (Apple HIG: red for destructive)
        destructive: [
          "bg-destructive text-white",
          "hover:bg-destructive/90 active:bg-destructive/80",
        ],
        // Destructive Outline: 危险操作的边框版本
        "destructive-outline": [
          "border border-destructive/30 text-destructive",
          "hover:bg-destructive/10 active:bg-destructive/20",
        ],
        // Link: 文字链接样式
        link: [
          "text-primary underline-offset-4",
          "hover:underline",
        ],
      },
      size: {
        // ===== 文字按钮 - 响应式高度 =====
        // mini: 移动端 28px, 桌面端 24px
        mini: [
          "h-7 md:h-6 px-2 text-xs",
          "[&_svg]:size-3",
        ],
        // small: 移动端 36px, 桌面端 32px
        small: [
          "h-9 md:h-8 px-3 text-sm",
          "[&_svg]:size-3.5",
        ],
        sm: [
          "h-9 md:h-8 px-3 text-sm",
          "[&_svg]:size-3.5",
        ],
        // medium (default): 移动端 44px, 桌面端 36px (Apple HIG 标准)
        medium: [
          "h-11 md:h-9 px-4 text-sm",
          "[&_svg]:size-4",
        ],
        default: [
          "h-11 md:h-9 px-4 text-sm",
          "[&_svg]:size-4",
        ],
        // large: 移动端 52px, 桌面端 44px
        large: [
          "h-13 md:h-11 px-6 text-base",
          "[&_svg]:size-5",
        ],
        lg: [
          "h-13 md:h-11 px-6 text-base",
          "[&_svg]:size-5",
        ],
        // ===== 图标按钮 - 正方形 =====
        // icon-mini: 移动端 32px, 桌面端 28px
        "icon-mini": [
          "size-8 md:size-7",
          "[&_svg]:size-3.5",
        ],
        // icon-sm: 移动端 40px, 桌面端 36px
        "icon-sm": [
          "size-10 md:size-9",
          "[&_svg]:size-4",
        ],
        // icon (default): 移动端 44px, 桌面端 40px
        icon: [
          "size-11 md:size-10",
          "[&_svg]:size-[18px]",
        ],
        // icon-lg: 移动端 52px, 桌面端 44px
        "icon-lg": [
          "size-13 md:size-11",
          "[&_svg]:size-5",
        ],
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

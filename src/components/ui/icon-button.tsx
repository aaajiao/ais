import * as React from "react"
import { Button, type ButtonProps } from "./button"
import { cn } from "@/lib/utils"

type IconButtonSize = "mini" | "sm" | "default" | "lg"

export interface IconButtonProps extends Omit<ButtonProps, "size"> {
  /**
   * 按钮尺寸
   * - mini: 移动端 32px, 桌面端 28px
   * - sm: 移动端 40px, 桌面端 36px
   * - default: 移动端 44px, 桌面端 40px (Apple HIG 标准)
   * - lg: 移动端 52px, 桌面端 44px
   */
  size?: IconButtonSize
  /**
   * 无障碍标签 (必填)
   * 用于屏幕阅读器和鼠标悬停提示
   */
  label: string
}

const sizeMap: Record<IconButtonSize, ButtonProps["size"]> = {
  mini: "icon-mini",
  sm: "icon-sm",
  default: "icon",
  lg: "icon-lg",
}

/**
 * IconButton - 图标按钮组件
 *
 * 基于 Apple HIG 设计的图标按钮，强制要求 label 属性确保无障碍性。
 * 移动端默认达到 44px 最小触控目标。
 *
 * @example
 * ```tsx
 * <IconButton
 *   variant="ghost"
 *   size="sm"
 *   label={t('edit')}
 *   onClick={handleEdit}
 * >
 *   <Pencil />
 * </IconButton>
 * ```
 */
const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ size = "default", label, className, children, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        size={sizeMap[size]}
        className={cn(className)}
        aria-label={label}
        title={label}
        {...props}
      >
        {children}
      </Button>
    )
  }
)

IconButton.displayName = "IconButton"

export { IconButton }

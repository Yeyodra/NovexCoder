import React from "react"
import { Icon } from "@/components/icon/Icon"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import type { ShellInfo } from "@/types/shell"

interface ShellPickerProps {
  shells: ShellInfo[]
  defaultShellId: string | null
  onCreateDefault: () => void
  onSelectShell: (shell: ShellInfo) => void
  onSetDefault: (shell: ShellInfo) => void
}

export const ShellPicker = React.memo(function ShellPicker({
  shells,
  defaultShellId,
  onCreateDefault,
  onSelectShell,
  onSetDefault,
}: ShellPickerProps) {
  return (
    <div className="flex items-center h-7 rounded-md text-muted-foreground transition-colors">
      {/* Left: spawn default shell */}
      <button
        className="flex h-7 w-7 items-center justify-center rounded-l-md hover:bg-accent hover:text-foreground transition-colors"
        onClick={onCreateDefault}
        title="New terminal (default shell)"
      >
        <Icon name="add" className="h-3.5 w-3.5" />
      </button>

      {/* Right: shell picker dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex h-7 w-5 items-center justify-center rounded-r-md hover:bg-accent hover:text-foreground transition-colors border-l border-border/50"
            title="Select shell"
          >
            <Icon name="arrow-down-s" className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" sideOffset={4}>
          <DropdownMenuLabel>Shells</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {shells.map((shell) => (
            <DropdownMenuItem
              key={shell.id}
              onClick={() => onSelectShell(shell)}
            >
              <span className="flex items-center gap-2 w-full">
                <span className="flex-1">{shell.name}</span>
                {shell.id === defaultShellId && (
                  <Icon name="star-fill" className="h-3 w-3 text-yellow-500" />
                )}
                {shell.id !== defaultShellId && (
                  <span
                    className="opacity-0 group-hover:opacity-100 hover:text-yellow-500 transition-opacity cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSetDefault(shell)
                    }}
                    title="Set as default"
                  >
                    <Icon name="star" className="h-3 w-3" />
                  </span>
                )}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
})

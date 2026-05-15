import React, { useEffect, useCallback, useMemo } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
  CommandSeparator,
} from "@/components/ui/command";
import { useUIStore } from "@/stores/useUIStore";
import { Icon } from "@/components/icon/Icon";
import { rankByFuzzyQuery } from "@/lib/search/fuzzySearch";

type CommandEntry = {
  id: string;
  title: string;
  icon: React.ReactNode;
  shortcut?: string;
  group: "commands" | "settings";
  onSelect: () => void;
};

export function CommandPalette() {
  const isOpen = useUIStore((s) => s.isCommandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const toggleLeftSidebar = useUIStore((s) => s.toggleLeftSidebar);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const setMainView = useUIStore((s) => s.setMainView);

  const [query, setQuery] = React.useState("");

  // Global keyboard shortcut: Cmd+P / Ctrl+P
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "p") {
        e.preventDefault();
        setOpen(!isOpen);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, setOpen]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, [setOpen]);

  const handleSelect = useCallback((fn: () => void) => {
    fn();
    close();
  }, [close]);

  const commands: CommandEntry[] = useMemo(() => [
    {
      id: "new-session",
      title: "New Session",
      icon: <Icon name="add" className="size-4" />,
      shortcut: "Ctrl+N",
      group: "commands",
      onSelect: () => {
        // Placeholder — will be wired to session creation
      },
    },
    {
      id: "toggle-sidebar",
      title: "Toggle Sidebar",
      icon: <Icon name="sidebar-fold" className="size-4" />,
      shortcut: "Ctrl+B",
      group: "commands",
      onSelect: toggleLeftSidebar,
    },
    {
      id: "toggle-theme",
      title: "Toggle Theme",
      icon: <Icon name="contrast" className="size-4" />,
      group: "commands",
      onSelect: toggleTheme,
    },
    {
      id: "open-settings",
      title: "Open Settings",
      icon: <Icon name="settings" className="size-4" />,
      shortcut: "Ctrl+,",
      group: "settings",
      onSelect: () => setMainView("settings"),
    },
    {
      id: "settings-general",
      title: "Settings: General",
      icon: <Icon name="settings" className="size-4" />,
      group: "settings",
      onSelect: () => setMainView("settings"),
    },
    {
      id: "settings-appearance",
      title: "Settings: Appearance",
      icon: <Icon name="palette" className="size-4" />,
      group: "settings",
      onSelect: () => setMainView("settings"),
    },
  ], [toggleLeftSidebar, toggleTheme, setMainView]);

  const filteredCommands = useMemo(() => {
    if (!query) return commands;
    return rankByFuzzyQuery(commands, query, (c) => c.title, { limit: 10 });
  }, [commands, query]);

  const commandGroup = filteredCommands.filter((c) => c.group === "commands");
  const settingsGroup = filteredCommands.filter((c) => c.group === "settings");

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title="Command Palette"
      description="Search commands, sessions, and settings"
    >
      <CommandInput
        placeholder="Type a command or search..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {commandGroup.length > 0 && (
          <CommandGroup heading="Commands">
            {commandGroup.map((cmd) => (
              <CommandItem
                key={cmd.id}
                value={cmd.title}
                onSelect={() => handleSelect(cmd.onSelect)}
              >
                {cmd.icon}
                <span>{cmd.title}</span>
                {cmd.shortcut && (
                  <CommandShortcut>{cmd.shortcut}</CommandShortcut>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {commandGroup.length > 0 && settingsGroup.length > 0 && (
          <CommandSeparator />
        )}

        {settingsGroup.length > 0 && (
          <CommandGroup heading="Settings">
            {settingsGroup.map((cmd) => (
              <CommandItem
                key={cmd.id}
                value={cmd.title}
                onSelect={() => handleSelect(cmd.onSelect)}
              >
                {cmd.icon}
                <span>{cmd.title}</span>
                {cmd.shortcut && (
                  <CommandShortcut>{cmd.shortcut}</CommandShortcut>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}

import React, { useState, useMemo } from 'react';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { Icon } from '@/components/icon/Icon';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

export const ModelSelector: React.FC = () => {
  const providers = useSettingsStore((s) => s.providers);
  const selectedModelId = useSettingsStore((s) => s.selectedModelId);
  const setSelectedModelId = useSettingsStore((s) => s.setSelectedModelId);

  const [search, setSearch] = useState('');

  const enabledProviders = useMemo(
    () => providers.filter((p) => p.isEnabled),
    [providers]
  );

  const filteredProviders = useMemo(() => {
    if (!search.trim()) return enabledProviders;
    const q = search.toLowerCase();
    return enabledProviders.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.model.toLowerCase().includes(q)
    );
  }, [enabledProviders, search]);

  const displayName = useMemo(() => {
    if (!selectedModelId) return 'No model';
    const provider = providers.find((p) => p.model === selectedModelId);
    if (provider) return provider.model;
    return selectedModelId;
  }, [selectedModelId, providers]);

  // Group providers by providerType
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filteredProviders>();
    for (const p of filteredProviders) {
      const group = map.get(p.providerType) ?? [];
      group.push(p);
      map.set(p.providerType, group);
    }
    return map;
  }, [filteredProviders]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-1 h-7 px-2 rounded-md hover:bg-accent transition-colors text-sm font-medium text-foreground truncate max-w-[180px] cursor-pointer"
      >
        <span className="truncate">{displayName}</span>
        <Icon name="arrow-down" className="h-3 w-3 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" sideOffset={6} className="w-[240px] max-h-[320px] overflow-hidden flex flex-col">
        {/* Search input */}
        <div className="px-2 py-1.5">
          <div className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1">
            <Icon name="search" className="h-3 w-3 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
              autoFocus
            />
          </div>
        </div>

        <DropdownMenuSeparator />

        {/* Model list */}
        <div className="overflow-y-auto flex-1 max-h-[250px]">
          {grouped.size === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground text-center">
              No models found
            </div>
          ) : (
            Array.from(grouped.entries()).map(([providerType, providerList], idx) => (
              <DropdownMenuGroup key={providerType}>
                {idx > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">
                  {providerType}
                </DropdownMenuLabel>
                {providerList.map((provider) => (
                  <DropdownMenuItem
                    key={provider.id}
                    onClick={() => setSelectedModelId(provider.model)}
                    className={
                      selectedModelId === provider.model
                        ? 'bg-interactive-selection text-interactive-selection-foreground'
                        : undefined
                    }
                  >
                    <span className="truncate text-sm">{provider.model}</span>
                    {selectedModelId === provider.model && (
                      <Icon name="check" className="ml-auto h-3 w-3 shrink-0" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

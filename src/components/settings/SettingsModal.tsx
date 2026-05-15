import React, { useState } from 'react';
import { useUIStore } from '@/stores/useUIStore';
import { ProvidersTab } from './ProvidersTab';
import { AgentsTab } from './AgentsTab';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Icon } from '@/components/icon/Icon';
import { themes } from '@/lib/theme/themes';

type SettingsTab = 'providers' | 'agents' | 'appearance';

interface NavItemProps {
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  active: boolean;
  onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-2.5 px-3 py-2 rounded-lg typography-ui-label transition-colors text-left w-full",
      active
        ? "bg-interactive-active text-foreground"
        : "text-muted-foreground hover:text-foreground hover:bg-interactive-hover"
    )}
  >
    <Icon name={icon} className="size-4 shrink-0" />
    {label}
  </button>
);

export const SettingsPage: React.FC = () => {
  const setMainView = useUIStore((s) => s.setMainView);
  const [activeTab, setActiveTab] = useState<SettingsTab>('providers');
  const [selectedTheme, setSelectedTheme] = useState<string>(
    themes[0]?.metadata.id ?? ''
  );

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMainView('chat')}
          className="gap-1.5"
        >
          <Icon name="arrow-left" className="size-4" />
          Back to Chat
        </Button>
        <div className="h-4 w-px bg-border" />
        <h1 className="typography-ui-header font-semibold text-foreground">Settings</h1>
      </div>

      {/* Content area with sidebar nav */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar nav */}
        <nav className="w-48 shrink-0 border-r border-border py-4 px-3 flex flex-col gap-1">
          <NavItem
            icon="cloud"
            label="Providers"
            active={activeTab === 'providers'}
            onClick={() => setActiveTab('providers')}
          />
          <NavItem
            icon="ai-agent"
            label="Agents"
            active={activeTab === 'agents'}
            onClick={() => setActiveTab('agents')}
          />
          <NavItem
            icon="palette"
            label="Appearance"
            active={activeTab === 'appearance'}
            onClick={() => setActiveTab('appearance')}
          />
        </nav>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="mx-auto w-full max-w-3xl px-6 py-6 space-y-6">
            {activeTab === 'providers' && <ProvidersTab />}
            {activeTab === 'agents' && <AgentsTab />}
            {activeTab === 'appearance' && (
              <AppearanceSection
                selectedTheme={selectedTheme}
                onThemeChange={setSelectedTheme}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Appearance Section                                                          */
/* -------------------------------------------------------------------------- */

interface AppearanceSectionProps {
  selectedTheme: string;
  onThemeChange: (themeId: string) => void;
}

const AppearanceSection: React.FC<AppearanceSectionProps> = ({
  selectedTheme,
  onThemeChange,
}) => {
  const currentTheme = themes.find((t) => t.metadata.id === selectedTheme);

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="space-y-1">
        <h2 className="typography-ui-header font-semibold text-foreground">Appearance</h2>
        <p className="typography-micro text-muted-foreground">
          Customize the look and feel of enowX Coder.
        </p>
      </div>

      {/* Theme card */}
      <div className="rounded-xl border border-border bg-[var(--surface-elevated)] p-5 space-y-4">
        <div className="space-y-1">
          <h3 className="typography-ui-label font-medium text-foreground">Theme</h3>
          <p className="typography-micro text-muted-foreground">
            Select a color theme for the interface.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select value={selectedTheme} onValueChange={onThemeChange}>
            <SelectTrigger size="lg" className="min-w-[200px]">
              <SelectValue placeholder="Select theme">
                {currentTheme
                  ? `${currentTheme.metadata.name} (${currentTheme.metadata.variant})`
                  : 'Select theme'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {themes.map((theme) => (
                <SelectItem key={theme.metadata.id} value={theme.metadata.id}>
                  {theme.metadata.name} ({theme.metadata.variant})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {currentTheme && (
          <div className="flex items-center gap-2 pt-1">
            <div
              className="size-4 rounded-full border border-border"
              style={{ backgroundColor: currentTheme.colors.primary.base }}
            />
            <span className="typography-micro text-muted-foreground">
              {currentTheme.metadata.description}
            </span>
          </div>
        )}
      </div>

      {/* Theme preview swatches */}
      {currentTheme && (
        <div className="rounded-xl border border-border bg-[var(--surface-elevated)] p-5 space-y-4">
          <h3 className="typography-ui-label font-medium text-foreground">Preview</h3>
          <div className="grid grid-cols-6 gap-2">
            {[
              { label: 'Primary', color: currentTheme.colors.primary.base },
              { label: 'Hover', color: currentTheme.colors.primary.hover },
              { label: 'Active', color: currentTheme.colors.primary.active },
              { label: 'Surface', color: currentTheme.colors.surface.background },
              { label: 'Elevated', color: currentTheme.colors.surface.elevated },
              { label: 'Muted', color: currentTheme.colors.surface.muted },
            ].map((swatch) => (
              <div key={swatch.label} className="flex flex-col items-center gap-1.5">
                <div
                  className="size-8 rounded-lg border border-border shadow-sm"
                  style={{ backgroundColor: swatch.color }}
                />
                <span className="typography-micro text-muted-foreground">{swatch.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { useUIStore } from '@/stores/useUIStore';
import { useAgentStore } from '@/stores/useAgentStore';
import { Icon } from '@/components/icon/Icon';
import { cn } from '@/lib/utils';
import { ModelSelector } from '@/components/ui/ModelSelector';
import { useDevice } from '@/lib/device';

interface ChatHeaderProps {
  onToggleLeftSidebar?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({ onToggleLeftSidebar }) => {
  const selectedAgentType = useAgentStore((s) => s.selectedAgentType);
  const toggleRightSidebar = useUIStore((s) => s.toggleRightSidebar);
  const fluxEnabled = useUIStore((s) => s.fluxEnabled);
  const toggleFlux = useUIStore((s) => s.toggleFlux);
  const mainView = useUIStore((s) => s.mainView);
  const setMainView = useUIStore((s) => s.setMainView);
  const { theme, toggleTheme } = useUIStore();
  const device = useDevice();

  return (
    <header className="border-b border-border">
      {/* Main header row */}
      <div className="flex items-center justify-between px-4 py-2">
        {/* Left: sidebar toggle + model/agent info */}
        <div className="flex items-center gap-2 min-w-0">
          {onToggleLeftSidebar && (
            <button
              onClick={onToggleLeftSidebar}
              className={cn(
                'rounded-md flex items-center justify-center hover:bg-accent transition-colors text-muted-foreground',
                device.isMobile ? 'min-h-[44px] min-w-[44px]' : 'h-7 w-7'
              )}
              title="Toggle sidebar"
            >
              <Icon name="align-justify" className="h-4 w-4" />
            </button>
          )}

          <ModelSelector />

          <span className="text-xs px-1.5 py-0.5 rounded bg-accent text-muted-foreground">
            {selectedAgentType}
          </span>

          {/* Desktop view toggle */}
          {!device.isMobile && (
            <div className="flex items-center gap-0.5 ml-2 bg-muted/50 rounded-lg p-0.5">
              <button
                onClick={() => setMainView('chat')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                  mainView === 'chat' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Chat
              </button>
              <button
                onClick={() => setMainView('canvas')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                  mainView === 'canvas' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Canvas
              </button>
            </div>
          )}

        </div>

        {/* Right: flux + theme + right sidebar toggle */}
        <div className="flex items-center gap-1">
          <button
            onClick={toggleFlux}
            className={cn(
              'rounded-md flex items-center justify-center transition-colors',
              device.isMobile ? 'min-h-[44px] min-w-[44px]' : 'h-7 w-7',
              fluxEnabled
                ? 'text-foreground bg-accent'
                : 'text-muted-foreground hover:bg-accent'
            )}
            title={fluxEnabled ? 'Disable flux mode' : 'Enable flux mode'}
          >
            <Icon name="sparkling" className="h-4 w-4" />
          </button>

          <button
            onClick={toggleTheme}
            className={cn(
              'rounded-md flex items-center justify-center hover:bg-accent transition-colors text-muted-foreground',
              device.isMobile ? 'min-h-[44px] min-w-[44px]' : 'h-7 w-7'
            )}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <Icon name="lightbulb" className="h-4 w-4" />
          </button>

          <button
            onClick={toggleRightSidebar}
            className={cn(
              'rounded-md flex items-center justify-center hover:bg-accent transition-colors text-muted-foreground',
              device.isMobile ? 'min-h-[44px] min-w-[44px]' : 'h-7 w-7'
            )}
            title="Toggle right sidebar"
          >
            <Icon name="layout-right" className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Mobile tab strip */}
      {device.isMobile && (
        <div className="flex items-center gap-2 px-4 pb-2">
          <button
            onClick={() => setMainView('chat')}
            className={cn(
              'px-3 min-h-[44px] min-w-[44px] rounded-md text-sm font-medium transition-colors',
              mainView === 'chat'
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50'
            )}
          >
            Chat
          </button>
          <button
            onClick={() => setMainView('canvas')}
            className={cn(
              'px-3 min-h-[44px] min-w-[44px] rounded-md text-sm font-medium transition-colors',
              mainView === 'canvas'
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50'
            )}
          >
            Canvas
          </button>
        </div>
      )}
    </header>
  );
};

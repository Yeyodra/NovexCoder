import React, { useState } from 'react';
import { ArrowLeft, Wrench, Robot, GearSix } from '@phosphor-icons/react';
import { useUIStore } from '@/stores/useUIStore';
import { ProvidersTab } from './ProvidersTab';
import { AgentsTab } from './AgentsTab';
import { cn } from '@/lib/utils';

type SettingsTab = 'providers' | 'agents' | 'tools' | 'system';

export const SettingsPage: React.FC = () => {
  const setMainView = useUIStore((s) => s.setMainView);
  const [activeTab, setActiveTab] = useState<SettingsTab>('providers');

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--border)]">
        <button
          onClick={() => setMainView('chat')}
          className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover-bg)] transition-colors"
          title="Back to chat"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-base font-bold text-[var(--text)]">Settings</h1>
      </div>

      {/* Content area with sidebar nav */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar nav */}
        <nav className="w-52 shrink-0 border-r border-[var(--border)] py-4 px-3 flex flex-col gap-1">
          <button
            onClick={() => setActiveTab('providers')}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left",
              activeTab === 'providers'
                ? "bg-[var(--hover-bg-strong)] text-[var(--text)]"
                : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover-bg)]"
            )}
          >
            <Robot size={16} weight={activeTab === 'providers' ? "fill" : "regular"} />
            Providers
          </button>
          <button
            onClick={() => setActiveTab('agents')}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left",
              activeTab === 'agents'
                ? "bg-[var(--hover-bg-strong)] text-[var(--text)]"
                : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover-bg)]"
            )}
          >
            <Robot size={16} weight={activeTab === 'agents' ? "fill" : "regular"} />
            Agents
          </button>
          <button
            onClick={() => setActiveTab('tools')}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left",
              activeTab === 'tools'
                ? "bg-[var(--hover-bg-strong)] text-[var(--text)]"
                : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover-bg)]"
            )}
          >
            <Wrench size={16} weight={activeTab === 'tools' ? "fill" : "regular"} />
            Tools
          </button>
          <button
            onClick={() => setActiveTab('system')}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left",
              activeTab === 'system'
                ? "bg-[var(--hover-bg-strong)] text-[var(--text)]"
                : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover-bg)]"
            )}
          >
            <GearSix size={16} weight={activeTab === 'system' ? "fill" : "regular"} />
            System
          </button>
        </nav>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {activeTab === 'providers' && <ProvidersTab />}
          {activeTab === 'agents' && <AgentsTab />}
          
          {activeTab === 'tools' && (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
              <Wrench size={32} weight="duotone" className="opacity-50 mb-4" />
              <p className="text-sm font-semibold">Tools Configuration</p>
              <p className="text-xs">Coming soon</p>
            </div>
          )}

          {activeTab === 'system' && (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
              <GearSix size={32} weight="duotone" className="opacity-50 mb-4" />
              <p className="text-sm font-semibold">System Settings</p>
              <p className="text-xs">Coming soon</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

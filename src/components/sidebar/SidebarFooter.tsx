import { Icon } from '@/components/icon/Icon';
import { useUIStore } from '@/stores/useUIStore';

const footerButtonClass =
  'h-7 w-7 rounded-md flex items-center justify-center hover:bg-accent transition-colors text-muted-foreground hover:text-foreground';

export function SidebarFooter() {
  const setMainView = useUIStore((s) => s.setMainView);

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-t border-border">
      <button
        type="button"
        className={footerButtonClass}
        onClick={() => setMainView('settings')}
        aria-label="Settings"
      >
        <Icon name="settings-3" className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={footerButtonClass}
        onClick={() => {/* TODO: open shortcuts dialog */}}
        aria-label="Keyboard shortcuts"
      >
        <Icon name="command" className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={footerButtonClass}
        onClick={() => {/* TODO: open about dialog */}}
        aria-label="About"
      >
        <Icon name="information" className="h-4 w-4" />
      </button>
    </div>
  );
}

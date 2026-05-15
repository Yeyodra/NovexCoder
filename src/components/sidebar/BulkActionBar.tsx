import { AnimatePresence, motion } from 'motion/react';
import { Archive, Trash, X } from '@phosphor-icons/react';

interface BulkActionBarProps {
  selectedCount: number;
  visible: boolean;
  onArchiveAll: () => void;
  onDeleteAll: () => void;
  onClearSelection: () => void;
}

export function BulkActionBar({
  selectedCount,
  visible,
  onArchiveAll,
  onDeleteAll,
  onClearSelection,
}: BulkActionBarProps) {
  return (
    <AnimatePresence>
      {visible && selectedCount > 0 && (
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
          className="absolute bottom-0 left-0 right-0 bg-[var(--card)] border-t border-[var(--border)] px-3 py-2 flex items-center justify-between z-20"
        >
          <span className="text-sm text-[var(--foreground)] font-medium">
            {selectedCount} selected
          </span>
          <div className="flex items-center gap-1.5">
            <button
              className="h-7 px-2.5 rounded-md flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--hover-bg)]"
              onClick={onArchiveAll}
              title="Archive All"
            >
              <Archive size={14} />
              Archive
            </button>
            <button
              className="h-7 px-2.5 rounded-md flex items-center gap-1.5 text-sm text-[var(--destructive)] hover:bg-[var(--danger-bg)]"
              onClick={onDeleteAll}
              title="Delete All"
            >
              <Trash size={14} />
              Delete
            </button>
            <button
              className="h-7 w-7 rounded-md flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--hover-bg)]"
              onClick={onClearSelection}
              title="Clear Selection"
            >
              <X size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-[var(--overlay)]" />
      <div
        className="relative bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 max-w-sm w-full mx-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[var(--foreground)] font-semibold text-base mb-2">{title}</h3>
        <p className="text-[var(--muted-foreground)] text-sm mb-6">{description}</p>
        <div className="flex justify-end gap-2">
          <button
            className="px-3 py-1.5 text-sm rounded-md text-[var(--muted-foreground)] hover:bg-[var(--hover-bg)]"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className={`px-3 py-1.5 text-sm rounded-md font-medium ${
              danger
                ? 'bg-[var(--destructive)] text-white hover:opacity-90'
                : 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90'
            }`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Convenience wrappers
export function DeleteSessionDialog({ open, onConfirm, onCancel }: { open: boolean; onConfirm: () => void; onCancel: () => void }) {
  return <ConfirmDialog open={open} title="Delete Session" description="This session and all its messages will be permanently deleted." confirmLabel="Delete" danger onConfirm={onConfirm} onCancel={onCancel} />;
}

export function DeleteFolderDialog({ open, onConfirm, onCancel }: { open: boolean; onConfirm: () => void; onCancel: () => void }) {
  return <ConfirmDialog open={open} title="Delete Folder" description="This folder will be deleted. Sessions inside will be moved to the project root." confirmLabel="Delete" danger onConfirm={onConfirm} onCancel={onCancel} />;
}

export function BulkDeleteDialog({ open, count, onConfirm, onCancel }: { open: boolean; count: number; onConfirm: () => void; onCancel: () => void }) {
  return <ConfirmDialog open={open} title="Delete Sessions" description={`${count} sessions will be permanently deleted.`} confirmLabel="Delete All" danger onConfirm={onConfirm} onCancel={onCancel} />;
}

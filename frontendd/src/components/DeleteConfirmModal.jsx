import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";

/**
 * Reusable Custom Delete Confirmation Modal
 *
 * @param {boolean} open - Controls visibility of the modal
 * @param {function} onClose - Callback when modal is closed or cancelled
 * @param {function} onConfirm - Callback when delete is confirmed
 * @param {string} [title="Delete Item"] - Title header text
 * @param {string} [description] - Explanation text
 * @param {string} [itemName] - Specific name of item being deleted
 * @param {string} [confirmText="Delete"] - Label for confirm button
 * @param {string} [cancelText="Cancel"] - Label for cancel button
 * @param {boolean} [loading=false] - Loading state for async deletion
 */
export default function DeleteConfirmModal({
  open,
  onClose,
  onConfirm,
  title = "Delete Item",
  description = "Are you sure you want to delete this? This action cannot be undone.",
  itemName,
  confirmText = "Delete",
  cancelText = "Cancel",
  loading = false,
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && !loading && onClose?.()}>
      <DialogContent
        className="max-w-md rounded-2xl p-6 sm:rounded-2xl"
        data-testid="delete-confirm-modal"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
            <AlertTriangle size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <DialogHeader className="p-0 text-left">
              <DialogTitle className="font-display text-xl font-bold text-foreground">
                {title}
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-muted-foreground">
                {description}
              </DialogDescription>
            </DialogHeader>

            {itemName && (
              <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs font-semibold text-rose-700 dark:text-rose-300">
                <span className="opacity-70">Target:</span> "{itemName}"
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-6 flex flex-row items-center justify-end gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={loading}
            onClick={onClose}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="rounded-full font-semibold shadow-md"
            disabled={loading}
            onClick={onConfirm}
            data-testid="confirm-delete-btn"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              confirmText
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

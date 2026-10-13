import { AlertCircle, AlertTriangle, HelpCircle, Loader2 } from "lucide-react";
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
 * Universal Reusable Custom Confirmation Modal
 *
 * @param {boolean} open - Controls visibility of the modal
 * @param {function} onClose - Callback when modal is closed or cancelled
 * @param {function} onConfirm - Callback when action is confirmed
 * @param {string} [title="Confirm Action"] - Header title
 * @param {string} [description="Are you sure you want to proceed?"] - Detail description
 * @param {string} [itemName] - Highlighted target item name (optional)
 * @param {string} [confirmText="Confirm"] - Confirm button label
 * @param {string} [cancelText="Cancel"] - Cancel button label
 * @param {string} [variant="destructive"] - Button variant: "destructive" | "default" | "warning"
 * @param {boolean} [loading=false] - Async loading spinner state
 */
export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title = "Confirm Action",
  description = "Are you sure you want to proceed?",
  itemName,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "destructive",
  loading = false,
}) {
  const isDestructive = variant === "destructive";
  const isWarning = variant === "warning";

  const IconComponent = isDestructive
    ? AlertTriangle
    : isWarning
      ? AlertCircle
      : HelpCircle;

  const iconColorClass = isDestructive
    ? "bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400"
    : isWarning
      ? "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400"
      : "bg-primary/10 text-primary dark:bg-primary/20";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !loading && onClose?.()}>
      <DialogContent
        className="max-w-md rounded-2xl p-6 sm:rounded-2xl"
        data-testid="custom-confirm-modal"
      >
        <div className="flex items-start gap-4">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconColorClass}`}
          >
            <IconComponent size={24} />
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
              <div className="mt-3 rounded-xl border border-border bg-secondary/50 p-3 text-xs font-semibold text-foreground">
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
            variant={isDestructive ? "destructive" : "default"}
            className="rounded-full font-semibold shadow-md"
            disabled={loading}
            onClick={onConfirm}
            data-testid="modal-confirm-btn"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
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

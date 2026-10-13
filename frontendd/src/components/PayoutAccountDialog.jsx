import { useEffect, useState } from "react";
import { Building2, Loader2, Smartphone } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

// Mirrors the validation the handoff documents for PUT /payout-account/me:
//   bank_account -> account_holder_name, account_number and ifsc_code required
//   upi          -> upi_id required
// The backend is the authority; this only stops obviously-invalid submissions.
const EMPTY = {
  payout_type: "upi",
  upi_id: "",
  account_holder_name: "",
  account_number: "",
  ifsc_code: "",
};

const toForm = (account) =>
  account
    ? {
        payout_type: account.payout_type === "bank_account" ? "bank_account" : "upi",
        upi_id: account.upi_id || "",
        account_holder_name: account.account_holder_name || "",
        account_number: account.account_number || "",
        ifsc_code: account.ifsc_code || "",
      }
    : { ...EMPTY };

const TYPES = [
  { value: "upi", label: "UPI", icon: Smartphone },
  { value: "bank_account", label: "Bank account", icon: Building2 },
];

export default function PayoutAccountDialog({
  open,
  onOpenChange,
  account = null,
  saving = false,
  onSubmit,
}) {
  const [form, setForm] = useState(() => toForm(account));
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (open) {
      setForm(toForm(account));
      setErrors({});
    }
  }, [open, account]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  // Switching type clears the other type's fields, matching what the backend
  // does, so a stale bank number is never sent alongside a UPI id.
  const setType = (payout_type) =>
    setForm((prev) =>
      payout_type === "upi"
        ? { ...prev, payout_type, account_holder_name: "", account_number: "", ifsc_code: "" }
        : { ...prev, payout_type, upi_id: "" },
    );

  const validate = () => {
    const next = {};
    if (form.payout_type === "upi") {
      if (!form.upi_id.trim()) next.upi_id = "Enter your UPI ID.";
      else if (!form.upi_id.includes("@"))
        next.upi_id = "A UPI ID looks like name@bank.";
    } else {
      if (!form.account_holder_name.trim())
        next.account_holder_name = "Enter the account holder's name.";
      if (!form.account_number.trim())
        next.account_number = "Enter the account number.";
      if (!form.ifsc_code.trim()) next.ifsc_code = "Enter the IFSC code.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!validate()) return;
    await onSubmit(form);
  };

  const isUpi = form.payout_type === "upi";

  return (
    <Dialog open={open} onOpenChange={(value) => !saving && onOpenChange(value)}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-md"
        data-testid="payout-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {account ? "Update payout details" : "Add payout details"}
          </DialogTitle>
          <DialogDescription>
            Where your withdrawals are sent. Saving these does not verify them.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value)}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                  form.payout_type === value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-accent"
                }`}
                data-testid={`payout-type-${value}`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>

          {isUpi ? (
            <div className="space-y-1.5">
              <Label htmlFor="payout-upi">UPI ID</Label>
              <Input
                id="payout-upi"
                value={form.upi_id}
                onChange={(event) => setField("upi_id", event.target.value)}
                placeholder="yourname@bank"
                autoComplete="off"
                className="rounded-xl"
                data-testid="payout-upi-input"
              />
              {errors.upi_id && (
                <p className="text-xs text-destructive">{errors.upi_id}</p>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="payout-holder">Account holder name</Label>
                <Input
                  id="payout-holder"
                  value={form.account_holder_name}
                  onChange={(event) =>
                    setField("account_holder_name", event.target.value)
                  }
                  placeholder="As printed on the account"
                  autoComplete="off"
                  className="rounded-xl"
                  data-testid="payout-holder-input"
                />
                {errors.account_holder_name && (
                  <p className="text-xs text-destructive">
                    {errors.account_holder_name}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="payout-account">Account number</Label>
                <Input
                  id="payout-account"
                  value={form.account_number}
                  onChange={(event) =>
                    setField("account_number", event.target.value)
                  }
                  autoComplete="off"
                  className="rounded-xl"
                  data-testid="payout-account-input"
                />
                {errors.account_number && (
                  <p className="text-xs text-destructive">
                    {errors.account_number}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="payout-ifsc">IFSC code</Label>
                <Input
                  id="payout-ifsc"
                  value={form.ifsc_code}
                  onChange={(event) => setField("ifsc_code", event.target.value)}
                  placeholder="ABCD0123456"
                  autoComplete="off"
                  className="rounded-xl uppercase"
                  data-testid="payout-ifsc-input"
                />
                {errors.ifsc_code && (
                  <p className="text-xs text-destructive">{errors.ifsc_code}</p>
                )}
              </div>
            </>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="rounded-full"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="rounded-full"
              disabled={saving}
              data-testid="payout-save-btn"
            >
              {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              {saving ? "Saving..." : "Save details"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

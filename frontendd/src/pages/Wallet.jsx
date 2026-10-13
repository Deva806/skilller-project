import AdminContact from "../components/AdminContact";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Clock,
  Info,
  Loader2,
  Receipt,
  Wallet as WalletIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  useWalletStore,
  LEDGER_LABELS,
  WITHDRAWAL_TONE,
} from "../store/walletStore";
import PayoutAccountDialog from "../components/PayoutAccountDialog";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";

const money = (amount) =>
  `₹${Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

const when = (value) => {
  if (!value) return "";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("en-IN");
};

const maskPayout = (account) => {
  if (!account) return "";

  if (account.payout_type === "upi") {
    const upi = account.upi_id || "";
    const [name, bank] = upi.split("@");

    if (!bank) {
      return upi ? `${upi.slice(0, 2)}...` : "";
    }

    return `${name.slice(0, 2)}${"•".repeat(
      Math.max(name.length - 2, 2),
    )}@${bank}`;
  }

  const number = account.account_number || "";
  return number ? `••••${number.slice(-4)}` : "";
};

const titleise = (value) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/^\w/, (character) => character.toUpperCase());

const getWithdrawalStatusMessage = (item) => {
  if (item.status === "pending") {
    return "Your request is awaiting admin review.";
  }

  if (item.status === "successful" || item.status === "completed") {
    return "Your payout has been processed.";
  }

  if (item.status === "failed" || item.status === "rejected") {
    return "Your request was rejected. Any reserved funds should have been returned to your available balance.";
  }

  return "";
};

export default function Wallet() {
  const wallet = useWalletStore((state) => state.wallet);
  const ledger = useWalletStore((state) => state.ledger);
  const withdrawals = useWalletStore((state) => state.withdrawals);
  const payoutAccount = useWalletStore((state) => state.payoutAccount);
  const payoutSupported = useWalletStore((state) => state.payoutSupported);

  const walletLoading = useWalletStore((state) => state.walletLoading);
  const ledgerLoading = useWalletStore((state) => state.ledgerLoading);
  const withdrawalsLoading = useWalletStore(
    (state) => state.withdrawalsLoading,
  );

  const requesting = useWalletStore((state) => state.requesting);

  const walletError = useWalletStore((state) => state.walletError);
  const ledgerError = useWalletStore((state) => state.ledgerError);
  const withdrawalsError = useWalletStore(
    (state) => state.withdrawalsError,
  );

  const loadAll = useWalletStore((state) => state.loadAll);
  const fetchWallet = useWalletStore((state) => state.fetchWallet);
  const fetchLedger = useWalletStore((state) => state.fetchLedger);
  const fetchWithdrawals = useWalletStore(
    (state) => state.fetchWithdrawals,
  );

  const requestWithdrawal = useWalletStore(
    (state) => state.requestWithdrawal,
  );

  const requestError = useWalletStore((state) => state.requestError);

  const savingPayout = useWalletStore((state) => state.savingPayout);
  const savePayoutAccount = useWalletStore(
    (state) => state.savePayoutAccount,
  );

  const [payoutOpen, setPayoutOpen] = useState(false);

  useEffect(() => {
    loadAll().catch(() => {});
  }, [loadAll]);

  const balance = Number(wallet?.balance || 0);
  const pending = Number(wallet?.pending_balance || 0);

  const hasActiveAccount = Boolean(payoutAccount?.is_active);

  const canWithdraw =
    payoutSupported === true &&
    hasActiveAccount &&
    balance > 0 &&
    !requesting;

  const submit = async (event) => {
    event.preventDefault();

    if (payoutSupported !== true) {
      toast.error("Withdrawals are not available for this account yet.");
      return;
    }

    if (!hasActiveAccount) {
      toast.error("Add your payout details before requesting a withdrawal.");
      setPayoutOpen(true);
      return;
    }

    if (!Number.isFinite(balance) || balance <= 0) {
      toast.error("You do not have an available balance to withdraw.");
      return;
    }

    try {
      const result = await requestWithdrawal();

      toast.success(
        result?.message ||
          "Payout request submitted. The amount will be credited to your account within 24 hours.",
      );

      await Promise.allSettled([
        fetchWithdrawals(),
        fetchWallet(),
        fetchLedger(),
      ]);
    } catch {
      toast.error(
        useWalletStore.getState().requestError ||
          "Could not request withdrawal.",
      );
    }
  };

  return (
    <div
      className="mx-auto max-w-4xl px-4 py-6"
      data-testid="wallet-page"
    >
      {walletLoading && !wallet ? (
        <div className="rounded-3xl border border-border p-6 md:p-8">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-3 h-12 w-56" />
          <Skeleton className="mt-3 h-4 w-72" />
        </div>
      ) : walletError ? (
        <div
          className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6 md:p-8"
          data-testid="wallet-error"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertCircle size={16} />
            Could not load your wallet
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            {walletError}
          </p>

          <Button
            variant="outline"
            className="mt-4 rounded-full"
            onClick={() => fetchWallet().catch(() => {})}
            data-testid="wallet-retry"
          >
            Try again
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/15 via-primary/5 to-background p-6 md:p-8">
          <div className="text-xs font-bold uppercase tracking-widest text-primary">
            Available balance
          </div>

          <div className="mt-1 flex items-end gap-3">
            <WalletIcon
              size={30}
              className="mb-1 text-primary"
            />

            <span
              className="font-display text-4xl font-extrabold leading-none md:text-5xl"
              data-testid="wallet-balance"
            >
              {money(balance)}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Figure
              label="Reserved"
              value={money(pending)}
              hint="Held for withdrawals awaiting review"
              testId="wallet-pending"
            />

            <Figure
              label="Lifetime earned"
              value={money(wallet?.lifetime_earned)}
              hint="Total earnings to date"
              testId="wallet-earned"
            />

            <Figure
              label="Lifetime withdrawn"
              value={money(wallet?.lifetime_withdrawn)}
              hint="Total approved withdrawals"
              testId="wallet-withdrawn"
            />
          </div>
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 font-display text-lg font-bold">
          <ArrowUpRight size={17} className="text-primary" />
          Withdraw
        </div>

        {payoutSupported === false ? (
          <div
            className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-secondary/30 p-4 text-sm text-muted-foreground"
            data-testid="payout-unavailable"
          >
            <span className="flex items-start gap-2">
              <Info size={15} className="mt-0.5 shrink-0" />
              <span>
                Withdrawals aren't available yet. Saving payout details is
                not live on this account, so there is nowhere to send the
                money.
              </span>
            </span>

            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => setPayoutOpen(true)}
              data-testid="payout-add-btn"
            >
              {payoutAccount ? "Change details" : "Add details"}
            </Button>
          </div>
        ) : payoutSupported === true && !hasActiveAccount ? (
          <div
            className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-secondary/30 p-4 text-sm text-muted-foreground"
            data-testid="payout-missing"
          >
            <span className="flex items-start gap-2">
              <Info size={15} className="mt-0.5 shrink-0" />
              Add your payout details before requesting a withdrawal.
            </span>

            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => setPayoutOpen(true)}
              data-testid="payout-add-btn"
            >
              Add details
            </Button>
          </div>
        ) : null}

        {payoutAccount && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-secondary px-2.5 py-1 font-medium">
              {titleise(payoutAccount.payout_type)}
            </span>

            <span className="rounded-full bg-secondary px-2.5 py-1 font-mono">
              {maskPayout(payoutAccount)}
            </span>

            <span
              className={`rounded-full px-2.5 py-1 font-semibold ${
                payoutAccount.is_verified
                  ? "bg-emerald-500/10 text-emerald-600"
                  : "bg-amber-500/10 text-amber-600"
              }`}
              data-testid="payout-verified"
            >
              {payoutAccount.is_verified ? "Verified" : "Not verified"}
            </span>

            <button
              type="button"
              onClick={() => setPayoutOpen(true)}
              className="rounded-full border border-border px-2.5 py-1 font-medium transition-colors hover:bg-accent"
              data-testid="payout-edit-btn"
            >
              Change
            </button>
          </div>
        )}

        <form
          onSubmit={submit}
          className="mt-4 space-y-3"
        >
          <div className="rounded-xl border border-border bg-secondary/30 p-4">
            <div className="text-sm font-semibold">
              Withdraw your full available balance
            </div>

            <div
              className="mt-1 font-display text-2xl font-bold"
              data-testid="withdraw-amount"
            >
              {money(balance)}
            </div>

            <p className="mt-1 text-xs text-muted-foreground">
              Your available balance will be reserved when you submit the
              request. Funds already reserved for pending withdrawals
              cannot be requested again.
            </p>
          </div>

          <Button
            type="submit"
            disabled={!canWithdraw}
            className="w-full rounded-full sm:w-auto"
            data-testid="withdraw-submit"
          >
            {requesting && (
              <Loader2
                size={14}
                className="mr-1.5 animate-spin"
              />
            )}

            {requesting
              ? "Requesting..."
              : `Withdraw ${money(balance)}`}
          </Button>
        </form>

        {!hasActiveAccount && payoutSupported === true && (
          <p className="mt-3 text-xs text-muted-foreground">
            Add an active payout account before requesting a withdrawal.
          </p>
        )}

        {hasActiveAccount && balance <= 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            You need an available balance before you can request a
            withdrawal.
          </p>
        )}

        <p className="mt-3 text-xs text-muted-foreground">
          Payouts are processed manually by the admin after review. Once
          submitted, the requested amount is reserved until the request is
          approved or rejected. Approved withdrawals increase your lifetime
          withdrawn total; they do not reduce lifetime earned.
        </p>
      </section>

      <Panel
        title="Withdrawals"
        icon={Clock}
        loading={withdrawalsLoading && withdrawals.length === 0}
        error={withdrawalsError}
        onRetry={() => fetchWithdrawals().catch(() => {})}
        empty={withdrawals.length === 0}
        emptyText="No withdrawal requests yet."
        testId="withdrawals"
      >
        <ul className="divide-y divide-border" data-testid="withdrawals-list">
          {withdrawals.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-start gap-3 px-5 py-3.5"
              data-testid={`withdrawal-${item.id}`}
            >
              <div className="min-w-0 flex-1">
                <div className="font-display text-base font-bold">
                  {money(item.amount)}
                </div>

                <div className="text-xs text-muted-foreground">
                  Requested {when(item.requested_at)}
                </div>

                {item.funds_reserved === false && (
                  <div className="mt-1 text-xs font-semibold text-amber-700">
                    Test request — no funds reserved
                  </div>
                )}

                {getWithdrawalStatusMessage(item) && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {getWithdrawalStatusMessage(item)}
                  </div>
                )}

                {item.payout_reference && (
                  <div className="mt-1 break-all text-xs text-muted-foreground">
                    Transaction reference: {item.payout_reference}
                  </div>
                )}

                {item.remarks && (
                  <div className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                    Admin message: {item.remarks}
                  </div>
                )}

                {item.failure_reason && (
                  <div className="mt-1 whitespace-pre-wrap break-words text-xs text-destructive">
                    Rejection reason: {item.failure_reason}
                  </div>
                )}

                {item.processed_at && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Processed {when(item.processed_at)}
                  </div>
                )}
              </div>

              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                  WITHDRAWAL_TONE[item.status] ||
                  "bg-secondary text-muted-foreground"
                }`}
                data-testid={`withdrawal-status-${item.id}`}
              >
                {titleise(item.status)}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="Transactions"
        icon={Receipt}
        loading={ledgerLoading && ledger.length === 0}
        error={ledgerError}
        onRetry={() => fetchLedger().catch(() => {})}
        empty={ledger.length === 0}
        emptyText="No transactions yet. Course earnings will appear here."
        testId="ledger"
      >
        <ul className="divide-y divide-border" data-testid="ledger-list">
          {ledger.map((entry, index) => (
            <li
              key={entry.reference_id || `${entry.created_at}-${index}`}
              className="flex items-center gap-3 px-5 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">
                  {LEDGER_LABELS[entry.transaction_type] ||
                    titleise(entry.transaction_type)}
                </div>

                <div className="text-xs text-muted-foreground">
                  {entry.description || when(entry.created_at)}
                </div>
              </div>

              <div className="font-display text-base font-bold">
                {money(entry.amount)}
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <PayoutAccountDialog
        open={payoutOpen}
        onOpenChange={setPayoutOpen}
        account={payoutAccount}
        saving={savingPayout}
        onSubmit={async (form) => {
          try {
            await savePayoutAccount(form);

            toast.success(
              "Payout details saved. Verification is separate.",
            );

            setPayoutOpen(false);
          } catch {
            toast.error(
              useWalletStore.getState().payoutError ||
                "Could not save payout details",
            );
          }
        }}
      />
      <AdminContact />
    </div>
  );
}

function Figure({ label, value, hint, testId }) {
  return (
    <div className="rounded-2xl border border-border bg-background/70 p-4">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">
        {label}
      </div>

      <div
        className="mt-1 font-display text-xl font-bold"
        data-testid={testId}
      >
        {value}
      </div>

      {hint && (
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {hint}
        </div>
      )}
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  loading,
  error,
  onRetry,
  empty,
  emptyText,
  testId,
  children,
}) {
  return (
    <section
      className="mt-6 overflow-hidden rounded-2xl border border-border bg-card"
      data-testid={`${testId}-panel`}
    >
      <div className="flex items-center gap-2 border-b border-border px-5 py-3 font-display text-base font-bold">
        {Icon && (
          <Icon size={16} className="text-muted-foreground" />
        )}
        {title}
      </div>

      {loading ? (
        <div className="space-y-3 p-5">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      ) : error ? (
        <div
          className="px-5 py-8 text-center text-sm text-destructive"
          data-testid={`${testId}-error`}
        >
          <p>{error}</p>

          <Button
            variant="outline"
            className="mt-3 rounded-full"
            onClick={onRetry}
          >
            Try again
          </Button>
        </div>
      ) : empty ? (
        <div
          className="px-5 py-10 text-center text-sm text-muted-foreground"
          data-testid={`${testId}-empty`}
        >
          {emptyText}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

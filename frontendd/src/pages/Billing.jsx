import { useEffect, useMemo } from "react";
import {
  AlertCircle,
  BookOpen,
  CalendarClock,
  Crown,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "../store/authStore";
import {
  useSubscriptionStore,
  audienceForRole,
  purchasablePlans,
} from "../store/subscriptionStore";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";

const money = (amount) =>
  `₹${Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (value) => {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
};

const perLabel = (days) => {
  if (days === 30) return "month";
  if (days === 365) return "year";
  return `${days} days`;
};

export default function Billing() {
  const user = useAuthStore((state) => state.user);

  const plans = useSubscriptionStore(
    (state) => state.plans,
  );
  const billing = useSubscriptionStore(
    (state) => state.billing,
  );

  const plansLoading = useSubscriptionStore(
    (state) => state.plansLoading,
  );
  const billingLoading = useSubscriptionStore(
    (state) => state.billingLoading,
  );

  const checkingOutPlanId = useSubscriptionStore(
    (state) => state.checkingOutPlanId,
  );

  const plansError = useSubscriptionStore(
    (state) => state.plansError,
  );
  const billingError = useSubscriptionStore(
    (state) => state.billingError,
  );

  const loadAll = useSubscriptionStore(
    (state) => state.loadAll,
  );
  const fetchPlans = useSubscriptionStore(
    (state) => state.fetchPlans,
  );
  const fetchBillingState = useSubscriptionStore(
    (state) => state.fetchBillingState,
  );
  const startCheckout = useSubscriptionStore(
    (state) => state.startCheckout,
  );

  useEffect(() => {
    loadAll().catch(() => {});
  }, [loadAll]);

  const audience = audienceForRole(user?.role);

  const available = useMemo(
    () => purchasablePlans(plans, audience),
    [plans, audience],
  );

  const isPremium = Boolean(billing?.is_premium);
  const daysLeft = Number(billing?.days_left ?? 0);
  const renewalDate = formatDate(
    billing?.premium_until,
  );
  const expiringSoon =
    isPremium && daysLeft <= 7;

  const buy = async (plan) => {
    try {
      const result = await startCheckout(
        plan,
        user || {},
      );

      if (result?.status === "paid") {
        toast.success(
          "Payment verified. Subscription active.",
        );

        await fetchBillingState().catch(() => {});
      } else if (result?.status === "cancelled") {
        toast.message("Checkout closed.");
      } else if (result?.status === "mock") {
        toast.message("Coming soon", {
          description: result.message,
        });
      } else if (result?.status === "unknown") {
        toast.error(
          result.message || "Payment status unknown.",
        );
      }
    } catch {
      toast.error(
        useSubscriptionStore.getState().checkoutError ||
          "Checkout failed",
      );
    }
  };

  return (
    <div
      className="mx-auto max-w-5xl px-4 py-6"
      data-testid="billing-page"
    >
      {billingLoading && !billing ? (
        <div className="rounded-3xl border border-border p-6 md:p-8">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-3 h-8 w-64" />
          <Skeleton className="mt-2 h-4 w-80" />
        </div>
      ) : billingError ? (
        <div
          className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6 md:p-8"
          data-testid="billing-status-error"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertCircle size={16} />
            Could not load your subscription status
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            {billingError}
          </p>

          <Button
            variant="outline"
            className="mt-4 rounded-full"
            onClick={() =>
              fetchBillingState().catch(() => {})
            }
            data-testid="billing-status-retry"
          >
            Try again
          </Button>
        </div>
      ) : (
        <div
          className={`overflow-hidden rounded-3xl border p-6 md:p-8 ${
            isPremium
              ? expiringSoon
                ? "border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-background"
                : "border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-background"
              : "border-border bg-secondary/40"
          }`}
        >
          <div className="text-xs font-bold uppercase tracking-widest text-primary">
            Your subscription
          </div>

          <h1
            className="mt-1 font-display text-2xl font-extrabold md:text-3xl"
            data-testid="billing-status"
          >
            {isPremium ? (
              <>
                Active ·{" "}
                <span
                  className={
                    expiringSoon
                      ? "text-amber-600"
                      : "text-primary"
                  }
                >
                  {daysLeft}{" "}
                  {daysLeft === 1
                    ? "day"
                    : "days"}{" "}
                  left
                </span>
              </>
            ) : (
              "No active subscription"
            )}
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            {isPremium
              ? renewalDate
                ? `Your ${
                    billing?.plan || "plan"
                  } runs until ${renewalDate}.`
                : `You are on the ${
                    billing?.plan || "current"
                  } plan.`
              : "Choose a plan below to publish courses and unlock creator tools."}
          </p>

          {isPremium && (
            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-3 py-1 text-xs text-muted-foreground">
              <CalendarClock size={12} />
              Plan:{" "}
              <span className="font-semibold text-foreground">
                {billing?.plan}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="mt-8 flex items-end justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Plans
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            {audience === "institution"
              ? "Institution plans, billed to your organisation."
              : "Creator plans. Prices and durations come from the server."}
          </p>
        </div>
      </div>

      {plansLoading && plans.length === 0 ? (
        <div
          className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2"
          data-testid="billing-plans-loading"
        >
          {[0, 1].map((key) => (
            <div
              key={key}
              className="rounded-2xl border border-border p-5"
            >
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-4 h-9 w-32" />
              <Skeleton className="mt-5 h-10 w-full" />
            </div>
          ))}
        </div>
      ) : plansError ? (
        <div
          className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center text-sm text-destructive"
          data-testid="billing-plans-error"
        >
          <p>{plansError}</p>

          <Button
            variant="outline"
            className="mt-4 rounded-full"
            onClick={() =>
              fetchPlans().catch(() => {})
            }
            data-testid="billing-plans-retry"
          >
            Try again
          </Button>
        </div>
      ) : available.length === 0 ? (
        <div
          className="mt-3 rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground"
          data-testid="billing-plans-empty"
        >
          No plans are available for your account type
          right now.
        </div>
      ) : (
        <div
          className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2"
          data-testid="billing-plans"
        >
          {available.map((plan) => {
            const isCheckingOut =
              checkingOutPlanId === plan.id;

            const disabled =
              checkingOutPlanId !== null;

            return (
              <div
                key={plan.id}
                className="rounded-2xl border border-border bg-card p-5"
                data-testid={`billing-plan-${plan.id}`}
              >
                <div className="flex items-center gap-2 font-display text-lg font-bold">
                  <Crown
                    size={16}
                    className="text-primary"
                  />
                  {plan.name}
                </div>

                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="font-display text-3xl font-extrabold">
                    {money(plan.price)}
                  </span>

                  <span className="text-xs text-muted-foreground">
                    /{" "}
                    {perLabel(
                      Number(plan.duration_days),
                    )}
                  </span>
                </div>

                {plan.max_courses != null && (
                  <div
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium"
                    data-testid={`billing-plan-limit-${plan.id}`}
                  >
                    <BookOpen size={12} />
                    Up to {plan.max_courses} courses
                  </div>
                )}

                <Button
                  disabled={disabled}
                  onClick={() => buy(plan)}
                  className="mt-5 w-full rounded-full"
                  data-testid={`subscribe-${plan.id}`}
                >
                  {isCheckingOut && (
                    <Loader2
                      size={14}
                      className="mr-1.5 animate-spin"
                    />
                  )}

                  {isCheckingOut
                    ? "Opening checkout..."
                    : `Subscribe · ${money(plan.price)}`}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Payments are processed by Razorpay and verified
        on the server. Your plan and expiry always come
        from the backend.
      </p>
    </div>
  );
}
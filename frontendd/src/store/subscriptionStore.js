import { create } from "zustand";
import { api, formatApiError } from "../lib/api";
import { loadRazorpay } from "../lib/razorpay";

// Subscription/billing scope, chosen against the deployed backend rather than
// the handoff document alone (verified 05 Sep 2026):
//
//   GET  /subscriptions/plans        200, bare array of plan records
//   GET  /billing/me                 200, { plan, premium_until, is_premium, days_left }
//   POST /billing/checkout           creates a Razorpay order
//   POST /billing/verify-payment     server-side signature verification
//
// Deliberately not used:
//   GET  /billing/plans              returns 500 on the deployed backend
//   POST /subscriptions/start-trial  registration already grants 30 days on the
//                                    user row; calling this creates a second,
//                                    independently drifting expiry clock
//
// /billing/me is a rendering source only. It is never treated as permission:
// the backend's own 403s remain the authority on what a user may do.

const AUDIENCES = ["creator", "institution"];

export const audienceForRole = (role) =>
  role === "institution" ? "institution" : "creator";

// The plan list is returned for every audience at once.
export const purchasablePlans = (plans, audience) =>
  plans.filter(
    (plan) =>
      plan.user_type === audience &&
      Number(plan.price) > 0 &&
      plan.is_active !== false,
  );

export const useSubscriptionStore = create((set, get) => ({
  plans: [],
  billing: null,

  plansLoading: false,
  billingLoading: false,
  // Holds the id of the plan being bought, not a bare flag, so only the card
  // that was clicked shows a spinner.
  checkingOutPlanId: null,

  plansError: null,
  billingError: null,
  checkoutError: null,

  clearCheckoutError: () => set({ checkoutError: null }),

  fetchPlans: async () => {
    set({ plansLoading: true, plansError: null });
    try {
      const { data } = await api.get("/subscriptions/plans");
      const plans = Array.isArray(data)
        ? data
        : Array.isArray(data?.plans)
          ? data.plans
          : [];
      set({ plans });
      return plans;
    } catch (err) {
      set({
        plansError:
          formatApiError(err.response?.data?.detail) ||
          "Could not load subscription plans.",
      });
      throw err;
    } finally {
      set({ plansLoading: false });
    }
  },

  fetchBillingState: async () => {
    set({ billingLoading: true, billingError: null });
    try {
      const { data } = await api.get("/billing/me");
      set({ billing: data });
      return data;
    } catch (err) {
      set({
        billingError:
          formatApiError(err.response?.data?.detail) ||
          "Could not load your subscription status.",
      });
      throw err;
    } finally {
      set({ billingLoading: false });
    }
  },

  // Loaded separately so one failing request does not blank the other section.
  loadAll: async () => {
    const results = await Promise.allSettled([
      get().fetchPlans(),
      get().fetchBillingState(),
    ]);
    return results;
  },

  /**
   * Buy a plan through Razorpay.
   *
   * NOT EXERCISED END TO END. The project's Razorpay credentials are live keys,
   * so no order was ever created against them during development. This follows
   * the documented contract and tolerates both response shapes seen in the
   * codebase and the handoff; it needs a real run with test credentials before
   * anyone can call it verified.
   */
  startCheckout: async (plan, user = {}) => {
    set({ checkingOutPlanId: plan?.id ?? null, checkoutError: null });

    try {
      const { data: checkout } = await api.post("/billing/checkout", {
        plan_id: plan.id,
        pay_with: "razorpay",
      });

      if (!checkout) throw new Error("Unable to fetch checkout details.");

      // The handoff documents a bare { key_id, order_id, amount, currency,
      // prefill }. The previous page instead branched on a `status` field.
      // Handle both until the real shape is confirmed.
      if (checkout.status === "paid" || checkout.status === "already_paid") {
        await get().fetchBillingState().catch(() => {});
        return { status: "paid" };
      }

      if (checkout.status === "mock") {
        return { status: "mock", message: checkout.message };
      }

      if (!checkout.order_id) {
        return {
          status: "unknown",
          message:
            checkout.message || "Checkout did not return a payment order.",
        };
      }

      const Razorpay = await loadRazorpay();
      if (!Razorpay) throw new Error("Unable to load Razorpay.");

      return await new Promise((resolve, reject) => {
        const razorpay = new Razorpay({
          key: checkout.key_id || import.meta.env.VITE_RAZORPAY_KEY_ID,
          order_id: checkout.order_id,
          amount: checkout.amount,
          currency: checkout.currency || "INR",
          name: "Skiller",
          description: checkout.plan_name || plan.name || "Subscription",
          prefill: {
            name: checkout.prefill?.name || user.name || "",
            email: checkout.prefill?.email || user.email || "",
          },
          notes: checkout.notes || {},
          theme: { color: "#B91C1C" },
          modal: {
            ondismiss: () => resolve({ status: "cancelled" }),
          },
          handler: async (response) => {
            try {
              const { data: verification } = await api.post(
                "/billing/verify-payment",
                {
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                },
              );

              // The server decides whether this is paid. Re-read billing state
              // rather than believing anything the client was handed.
              await get().fetchBillingState().catch(() => {});

              resolve({
                status: "paid",
                paymentId: response.razorpay_payment_id,
                verification,
              });
            } catch (err) {
              reject(err);
            }
          },
        });

        razorpay.on("payment.failed", (response) => {
          reject(new Error(response.error?.description || "Payment failed."));
        });
        razorpay.open();
      });
    } catch (err) {
      const message =
        formatApiError(err.response?.data?.detail) ||
        err.message ||
        "Checkout failed.";
      set({ checkoutError: message });
      throw err;
    } finally {
      set({ checkingOutPlanId: null });
    }
  },
}));

export { AUDIENCES };

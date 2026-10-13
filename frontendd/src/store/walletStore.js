
import { create } from "zustand";
import { api, formatApiError } from "../lib/api";

const WITHDRAWAL_KEY_STORAGE = "skiller_withdrawal_key";

const newKey = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `wd-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const readStoredKey = () => {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(WITHDRAWAL_KEY_STORAGE);
  } catch {
    return null;
  }
};

const writeStoredKey = (key) => {
  if (typeof window === "undefined") return;

  try {
    if (key) {
      window.localStorage.setItem(WITHDRAWAL_KEY_STORAGE, key);
    } else {
      window.localStorage.removeItem(WITHDRAWAL_KEY_STORAGE);
    }
  } catch {
    // The key remains usable for the current page session.
  }
};

const getErrorMessage = (error, fallback) =>
  formatApiError(error?.response?.data?.detail) || fallback;

const isGenericNotFound = (detail) =>
  typeof detail === "string" && /^not found$/i.test(detail.trim());

export const LEDGER_LABELS = {
  withdrawal_pending: "Withdrawal requested",
  withdrawal_completed: "Withdrawal completed",
  withdrawal_released: "Withdrawal returned",
};

export const WITHDRAWAL_TONE = {
  pending: "bg-amber-500/10 text-amber-600",
  successful: "bg-emerald-500/10 text-emerald-600",
  completed: "bg-emerald-500/10 text-emerald-600",
  failed: "bg-secondary text-muted-foreground",
  rejected: "bg-secondary text-muted-foreground",
};

export const useWalletStore = create((set, get) => ({
  wallet: null,
  ledger: [],
  withdrawals: [],
  payoutAccount: null,

  payoutSupported: null,

  walletLoading: false,
  ledgerLoading: false,
  withdrawalsLoading: false,
  payoutLoading: false,
  savingPayout: false,
  requesting: false,

  walletError: null,
  ledgerError: null,
  withdrawalsError: null,
  payoutError: null,
  requestError: null,

  clearRequestError: () => set({ requestError: null }),
  clearPayoutError: () => set({ payoutError: null }),

  fetchWallet: async () => {
    set({ walletLoading: true, walletError: null });

    try {
      const { data } = await api.get("/wallets/me");

      set({ wallet: data });

      return data;
    } catch (error) {
      set({
        walletError: getErrorMessage(
          error,
          "Could not load your wallet.",
        ),
      });

      throw error;
    } finally {
      set({ walletLoading: false });
    }
  },

  fetchLedger: async () => {
    set({ ledgerLoading: true, ledgerError: null });

    try {
      const { data } = await api.get("/wallets/ledger");

      const ledger = Array.isArray(data)
        ? data
        : Array.isArray(data?.ledger)
          ? data.ledger
          : [];

      set({ ledger });

      return ledger;
    } catch (error) {
      set({
        ledgerError: getErrorMessage(
          error,
          "Could not load your transactions.",
        ),
      });

      throw error;
    } finally {
      set({ ledgerLoading: false });
    }
  },

  fetchWithdrawals: async () => {
    set({ withdrawalsLoading: true, withdrawalsError: null });

    try {
      const { data } = await api.get("/withdrawals/me");

      const withdrawals = Array.isArray(data)
        ? data
        : Array.isArray(data?.withdrawals)
          ? data.withdrawals
          : [];

      set({ withdrawals });

      return withdrawals;
    } catch (error) {
      set({
        withdrawalsError: getErrorMessage(
          error,
          "Could not load your withdrawals.",
        ),
      });

      throw error;
    } finally {
      set({ withdrawalsLoading: false });
    }
  },

  fetchPayoutAccount: async () => {
    set({ payoutLoading: true, payoutError: null });

    try {
      const { data } = await api.get("/payout-account/me");

      set({
        payoutAccount: data || null,
        payoutSupported: true,
      });

      return data || null;
    } catch (error) {
      const status = error?.response?.status;
      const detail = error?.response?.data?.detail;

      if (status === 404 && isGenericNotFound(detail)) {
        set({
          payoutAccount: null,
          payoutSupported: false,
        });

        return null;
      }

      if (status === 404) {
        set({
          payoutAccount: null,
          payoutSupported: true,
        });

        return null;
      }

      if (status === 403) {
        set({
          payoutAccount: null,
          payoutSupported: true,
          payoutError: getErrorMessage(
            error,
            "Your account cannot access payout settings.",
          ),
        });

        return null;
      }

      set({
        payoutAccount: null,
        payoutSupported: false,
        payoutError: getErrorMessage(
          error,
          "Could not load payout details.",
        ),
      });

      return null;
    } finally {
      set({ payoutLoading: false });
    }
  },

  savePayoutAccount: async (form) => {
    set({
      savingPayout: true,
      payoutError: null,
    });

    const payload =
      form.payout_type === "upi"
        ? {
            payout_type: "upi",
            upi_id: form.upi_id?.trim() || null,
            account_holder_name: null,
            account_number: null,
            ifsc_code: null,
          }
        : {
            payout_type: "bank_account",
            account_holder_name:
              form.account_holder_name?.trim() || null,
            account_number: form.account_number?.trim() || null,
            ifsc_code: form.ifsc_code?.trim().toUpperCase() || null,
            upi_id: null,
          };

    try {
      const { data } = await api.put(
        "/payout-account/me",
        payload,
      );

      set({
        payoutAccount: data,
        payoutSupported: true,
        payoutError: null,
      });

      return data;
    } catch (error) {
      const status = error?.response?.status;
      const detail = error?.response?.data?.detail;

      if (status === 404 && isGenericNotFound(detail)) {
        set({
          payoutSupported: false,
          payoutError:
            "Payout setup is not available on the server yet, so these details cannot be saved.",
        });
      } else {
        set({
          payoutError: getErrorMessage(
            error,
            "Could not save your payout details.",
          ),
        });
      }

      throw error;
    } finally {
      set({ savingPayout: false });
    }
  },

  loadAll: async () =>
    Promise.allSettled([
      get().fetchWallet(),
      get().fetchLedger(),
      get().fetchWithdrawals(),
      get().fetchPayoutAccount(),
    ]),

  requestWithdrawal: async () => {
    if (get().requesting) {
      throw new Error("A withdrawal request is already being submitted.");
    }

    set({
      requesting: true,
      requestError: null,
    });

    const idempotencyKey = readStoredKey() || newKey();

    writeStoredKey(idempotencyKey);

    try {
      const { data } = await api.post("/withdrawals/", {
        idempotency_key: idempotencyKey,
      });

      writeStoredKey(null);

      await Promise.allSettled([
        get().fetchWallet(),
        get().fetchWithdrawals(),
        get().fetchLedger(),
      ]);

      return data;
    } catch (error) {
      set({
        requestError: getErrorMessage(
          error,
          "Could not request the withdrawal.",
        ),
      });

      throw error;
    } finally {
      set({ requesting: false });
    }
  },
}));

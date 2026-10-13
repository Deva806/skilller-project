
import axios from "axios";


const rawUrl = import.meta.env.VITE_API_URL || "";
const BACKEND_URL = rawUrl.replace(/\/+$/, "");

export const API = BACKEND_URL
  ? `${BACKEND_URL}/api`
  : "/api";

export const api = axios.create({
  baseURL: API,
});

let authToken = null;

export function setAuthToken(token) {
  authToken = token;
}
// The auth store registers here to decide what a 401 means.
// Keep api.js independent of the auth store.
let onUnauthorized = null;

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export const SKIP_AUTH_CHECK = "x-skiller-skip-auth-check";



api.interceptors.request.use(
  (config) => {
    const token =
      authToken ||
      localStorage.getItem("skiller_token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);


api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      !error.config?.[SKIP_AUTH_CHECK]
    ) {
      
      onUnauthorized?.();
    }

    return Promise.reject(error);
  }
);


export function formatApiError(detail) {
  if (detail == null) {
    return "Something went wrong. Please try again.";
  }

  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item.msg === "string") {
          return item.msg;
        }

        return JSON.stringify(item);
      })
      .filter(Boolean)
      .join(" ");
  }

  if (detail && typeof detail.msg === "string") {
    return detail.msg;
  }

  return "Something went wrong. Please try again.";
}

export function getApiErrorMessage(error) {
  return formatApiError(
    error?.response?.data?.detail ??
    error?.response?.data?.message ??
    error?.message
  );
}



export async function getCreatorWallet() {
  const response = await api.get("/wallet/me");
  return response.data;
}

export async function getCreatorWalletLedger() {
  const response = await api.get("/wallet/me/ledger");
  return response.data;
}



export async function getMyPayoutAccount() {
  const response = await api.get("/payout-account/me");
  return response.data;
}

export async function saveMyPayoutAccount(data) {
  const response = await api.put(
    "/payout-account/me",
    data
  );

  return response.data;
}


export async function getMyWithdrawals() {
  const response = await api.get("/withdrawals/me");
  return response.data;
}

export async function requestFullWithdrawal(
  idempotencyKey
) {
  if (
    typeof idempotencyKey !== "string" ||
    !idempotencyKey.trim()
  ) {
    throw new Error(
      "A withdrawal request key is required."
    );
  }

  // The backend calculates the full available balance.
  // No withdrawal amount is submitted by the frontend.
  const response = await api.post("/withdrawals/", {
    idempotency_key: idempotencyKey.trim(),
  });

  return response.data;
}

export async function getAdminWithdrawals(status = null) {
  const response = await api.get(
    "/admin/withdrawals",
    {
      params: status ? { status } : {},
    }
  );

  return response.data;
}

export async function getAdminWithdrawalById(
  withdrawalId
) {
  const response = await api.get(
    `/admin/withdrawals/${encodeURIComponent(withdrawalId)}`
  );

  return response.data;
}

export async function approveAdminWithdrawal(
  withdrawalId,
  payoutReference,
  remarks = null,
  payoutProvider = "manual"
) {
  if (
    typeof payoutReference !== "string" ||
    !payoutReference.trim()
  ) {
    throw new Error(
      "Transaction reference is required for approval."
    );
  }

  const response = await api.post(
    `/admin/withdrawals/${encodeURIComponent(withdrawalId)}/approve`,
    {
      payout_reference: payoutReference.trim(),
      payout_provider: payoutProvider,
      remarks,
    }
  );

  return response.data;
}

export async function rejectAdminWithdrawal(
  withdrawalId,
  rejectionReason
) {
  if (
    typeof rejectionReason !== "string" ||
    !rejectionReason.trim()
  ) {
    throw new Error(
      "Rejection reason is required."
    );
  }

  const response = await api.post(
    `/admin/withdrawals/${encodeURIComponent(withdrawalId)}/reject`,
    {
      remarks: rejectionReason.trim(),
    }
  );

  return response.data;
}

 

export async function getAdminStats() {
  const response = await api.get("/admin/stats");
  return response.data;
}

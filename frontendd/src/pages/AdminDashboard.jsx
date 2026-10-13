
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { toast } from "sonner";
import {
  Users,
  GraduationCap,
  UserRound,
  ShieldCheck,
  BookOpen,
  ShoppingBag,
  Wallet,
  RefreshCw,
  LogOut,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  IndianRupee,
  TrendingUp,
  Landmark,
  Copy,
  Mail,
} from "lucide-react";
import { Button } from "../components/ui/button";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const number = (value) =>
  new Intl.NumberFormat("en-IN").format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return "Date unavailable";
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString("en-IN");
};

const firstValue = (object, keys, fallback = 0) => {
  for (const key of keys) {
    if (object?.[key] !== undefined && object?.[key] !== null) {
      return object[key];
    }
  }

  return fallback;
};

function StatCard({ title, value, icon: Icon, description }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <span className="rounded-xl bg-primary/10 p-3 text-primary">
          <Icon size={20} />
        </span>
      </div>

      <p className="mt-5 break-words text-2xl font-bold tracking-tight">
        {value}
      </p>

      {description && (
        <p className="mt-2 text-xs text-muted-foreground">{description}</p>
      )}
    </article>
  );
}

function Section({ title, description, children }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 md:p-6">
      <div className="mb-5">
        <h2 className="text-xl font-bold">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>

      {children}
    </section>
  );
}

function WithdrawalDetails({ item }) {
  const copyValue = async (value, label) => {
    if (!value) return;

    try {
      await navigator.clipboard.writeText(String(value));
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}`);
    }
  };

  const isBank = item.payout_method === "bank_account";
  const isUpi = item.payout_method === "upi";

  return (
    <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4">
      <div className="mb-3 flex items-center gap-2">
        {isBank ? (
          <Landmark size={18} className="text-primary" />
        ) : (
          <Wallet size={18} className="text-primary" />
        )}
        <h3 className="font-semibold">Payout destination</h3>
      </div>

      {!isBank && !isUpi && (
        <p className="text-sm text-muted-foreground">
          Payout method was not saved with this request.
        </p>
      )}

      {item.account_holder_name && (
        <div className="mb-2">
          <p className="text-xs text-muted-foreground">Account holder</p>
          <p className="break-words text-sm font-medium">
            {item.account_holder_name}
          </p>
        </div>
      )}

      {isBank && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Bank account number</p>
            <div className="flex items-center gap-2">
              <p className="break-all text-sm font-medium">
                {item.account_number || "Not provided"}
              </p>
              {item.account_number && (
                <button
                  type="button"
                  onClick={() =>
                    copyValue(item.account_number, "Account number")
                  }
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Copy account number"
                >
                  <Copy size={14} />
                </button>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">IFSC code</p>
            <div className="flex items-center gap-2">
              <p className="break-all text-sm font-medium">
                {item.ifsc_code || "Not provided"}
              </p>
              {item.ifsc_code && (
                <button
                  type="button"
                  onClick={() => copyValue(item.ifsc_code, "IFSC code")}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Copy IFSC code"
                >
                  <Copy size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {isUpi && (
        <div>
          <p className="text-xs text-muted-foreground">UPI ID</p>
          <div className="flex items-center gap-2">
            <p className="break-all text-sm font-medium">
              {item.upi_id || "Not provided"}
            </p>
            {item.upi_id && (
              <button
                type="button"
                onClick={() => copyValue(item.upi_id, "UPI ID")}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Copy UPI ID"
              >
                <Copy size={14} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);
  const [withdrawalsError, setWithdrawalsError] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [remarks, setRemarks] = useState({});
  const [references, setReferences] = useState({});
  const [rejectionReasons, setRejectionReasons] = useState({});
  const [showAllWithdrawals, setShowAllWithdrawals] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);

    const [statsResult, withdrawalsResult] = await Promise.allSettled([
      api.get("/admin/stats"),
      api.get("/admin/withdrawals"),
    ]);

    if (statsResult.status === "fulfilled") {
      const payload = statsResult.value.data;
      setStats(payload?.stats ?? payload?.data ?? payload);
      setStatsError(false);
    } else {
      setStatsError(true);
    }

    if (withdrawalsResult.status === "fulfilled") {
      const payload = withdrawalsResult.value.data;
      const list = Array.isArray(payload)
        ? payload
        : payload?.withdrawals ?? payload?.items ?? [];

      setWithdrawals(Array.isArray(list) ? list : []);
      setWithdrawalsError(false);
    } else {
      setWithdrawalsError(true);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch {
      toast.error("Could not log out. Please try again.");
    }
  };

  const handleWithdrawal = async (withdrawal, action) => {
    const id = withdrawal.id || withdrawal.withdrawal_id;

    if (!id) {
      toast.error("Withdrawal ID is missing");
      return;
    }

    if (withdrawal.status !== "pending") {
      toast.error("This request has already been processed");
      return;
    }

    if (action === "approve") {
      const reference = references[id]?.trim();

      if (!reference) {
        toast.error("Enter the actual bank/UPI transaction reference");
        return;
      }

      const confirmed = window.confirm(
        "Have you actually transferred the money to the creator? Only approve after the external bank/UPI transfer is complete."
      );

      if (!confirmed) return;

      setActionId(id);

      try {
        await api.post(`/admin/withdrawals/${encodeURIComponent(id)}/approve`, {
          payout_provider: "manual",
          payout_reference: reference,
          remarks: remarks[id]?.trim() || null,
        });

        toast.success("Withdrawal marked as successful");
        setReferences((current) => ({ ...current, [id]: "" }));
        setRemarks((current) => ({ ...current, [id]: "" }));
        await loadDashboard();
      } catch (error) {
        toast.error(
          error?.response?.data?.detail ||
            "Could not approve withdrawal"
        );
      } finally {
        setActionId(null);
      }

      return;
    }

    const reason = rejectionReasons[id]?.trim();

    if (!reason) {
      toast.error("Enter a rejection reason for the creator");
      return;
    }

    const confirmed = window.confirm(
      "Reject this creator withdrawal request? The reserved funds will be released back to the creator's available wallet balance."
    );

    if (!confirmed) return;

    setActionId(id);

    try {
      await api.post(`/admin/withdrawals/${encodeURIComponent(id)}/reject`, {
        remarks: reason,
      });

      toast.success("Withdrawal request rejected and funds released");
      setRejectionReasons((current) => ({ ...current, [id]: "" }));
      await loadDashboard();
    } catch (error) {
      toast.error(
        error?.response?.data?.detail ||
          "Could not reject withdrawal"
      );
    } finally {
      setActionId(null);
    }
  };

  const dashboardStats = useMemo(() => {
    const source = stats || {};

    const users = source.users || source.user_stats || {};
    const courses = source.courses || source.course_stats || {};
    const revenue = source.revenue || source.revenue_stats || {};

    const totalUsers = firstValue(
      source,
      [
        "total_users",
        "total_signups",
        "total_sign_ups",
        "total_registrations",
      ],
      firstValue(users, ["total", "total_users", "count"])
    );

    const students = firstValue(
      source,
      ["total_students", "students", "student_count"],
      firstValue(users, ["students", "total_students"])
    );

    const creators = firstValue(
      source,
      ["total_creators", "creators", "creator_count"],
      firstValue(users, ["creators", "total_creators"])
    );

    const admins = firstValue(
      source,
      ["total_admins", "admins", "admin_count"],
      firstValue(users, ["admins", "total_admins"])
    );

    const totalCourses = firstValue(
      source,
      ["total_courses", "courses_count"],
      firstValue(courses, ["total", "total_courses", "count"])
    );

    const purchases = firstValue(
      source,
      [
        "courses_purchased",
        "total_course_purchases",
        "total_purchases",
        "successful_purchases",
      ],
      firstValue(courses, [
        "purchased",
        "total_purchases",
        "purchases",
      ])
    );

    const totalRevenue = Number(
      firstValue(
        source,
        [
          "total_revenue",
          "total_course_revenue",
          "gross_revenue",
          "total_purchase_amount",
        ],
        firstValue(revenue, ["total_revenue", "gross", "total"])
      )
    );

    const platformCommission = Number(
      firstValue(
        source,
        [
          "platform_commission",
          "platform_earnings",
          "commission_amount",
          "total_commission",
        ],
        firstValue(
          revenue,
          ["platform_commission", "commission"],
          totalRevenue * 0.1
        )
      )
    );

    const creatorEarnings = Number(
      firstValue(
        source,
        [
          "creator_earnings",
          "creator_share",
          "total_creator_earnings",
        ],
        firstValue(
          revenue,
          ["creator_earnings", "creator_share"],
          totalRevenue * 0.9
        )
      )
    );

    return {
      totalUsers,
      students,
      creators,
      admins,
      totalCourses,
      purchases,
      totalRevenue,
      platformCommission,
      creatorEarnings,
    };
  }, [stats]);

  const pendingCount = withdrawals.filter(
    (item) => item.status === "pending"
  ).length;

  const pendingAmount = withdrawals
    .filter((item) => item.status === "pending")
    .reduce((total, item) => total + Number(item.amount || 0), 0);

  const visibleWithdrawals = showAllWithdrawals
    ? withdrawals
    : withdrawals.filter((item) => item.status === "pending");

  return (
    <main className="min-h-screen bg-background px-4 py-6 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
              Skiller control centre
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight">
              Admin Dashboard
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              Welcome, {user?.name || user?.username || "Admin"}. Monitor
              platform performance and manage creator withdrawals.
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="rounded-full"
              onClick={loadDashboard}
              disabled={loading}
            >
              <RefreshCw
                size={15}
                className={`mr-2 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>

            <Button
              variant="outline"
              className="rounded-full"
              onClick={handleLogout}
            >
              <LogOut size={15} className="mr-2" />
              Logout
            </Button>
          </div>
        </header>

        <Section
          title="Platform overview"
          description="Total registered accounts across Skiller."
        >
          {statsError ? (
            <div className="rounded-xl border border-amber-500/30 p-4 text-sm text-muted-foreground">
              Could not load platform statistics. Check the backend statistics
              endpoint and its response.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                title="Total sign-ups"
                value={
                  loading && !stats
                    ? "…"
                    : number(dashboardStats.totalUsers)
                }
                icon={Users}
              />

              <StatCard
                title="Students"
                value={
                  loading && !stats
                    ? "…"
                    : number(dashboardStats.students)
                }
                icon={GraduationCap}
              />

              <StatCard
                title="Creators"
                value={
                  loading && !stats
                    ? "…"
                    : number(dashboardStats.creators)
                }
                icon={UserRound}
              />

              <StatCard
                title="Admins"
                value={
                  loading && !stats
                    ? "…"
                    : number(dashboardStats.admins)
                }
                icon={ShieldCheck}
              />
            </div>
          )}
        </Section>

        <Section
          title="Courses and revenue"
          description="Course catalogue, successful purchases, and revenue distribution."
        >
          {statsError ? (
            <p className="text-sm text-muted-foreground">
              Revenue information is unavailable until the statistics request
              succeeds.
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <StatCard
                  title="Total courses"
                  value={
                    loading && !stats
                      ? "…"
                      : number(dashboardStats.totalCourses)
                  }
                  icon={BookOpen}
                />

                <StatCard
                  title="Course purchases"
                  value={
                    loading && !stats
                      ? "…"
                      : number(dashboardStats.purchases)
                  }
                  icon={ShoppingBag}
                  description="Successful purchases reported by the backend"
                />
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <StatCard
                  title="Total course revenue"
                  value={
                    loading && !stats
                      ? "…"
                      : money(dashboardStats.totalRevenue)
                  }
                  icon={IndianRupee}
                  description="Total value of successful course purchases"
                />

                <StatCard
                  title="Platform commission · 10%"
                  value={
                    loading && !stats
                      ? "…"
                      : money(dashboardStats.platformCommission)
                  }
                  icon={Wallet}
                  description="Skiller's share of course revenue"
                />

                <StatCard
                  title="Creator share · 90%"
                  value={
                    loading && !stats
                      ? "…"
                      : money(dashboardStats.creatorEarnings)
                  }
                  icon={TrendingUp}
                  description="Creator share of course revenue"
                />
              </div>
            </>
          )}
        </Section>

        <Section
          title="Creator withdrawal requests"
          description="Review creator payout details, record actual external transfers, and reject requests with a reason."
        >
          <div className="mb-5 grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl border border-border p-4">
              <span className="rounded-xl bg-primary/10 p-3 text-primary">
                <Wallet size={22} />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">
                  Pending requests
                </p>
                <p className="text-2xl font-bold">{pendingCount}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-border p-4">
              <span className="rounded-xl bg-primary/10 p-3 text-primary">
                <IndianRupee size={22} />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">
                  Amount awaiting payout
                </p>
                <p className="text-2xl font-bold">{money(pendingAmount)}</p>
              </div>
            </div>
          </div>

          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {showAllWithdrawals
                ? "Showing all withdrawal requests"
                : "Showing pending withdrawal requests"}
            </p>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => setShowAllWithdrawals((value) => !value)}
            >
              {showAllWithdrawals
                ? "Show pending only"
                : "Show all requests"}
            </Button>
          </div>

          {withdrawalsError ? (
            <div className="rounded-xl border border-amber-500/30 p-4 text-sm text-muted-foreground">
              Could not load withdrawal requests. Check the admin withdrawals
              endpoint and your admin permissions.
            </div>
          ) : loading && withdrawals.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              Loading withdrawal requests…
            </div>
          ) : visibleWithdrawals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center">
              <CheckCircle2
                size={32}
                className="mx-auto mb-3 text-muted-foreground"
              />
              <p className="font-semibold">
                {showAllWithdrawals
                  ? "No withdrawal requests found"
                  : "No pending withdrawal requests"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                New creator requests will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {visibleWithdrawals.map((item, index) => {
                const id =
                  item.id ||
                  item.withdrawal_id ||
                  `request-${index}`;

                const amount = item.amount ?? item.requested_amount ?? 0;
                const status = item.status || "pending";
                const busy = actionId === id;

                return (
                  <article
                    key={id}
                    className="rounded-xl border border-border p-4 md:p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="text-2xl font-bold">{money(amount)}</p>

                        <p className="break-all text-xs text-muted-foreground">
                          Request ID: {id}
                        </p>

                        <p className="break-words text-sm">
                          Creator:{" "}
                          {item.creator_name ||
                            item.user_name ||
                            item.user_id ||
                            "Not provided"}
                        </p>

                        {item.creator_email && (
                          <p className="flex items-center gap-2 break-all text-sm text-muted-foreground">
                            <Mail size={14} />
                            {item.creator_email}
                          </p>
                        )}

                        <p className="text-sm text-muted-foreground">
                          Requested: {formatDate(item.requested_at)}
                        </p>

                        {item.funds_reserved === false && (
                          <p className="flex items-center gap-2 rounded-lg bg-amber-500/10 p-2 text-sm text-amber-600">
                            <AlertCircle size={16} />
                            Test request — no wallet funds reserved
                          </p>
                        )}

                        <p className="flex items-center gap-2 text-sm capitalize text-muted-foreground">
                          {status === "successful" ? (
                            <CheckCircle2 size={15} />
                          ) : status === "failed" ? (
                            <XCircle size={15} />
                          ) : (
                            <Clock size={15} />
                          )}
                          Status: {status}
                        </p>

                        {item.payout_reference && (
                          <p className="break-all text-sm">
                            Payout reference: {item.payout_reference}
                          </p>
                        )}

                        {item.remarks && (
                          <p className="break-words text-sm text-muted-foreground">
                            Remarks: {item.remarks}
                          </p>
                        )}

                        {item.failure_reason && (
                          <p className="break-words text-sm text-destructive">
                            Rejection/failure reason: {item.failure_reason}
                          </p>
                        )}
                      </div>
                    </div>

                    <WithdrawalDetails item={item} />

                    {status === "pending" && (
                      <div className="mt-5 space-y-4">
                        <div>
                          <label
                            htmlFor={`reference-${id}`}
                            className="mb-1 block text-sm font-medium"
                          >
                            Actual bank/UPI transaction reference
                            <span className="ml-1 text-destructive">*</span>
                          </label>

                          <input
                            id={`reference-${id}`}
                            value={references[id] || ""}
                            onChange={(event) =>
                              setReferences((current) => ({
                                ...current,
                                [id]: event.target.value,
                              }))
                            }
                            placeholder="Enter reference after transferring the money"
                            maxLength={255}
                            disabled={busy}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor={`remarks-${id}`}
                            className="mb-1 block text-sm font-medium"
                          >
                            Admin remarks (optional)
                          </label>

                          <textarea
                            id={`remarks-${id}`}
                            value={remarks[id] || ""}
                            onChange={(event) =>
                              setRemarks((current) => ({
                                ...current,
                                [id]: event.target.value,
                              }))
                            }
                            placeholder="Optional note for this payout"
                            rows={2}
                            disabled={busy}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor={`rejection-${id}`}
                            className="mb-1 block text-sm font-medium"
                          >
                            Rejection reason
                            <span className="ml-1 text-destructive">*</span>
                          </label>

                          <textarea
                            id={`rejection-${id}`}
                            value={rejectionReasons[id] || ""}
                            onChange={(event) =>
                              setRejectionReasons((current) => ({
                                ...current,
                                [id]: event.target.value,
                              }))
                            }
                            placeholder="Required only if you reject this request"
                            rows={2}
                            maxLength={2000}
                            disabled={busy}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                          />
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="rounded-full"
                            disabled={busy}
                            onClick={() => handleWithdrawal(item, "approve")}
                          >
                            <CheckCircle2 size={15} className="mr-1" />
                            {busy ? "Processing…" : "Approve after transfer"}
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-full"
                            disabled={busy}
                            onClick={() => handleWithdrawal(item, "reject")}
                          >
                            <XCircle size={15} className="mr-1" />
                            Reject request
                          </Button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </Section>
      </div>
    </main>
  );
}

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { Logo } from "../components/Logo";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { formatApiError } from "../lib/api";
import ThemeToggle from "../components/ThemeToggle";
import { GraduationCap, Briefcase, Gift } from "lucide-react";

export default function Register() {
  const register = useAuthStore((state) => state.register);
  const verifyRegistrationOtp = useAuthStore(
    (state) => state.verifyRegistrationOtp
  );
  const resendRegistrationOtp = useAuthStore(
    (state) => state.resendRegistrationOtp
  );
  const pendingOtp = useAuthStore((state) => state.pendingOtp);
  const clearPendingOtp = useAuthStore(
    (state) => state.clearPendingOtp
  );

  const navigate = useNavigate();
  const [params] = useSearchParams();

  const refFromUrl = (params.get("ref") || "")
    .trim()
    .toUpperCase();

  const [form, setForm] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    role: "student",
    referral_code: refFromUrl,
  });

  const [loading, setLoading] = useState(false);
  const [otpMode, setOtpMode] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(60);

  useEffect(() => {
    if (refFromUrl) {
      setForm((f) => ({
        ...f,
        referral_code: refFromUrl,
      }));
    }
  }, [refFromUrl]);

  useEffect(() => {
    if (pendingOtp?.type === "registration") {
      setOtpMode(true);
    }
  }, [pendingOtp]);

  const set = (key, value) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const startCooldown = () => {
    setOtpCooldown(60);

    const timer = setInterval(() => {
      setOtpCooldown((seconds) => {
        if (seconds <= 1) {
          clearInterval(timer);
          return 0;
        }

        return seconds - 1;
      });
    }, 1000);
  };

  const submit = async (e) => {
    e.preventDefault();

    if (!form.name.trim()) {
      toast.error("Please enter your name");
      return;
    }

    if (!form.username.trim()) {
      toast.error("Please enter a username");
      return;
    }

    if (!form.email.trim()) {
      toast.error("Please enter your email");
      return;
    }

    if (form.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      const data = await register({
        ...form,
        name: form.name.trim(),
        username: form.username.trim().toLowerCase(),
        email: form.email.trim().toLowerCase(),
      });

      if (data?.otp_required) {
        setOtpMode(true);
        setOtp("");
        startCooldown();

        toast.success(
          `Verification OTP sent to ${
            data.email || form.email
          }`
        );

        return;
      }

      const user = data?.user || data;

      toast.success("Welcome to Skiller!");

      if (
        user?.role === "creator" ||
        user?.role === "admin"
      ) {
        navigate("/dashboard", {
          replace: true,
        });
      } else {
        navigate("/home", {
          replace: true,
        });
      }
    } catch (err) {
      toast.error(
        formatApiError(
          err.response?.data?.detail
        ) || "Sign up failed"
      );
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (e) => {
    e.preventDefault();

    if (otp.trim().length !== 6) {
      toast.error("Enter the 6-digit OTP");
      return;
    }

    setOtpLoading(true);

    try {
      const data = await verifyRegistrationOtp(
        otp.trim()
      );

      toast.success(
        "Email verified! Welcome to Skiller!"
      );

      const user = data?.user;

      if (
        user?.role === "creator" ||
        user?.role === "admin"
      ) {
        navigate("/dashboard", {
          replace: true,
        });
      } else {
        navigate("/home", {
          replace: true,
        });
      }
    } catch (err) {
      toast.error(
        formatApiError(
          err.response?.data?.detail
        ) || "Invalid or expired OTP"
      );
    } finally {
      setOtpLoading(false);
    }
  };

  const resendOtp = async () => {
    if (otpCooldown > 0 || resending) {
      return;
    }

    setResending(true);

    try {
      await resendRegistrationOtp(
        form.email.trim().toLowerCase()
      );

      setOtp("");
      startCooldown();

      toast.success(
        "A new verification OTP has been sent"
      );
    } catch (err) {
      toast.error(
        formatApiError(
          err.response?.data?.detail
        ) || "Could not resend OTP"
      );
    } finally {
      setResending(false);
    }
  };

  const backToRegister = () => {
    setOtpMode(false);
    setOtp("");
    setOtpCooldown(0);
    clearPendingOtp();
  };

  return (
    <div
      className="grid min-h-screen grid-cols-1 md:grid-cols-2"
      data-testid="register-page"
    >
      <div className="relative flex flex-col items-center justify-center px-6 py-12 order-2 md:order-1">
        <div className="absolute right-6 top-6">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <Logo />
          </div>

          {!otpMode ? (
            <>
              <h1 className="font-display text-3xl font-bold tracking-tight">
                Create your account
              </h1>

              <p className="mt-1 text-sm text-muted-foreground">
                Already here?{" "}
                <Link
                  to="/login"
                  className="font-semibold text-primary hover:underline"
                  data-testid="to-login-link"
                >
                  Sign in
                </Link>
              </p>

              <div
                className="mt-6 grid grid-cols-2 gap-3"
                data-testid="role-selector"
              >
                <RoleCard
                  label="Student"
                  description="Learn skills, watch reels, take courses."
                  icon={GraduationCap}
                  active={form.role === "student"}
                  onClick={() =>
                    set("role", "student")
                  }
                  tid="role-student"
                />

                <RoleCard
                  label="Creator / Institution"
                  description="Teach, post gigs, run ads, run a CRM."
                  icon={Briefcase}
                  active={form.role === "creator"}
                  onClick={() =>
                    set("role", "creator")
                  }
                  tid="role-creator"
                />
              </div>

              <form
                onSubmit={submit}
                className="mt-6 space-y-4"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="name">
                    {form.role === "creator"
                      ? "Brand or full name"
                      : "Full name"}
                  </Label>

                  <Input
                    id="name"
                    required
                    value={form.name}
                    onChange={(e) =>
                      set("name", e.target.value)
                    }
                    placeholder="Priya Kapoor"
                    data-testid="register-name-input"
                    className="rounded-xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="username">
                    Username
                  </Label>

                  <Input
                    id="username"
                    required
                    value={form.username}
                    onChange={(e) =>
                      set(
                        "username",
                        e.target.value
                          .toLowerCase()
                          .replace(
                            /[^a-z0-9_]/g,
                            ""
                          )
                      )
                    }
                    placeholder="priya"
                    data-testid="register-username-input"
                    className="rounded-xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email">
                    Email
                  </Label>

                  <Input
                    id="email"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) =>
                      set("email", e.target.value)
                    }
                    placeholder="you@skiller.app"
                    data-testid="register-email-input"
                    className="rounded-xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">
                    Password
                  </Label>

                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={6}
                    value={form.password}
                    onChange={(e) =>
                      set(
                        "password",
                        e.target.value
                      )
                    }
                    placeholder="At least 6 characters"
                    data-testid="register-password-input"
                    className="rounded-xl"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="h-11 w-full rounded-full"
                  data-testid="register-submit-btn"
                >
                  {loading
                    ? "Creating account…"
                    : `Create ${
                        form.role === "creator"
                          ? "creator"
                          : "student"
                      } account`}
                </Button>

                {form.referral_code && (
                  <div
                    className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary"
                    data-testid="referral-banner"
                  >
                    <Gift size={14} />

                    Joining via referral code{" "}
                    <strong>
                      {form.referral_code}
                    </strong>{" "}
                    — your friend earns 500 tokens
                    when you go premium.
                  </div>
                )}
              </form>
            </>
          ) : (
            <>
              <h1 className="font-display text-3xl font-bold tracking-tight">
                Verify your email
              </h1>

              <p className="mt-2 text-sm text-muted-foreground">
                We sent a 6-digit verification OTP to
              </p>

              <p className="mt-1 font-semibold">
                {pendingOtp?.email ||
                  form.email}
              </p>

              <form
                onSubmit={verifyOtp}
                className="mt-8 space-y-5"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="registration-otp">
                    Enter OTP
                  </Label>

                  <Input
                    id="registration-otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    value={otp}
                    onChange={(e) =>
                      setOtp(
                        e.target.value
                          .replace(/\D/g, "")
                          .slice(0, 6)
                      )
                    }
                    placeholder="123456"
                    data-testid="registration-otp-input"
                    className="h-12 rounded-xl text-center text-xl tracking-[0.4em]"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={
                    otpLoading ||
                    otp.length !== 6
                  }
                  className="h-11 w-full rounded-full"
                  data-testid="verify-registration-otp-btn"
                >
                  {otpLoading
                    ? "Verifying…"
                    : "Verify email"}
                </Button>
              </form>

              <div className="mt-5 text-center text-sm">
                {otpCooldown > 0 ? (
                  <p className="text-muted-foreground">
                    Resend OTP in{" "}
                    <span className="font-semibold text-foreground">
                      {otpCooldown}s
                    </span>
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={resendOtp}
                    disabled={resending}
                    className="font-semibold text-primary hover:underline disabled:opacity-50"
                  >
                    {resending
                      ? "Sending…"
                      : "Resend OTP"}
                  </button>
                )}
              </div>

              <div className="mt-5 text-center">
                <button
                  type="button"
                  onClick={backToRegister}
                  className="text-sm text-muted-foreground hover:text-primary hover:underline"
                >
                  ← Back to registration
                </button>
              </div>

              <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
                <p>
                  Verify your email to complete
                  your Skiller account.
                </p>

                <p className="mt-1">
                  Check your inbox and spam folder
                  for the OTP.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="relative hidden md:block order-1 md:order-2">
        <img
          src="https://images.unsplash.com/photo-1648111320024-3a08e28d20ff?w=1200&q=80"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />

        <div className="absolute inset-0 bg-gradient-to-tl from-black/80 via-black/30 to-transparent" />

        <div className="absolute inset-0 flex flex-col justify-end p-10 text-white">
          <div className="font-display text-4xl font-black leading-tight">
            Learn. Ship.
            <br />
            Get paid.
          </div>

          <p className="mt-2 max-w-sm text-sm text-white/70">
            Join 100K+ creators turning their
            skills into income.
          </p>
        </div>
      </div>
    </div>
  );
}

function RoleCard({
  label,
  description,
  icon: Icon,
  active,
  onClick,
  tid,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={tid}
      className={`flex flex-col items-start gap-2 rounded-2xl border p-3 text-left transition-all ${
        active
          ? "border-primary bg-primary/5 ring-2 ring-primary"
          : "border-border hover:border-primary/40"
      }`}
    >
      <Icon
        size={18}
        className={
          active
            ? "text-primary"
            : "text-muted-foreground"
        }
      />

      <div>
        <div className="text-sm font-semibold">
          {label}
        </div>

        <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {description}
        </div>
      </div>
    </button>
  );
}
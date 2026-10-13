
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { Logo } from "../components/Logo";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { formatApiError } from "../lib/api";
import ThemeToggle from "../components/ThemeToggle";

export default function Login() {
  const login = useAuthStore((state) => state.login);
  const verifyLoginOtp = useAuthStore((state) => state.verifyLoginOtp);
  const resendLoginOtp = useAuthStore((state) => state.resendLoginOtp);

  const location = useLocation();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("login");
  const [userId, setUserId] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [cooldown, setCooldown] = useState(60);

  // Countdown for OTP resend.
  useEffect(() => {
    if (step !== "otp" || cooldown <= 0) return undefined;

    const timer = setInterval(() => {
      setCooldown((value) => Math.max(0, value - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [step, cooldown]);

  // Redirect users after successful login or OTP verification.
  const goAfterLogin = (user) => {
    if (user?.role === "admin") {
      navigate("/admin", { replace: true });
      return;
    }

    const redirectTo = location.state?.redirectTo;

    if (
      typeof redirectTo === "string" &&
      redirectTo.startsWith("/") &&
      !redirectTo.startsWith("//") &&
      redirectTo !== "/admin"
    ) {
      navigate(redirectTo, { replace: true });
      return;
    }

    navigate(user?.role === "creator" ? "/dashboard" : "/home", {
      replace: true,
    });
  };

  // Submit email and password.
  const submit = async (e) => {
    e.preventDefault();

    if (!email.trim() || !password) {
      toast.error("Please enter your email and password");
      return;
    }

    setLoading(true);

    try {
      const result = await login(email.trim(), password);

      if (result?.otp_required) {
        setUserId(result.user_id);
        setOtpEmail(result.email || email.trim());
        setOtp("");
        setCooldown(60);
        setStep("otp");

        toast.success(result.message || "Login OTP sent to your email");
        return;
      }

      if (result?.user) {
        toast.success("Welcome back!");
        goAfterLogin(result.user);
        return;
      }

      if (result?.role) {
        toast.success("Welcome back!");
        goAfterLogin(result);
        return;
      }

      toast.error("Login response was incomplete");
    } catch (err) {
      toast.error(
        formatApiError(err?.response?.data?.detail) ||
          err?.message ||
          "Login failed"
      );
    } finally {
      setLoading(false);
    }
  };

  // Verify the six-digit login OTP.
  const verifyOtp = async (e) => {
    e.preventDefault();

    const cleanOtp = otp.trim();

    if (!/^\d{6}$/.test(cleanOtp)) {
      toast.error("Enter the 6-digit OTP");
      return;
    }

    if (!userId) {
      toast.error("Login session expired. Please sign in again.");
      setStep("login");
      return;
    }

    setLoading(true);

    try {
      const user = await verifyLoginOtp(userId, cleanOtp);

      if (!user) {
        toast.error("Login verification returned no user information");
        return;
      }

      toast.success("Login successful!");
      goAfterLogin(user);
    } catch (err) {
      toast.error(
        formatApiError(err?.response?.data?.detail) ||
          err?.message ||
          "Invalid or expired OTP"
      );
    } finally {
      setLoading(false);
    }
  };

  // Request a new OTP after the cooldown expires.
  const resendOtp = async () => {
    if (cooldown > 0 || resendLoading || loading) return;

    setResendLoading(true);

    try {
      const result = await resendLoginOtp(otpEmail || email.trim());

      setOtp("");
      setCooldown(60);

      toast.success(result?.message || "A new OTP has been sent");
    } catch (err) {
      toast.error(
        formatApiError(err?.response?.data?.detail) ||
          err?.message ||
          "Could not resend OTP"
      );
    } finally {
      setResendLoading(false);
    }
  };

  // Return to the login form.
  const backToLogin = () => {
    setStep("login");
    setOtp("");
    setUserId("");
    setOtpEmail("");
    setCooldown(60);
  };

  return (
    <div
      className="grid min-h-screen grid-cols-1 md:grid-cols-2"
      data-testid="login-page"
    >
      {/* Left-side welcome panel */}
      <div className="relative hidden md:block">
        <img
          src="https://images.unsplash.com/photo-1519408469771-2586093c3f14?w=1200&q=80"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />

        <div className="absolute inset-0 bg-gradient-to-tr from-black/80 via-black/30 to-transparent" />

        <div className="absolute inset-0 flex flex-col justify-between p-10 text-white">
          <Logo />

          <div>
            <div className="font-display text-4xl font-black leading-tight">
              Welcome back.
              <br />
              Keep building.
            </div>

            <p className="mt-2 max-w-sm text-sm text-white/70">
              Sign in to pick up where you left off — your feed, courses and
              gigs.
            </p>
          </div>
        </div>
      </div>

      {/* Login and OTP panel */}
      <div className="relative flex flex-col items-center justify-center px-6 py-12">
        <div className="absolute right-6 top-6">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8 md:hidden">
            <Logo />
          </div>

          {step === "login" ? (
            <>
              <h1 className="font-display text-3xl font-bold tracking-tight">
                Sign in
              </h1>

              <p className="mt-1 text-sm text-muted-foreground">
                New to Skiller?{" "}
                <Link
                  to="/register"
                  className="font-semibold text-primary hover:underline"
                  data-testid="to-register-link"
                >
                  Create an account
                </Link>
              </p>

              <form onSubmit={submit} className="mt-8 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@skiller.app"
                    data-testid="login-email-input"
                    className="rounded-xl"
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    data-testid="login-password-input"
                    className="rounded-xl"
                    autoComplete="current-password"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="h-11 w-full rounded-full"
                  data-testid="login-submit-btn"
                >
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
              </form>

              <div className="mt-3 text-center text-sm">
                <Link
                  to="/forgot-password"
                  className="text-muted-foreground hover:text-primary hover:underline"
                  data-testid="forgot-password-link"
                >
                  Forgot password?
                </Link>
              </div>

              <div className="mt-6 rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
                <div className="mb-1 font-semibold text-foreground">
                  Try a demo account
                </div>
                Email: <span className="font-mono">maya@skiller.app</span>
                <br />
                Password: <span className="font-mono">Demo@123</span>
              </div>
            </>
          ) : (
            <>
              <h1 className="font-display text-3xl font-bold tracking-tight">
                Verify your login
              </h1>

              <p className="mt-2 text-sm text-muted-foreground">
                We sent a 6-digit OTP to{" "}
                <span className="font-semibold text-foreground">
                  {otpEmail}
                </span>
              </p>

              <form onSubmit={verifyOtp} className="mt-8 space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="login-otp">Enter OTP</Label>
                  <Input
                    id="login-otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    value={otp}
                    onChange={(e) =>
                      setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="Enter 6-digit OTP"
                    data-testid="login-otp-input"
                    className="h-12 rounded-xl text-center text-lg tracking-[0.35em]"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="h-11 w-full rounded-full"
                  data-testid="verify-login-otp-btn"
                >
                  {loading ? "Verifying…" : "Verify OTP"}
                </Button>
              </form>

              <div className="mt-5 text-center text-sm">
                {cooldown > 0 ? (
                  <p className="text-muted-foreground">
                    Resend OTP in{" "}
                    <span className="font-semibold text-foreground">
                      {cooldown}s
                    </span>
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={resendOtp}
                    disabled={resendLoading || loading}
                    className="font-semibold text-primary hover:underline disabled:opacity-50"
                  >
                    {resendLoading ? "Sending…" : "Resend OTP"}
                  </button>
                )}
              </div>

              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={backToLogin}
                  disabled={loading}
                  className="text-sm text-muted-foreground hover:text-primary hover:underline disabled:opacity-50"
                >
                  ← Back to sign in
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

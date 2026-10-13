import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { Logo } from "../components/Logo";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { formatApiError } from "../lib/api";
import ThemeToggle from "../components/ThemeToggle";

export default function ForgotPassword() {
  const requestPasswordReset = useAuthStore(
    (state) => state.requestPasswordReset
  );
  const verifyResetOtp = useAuthStore(
    (state) => state.verifyResetOtp
  );
  const resendResetOtp = useAuthStore(
    (state) => state.resendResetOtp
  );
  const resetPassword = useAuthStore(
    (state) => state.resetPassword
  );

  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");

  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [step, setStep] = useState("email");

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const [cooldown, setCooldown] = useState(60);

  const startCooldown = () => {
    setCooldown(60);

    const timer = setInterval(() => {
      setCooldown((seconds) => {
        if (seconds <= 1) {
          clearInterval(timer);
          return 0;
        }

        return seconds - 1;
      });
    }, 1000);
  };

  const submitEmail = async (e) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error("Please enter your email");
      return;
    }

    setLoading(true);

    try {
      await requestPasswordReset(
        email.trim().toLowerCase()
      );

      setStep("otp");
      startCooldown();

      toast.success(
        "Password reset OTP sent to your email"
      );
    } catch (err) {
      toast.error(
        formatApiError(
          err?.response?.data?.detail
        ) || "Failed to send reset OTP"
      );
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async (e) => {
    e.preventDefault();

    if (otp.trim().length !== 6) {
      toast.error("Enter the 6-digit OTP");
      return;
    }

    setLoading(true);

    try {
      const data = await verifyResetOtp(
        email.trim().toLowerCase(),
        otp.trim()
      );

      if (!data?.reset_token) {
        toast.error(
          "Reset token was not received"
        );
        return;
      }

      setResetToken(data.reset_token);
      setStep("password");

      toast.success("OTP verified");
    } catch (err) {
      toast.error(
        formatApiError(
          err?.response?.data?.detail
        ) || "Invalid or expired OTP"
      );
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (cooldown > 0 || resending) {
      return;
    }

    setResending(true);

    try {
      await resendResetOtp(
        email.trim().toLowerCase()
      );

      setOtp("");
      startCooldown();

      toast.success(
        "A new reset OTP has been sent"
      );
    } catch (err) {
      toast.error(
        formatApiError(
          err?.response?.data?.detail
        ) || "Could not resend OTP"
      );
    } finally {
      setResending(false);
    }
  };

  const submitNewPassword = async (e) => {
    e.preventDefault();

    if (newPassword.length < 6) {
      toast.error(
        "Password must be at least 6 characters"
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (!resetToken) {
      toast.error(
        "Reset session expired. Please start again."
      );
      setStep("email");
      return;
    }

    setLoading(true);

    try {
      await resetPassword({
        reset_token: resetToken,
        new_password: newPassword,
      });

      toast.success(
        "Password reset successfully"
      );

      navigate("/login", {
        replace: true,
      });
    } catch (err) {
      toast.error(
        formatApiError(
          err?.response?.data?.detail
        ) || "Failed to reset password"
      );
    } finally {
      setLoading(false);
    }
  };

  const backToEmail = () => {
    setStep("email");
    setOtp("");
    setResetToken("");
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <div
      className="relative grid min-h-screen place-items-center px-6"
      data-testid="forgot-password-page"
    >
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Logo />
        </div>

        {step === "email" && (
          <>
            <h1 className="font-display text-3xl font-bold tracking-tight">
              Reset your password
            </h1>

            <p className="mt-1 text-sm text-muted-foreground">
              Enter your email and we'll send you
              a verification OTP.
            </p>

            <form
              onSubmit={submitEmail}
              className="mt-8 space-y-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="email">
                  Email
                </Label>

                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) =>
                    setEmail(e.target.value)
                  }
                  placeholder="you@skiller.app"
                  data-testid="forgot-email-input"
                  className="rounded-xl"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="h-11 w-full rounded-full"
                data-testid="forgot-submit-btn"
              >
                {loading
                  ? "Sending…"
                  : "Send reset OTP"}
              </Button>

              <div className="text-center text-sm text-muted-foreground">
                <Link
                  to="/login"
                  className="hover:underline"
                >
                  Back to sign in
                </Link>
              </div>
            </form>
          </>
        )}

        {step === "otp" && (
          <>
            <h1 className="font-display text-3xl font-bold tracking-tight">
              Verify OTP
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              We sent a 6-digit password reset OTP
              to
            </p>

            <p className="mt-1 font-semibold">
              {email}
            </p>

            <form
              onSubmit={submitOtp}
              className="mt-8 space-y-5"
            >
              <div className="space-y-1.5">
                <Label htmlFor="reset-otp">
                  Enter OTP
                </Label>

                <Input
                  id="reset-otp"
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
                  data-testid="reset-otp-input"
                  className="h-12 rounded-xl text-center text-xl tracking-[0.4em]"
                />
              </div>

              <Button
                type="submit"
                disabled={
                  loading || otp.length !== 6
                }
                className="h-11 w-full rounded-full"
                data-testid="verify-reset-otp-btn"
              >
                {loading
                  ? "Verifying…"
                  : "Verify OTP"}
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
                onClick={backToEmail}
                className="text-sm text-muted-foreground hover:text-primary hover:underline"
              >
                ← Change email
              </button>
            </div>
          </>
        )}

        {step === "password" && (
          <>
            <h1 className="font-display text-3xl font-bold tracking-tight">
              Create new password
            </h1>

            <p className="mt-1 text-sm text-muted-foreground">
              Choose a new password for your Skiller
              account.
            </p>

            <form
              onSubmit={submitNewPassword}
              className="mt-8 space-y-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="new-password">
                  New password
                </Label>

                <Input
                  id="new-password"
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) =>
                    setNewPassword(e.target.value)
                  }
                  placeholder="At least 6 characters"
                  data-testid="new-password-input"
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">
                  Confirm password
                </Label>

                <Input
                  id="confirm-password"
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) =>
                    setConfirmPassword(
                      e.target.value
                    )
                  }
                  placeholder="Enter password again"
                  data-testid="confirm-password-input"
                  className="rounded-xl"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="h-11 w-full rounded-full"
                data-testid="reset-password-btn"
              >
                {loading
                  ? "Updating…"
                  : "Reset password"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import {
  Grid3x3,
  Settings,
  LockKeyhole,
  BookOpen,
  CheckCircle2,
  PlayCircle,
} from "lucide-react";

function getEnrollmentCourse(entry) {
  if (!entry || typeof entry !== "object") return {};
  return entry.course && typeof entry.course === "object" ? entry.course : entry;
}

function getEnrollmentCourseId(entry) {
  if (!entry || typeof entry !== "object") return null;
  if (entry.course_id) return entry.course_id;
  if (entry.course?.id) return entry.course.id;
  if (entry.id && entry.title) return entry.id;
  return null;
}

function getEnrollmentProgress(entry) {
  const course = getEnrollmentCourse(entry);
  const raw =
    entry?.progress_percentage ??
    entry?.completion_percentage ??
    entry?.progress ??
    course?.progress_percentage ??
    course?.completion_percentage ??
    course?.progress;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
}

function courseCompletedFlag(entry) {
  const course = getEnrollmentCourse(entry);
  return Boolean(course?.completed === true || course?.is_completed === true);
}

function isEnrollmentCompleted(entry) {
  const progress = getEnrollmentProgress(entry);
  return Boolean(
    entry?.completed === true ||
      entry?.is_completed === true ||
      courseCompletedFlag(entry) ||
      (progress !== null && progress >= 100) ||
      entry?.completed_at
  );
}

function PasswordOtpStep({ email, onVerify, onResend, onBack, loading }) {
  const [otp, setOtp] = useState("");
  const [seconds, setSeconds] = useState(60);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setInterval(() => {
      setSeconds((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [seconds]);

  const submit = async (event) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(otp)) {
      toast.error("Enter the 6-digit OTP");
      return;
    }
    await onVerify(otp);
  };

  const resend = async () => {
    if (seconds > 0 || resending) return;
    try {
      setResending(true);
      await onResend();
      setOtp("");
      setSeconds(60);
    } finally {
      setResending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h3 className="text-2xl font-bold">Check your email</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          We sent a 6-digit code to <span className="font-medium">{email || "your registered email"}</span>. It expires in 5 minutes.
        </p>
      </div>

      <div>
        <label htmlFor="change-password-otp" className="text-sm font-semibold">
          Verification code
        </label>
        <input
          id="change-password-otp"
          name="change-password-otp"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={otp}
          onChange={(event) =>
            setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
          }
          placeholder="1 2 3 4 5 6"
          className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 text-center text-lg font-semibold tracking-[0.35em]"
          disabled={loading || resending}
          autoFocus
        />
      </div>

      <Button
        type="submit"
        disabled={loading || resending || otp.length !== 6}
        className="w-full rounded-full"
      >
        {loading ? "Verifying..." : "Verify"}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={onBack}
          disabled={loading || resending}
          className="text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Back
        </button>

        <button
          type="button"
          onClick={resend}
          disabled={seconds > 0 || resending || loading}
          className="font-medium text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resending
            ? "Sending..."
            : seconds > 0
              ? `Resend code in ${seconds}s`
              : "Resend code"}
        </button>
      </div>
    </form>
  );
}

export default function Profile() {
  const { username } = useParams();
  const navigate = useNavigate();

  const {
    user: currentUser,
    refresh,
    logout,
  } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: "",
    bio: "",
    avatar_url: "",
  });

  const [passwordStep, setPasswordStep] = useState("closed");
  const [changeToken, setChangeToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  const [courseStats, setCourseStats] = useState({
    active: 0,
    enrolled: 0,
    completed: 0,
    published: 0,
    students: 0,
  });
  const [enrolledCourses, setEnrolledCourses] = useState([]);

  const load = async () => {
    try {
      setLoading(true);

      const res = await api.get(`/users/${username}`);
      if (!res.data?.user) {
        throw new Error("Profile response is missing user data");
      }

      setData(res.data);
      setForm({
        name: res.data.user.name || "",
        bio: res.data.user.bio || "",
        avatar_url: res.data.user.avatar_url || "",
      });

      setCourseStats({
        active: 0,
        enrolled: 0,
        completed: 0,
        published: 0,
        students: 0,
      });
      setEnrolledCourses([]);

      if (res.data.is_self) {
        try {
          if (res.data.user.role === "student") {
            const enrolledRes = await api.get("/courses/enrolled");
            const enrolledList = Array.isArray(enrolledRes.data)
              ? enrolledRes.data
              : [];

            const completedCount =
              enrolledList.filter(isEnrollmentCompleted).length;

            setEnrolledCourses(enrolledList);
            setCourseStats({
              active: Math.max(enrolledList.length - completedCount, 0),
              enrolled: enrolledList.length,
              completed: completedCount,
              published: 0,
              students: 0,
            });
          } else if (
            res.data.user.role === "creator" ||
            res.data.user.role === "admin"
          ) {
            const coursesRes = await api.get("/courses");
            const courses = Array.isArray(coursesRes.data)
              ? coursesRes.data
              : [];

            const myCourses = courses.filter(
              (course) => course.owner_id === res.data.user.id
            );

            const totalStudents = myCourses.reduce(
              (total, course) =>
                total +
                Number(course.students ?? course.enrollments ?? 0),
              0
            );

            setCourseStats({
              active: 0,
              enrolled: 0,
              completed: 0,
              published: myCourses.length,
              students: totalStudents,
            });
          }
        } catch (statsError) {
          console.error("Course statistics load error:", statsError);
        }
      }
    } catch (err) {
      console.error("Profile load error:", err);
      toast.error(
        formatApiError(err.response?.data?.detail) || "Could not load profile"
      );
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [username]);

  const follow = async () => {
    if (!currentUser) {
      toast.error("Sign in to follow");
      return;
    }

    try {
      await api.post(`/users/${data.user.id}/follow`);
      await load();
    } catch (err) {
      toast.error(
        formatApiError(err.response?.data?.detail) || "Could not update follow"
      );
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();

    try {
      await api.patch("/users/me", form);
      toast.success("Profile saved");
      setEditing(false);
      await refresh();
      await load();
    } catch (err) {
      toast.error(
        formatApiError(err.response?.data?.detail) || "Could not save profile"
      );
    }
  };

  const startChangePassword = () => {
    // Always switch the section first. Do not wait for the API request.
    setPasswordStep("otp");
    setPasswordLoading(true);

    api.post("/auth/change-password/request-otp")
      .then((response) => {
        toast.success(
          response.data?.message || "OTP sent to your registered email"
        );
      })
      .catch((err) => {
        console.error("Change password OTP error:", err);
        setPasswordStep("closed");
        toast.error(
          formatApiError(err.response?.data?.detail) ||
            "Could not send password change OTP"
        );
      })
      .finally(() => {
        setPasswordLoading(false);
      });
  };

  const verifyPasswordOtp = async (otp) => {
    try {
      setPasswordLoading(true);
      const response = await api.post("/auth/change-password/verify-otp", {
        otp: String(otp).trim(),
      });

      if (!response.data?.change_token) {
        throw new Error("The server did not return a change token");
      }

      setChangeToken(response.data.change_token);
      setPasswordStep("password");
      toast.success(response.data?.message || "OTP verified");
    } catch (err) {
      console.error("Change password OTP verification error:", err);
      toast.error(
        formatApiError(err.response?.data?.detail) || "Invalid or expired OTP"
      );
    } finally {
      setPasswordLoading(false);
    }
  };

  const resendPasswordOtp = async () => {
    try {
      const response = await api.post("/auth/change-password/resend-otp");
      toast.success(response.data?.message || "A new OTP has been sent");
      return response.data;
    } catch (err) {
      console.error("Resend password OTP error:", err);
      toast.error(
        formatApiError(err.response?.data?.detail) || "Could not resend OTP"
      );
      throw err;
    }
  };

  const submitNewPassword = async (event) => {
    event.preventDefault();

    if (!changeToken) {
      toast.error("Password change session expired. Please try again.");
      setPasswordStep("closed");
      return;
    }

    if (!newPassword || !confirmPassword) {
      toast.error("Please enter both password fields");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    try {
      setPasswordLoading(true);
      const response = await api.post("/auth/change-password", {
        change_token: changeToken,
        new_password: newPassword,
      });

      toast.success(response.data?.message || "Password changed successfully");

      setChangeToken("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordStep("closed");

      // Password has changed, so invalidate the current session immediately.
      logout();
      navigate("/login", { replace: true });
    } catch (err) {
      console.error("Change password error:", err);
      toast.error(
        formatApiError(err.response?.data?.detail) ||
          "Could not change password"
      );
    } finally {
      setPasswordLoading(false);
    }
  };

  const cancelChangePassword = () => {
    setPasswordStep("closed");
    setChangeToken("");
    setNewPassword("");
    setConfirmPassword("");
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Loading profile…
      </div>
    );
  }

  if (!data?.user) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        User not found.
      </div>
    );
  }

  const {
    user,
    posts = [],
    post_count = 0,
    follower_count = 0,
    following_count = 0,
    is_following = false,
    is_self = false,
    level,
    badges = [],
  } = data;

  return (
    <div
      className="mx-auto max-w-4xl px-4 py-6"
      data-testid="profile-page"
    >
      <header className="flex flex-col gap-6 border-b border-border pb-8 md:flex-row md:items-center">
        <img
          src={
            user.avatar_url ||
            `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(
              user.name || user.username
            )}`
          }
          alt=""
          className="h-24 w-24 rounded-full border border-border object-cover md:h-32 md:w-32"
        />

        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-bold">
              {user.username}
            </h1>

            {is_self ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing((value) => !value)}
                className="rounded-full"
                data-testid="edit-profile-btn"
              >
                <Settings size={14} className="mr-1" />
                Edit profile
              </Button>
            ) : (
              <Button
                onClick={follow}
                size="sm"
                variant={is_following ? "outline" : "default"}
                className="rounded-full"
                data-testid="follow-btn"
              >
                {is_following ? "Following" : "Follow"}
              </Button>
            )}

            {(user.role === "creator" || user.role === "admin") && (
              <Link
                to={`/c/${user.username}`}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-accent"
                data-testid="view-storefront-link"
              >
                View storefront →
              </Link>
            )}
          </div>

          <div className="mt-4 flex items-center gap-6 text-sm">
            <div>
              <span className="font-bold">{post_count}</span>{" "}
              <span className="text-muted-foreground">posts</span>
            </div>
            <div data-testid="follower-count">
              <span className="font-bold">{follower_count}</span>{" "}
              <span className="text-muted-foreground">followers</span>
            </div>
            <div>
              <span className="font-bold">{following_count}</span>{" "}
              <span className="text-muted-foreground">following</span>
            </div>
          </div>

          <div className="mt-3 text-sm font-semibold">{user.name}</div>

          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            {user.bio || "No bio yet."}
          </p>

          {level && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs">
              <span className="font-bold">
                L{level.level} · {level.name}
              </span>
              <span className="text-muted-foreground">{level.xp} XP</span>
              {user.streak > 0 && (
                <span className="ml-1 rounded-full bg-orange-500/10 px-2 py-0.5 font-semibold text-orange-500">
                  🔥 {user.streak}d streak
                </span>
              )}
            </div>
          )}

          {badges?.length > 0 && (
            <div
              className="mt-3 flex flex-wrap gap-2"
              data-testid="profile-badges"
            >
              {badges.map((badge) => (
                <span
                  key={badge.key}
                  title={badge.desc}
                  className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium"
                >
                  <span>{badge.icon}</span>
                  {badge.title}
                </span>
              ))}
            </div>
          )}
        </div>
      </header>

      {editing && (
        <form
          onSubmit={saveProfile}
          className="mt-6 space-y-3 rounded-2xl border border-border p-4"
          data-testid="edit-profile-form"
        >
          <div>
            <label className="text-sm font-medium">Name</label>
            <input
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </div>

          <div>
            <label className="text-sm font-medium">Bio</label>
            <textarea
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              rows={3}
              value={form.bio}
              onChange={(event) =>
                setForm({ ...form, bio: event.target.value })
              }
            />
          </div>

          <div>
            <label className="text-sm font-medium">Avatar URL</label>
            <input
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              value={form.avatar_url}
              onChange={(event) =>
                setForm({ ...form, avatar_url: event.target.value })
              }
              placeholder="https://…"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditing(false)}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="rounded-full"
              data-testid="save-profile-btn"
            >
              Save
            </Button>
          </div>
        </form>
      )}

      <div className="mt-6">
        <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <Grid3x3 size={14} />
          Posts
        </div>

        {posts.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            No posts yet.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1 md:gap-3">
            {posts.map((post) => (
              <Link
                key={post.id}
                to={`/p/${post.id}`}
                className="aspect-square overflow-hidden rounded-none md:rounded-xl"
              >
                <img
                  src={post.media}
                  alt=""
                  className="h-full w-full object-cover transition-transform hover:scale-105"
                  loading="lazy"
                />
              </Link>
            ))}
          </div>
        )}
      </div>

      {is_self && (
        <section className="mt-8 border-t border-border pt-8">
          <div className="mb-5">
            <h2 className="text-base font-semibold">
              {user.role === "student"
                ? "Course Activity"
                : "Course Statistics"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {user.role === "student"
                ? "Your active courses and lifetime enrollment."
                : "Your course activity and learning statistics."}
            </p>
          </div>

          {user.role === "student" ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border p-5">
                  <div className="mb-3 flex items-center gap-2 text-muted-foreground">
                    <PlayCircle size={17} />
                    <span className="text-xs font-semibold uppercase tracking-wide">
                      Active Courses
                    </span>
                  </div>
                  <p className="text-3xl font-bold">{courseStats.active}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Courses currently in progress
                  </p>
                </div>

                <div className="rounded-2xl border border-border p-5">
                  <div className="mb-3 flex items-center gap-2 text-muted-foreground">
                    <BookOpen size={17} />
                    <span className="text-xs font-semibold uppercase tracking-wide">
                      Lifetime Enrolled
                    </span>
                  </div>
                  <p className="text-3xl font-bold">{courseStats.enrolled}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Total courses enrolled
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-border">
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                  <div>
                    <h3 className="font-semibold">Enrolled Course Details</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Your current and completed courses.
                    </p>
                  </div>
                  <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">
                    {courseStats.enrolled} total
                  </span>
                </div>

                {enrolledCourses.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    You haven't enrolled in any course yet.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {enrolledCourses.map((entry, index) => {
                      const course = getEnrollmentCourse(entry);
                      const courseId = getEnrollmentCourseId(entry);
                      const progress = getEnrollmentProgress(entry);
                      const completed = isEnrollmentCompleted(entry);

                      const content = (
                        <div className="flex items-center gap-4 px-5 py-4">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                            {completed ? (
                              <CheckCircle2 size={18} />
                            ) : (
                              <BookOpen size={18} />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold">
                              {course.title || "Untitled course"}
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              {course.category && <span>{course.category}</span>}
                              {progress !== null && (
                                <span>{progress}% complete</span>
                              )}
                            </div>

                            {progress !== null && (
                              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                                <div
                                  className="h-full rounded-full bg-primary"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            )}
                          </div>

                          <span
                            className={
                              completed
                                ? "shrink-0 rounded-full bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-600"
                                : "shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
                            }
                          >
                            {completed ? "Completed" : "Active"}
                          </span>
                        </div>
                      );

                      return courseId ? (
                        <Link
                          key={courseId || entry.id || index}
                          to={`/courses/${courseId}`}
                          className="block transition-colors hover:bg-accent/40"
                        >
                          {content}
                        </Link>
                      ) : (
                        <div key={entry.id || index}>{content}</div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border p-5">
                <p className="text-2xl font-bold">{courseStats.published}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Courses Published
                </p>
              </div>

              <div className="rounded-2xl border border-border p-5">
                <p className="text-2xl font-bold">{courseStats.students}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Total Students
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Total student enrollments across your courses
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      {is_self && (
        <section className="mt-8 border-t border-border pt-8">
          <div className="mb-4 flex items-center gap-2">
            <LockKeyhole size={18} />
            <div>
              <h2 className="text-base font-semibold">Change Password</h2>
              <p className="text-sm text-muted-foreground">
                Secure your account by changing your password.
              </p>
            </div>
          </div>

          {passwordStep === "closed" && (
            <div className="rounded-2xl border border-border p-4">
              <p className="text-sm text-muted-foreground">
                We'll send a verification code to the email address registered
                to your account.
              </p>

              {currentUser?.email && (
                <p className="mt-2 text-sm font-medium">
                  {currentUser.email}
                </p>
              )}

              <Button
                type="button"
                onClick={startChangePassword}
                disabled={passwordLoading}
                className="mt-4 rounded-full"
                data-testid="change-password-btn"
              >
                {passwordLoading ? "Sending OTP..." : "Change Password"}
              </Button>
            </div>
          )}

          {passwordStep === "otp" && (
            <div className="rounded-2xl border border-border p-4">
              <PasswordOtpStep
                email={currentUser?.email || ""}
                onVerify={verifyPasswordOtp}
                onResend={resendPasswordOtp}
                onBack={cancelChangePassword}
                loading={passwordLoading}
              />
            </div>
          )}

          {passwordStep === "password" && (
            <form
              onSubmit={submitNewPassword}
              className="space-y-4 rounded-2xl border border-border p-4"
            >
              <div>
                <h3 className="text-sm font-semibold">
                  Create a new password
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Your password must be at least 6 characters.
                </p>
              </div>

              <div>
                <label htmlFor="new-password" className="text-sm font-medium">
                  New password
                </label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="Enter new password"
                  minLength={6}
                  disabled={passwordLoading}
                />
              </div>

              <div>
                <label
                  htmlFor="confirm-password"
                  className="text-sm font-medium"
                >
                  Confirm new password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Confirm new password"
                  minLength={6}
                  disabled={passwordLoading}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={cancelChangePassword}
                  disabled={passwordLoading}
                  className="rounded-full"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={passwordLoading}
                  className="rounded-full"
                  data-testid="save-new-password-btn"
                >
                  {passwordLoading ? "Changing..." : "Change Password"}
                </Button>
              </div>
            </form>
          )}
        </section>
      )}
    </div>
  );
}

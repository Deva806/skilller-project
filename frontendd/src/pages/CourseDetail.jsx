import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  PlayCircle,
  Lock,
  CheckCircle,
  FileText,
  Star,
  ArrowLeft,
  Loader2,
  ExternalLink,
  ShieldCheck,
  Edit,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { useCourseStore } from "../store/courseStore";
import { useAuthStore } from "../store/authStore";

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Accept only HTTPS URLs from known YouTube hosts and build a fresh,
 * canonical embed URL. Never pass an untrusted URL directly to an iframe.
 */
function getYouTubeEmbedUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    return null;
  }

  if (
    parsed.protocol !== "https:" ||
    !YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase()) ||
    parsed.username ||
    parsed.password
  ) {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const pathParts = parsed.pathname.split("/").filter(Boolean);
  let videoId = null;

  if (host === "youtu.be" || host === "www.youtu.be") {
    videoId = pathParts[0] || null;
  } else if (pathParts[0] === "watch") {
    videoId = parsed.searchParams.get("v");
  } else if (
    ["embed", "shorts", "live"].includes(pathParts[0]) &&
    pathParts.length >= 2
  ) {
    videoId = pathParts[1];
  }

  if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) return null;

  return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
}

/**
 * Only expose valid HTTP(S) resource links to the browser. Reject javascript:,
 * data:, file:, protocol-relative URLs, and URLs with embedded credentials.
 */
function getSafeResourceUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const parsed = new URL(value.trim());
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }

    return parsed.href;
  } catch {
    return null;
  }
}

function getErrorMessage(error) {
  const detail =
    error?.response?.data?.detail ||
    error?.message ||
    "";

  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg || String(item))
      .join(", ");
  }

  return "Course action failed.";
}

export default function CourseDetail() {
  const { courseId } = useParams();
  const navigate = useNavigate();

  const user = useAuthStore((state) => state.user);

  const activeCourse = useCourseStore(
    (state) => state.activeCourse
  );

  const enrolledCourses = useCourseStore(
    (state) => state.enrolledCourses
  );

  const fetchEnrolledCourses = useCourseStore(
    (state) => state.fetchEnrolledCourses
  );

  const fetchCourseById = useCourseStore(
    (state) => state.fetchCourseById
  );

  const enrollInFreeCourse = useCourseStore(
    (state) => state.enrollInFreeCourse
  );

  const purchasePaidCourse = useCourseStore(
    (state) => state.purchasePaidCourse
  );

  const loading = useCourseStore(
    (state) => state.loading
  );

  const enrolling = useCourseStore(
    (state) => state.enrolling
  );

  const purchasing = useCourseStore(
    (state) => state.purchasing
  );

  const courseLoadError = useCourseStore(
    (state) => state.courseLoadError
  );

  const courseActionError = useCourseStore(
    (state) => state.courseActionError
  );

  const clearCourseActionError = useCourseStore(
    (state) => state.clearCourseActionError
  );

  const [selectedLessonIndex, setSelectedLessonIndex] =
    useState(0);

  const price = Number(activeCourse?.price || 0);

  useEffect(() => {
    if (user?.role === "student") {
      fetchEnrolledCourses().catch(() => {});
    }
  }, [user?.role, fetchEnrolledCourses]);

  useEffect(() => {
    if (courseId) {
      fetchCourseById(courseId).catch(() => {});
    }
  }, [courseId, fetchCourseById]);

  useEffect(() => {
    setSelectedLessonIndex(0);
    clearCourseActionError();
  }, [clearCourseActionError, courseId]);

  const lessons = useMemo(
    () => activeCourse?.lesson_items ?? [],
    [activeCourse]
  );

  useEffect(() => {
    if (
      selectedLessonIndex >= lessons.length &&
      lessons.length > 0
    ) {
      setSelectedLessonIndex(0);
    }
  }, [lessons.length, selectedLessonIndex]);

  const isCurrentCourse =
    activeCourse?.id === courseId;

  const isInitialLoading =
    loading &&
    (!isCurrentCourse || !activeCourse);

  const isOwner = Boolean(
    user &&
      activeCourse &&
      (activeCourse.owner_id === user.id ||
        user.role === "admin")
  );

  const isEnrolled = useMemo(() => {
    if (!activeCourse?.id) return false;

    if (
      activeCourse.is_enrolled ||
      activeCourse.enrolled
    ) {
      return true;
    }

    return enrolledCourses.some((entry) => {
      const entryId =
        entry.course_id ||
        entry.course?.id ||
        entry.id;

      return entryId === activeCourse.id;
    });
  }, [activeCourse, enrolledCourses]);

  const isAccessAllowed = isOwner || isEnrolled;

  const currentLesson =
    lessons[selectedLessonIndex] || lessons[0];

  const embedUrl = useMemo(
    () =>
      getYouTubeEmbedUrl(
        currentLesson?.youtube_url
      ),
    [currentLesson?.youtube_url]
  );

  const handleEnrollOrPurchase = async () => {
    if (!user) {
      toast.info(
        "Please log in to enroll in this course."
      );

      navigate("/login", {
        state: {
          redirectTo: `/courses/${courseId}`,
        },
      });

      return;
    }

    try {
      const isFreeCourse = price === 0;

      if (isFreeCourse) {
        await enrollInFreeCourse(courseId);

        toast.success("Successfully enrolled.");
        return;
      }

      const result = await purchasePaidCourse(
        activeCourse,
        {
          name: user.name || user.username,
          email: user.email,
        }
      );

      switch (result?.status) {
        case "already_enrolled":
          toast.info(
            "You already have access to this course."
          );
          return;

        case "success":
          toast.success(
            "Payment verified. Course unlocked."
          );
          return;

        default:
          toast.success(
            "Course purchased successfully."
          );
      }
    } catch (error) {
      const message = getErrorMessage(error);
      const lowerMessage = message.toLowerCase();

      if (lowerMessage.includes("cancel")) {
        toast.info("Payment cancelled.");
        return;
      }

      if (lowerMessage.includes("payment failed")) {
        toast.error(
          "Payment failed. Please try again."
        );
        return;
      }

      if (
        lowerMessage.includes("already enrolled") ||
        lowerMessage.includes("already purchased")
      ) {
        toast.info(
          "You already have access to this course."
        );
        return;
      }

      toast.error(message);
    }
  };

  if (isInitialLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium">
          Loading course details...
        </p>
      </div>
    );
  }

  if (
    (!loading && !isCurrentCourse) ||
    courseLoadError ||
    !activeCourse
  ) {
    return (
      <div
        className="mx-auto max-w-3xl px-4 py-16 text-center"
        data-testid="course-error"
      >
        <h2 className="text-2xl font-bold">
          Course Not Found
        </h2>

        <p className="mt-2 text-sm text-muted-foreground">
          {courseLoadError ||
            "The requested course could not be located."}
        </p>

        <Button
          className="mt-6 rounded-full"
          onClick={() => navigate("/courses")}
        >
          <ArrowLeft size={16} className="mr-2" />
          Back to Courses
        </Button>
      </div>
    );
  }

  return (
    <div
      className="mx-auto max-w-7xl px-4 py-6"
      data-testid="course-detail-page"
    >
      <button
        type="button"
        onClick={() => navigate("/courses")}
        className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} />
        Back to Courses
      </button>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {courseActionError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-950 dark:bg-rose-950/40 dark:text-rose-200">
              {courseActionError}
            </div>
          ) : null}

          <div className="group relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-slate-950 shadow-2xl">
            {isAccessAllowed ? (
              embedUrl ? (
                <iframe
                  key={
                    currentLesson?.id ||
                    selectedLessonIndex
                  }
                  src={embedUrl}
                  title={
                    currentLesson?.title ||
                    activeCourse.title
                  }
                  className="h-full w-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center p-6 text-center text-slate-300">
                  <PlayCircle className="mb-2 h-12 w-12 text-primary opacity-80" />

                  <p className="font-semibold text-white">
                    {currentLesson?.title ||
                      "Lesson Video"}
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    No valid YouTube video URL provided
                    for this lesson.
                  </p>
                </div>
              )
            ) : (
              <div className="relative flex h-full w-full flex-col items-center justify-center p-6 text-center">
                {activeCourse.thumbnail ? (
                  <img
                    src={activeCourse.thumbnail}
                    alt={activeCourse.title}
                    className="absolute inset-0 h-full w-full object-cover opacity-25 blur-sm"
                  />
                ) : null}

                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />

                <div className="relative z-10 flex max-w-md flex-col items-center">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20 text-primary backdrop-blur-md">
                    <Lock size={28} />
                  </div>

                  <h3 className="font-display text-xl font-bold text-foreground">
                    Enroll to Access Course Content
                  </h3>

                  <p className="mt-1 text-xs text-muted-foreground">
                    Gain full access to all{" "}
                    {lessons.length} lessons,
                    downloadable resources, and updates.
                  </p>

                  <Button
                    onClick={handleEnrollOrPurchase}
                    disabled={
                      enrolling || purchasing
                    }
                    className="mt-5 h-11 rounded-full px-8 font-semibold shadow-lg"
                  >
                    {enrolling || purchasing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : price === 0 ? (
                      "Enroll for Free Now"
                    ) : (
                      `Unlock Course for ₹${price.toLocaleString(
                        "en-IN"
                      )}`
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {currentLesson && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  Lesson {selectedLessonIndex + 1} of{" "}
                  {lessons.length}
                </span>

                {isOwner && (
                  <Link
                    to={`/dashboard/courses/${courseId}/edit`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                  >
                    <Edit size={14} />
                    Edit Course Studio
                  </Link>
                )}
              </div>

              <h2 className="mt-2 font-display text-xl font-bold text-foreground">
                {currentLesson.title}
              </h2>

              {currentLesson.description && (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {currentLesson.description}
                </p>
              )}

              {Array.isArray(currentLesson.notes_links) &&
                currentLesson.notes_links.some((link) => getSafeResourceUrl(link)) && (
                  <div className="mt-4 border-t border-border pt-4">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <FileText size={14} />
                      Downloadable Notes & Resources
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {currentLesson.notes_links.map((resourceLink, index) => {
                        const safeUrl = getSafeResourceUrl(resourceLink);
                        if (!safeUrl) return null;

                        return (
                          <a
                            key={`${safeUrl}-${index}`}
                            href={safeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            referrerPolicy="no-referrer"
                            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-secondary/50 px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary"
                          >
                            <span>Resource #{index + 1}</span>
                            <ExternalLink size={12} />
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
            </div>
          )}

          <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
            <h3 className="font-display text-lg font-bold">
              About this course
            </h3>

            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {activeCourse.description ||
                "No description provided."}
            </p>

            <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
              <div>
                <div className="text-xs text-muted-foreground">
                  Category
                </div>
                <div className="mt-1 text-sm font-semibold">
                  {activeCourse.category || "General"}
                </div>
              </div>

              <div>
                <div className="text-xs text-muted-foreground">
                  Instructor
                </div>
                <div className="mt-1 text-sm font-semibold">
                  {activeCourse.instructor ||
                    activeCourse.creator_name ||
                    activeCourse.creator?.name ||
                    activeCourse.creator?.username ||
                    "Creator"}
                </div>
              </div>

              <div>
                <div className="text-xs text-muted-foreground">
                  Total Lessons
                </div>
                <div className="mt-1 text-sm font-semibold">
                  {lessons.length} lessons
                </div>
              </div>

              <div>
                <div className="text-xs text-muted-foreground">
                  Rating
                </div>
                <div className="mt-1 flex items-center gap-1 text-sm font-semibold">
                  <Star
                    size={14}
                    className="fill-amber-400 text-amber-400"
                  />
                  {activeCourse.rating || 5.0}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Pricing
              </span>

              <span className="font-display text-2xl font-black text-foreground">
                {price === 0
                  ? "FREE"
                  : `₹${price.toLocaleString(
                      "en-IN"
                    )}`}
              </span>
            </div>

            <div className="mt-4 space-y-2">
              {isAccessAllowed ? (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle size={16} />

                  {isOwner
                    ? "You are the owner of this course"
                    : "You are enrolled in this course"}
                </div>
              ) : (
                <Button
                  onClick={handleEnrollOrPurchase}
                  disabled={enrolling || purchasing}
                  className="h-12 w-full rounded-full text-base font-bold shadow-md"
                  data-testid="enroll-detail-btn"
                >
                  {enrolling || purchasing ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : price === 0 ? (
                    "Enroll for Free"
                  ) : (
                    `Buy Now · ₹${price.toLocaleString(
                      "en-IN"
                    )}`
                  )}
                </Button>
              )}
            </div>

            <ul className="mt-6 space-y-2.5 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <PlayCircle
                  size={14}
                  className="text-primary"
                />
                Full lifetime access to all lessons
              </li>

              <li className="flex items-center gap-2">
                <FileText
                  size={14}
                  className="text-primary"
                />
                Downloadable notes and links
              </li>

              <li className="flex items-center gap-2">
                <ShieldCheck
                  size={14}
                  className="text-primary"
                />
                Verified certificate on completion
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-base font-bold">
                Course Content
              </h3>

              <span className="text-xs text-muted-foreground">
                {lessons.length} lessons
              </span>
            </div>

            {lessons.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No lessons added to this course yet.
              </p>
            ) : (
              <div className="max-h-[500px] space-y-2 overflow-y-auto pr-1">
                {lessons.map((lesson, index) => {
                  const isSelected =
                    selectedLessonIndex === index;

                  return (
                    <button
                      type="button"
                      key={lesson.id || index}
                      onClick={() => {
                        if (isAccessAllowed) {
                          setSelectedLessonIndex(index);
                          return;
                        }

                        toast.info(
                          "Please enroll to watch this lesson."
                        );
                      }}
                      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                        isSelected
                          ? "border-primary/30 bg-primary/10 font-semibold text-primary"
                          : "border-transparent text-foreground hover:bg-accent"
                      }`}
                    >
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs">
                        {isAccessAllowed ? (
                          isSelected ? (
                            <PlayCircle
                              size={14}
                              className="text-primary"
                            />
                          ) : (
                            index + 1
                          )
                        ) : (
                          <Lock
                            size={12}
                            className="text-muted-foreground"
                          />
                        )}
                      </div>

                      <div className="flex-1 overflow-hidden">
                        <div className="line-clamp-1 text-xs font-semibold">
                          {lesson.title ||
                            `Lesson ${index + 1}`}
                        </div>

                        {lesson.description && (
                          <div className="line-clamp-1 text-[11px] text-muted-foreground">
                            {lesson.description}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { fileSrc } from "../lib/upload";
import {
  BookOpen,
  Briefcase,
  Trophy,
  Flame,
} from "lucide-react";
import { useCourseStore } from "../store/courseStore";

function getEnrollmentCourseId(entry) {
  if (!entry || typeof entry !== "object") return null;

  if (
    typeof entry.course_id === "string" &&
    entry.course_id
  ) {
    return entry.course_id;
  }

  if (
    typeof entry.course?.id === "string" &&
    entry.course.id
  ) {
    return entry.course.id;
  }

  if (
    typeof entry.id === "string" &&
    entry.title
  ) {
    return entry.id;
  }

  return null;
}

function getEnrollmentCourse(entry) {
  if (!entry || typeof entry !== "object") return {};

  return entry.course &&
    typeof entry.course === "object"
    ? entry.course
    : entry;
}

function getLessonCount(course) {
  if (Array.isArray(course.lesson_items)) {
    return course.lesson_items.length;
  }

  if (Array.isArray(course.lessons)) {
    return course.lessons.length;
  }

  return Number(course.lessons || 0);
}

export default function Learning() {
  const enrolledCourses = useCourseStore(
    (state) => state.enrolledCourses
  );

  const fetchEnrolledCourses = useCourseStore(
    (state) => state.fetchEnrolledCourses
  );

  const [data, setData] = useState({
    applications: [],
    xp: null,
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [
          ,
          applicationsResponse,
          xpResponse,
        ] = await Promise.all([
          fetchEnrolledCourses().catch(() => []),
          api
            .get("/users/me/applications")
            .catch(() => ({ data: [] })),
          api.get("/users/me/xp"),
        ]);

        if (cancelled) return;

        setData({
          applications:
            applicationsResponse?.data || [],
          xp: xpResponse?.data || null,
        });
      } catch {
        if (!cancelled) {
          setData({
            applications: [],
            xp: null,
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [fetchEnrolledCourses]);

  if (loading) {
    return (
      <div
        className="py-20 text-center text-muted-foreground"
        data-testid="learning-loading"
      >
        Loading...
      </div>
    );
  }

  const xp = data.xp;

  return (
    <div
      className="mx-auto max-w-5xl px-4 py-6"
      data-testid="learning-page"
    >
      <h1 className="font-display text-3xl font-bold tracking-tight">
        My Learning
      </h1>

      <p className="mt-1 text-sm text-muted-foreground">
        Your courses, gigs and progress, all in one place.
      </p>

      {xp && (
        <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="Level"
            value={`L${xp.level?.level || 0} · ${
              xp.level?.name || "Beginner"
            }`}
            icon={Trophy}
          />

          <Stat
            label="Total XP"
            value={xp.xp ?? 0}
            icon={Trophy}
          />

          <Stat
            label="Streak"
            value={`${xp.streak ?? 0}d`}
            icon={Flame}
          />

          <Stat
            label="Badges"
            value={xp.earned_badges?.length || 0}
            icon={Trophy}
          />
        </section>
      )}

      <section className="mt-8">
        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <BookOpen size={14} />
          Enrolled courses
        </div>

        {enrolledCourses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            You haven't enrolled in a course yet.{" "}
            <Link
              to="/courses"
              className="font-semibold text-primary hover:underline"
            >
              Browse courses
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {enrolledCourses.map((entry, index) => {
              const course =
                getEnrollmentCourse(entry);

              const courseId =
                getEnrollmentCourseId(entry);

              const lessonCount =
                getLessonCount(course);

              const thumbnail = course.thumbnail
                ? fileSrc(course.thumbnail)
                : null;

              if (!courseId) {
                return (
                  <div
                    key={
                      entry.id ||
                      course.title ||
                      index
                    }
                    className="overflow-hidden rounded-2xl border border-border opacity-70"
                  >
                    {thumbnail ? (
                      <img
                        src={thumbnail}
                        alt=""
                        className="aspect-video w-full object-cover"
                      />
                    ) : (
                      <div className="grid aspect-video w-full place-items-center bg-muted text-muted-foreground">
                        <BookOpen size={28} />
                      </div>
                    )}

                    <div className="p-3">
                      <div className="text-xs text-muted-foreground">
                        {course.category ||
                          "Course"}
                      </div>

                      <div className="font-display text-base font-bold">
                        {course.title ||
                          "Untitled course"}
                      </div>

                      <div className="mt-1 text-xs text-muted-foreground">
                        Course link unavailable
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <Link
                  key={courseId}
                  to={`/courses/${courseId}`}
                  className="group overflow-hidden rounded-2xl border border-border transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
                >
                  {thumbnail ? (
                    <img
                      src={thumbnail}
                      alt={
                        course.title ||
                        "Course thumbnail"
                      }
                      className="aspect-video w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="grid aspect-video w-full place-items-center bg-muted text-muted-foreground">
                      <BookOpen size={28} />
                    </div>
                  )}

                  <div className="p-3">
                    <div className="text-xs text-muted-foreground">
                      {course.category ||
                        "Course"}
                    </div>

                    <div className="font-display text-base font-bold group-hover:text-primary">
                      {course.title ||
                        "Untitled course"}
                    </div>

                    <div className="mt-1 text-xs text-muted-foreground">
                      {lessonCount} lessons
                      {course.instructor
                        ? ` · by ${course.instructor}`
                        : ""}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <Briefcase size={14} />
          Gig applications
        </div>

        {data.applications.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            You haven't applied to any gig yet.{" "}
            <Link
              to="/gigs"
              className="font-semibold text-primary hover:underline"
            >
              Browse gigs
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {data.applications.map((application) => (
              <div
                key={application.id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-border p-4"
              >
                <div>
                  <div className="font-display text-base font-bold">
                    {application.gig?.title ||
                      "Gig"}
                  </div>

                  <div className="mt-1 text-xs text-muted-foreground">
                    {application.gig?.category ||
                      "General"}{" "}
                    · ₹
                    {Number(
                      application.gig?.budget || 0
                    ).toLocaleString("en-IN")}
                  </div>
                </div>

                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                    application.status === "hired"
                      ? "bg-primary/10 text-primary"
                      : application.status ===
                        "shortlisted"
                        ? "bg-amber-500/10 text-amber-600"
                        : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {application.status ||
                    "pending"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {xp?.earned_badges?.length > 0 && (
        <section className="mt-10">
          <div className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Your badges
          </div>

          <div className="flex flex-wrap gap-2">
            {xp.earned_badges.map((badge) => (
              <span
                key={badge.key}
                title={badge.desc}
                className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm"
              >
                <span>{badge.icon}</span>
                {badge.title}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          {label}
        </div>

        {Icon && (
          <Icon
            size={14}
            className="text-muted-foreground"
          />
        )}
      </div>

      <div className="mt-1 font-display text-xl font-bold">
        {value}
      </div>
    </div>
  );
}
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  CheckCircle,
  PlayCircle,
  Star,
  Users,
} from "lucide-react";
import { Button } from "../components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import { useCourseStore } from "../store/courseStore";
import { useAuthStore } from "../store/authStore";

function getCourseId(entry) {
  if (!entry || typeof entry !== "object") return null;

  if (typeof entry.course_id === "string" && entry.course_id) {
    return entry.course_id;
  }

  if (
    typeof entry.course?.id === "string" &&
    entry.course.id
  ) {
    return entry.course.id;
  }

  if (typeof entry.id === "string" && entry.id) {
    return entry.id;
  }

  return null;
}

function getCourse(entry) {
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

function getPriceLabel(course) {
  const price = Number(course.price || 0);

  return price === 0
    ? "FREE"
    : `₹${price.toLocaleString("en-IN")}`;
}

function CourseCard({
  entry,
  ctaLabel,
  testIdPrefix,
}) {
  const course = getCourse(entry);
  const courseId = getCourseId(entry);
  const lessonCount = getLessonCount(course);

  if (!courseId) {
    return (
      <article className="overflow-hidden rounded-2xl border border-border bg-card opacity-70">
        <div className="aspect-video bg-muted" />

        <div className="p-5">
          <h3 className="font-display text-lg font-bold">
            {course.title || "Course"}
          </h3>

          <p className="mt-1 text-sm text-muted-foreground">
            Course link unavailable
          </p>
        </div>
      </article>
    );
  }

  return (
    <article
      className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
      data-testid={`${testIdPrefix}-${courseId}`}
    >
      <Link
        to={`/courses/${courseId}`}
        className="block"
      >
        <div className="relative aspect-video overflow-hidden bg-muted">
          {course.thumbnail ? (
            <img
              src={course.thumbnail}
              alt={course.title || "Course thumbnail"}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <div className="grid h-full place-items-center text-muted-foreground">
              <BookOpen size={28} />
            </div>
          )}

          {course.category ? (
            <span className="absolute left-3 top-3 rounded-full bg-background/90 px-2.5 py-0.5 text-xs font-semibold backdrop-blur-md">
              {course.category}
            </span>
          ) : null}
        </div>

        <div className="p-5">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <PlayCircle size={14} />
              {lessonCount} lessons
            </span>

            <span className="flex items-center gap-1">
              <Users size={14} />
              {course.students ||
                course.enrollments ||
                0}
            </span>

            <span className="flex items-center gap-1">
              <Star
                size={14}
                className="fill-amber-400 text-amber-400"
              />
              {course.rating || 5.0}
            </span>
          </div>

          <h3 className="mt-2 font-display text-lg font-bold leading-tight transition-colors group-hover:text-primary">
            {course.title || "Untitled course"}
          </h3>

          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {course.description ||
              "No description provided."}
          </p>
        </div>
      </Link>

      <div className="flex items-center justify-between gap-3 border-t border-border p-5 pt-3">
        <div>
          <div className="text-xs text-muted-foreground">
            by{" "}
            {course.instructor ||
              course.creator_name ||
              course.creator?.name ||
              course.creator?.username ||
              "Creator"}
          </div>

          <div className="font-display text-lg font-bold">
            {getPriceLabel(course)}
          </div>
        </div>

        <Button
          asChild
          className="shrink-0 rounded-full"
          data-testid={`enroll-${courseId}`}
        >
          <Link to={`/courses/${courseId}`}>
            {ctaLabel}
          </Link>
        </Button>
      </div>
    </article>
  );
}

function CourseGrid({
  courses,
  ctaLabel,
  empty,
  testIdPrefix,
}) {
  if (!courses || courses.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {empty}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {courses.map((entry, index) => (
        <CourseCard
          key={
            getCourseId(entry) ||
            getCourse(entry).title ||
            index
          }
          entry={entry}
          ctaLabel={ctaLabel}
          testIdPrefix={testIdPrefix}
        />
      ))}
    </div>
  );
}

export default function Courses() {
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore(
    (state) => state.loading
  );

  const courses = useCourseStore(
    (state) => state.courses
  );

  const enrolledCourses = useCourseStore(
    (state) => state.enrolledCourses
  );

  const categories = useCourseStore(
    (state) => state.categories
  );

  const selectedCategory = useCourseStore(
    (state) => state.selectedCategory
  );

  const loading = useCourseStore(
    (state) => state.loading
  );

  const courseLoadError = useCourseStore(
    (state) => state.courseLoadError
  );

  const fetchCourses = useCourseStore(
    (state) => state.fetchCourses
  );

  const fetchEnrolledCourses = useCourseStore(
    (state) => state.fetchEnrolledCourses
  );

  const setCategory = useCourseStore(
    (state) => state.setCategory
  );

  const isStudent = user?.role === "student";

  const [activeTab, setActiveTab] =
    useState("available");

  const [pageLoading, setPageLoading] =
    useState(false);

  const autoSelected = useRef(false);

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;

    setPageLoading(true);

    const requests = [
      fetchCourses().catch(() => []),
    ];

    if (isStudent) {
      requests.push(
        fetchEnrolledCourses().catch(() => [])
      );
    }

    Promise.all(requests)
      .then(([, nextEnrolled = []]) => {
        if (
          cancelled ||
          autoSelected.current ||
          !isStudent
        ) {
          return;
        }

        setActiveTab(
          nextEnrolled.length > 0
            ? "enrolled"
            : "available"
        );

        autoSelected.current = true;
      })
      .finally(() => {
        if (!cancelled) {
          setPageLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    fetchCourses,
    fetchEnrolledCourses,
    isStudent,
    user?.id,
    user?.role,
  ]);

  useEffect(() => {
    autoSelected.current = false;
    setActiveTab("available");
  }, [user?.id, user?.role]);

  const enrolledIds = useMemo(() => {
    const ids = new Set();

    enrolledCourses.forEach((entry) => {
      const id =
        entry.course_id ||
        entry.course?.id ||
        entry.id;

      if (id) {
        ids.add(id);
      }
    });

    return ids;
  }, [enrolledCourses]);

  const filteredAvailable = useMemo(() => {
    let list = Array.isArray(courses)
      ? courses
      : [];

    if (isStudent && enrolledIds.size > 0) {
      list = list.filter(
        (course) => !enrolledIds.has(course.id)
      );
    }

    if (
      selectedCategory &&
      selectedCategory !== "All"
    ) {
      list = list.filter(
        (course) =>
          course.category === selectedCategory
      );
    }

    return list;
  }, [
    courses,
    isStudent,
    enrolledIds,
    selectedCategory,
  ]);

  const showLoading =
    authLoading || loading || pageLoading;

  return (
    <div
      className="mx-auto max-w-6xl px-4 py-6"
      data-testid="courses-page"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
            Courses
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            Creator-led programs. Learn from people who
            ship.
          </p>
        </div>
      </div>

      {courseLoadError ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-950 dark:bg-amber-950/40 dark:text-amber-200">
          {courseLoadError}
        </div>
      ) : null}

      {showLoading ? (
        <div className="py-20 text-center text-muted-foreground">
          Loading courses...
        </div>
      ) : isStudent ? (
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full"
        >
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <TabsList
              className="rounded-full bg-secondary p-1"
              data-testid="course-tabs"
            >
              <TabsTrigger
                value="enrolled"
                className="rounded-full"
                data-testid="course-tab-enrolled"
              >
                <CheckCircle
                  size={14}
                  className="mr-1.5"
                />
                Enrolled Courses
              </TabsTrigger>

              <TabsTrigger
                value="available"
                className="rounded-full"
                data-testid="course-tab-available"
              >
                <BookOpen
                  size={14}
                  className="mr-1.5"
                />
                Available Courses
              </TabsTrigger>
            </TabsList>

            {activeTab === "available" ? (
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <button
                    type="button"
                    key={category}
                    onClick={() =>
                      setCategory(category)
                    }
                    data-testid={`filter-${category}`}
                    className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                      selectedCategory === category
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-accent"
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <TabsContent
            value="enrolled"
            className="mt-0"
          >
            {enrolledCourses.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                <p>
                  You haven't enrolled in a course yet.
                </p>

                <Button
                  type="button"
                  variant="outline"
                  className="mt-4 rounded-full"
                  onClick={() =>
                    setActiveTab("available")
                  }
                >
                  Browse available courses
                </Button>
              </div>
            ) : (
              <CourseGrid
                courses={enrolledCourses}
                ctaLabel="Continue Learning"
                empty="You haven't enrolled in a course yet."
                testIdPrefix="enrolled-course"
              />
            )}
          </TabsContent>

          <TabsContent
            value="available"
            className="mt-0"
          >
            <CourseGrid
              courses={filteredAvailable}
              ctaLabel="View and Enroll"
              empty="No courses available right now."
              testIdPrefix="course"
            />
          </TabsContent>
        </Tabs>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                type="button"
                key={category}
                onClick={() => setCategory(category)}
                data-testid={`filter-${category}`}
                className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                  selectedCategory === category
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-accent"
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          <CourseGrid
            courses={filteredAvailable}
            ctaLabel="View and Enroll"
            empty="No courses available right now."
            testIdPrefix="course"
          />
        </>
      )}
    </div>
  );
}
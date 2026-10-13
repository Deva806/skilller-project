import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Edit3, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { formatApiError } from "../lib/api";
import { fileSrc } from "../lib/upload";
import { Button } from "../components/ui/button";
import { useCourseStore } from "../store/courseStore";
import DeleteConfirmModal from "../components/DeleteConfirmModal";

const money = (amount) =>
  `Rs ${Number(amount || 0).toLocaleString("en-IN")}`;

export function CourseManagerSection({ embedded = false }) {
  const courses = useCourseStore((state) => state.courses);
  const loading = useCourseStore((state) => state.loading);
  const fetchCourses = useCourseStore((state) => state.fetchCourses);
  const deleteCourse = useCourseStore((state) => state.deleteCourse);

  const [targetCourse, setTargetCourse] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchCourses().catch((error) => {
      toast.error(
        formatApiError(error?.response?.data?.detail) ||
          "Could not load your courses."
      );
    });
  }, [fetchCourses]);

  const requestDelete = (course) => {
    setTargetCourse(course);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!targetCourse || deleting) return;

    setDeleting(true);

    try {
      await deleteCourse(targetCourse.id);

      toast.success("Course deleted successfully.");
      setDeleteModalOpen(false);
      setTargetCourse(null);
    } catch (error) {
      toast.error(
        formatApiError(error?.response?.data?.detail) ||
          "Failed to delete course."
      );
    } finally {
      setDeleting(false);
    }
  };

  const enrollmentCount = (course) =>
    course?.enrollments ?? course?.students ?? 0;

  const lessonCount = (course) =>
    Array.isArray(course?.lesson_items)
      ? course.lesson_items.length
      : Number(course?.lessons || 0);

  const totalEnrollments = courses.reduce(
    (total, course) =>
      total + Number(enrollmentCount(course) || 0),
    0
  );

  const potentialSales = courses.reduce(
    (total, course) =>
      total +
      Number(course?.price || 0) *
        Number(enrollmentCount(course) || 0),
    0
  );

  return (
    <div
      data-testid={
        embedded
          ? "course-manager-section"
          : "course-manager-page"
      }
    >
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            {embedded ? "Course manager" : "Creator studio"}
          </p>

          {embedded ? (
            <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">
              My courses
            </h2>
          ) : (
            <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">
              My courses
            </h1>
          )}

          <p className="mt-1 text-sm text-muted-foreground">
            Create, update and organise the courses you teach.
          </p>
        </div>

        <Button
          asChild
          className="rounded-full"
          data-testid="create-course-btn"
        >
          <Link to="/dashboard/courses/new">
            <Plus size={16} className="mr-1.5" />
            Create course
          </Link>
        </Button>
      </div>

      <div className="mb-7 grid gap-3 sm:grid-cols-3">
        <Metric
          label="Published courses"
          value={courses.length}
          icon={BookOpen}
        />

        <Metric
          label="Total enrolments"
          value={totalEnrollments.toLocaleString("en-IN")}
          icon={Users}
        />

        <Metric
          label="Potential sales"
          value={money(potentialSales)}
        />
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">
          Loading your courses...
        </div>
      ) : courses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center">
          <BookOpen
            className="mx-auto text-primary"
            size={30}
          />

          <h2 className="mt-4 font-display text-xl font-bold">
            Teach your first course
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Add a course, its lessons and learning resources in
            one guided studio.
          </p>

          <Button asChild className="mt-5 rounded-full">
            <Link to="/dashboard/courses/new">
              Create course
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {courses.map((course) => (
            <article
              key={course.id}
              className="overflow-hidden rounded-2xl border border-border bg-card"
            >
              <div className="flex gap-4 p-4">
                <div className="h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-muted">
                  {course.thumbnail ? (
                    <img
                      src={fileSrc(course.thumbnail)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <BookOpen
                      className="m-7 text-muted-foreground"
                      size={24}
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-primary">
                        {course.category || "General"}
                      </p>

                      <h2 className="truncate font-display text-lg font-bold">
                        {course.title}
                      </h2>
                    </div>

                    <span className="shrink-0 text-sm font-bold">
                      {money(course.price)}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {lessonCount(course)} lessons
                    </span>

                    <span>
                      {enrollmentCount(course)} enrolled
                    </span>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                    >
                      <Link
                        to={`/dashboard/courses/${course.id}/edit`}
                      >
                        <Edit3 size={14} className="mr-1" />
                        Edit lessons
                      </Link>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400"
                      onClick={() => requestDelete(course)}
                      data-testid={`delete-course-${course.id}`}
                    >
                      <Trash2 size={14} className="mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <DeleteConfirmModal
        open={deleteModalOpen}
        onClose={() =>
          !deleting && setDeleteModalOpen(false)
        }
        onConfirm={confirmDelete}
        title="Delete Course"
        description="Are you sure you want to delete this course? All associated lessons and student access data will be permanently removed."
        itemName={targetCourse?.title}
        confirmText="Delete Course"
        loading={deleting}
      />
    </div>
  );
}

export default function CourseManager() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <CourseManagerSection />
    </div>
  );
}

function Metric({ label, value, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted-foreground">
        <span>{label}</span>

        {Icon && <Icon size={15} />}
      </div>

      <div className="mt-2 font-display text-2xl font-bold">
        {value}
      </div>
    </div>
  );
}
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { formatApiError } from "../lib/api";
import { blankCourse, createBlankLesson } from "../lib/courseStudio";
import CourseStudioEditor from "../components/course-studio/CourseStudioEditor";
import DeleteConfirmModal from "../components/DeleteConfirmModal";
import ConfirmModal from "../components/ConfirmModal";
import { useCourseStore } from "../store/courseStore";

export default function CourseStudio() {
  const { courseId } = useParams();
  const isEditing = Boolean(courseId);
  const navigate = useNavigate();

  const fetchCourseStudio = useCourseStore(
    (state) => state.fetchCourseStudio
  );
  const saveCourseStudio = useCourseStore(
    (state) => state.saveCourseStudio
  );
  const deleteCourse = useCourseStore((state) => state.deleteCourse);
  const studioLoading = useCourseStore((state) => state.studioLoading);
  const studioSaving = useCourseStore((state) => state.studioSaving);
  const clearStudioError = useCourseStore(
    (state) => state.clearStudioError
  );

  const [course, setCourse] = useState(blankCourse);
  const [lessons, setLessons] = useState([]);
  const [initial, setInitial] = useState("");
  const [originalLessonIds, setOriginalLessonIds] = useState([]);
  const [errors, setErrors] = useState({});
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [discardModalOpen, setDiscardModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const snapshot = useMemo(
    () =>
      JSON.stringify({
        course,
        lessons: lessons.map(({ id, ...lesson }) => lesson),
      }),
    [course, lessons]
  );

  const dirty = Boolean(initial && initial !== snapshot);

  useEffect(() => {
    let active = true;

    if (!isEditing) {
      const initialCourse = { ...blankCourse };
      const initialLessons = [];

      setCourse(initialCourse);
      setLessons(initialLessons);
      setOriginalLessonIds([]);
      setErrors({});
      setInitial(
        JSON.stringify({
          course: initialCourse,
          lessons: initialLessons,
        })
      );
      clearStudioError();

      return () => {
        active = false;
      };
    }

    clearStudioError();

    (async () => {
      try {
        const studioData = await fetchCourseStudio(courseId);

        if (!active) return;

        setCourse(studioData.course);
        setLessons(studioData.lessons);
        setOriginalLessonIds(studioData.originalLessonIds || []);
        setErrors({});

        setInitial(
          JSON.stringify({
            course: studioData.course,
            lessons: studioData.lessons.map(
              ({ id, ...lesson }) => lesson
            ),
          })
        );
      } catch (error) {
        if (!active) return;

        toast.error(
          formatApiError(error?.response?.data?.detail) ||
            "Could not load this course."
        );

        navigate("/dashboard/courses", { replace: true });
      }
    })();

    return () => {
      active = false;
    };
  }, [
    courseId,
    isEditing,
    fetchCourseStudio,
    clearStudioError,
    navigate,
  ]);

  useEffect(() => {
    const beforeUnload = (event) => {
      if (!dirty) return;

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", beforeUnload);

    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [dirty]);

  const updateCourse = (patch) => {
    setCourse((value) => ({
      ...value,
      ...patch,
    }));
  };

  const updateLesson = (index, patch) => {
    setLessons((items) =>
      items.map((item, i) =>
        i === index
          ? {
              ...item,
              ...patch,
            }
          : item
      )
    );
  };

  const removeLesson = (index) => {
    setLessons((items) =>
      items
        .filter((_, i) => i !== index)
        .map((lesson, i) => ({
          ...lesson,
          order_index: i + 1,
        }))
    );
  };

  const moveLesson = (index, direction) => {
    setLessons((items) => {
      const target = index + direction;

      if (target < 0 || target >= items.length) {
        return items;
      }

      const next = [...items];

      [next[index], next[target]] = [next[target], next[index]];

      return next.map((lesson, i) => ({
        ...lesson,
        order_index: i + 1,
      }));
    });
  };

  const addLesson = () => {
    setLessons((items) => [
      ...items,
      createBlankLesson(items.length + 1),
    ]);
  };

  const leave = () => {
    if (!dirty) {
      navigate("/dashboard/courses");
      return;
    }

    setDiscardModalOpen(true);
  };

  const confirmDiscard = () => {
    setDiscardModalOpen(false);
    navigate("/dashboard/courses");
  };

  const validate = () => {
    const next = {};

    if (!String(course?.title || "").trim()) {
      next.title = "A course title is required.";
    }

    if (!String(course?.description || "").trim()) {
      next.description = "A course description is required.";
    }

    if (Number(course?.price) < 0) {
      next.price = "Price cannot be negative.";
    }

    lessons.forEach((lesson, index) => {
      if (
        !String(lesson?.title || "").trim() ||
        !String(lesson?.description || "").trim() ||
        !String(lesson?.youtube_url || "").trim()
      ) {
        next[`lesson-${index}`] =
          "Title, description and YouTube URL are required for every lesson.";
      }
    });

    setErrors(next);

    return Object.keys(next).length === 0;
  };

  const submit = async (event) => {
    event.preventDefault();

    if (!validate()) {
      toast.error("Complete the highlighted fields first.");
      return;
    }

    try {
      await saveCourseStudio({
        courseId: isEditing ? courseId : null,
        course,
        lessons,
        originalLessonIds,
      });

      toast.success(
        isEditing
          ? "Course details and lessons updated."
          : "Course published."
      );

      navigate("/dashboard/courses");
    } catch (error) {
      toast.error(
        formatApiError(error?.response?.data?.detail) ||
          "Could not save course changes."
      );
    }
  };

  const confirmDeleteCourse = async () => {
    if (!isEditing || !courseId || deleting) return;

    setDeleting(true);

    try {
      await deleteCourse(courseId);

      toast.success("Course deleted successfully.");
      setDeleteModalOpen(false);
      navigate("/dashboard/courses");
    } catch (error) {
      toast.error(
        formatApiError(error?.response?.data?.detail) ||
          "Could not delete course."
      );
    } finally {
      setDeleting(false);
    }
  };

  if (isEditing && studioLoading) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        Loading course studio...
      </div>
    );
  }

  return (
    <>
      <CourseStudioEditor
        course={course}
        lessons={lessons}
        errors={errors}
        dirty={dirty}
        saving={studioSaving}
        deleting={deleting}
        isEditing={isEditing}
        courseDetailsDisabled={false}
        onCancel={leave}
        onSubmit={submit}
        onDeleteCourse={() => setDeleteModalOpen(true)}
        onCourseChange={updateCourse}
        onAddLesson={addLesson}
        onLessonChange={updateLesson}
        onLessonMove={moveLesson}
        onLessonRemove={removeLesson}
      />

      <DeleteConfirmModal
        open={deleteModalOpen}
        onClose={() =>
          !deleting && setDeleteModalOpen(false)
        }
        onConfirm={confirmDeleteCourse}
        title="Delete Course"
        description="Are you sure you want to delete this course? All associated lessons and student access data will be permanently removed."
        itemName={course?.title}
        confirmText="Delete Course"
        loading={deleting}
      />

      <ConfirmModal
        open={discardModalOpen}
        onClose={() => setDiscardModalOpen(false)}
        onConfirm={confirmDiscard}
        title="Discard Unsaved Changes?"
        description="You have unsaved changes in this course. If you leave now, your changes will be lost."
        confirmText="Discard Changes"
        cancelText="Keep Editing"
        variant="warning"
      />
    </>
  );
}
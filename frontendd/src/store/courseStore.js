import { create } from "zustand";
import { api, formatApiError } from "../lib/api";
import {
  coursePayload,
  normalizeStudioData,
  lessonPayload,
} from "../lib/courseStudio";
import { loadRazorpay } from "../lib/razorpay";
import { useAuthStore } from "./authStore";

const buildCategories = (courses = []) => [
  "All",
  ...new Set(courses.map((course) => course.category).filter(Boolean)),
];

const syncCourseInList = (courses, updatedCourse) => {
  if (!updatedCourse?.id) return courses;

  return courses.map((course) =>
    course.id === updatedCourse.id ? { ...course, ...updatedCourse } : course,
  );
};

const getCourseListEndpoint = (user) =>
  user?.role === "student" ? "/courses/not-enrolled" : "/courses";

const getEnrolledCourseList = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.courses)) return data.courses;
  if (Array.isArray(data?.enrolled)) return data.enrolled;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};

export const useCourseStore = create((set, get) => ({
  courses: [],
  enrolledCourses: [],
  activeCourse: null,

  categories: ["All"],
  selectedCategory: "All",

  loading: false,
  enrolling: false,
  purchasing: false,

  studioLoading: false,
  studioSaving: false,

  courseLoadError: null,
  courseActionError: null,
  studioError: null,

  setCategory: (category) =>
    set({
      selectedCategory: category,
    }),

  clearCourseLoadError: () =>
    set({
      courseLoadError: null,
    }),

  clearCourseActionError: () =>
    set({
      courseActionError: null,
    }),

  clearStudioError: () =>
    set({
      studioError: null,
    }),

  refreshCourseState: async (courseId) => {
    const user = useAuthStore.getState().user;

    await Promise.all([
      get().fetchCourses(),
      user?.role === "student"
        ? get().fetchEnrolledCourses()
        : Promise.resolve([]),
    ]);

    if (courseId && get().activeCourse && get().activeCourse.id === courseId) {
      await get().fetchCourseById(courseId);
    }
  },

  fetchCourses: async () => {
    set({
      loading: true,
      courseLoadError: null,
    });

    try {
      const user = useAuthStore.getState().user;
      const { data } = await api.get(getCourseListEndpoint(user));
      const nextCourses = Array.isArray(data) ? data : [];

      set((state) => ({
        courses: nextCourses,
        categories: buildCategories(nextCourses),
        activeCourse: state.activeCourse
          ? nextCourses.find((course) => course.id === state.activeCourse.id) ||
            state.activeCourse
          : null,
      }));

      return nextCourses;
    } catch (err) {
      const message =
        formatApiError(err.response?.data?.detail) || "Failed to load courses";

      set({
        courseLoadError: message,
      });

      throw err;
    } finally {
      set({
        loading: false,
      });
    }
  },

  fetchEnrolledCourses: async () => {
    const user = useAuthStore.getState().user;

    if (user?.role !== "student") {
      set({ enrolledCourses: [] });
      return [];
    }

    try {
      const { data } = await api.get("/courses/enrolled");
      const enrolledCourses = getEnrolledCourseList(data);

      set({
        enrolledCourses,
      });

      return enrolledCourses;
    } catch (courseErr) {
      try {
        const { data } = await api.get("/users/me/enrollments");
        const enrolledCourses = getEnrolledCourseList(data);

        set({
          enrolledCourses,
        });

        return enrolledCourses;
      } catch (enrollmentErr) {
        const message =
          formatApiError(
            enrollmentErr.response?.data?.detail ||
              courseErr.response?.data?.detail,
          ) || "Failed to load enrolled courses";

        set({
          courseLoadError: message,
        });

        throw enrollmentErr;
      }
    }
  },

  isCourseEnrolled: (courseId) => {
    if (!courseId) return false;
    const enrolled = get().enrolledCourses || [];
    return enrolled.some(
      (entry) => (entry.course_id || entry.course?.id || entry.id) === courseId,
    );
  },

  fetchCourseById: async (courseId) => {
    set({
      loading: true,
      courseLoadError: null,
    });

    try {
      const { data } = await api.get(`/courses/${courseId}`);

      const enrolled = get().enrolledCourses || [];
      const isEnrolledInStore = enrolled.some(
        (entry) => (entry.course_id || entry.course?.id || entry.id) === courseId,
      );

      const augmentedCourse = {
        ...data,
        is_enrolled: Boolean(data.is_enrolled || data.enrolled || isEnrolledInStore),
      };

      set((state) => ({
        activeCourse: augmentedCourse,
        courses: syncCourseInList(state.courses, augmentedCourse),
      }));

      return augmentedCourse;
    } catch (err) {
      const message =
        formatApiError(err.response?.data?.detail) || "Failed to load course";

      set({
        courseLoadError: message,
      });

      throw err;
    } finally {
      set({
        loading: false,
      });
    }
  },
  fetchCourseStudio: async (courseId) => {
    set({
      studioLoading: true,
      studioError: null,
    });

    try {
      const { data } = await api.get(`/courses/${courseId}`);

      return normalizeStudioData(data);
    } catch (err) {
      const message =
        formatApiError(err.response?.data?.detail) ||
        "Could not load this course.";

      set({
        studioError: message,
      });

      throw err;
    } finally {
      set({
        studioLoading: false,
      });
    }
  },

  createCourse: async ({ course, lessons = [] }) => {
    set({
      studioSaving: true,
      studioError: null,
    });

    try {
      const lessonItems = lessons.map((lesson, index) =>
        lessonPayload({
          ...lesson,
          order_index: index + 1,
        }),
      );

      const { data } = await api.post("/courses", {
        ...coursePayload(course),
        lesson_items: lessonItems,
      });

      await get().fetchCourses();

      return data;
    } catch (err) {
      const message =
        formatApiError(err.response?.data?.detail) ||
        "Could not create course.";

      set({
        studioError: message,
      });

      throw err;
    } finally {
      set({
        studioSaving: false,
      });
    }
  },

  saveCourseStudio: async ({
    courseId,
    course,
    lessons,
    originalLessonIds,
  }) => {
    set({
      studioSaving: true,
      studioError: null,
    });

    try {
      const preparedLessons = lessons.map((lesson, index) => ({
        ...lesson,
        order_index: index + 1,
      }));

      if (!courseId) {
        await get().createCourse({
          course,
          lessons: preparedLessons,
        });

        return true;
      }

      const existingLessonIds = Array.isArray(originalLessonIds)
        ? originalLessonIds
        : [];

      const currentLessonIds = new Set(
        preparedLessons.map((lesson) => lesson.id).filter(Boolean),
      );

      // Update course metadata (title, description, price, category, thumbnail)
      const updateCoursePromise = api.patch(
        `/courses/${courseId}`,
        coursePayload(course),
      );

      // Delete removed lessons
      const deleteLessonsPromise = Promise.all(
        existingLessonIds
          .filter((id) => !currentLessonIds.has(id))
          .map((id) => api.delete(`/lessons/${id}`)),
      );

      // Update existing lessons / Create new lessons
      const saveLessonsPromise = Promise.all(
        preparedLessons.map((lesson) => {
          const payload = lessonPayload(lesson);

          if (lesson.id) {
            return api.patch(`/lessons/${lesson.id}`, payload);
          }

          return api.post(`/courses/${courseId}/lessons`, payload);
        }),
      );

      await Promise.all([
        updateCoursePromise,
        deleteLessonsPromise,
        saveLessonsPromise,
      ]);

      await Promise.all([
        get().fetchCourses(),
        get().fetchCourseById(courseId),
      ]);

      return true;
    } catch (err) {
      const message =
        formatApiError(err.response?.data?.detail) ||
        "Could not save course changes.";

      set({
        studioError: message,
      });

      throw err;
    } finally {
      set({
        studioSaving: false,
      });
    }
  },

  deleteCourse: async (courseId) => {
    set({
      loading: true,
      courseActionError: null,
    });

    try {
      await api.delete(`/courses/${courseId}`);

      set((state) => ({
        courses: state.courses.filter((course) => course.id !== courseId),
        activeCourse:
          state.activeCourse?.id === courseId ? null : state.activeCourse,
      }));

      await get().fetchCourses().catch(() => {});

      return true;
    } catch (err) {
      const message =
        formatApiError(err.response?.data?.detail) || "Failed to delete course.";

      set({
        courseActionError: message,
      });

      throw err;
    } finally {
      set({
        loading: false,
      });
    }
  },
  enrollInFreeCourse: async (courseId) => {
    set({
      enrolling: true,
      courseActionError: null,
    });

    try {
      const { data } = await api.post(`/courses/${courseId}/enroll`);

      await get().refreshCourseState(courseId);

      return data;
    } catch (err) {
      const message =
        formatApiError(err.response?.data?.detail) || "Enrollment failed.";

      set({
        courseActionError: message,
      });

      throw err;
    } finally {
      set({
        enrolling: false,
      });
    }
  },

  purchasePaidCourse: async (course, userDetails = {}) => {
    set({
      purchasing: true,
      courseActionError: null,
    });

    try {
      if (course.is_enrolled || course.enrolled || get().isCourseEnrolled(course.id)) {
        return {
          status: "already_enrolled",
        };
      }

      let checkoutMode = "course";
      let checkout;

      const { data } = await api.post(`/courses/${course.id}/checkout`, {
        pay_with: "razorpay",
      });
      checkout = data;

      if (!checkout) {
        throw new Error("Unable to fetch checkout details.");
      }

      const Razorpay = await loadRazorpay();

      if (!Razorpay) {
        throw new Error("Unable to load Razorpay.");
      }

      return await new Promise((resolve, reject) => {
        const razorpay = new Razorpay({
          key: checkout.key_id || import.meta.env.VITE_RAZORPAY_KEY_ID,
          order_id: checkout.order_id,
          amount: checkout.amount,
          currency: checkout.currency,
          name: "Skiller",
          description:
            checkout.course_title || course.title || "Course Purchase",
          prefill: {
            name: checkout.prefill?.name || userDetails.name || "",
            email: checkout.prefill?.email || userDetails.email || "",
          },
          theme: {
            color: "#B91C1C",
          },
          modal: {
            ondismiss: () => {
              reject(new Error("Payment cancelled."));
            },
          },
          handler: async (response) => {
            try {
              const verifyPayload = {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              };

              let verificationResult;

              const { data } = await api.post(
                "/courses/verify-payment",
                verifyPayload,
              );
              verificationResult = data;

              set((state) => ({
                activeCourse: state.activeCourse ? { ...state.activeCourse, is_enrolled: true } : null,
              }));

              await get().refreshCourseState(course.id);

              resolve({
                status: "success",
                paymentId: response.razorpay_payment_id,
                transactionId: verificationResult?.transaction_id,
                courseId: course.id,
                purchase: verificationResult,
              });
            } catch (err) {
              reject(err);
            }
          },
        });

        razorpay.on("payment.failed", (response) => {
          reject(new Error(response.error?.description || "Payment failed."));
        });
        razorpay.open();
      });
    } catch (err) {
      const message =
        formatApiError(err.response?.data?.detail) ||
        err.message ||
        "Purchase failed.";

      set({
        courseActionError: message,
      });

      throw err;
    } finally {
      set({
        purchasing: false,
      });
    }
  },
}));

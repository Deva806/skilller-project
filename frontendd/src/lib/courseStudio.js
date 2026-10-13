export const blankCourse = {
  title: "",
  description: "",
  price: 0,
  thumbnail: "",
  category: "General",
};

export const createBlankLesson = (order_index) => ({
  title: "",
  description: "",
  youtube_url: "",
  notes_links: [],
  order_index,
});

export const normalizeLinkList = (value) =>
  Array.isArray(value)
    ? value.map((link) => String(link).trim()).filter(Boolean)
    : typeof value === "string"
      ? value
          .split("\n")
          .map((link) => link.trim())
          .filter(Boolean)
      : [];

export const uniqueLinkList = (links) => {
  const seen = new Set();
  const cleaned = [];
  for (const link of normalizeLinkList(links)) {
    if (seen.has(link)) continue;
    seen.add(link);
    cleaned.push(link);
  }
  return cleaned;
};

export const normalizeCourse = (course) => {
  const { lesson_items, lessons, ...courseDetails } = course || {};
  return {
    ...blankCourse,
    ...courseDetails,
    price: Number(course?.price || 0),
  };
};

export const normalizeLesson = (lesson, index) => ({
  id: lesson?.id,
  title: lesson?.title || "",
  description: lesson?.description || "",
  youtube_url: lesson?.youtube_url || "",
  notes_links: uniqueLinkList(lesson?.notes_links),
  order_index: index + 1,
});

export const normalizeStudioData = (course, lessons) => {
  const nextCourse = normalizeCourse(course);
  const sourceLessons = Array.isArray(lessons)
    ? lessons
    : Array.isArray(course?.lesson_items)
      ? course.lesson_items
      : Array.isArray(course?.lessons)
        ? course.lessons
        : [];
  const nextLessons = sourceLessons
    .sort((a, b) => (a?.order_index || 0) - (b?.order_index || 0))
    .map(normalizeLesson);

  return {
    course: nextCourse,
    lessons: nextLessons,
    originalLessonIds: nextLessons.map((lesson) => lesson.id).filter(Boolean),
  };
};

export const coursePayload = (course) => ({
  title: course.title.trim(),
  description: course.description.trim(),
  price: Number(course.price),
  thumbnail: course.thumbnail,
  category: course.category,
});

export const lessonPayload = ({
  title,
  description,
  youtube_url,
  notes_links,
  order_index,
}) => ({
  title: title.trim(),
  description: description.trim(),
  youtube_url: youtube_url.trim(),
  notes_links: uniqueLinkList(notes_links),
  order_index,
});

import { useState } from "react";
import { ChevronDown, ChevronUp, ImagePlus, Plus, Trash2 } from "lucide-react";
import { fileSrc } from "../../lib/upload";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { uniqueLinkList } from "../../lib/courseStudio";

export default function CourseStudioEditor({
  course,
  lessons,
  errors,
  dirty,
  saving,
  deleting,
  isEditing,
  courseDetailsDisabled = false,
  onCancel,
  onSubmit,
  onDeleteCourse,
  onCourseChange,
  onAddLesson,
  onLessonChange,
  onLessonMove,
  onLessonRemove,
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto max-w-6xl px-4 py-6"
      data-testid="course-studio-page"
    >
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mt-1 font-display text-3xl font-bold">
            {isEditing ? "Edit course" : "Create course"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dirty
              ? "Unsaved changes"
              : isEditing
                ? "Update course details and curriculum lessons."
                : "Add the essentials, then build your curriculum."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isEditing && onDeleteCourse && (
            <Button
              type="button"
              variant="outline"
              className="rounded-full text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400"
              disabled={saving || deleting}
              onClick={onDeleteCourse}
              data-testid="delete-course-studio-btn"
            >
              <Trash2 size={16} className="mr-1.5" />
              {deleting ? "Deleting..." : "Delete course"}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button type="submit" className="rounded-full" disabled={saving || deleting}>
            {saving ? "Saving..." : isEditing ? "Save course changes" : "Publish course"}
          </Button>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="space-y-4 rounded-2xl border border-border p-5">
          <h2 className="font-display text-xl font-bold">Course details</h2>
          <Field label="Course title" error={errors.title}>
            <Input
              value={course.title}
              disabled={courseDetailsDisabled}
              onChange={(e) => onCourseChange({ title: e.target.value })}
              className="rounded-xl"
            />
          </Field>
          <Field label="Description" error={errors.description}>
            <Textarea
              value={course.description}
              disabled={courseDetailsDisabled}
              onChange={(e) =>
                onCourseChange({ description: e.target.value })
              }
              rows={5}
              className="rounded-xl"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category">
              <Input
                value={course.category}
                disabled={courseDetailsDisabled}
                onChange={(e) => onCourseChange({ category: e.target.value })}
                className="rounded-xl"
              />
            </Field>
            <Field label="Price (₹)" error={errors.price}>
              <Input
                type="number"
                min="0"
                value={course.price}
                disabled={courseDetailsDisabled}
                onChange={(e) => onCourseChange({ price: e.target.value })}
                className="rounded-xl"
              />
            </Field>
          </div>
          <div>
            <Label>Thumbnail</Label>
            <div className="mt-1 flex items-center gap-3 rounded-xl border border-dashed border-border p-3">
              {course.thumbnail ? (
                <img
                  src={fileSrc(course.thumbnail)}
                  alt="Course thumbnail"
                  className="h-16 w-24 rounded-lg object-cover"
                />
              ) : (
                <div className="grid h-16 w-24 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <ImagePlus size={20} />
                </div>
              )}
              <Input
                type="text"
                value={course.thumbnail}
                disabled={courseDetailsDisabled}
                placeholder="Paste image URL"
                onChange={(e) => onCourseChange({ thumbnail: e.target.value })}
                className="rounded-xl"
              />
            </div>
          </div>
        </section>
        <section className="space-y-4 rounded-2xl border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl font-bold">Curriculum</h2>
              <p className="text-sm text-muted-foreground">
                Add lessons in the order learners should take them.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={onAddLesson}
            >
              <Plus size={14} className="mr-1" />
              Add lesson
            </Button>
          </div>
          {lessons.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No lessons yet. You can publish an empty course or add your first
              lesson.
            </div>
          )}
          {lessons.map((lesson, index) => (
            <LessonCard
              key={lesson.id || `new-${index}`}
              lesson={lesson}
              index={index}
              count={lessons.length}
              error={errors[`lesson-${index}`]}
              onChange={(patch) => onLessonChange(index, patch)}
              onMove={(direction) => onLessonMove(index, direction)}
              onRemove={() => onLessonRemove(index)}
            />
          ))}
        </section>
      </div>
    </form>
  );
}

function Field({ label, error, children }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

function LessonCard({
  lesson,
  index,
  count,
  error,
  onChange,
  onMove,
  onRemove,
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-bold text-primary">Lesson {index + 1}</span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label="Move lesson up"
          >
            <ChevronUp size={16} />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
            aria-label="Move lesson down"
          >
            <ChevronDown size={16} />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={onRemove}
            aria-label="Remove lesson"
          >
            <Trash2 size={16} />
          </Button>
        </div>
      </div>
      <div className="grid gap-3">
        <Input
          placeholder="Lesson title"
          value={lesson.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="rounded-xl"
        />
        <Textarea
          placeholder="What will learners learn?"
          value={lesson.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={2}
          className="rounded-xl"
        />
        <Input
          placeholder="YouTube video URL"
          value={lesson.youtube_url}
          onChange={(e) => onChange({ youtube_url: e.target.value })}
          className="rounded-xl"
        />
        <ResourceLinks
          links={lesson.notes_links}
          onChange={(notes_links) => onChange({ notes_links })}
        />
        {error && <p className="text-xs font-medium text-destructive">{error}</p>}
      </div>
    </div>
  );
}

function ResourceLinks({ links, onChange }) {
  const [value, setValue] = useState("");
  const normalizedLinks = uniqueLinkList(links);
  const add = () => {
    const link = value.trim();
    if (!link || normalizedLinks.includes(link)) return;
    onChange([...normalizedLinks, link]);
    setValue("");
  };
  const remove = (linkToRemove) => {
    onChange(normalizedLinks.filter((item) => item !== linkToRemove));
  };

  return (
    <div className="space-y-2">
      <Label>
        Resource links{" "}
        <span className="font-normal text-muted-foreground">(optional)</span>
      </Label>
      <div className="flex gap-2">
        <Input
          placeholder="https://example.com/resource"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          className="rounded-xl"
        />
        <Button
          type="button"
          variant="outline"
          className="shrink-0 rounded-xl"
          onClick={add}
        >
          Add link
        </Button>
      </div>
      {normalizedLinks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {normalizedLinks.map((link) => (
            <span
              key={link}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs"
            >
              <span className="max-w-48 truncate">{link}</span>
              <button
                type="button"
                className="ml-1 text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${link}`}
                onClick={() => remove(link)}
              >
                x
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

from urllib.parse import urlparse, parse_qs

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from db.dependencies import get_db
from core import get_current_user, LessonCreate, LessonUpdate
from models.course import Course
from models.lesson import Lesson
from services.course_service import CourseService
from services.lesson_service import LessonService

router = APIRouter(
    prefix="/api",
    tags=["Lessons"],
)


# Keep this allowlist explicit: only HTTPS YouTube URLs from these hosts are accepted.
YOUTUBE_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
    "www.youtu.be",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
}


def _is_valid_youtube_url(value: str | None) -> bool:
    """Allow an empty URL, or a valid HTTPS YouTube watch/share/embed URL."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return True
    if not isinstance(value, str):
        return False

    candidate = value.strip()
    try:
        parsed = urlparse(candidate)
        host = (parsed.hostname or "").lower().rstrip(".")
        if parsed.scheme.lower() != "https" or host not in YOUTUBE_HOSTS:
            return False
        if parsed.username or parsed.password:
            return False

        path = parsed.path.rstrip("/")
        if host in {"youtu.be", "www.youtu.be"}:
            # Share links look like https://youtu.be/VIDEO_ID
            return bool(path and path != "/") and len(path.strip("/").split("/")) == 1

        if path == "/watch":
            return bool(parse_qs(parsed.query).get("v", [""])[0].strip())

        # Supported YouTube URL forms: /embed/VIDEO_ID, /shorts/VIDEO_ID,
        # /live/VIDEO_ID and /v/VIDEO_ID.
        parts = [part for part in path.split("/") if part]
        return len(parts) == 2 and parts[0] in {"embed", "shorts", "live", "v"} and bool(parts[1])
    except (TypeError, ValueError):
        return False


def _validate_youtube_url(value: str | None) -> None:
    if not _is_valid_youtube_url(value):
        raise HTTPException(
            status_code=400,
            detail="youtube_url must be empty or a valid HTTPS YouTube watch, share, or embed URL.",
        )


def _validate_notes_links(value) -> None:
    """Accept absent/None links; every supplied link must use HTTP or HTTPS."""
    if value is None:
        return
    if not isinstance(value, (list, tuple)):
        raise HTTPException(
            status_code=400,
            detail="notes_links must be a list of HTTP/HTTPS URLs.",
        )

    for link in value:
        if not isinstance(link, str) or not link.strip():
            raise HTTPException(
                status_code=400,
                detail="Each notes link must be a valid HTTP/HTTPS URL.",
            )
        try:
            parsed = urlparse(link.strip())
            if (
                parsed.scheme.lower() not in {"http", "https"}
                or not parsed.hostname
                or parsed.username is not None
                or parsed.password is not None
            ):
                raise ValueError("Invalid URL")
            # Accessing .port also detects malformed port values.
            _ = parsed.port
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=400,
                detail="Each notes link must be a valid HTTP/HTTPS URL.",
            )


@router.post("/courses/{course_id}/lessons")
async def create_lesson(
    course_id: str,
    data: LessonCreate,
    current=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    course = await CourseService.get_course(db, course_id)

    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    if course.owner_id != current["id"] and current.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    _validate_youtube_url(data.youtube_url)
    _validate_notes_links(data.notes_links)

    return await LessonService.create_lesson(
        db=db,
        course_id=course_id,
        title=data.title,
        description=data.description,
        youtube_url=data.youtube_url,
        notes_links=data.notes_links,
        order_index=data.order_index,
    )


@router.get("/courses/{course_id}/lessons")
async def list_lessons(
    course_id: str,
    db: AsyncSession = Depends(get_db),
):
    return await LessonService.list_course_lessons(db, course_id)


@router.patch("/lessons/{lesson_id}")
async def update_lesson(
    lesson_id: str,
    data: LessonUpdate,
    current=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lesson = await LessonService.get_lesson(db, lesson_id)

    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    course = await CourseService.get_course(db, lesson.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    if course.owner_id != current["id"] and current.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    updates = data.model_dump(exclude_unset=True)

    # Validate only fields included in the patch, preserving partial-update behavior.
    if "youtube_url" in updates:
        _validate_youtube_url(updates["youtube_url"])
    if "notes_links" in updates:
        _validate_notes_links(updates["notes_links"])

    return await LessonService.update_lesson(db, lesson, updates)


@router.delete("/lessons/{lesson_id}")
async def delete_lesson(
    lesson_id: str,
    current=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lesson = await LessonService.get_lesson(db, lesson_id)

    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    course = await CourseService.get_course(db, lesson.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    if course.owner_id != current["id"] and current.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    await LessonService.delete_lesson(db, lesson)
    return {"ok": True}

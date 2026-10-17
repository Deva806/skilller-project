
"""Users, XP, profiles, follows, and leaderboard."""

from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from core import (
    db,
    get_current_user,
    get_user_by_id,
    maybe_current_user,
    award_xp,
    compute_level,
    BADGE_DEFS,
    ProfileUpdate,
    RoleUpgradeIn,
)
from notifications_service import create_notification
from db.dependencies import get_db
from services.user_service import UserService
from services.user_follow_service import UserFollowService


router = APIRouter(prefix="/api", tags=["users"])


# ============================================================
# PUBLIC CREATOR STOREFRONT
# ============================================================

@router.get("/c/{username}")
async def creator_storefront(
    username: str,
    request: Request,
    pg_db: AsyncSession = Depends(get_db),
):
    """Public creator storefront: courses, gigs, reels, and posts."""

    user = await UserService.get_user_by_username(
        pg_db,
        username.lower(),
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="Creator not found",
        )

    if user.role not in ("creator", "admin"):
        raise HTTPException(
            status_code=404,
            detail="Not a creator",
        )

    courses = await db.courses.find(
        {"owner_id": user.id},
        {"_id": 0},
    ).sort("created_at", -1).to_list(50)

    for course in courses:
        course["enrollments"] = await db.enrollments.count_documents(
            {"course_id": course["id"]}
        )

    gigs = await db.gigs.find(
        {"owner_id": user.id},
        {"_id": 0},
    ).sort("created_at", -1).to_list(50)

    reels = await db.posts.find(
        {
            "user_id": user.id,
            "media_type": "video",
        },
        {"_id": 0},
    ).sort("created_at", -1).to_list(12)

    posts = await db.posts.find(
        {
            "user_id": user.id,
            "media_type": {"$ne": "video"},
        },
        {"_id": 0},
    ).sort("created_at", -1).to_list(12)

    followers = await UserFollowService.count_followers(
        pg_db,
        user.id,
    )

    following = await UserFollowService.count_following(
        pg_db,
        user.id,
    )

    viewer = await maybe_current_user(request)
    is_following = False

    if viewer:
        is_following = await UserFollowService.is_following(
            pg_db,
            viewer["id"],
            user.id,
        )

    return {
        "user": {
            "id": user.id,
            "username": user.username,
            "name": user.name,
            "bio": user.bio,
            "avatar_url": user.avatar_url,
            "role": user.role,
        },
        "stats": {
            "followers": followers,
            "following": following,
            "courses": len(courses),
            "gigs": len(gigs),
            "posts": len(posts) + len(reels),
        },
        "level": compute_level(user.xp or 0),
        "badges": [
            badge
            for badge in BADGE_DEFS
            if badge["key"] in (user.badges or [])
        ],
        "courses": courses,
        "gigs": gigs,
        "reels": reels,
        "posts": posts,
        "is_following": is_following,
        "is_self": bool(viewer and viewer["id"] == user.id),
    }


# ============================================================
# FOLLOW / UNFOLLOW
# ============================================================

@router.post("/users/{user_id}/follow")
async def follow_user(
    user_id: str,
    current=Depends(get_current_user),
    pg_db: AsyncSession = Depends(get_db),
):
    if user_id == current["id"]:
        raise HTTPException(
            status_code=400,
            detail="Cannot follow yourself",
        )

    target = await UserService.get_user(pg_db, user_id)

    if not target:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    existing_follow = await UserFollowService.get_follow(
        pg_db,
        current["id"],
        user_id,
    )

    if existing_follow:
        await UserFollowService.delete_follow(
            pg_db,
            existing_follow,
        )
        return {"following": False}

    await UserFollowService.create_follow(
        pg_db,
        current["id"],
        user_id,
    )

    await award_xp(current["id"], "follow_given")
    await award_xp(user_id, "follow_received")

    await create_notification(
        user_id,
        "follow",
        f"@{current['username']} started following you",
        actor_id=current["id"],
    )

    return {"following": True}


# ============================================================
# UPDATE PROFILE
# ============================================================

@router.patch("/users/me")
async def update_profile(
    data: ProfileUpdate,
    current=Depends(get_current_user),
    pg_db: AsyncSession = Depends(get_db),
):
    user = await UserService.get_user(pg_db, current["id"])

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    updates = {
        key: value
        for key, value in data.model_dump().items()
        if value is not None
    }

    user = await UserService.update_user(
        pg_db,
        user,
        updates,
    )

    return {
        "id": user.id,
        "username": user.username,
        "name": user.name,
        "bio": user.bio,
        "avatar_url": user.avatar_url,
    }


# ============================================================
# UPGRADE ROLE
# ============================================================

@router.post("/users/me/upgrade-role")
async def upgrade_role(
    data: RoleUpgradeIn,
    current=Depends(get_current_user),
    pg_db: AsyncSession = Depends(get_db),
):
    user = await UserService.get_user(pg_db, current["id"])

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    user = await UserService.update_user(
        pg_db,
        user,
        {"role": data.role},
    )

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "plan": user.plan,
    }


# ============================================================
# LIST CREATORS
# ============================================================

# The frontend calls GET /api/users?limit=8.
# Email addresses are deliberately excluded from this public-facing
# list to avoid exposing users' private contact information.

@router.get("/users")
async def list_users(
    limit: int = 8,
    current=Depends(get_current_user),
    pg_db: AsyncSession = Depends(get_db),
):
    # Bound the result size to prevent unnecessarily large queries.
    limit = max(1, min(limit, 100))

    users = await UserService.list_creators(
        pg_db,
        current["id"],
        limit,
    )

    return [
        {
            "id": user.id,
            "username": user.username,
            "name": user.name,
            "avatar_url": user.avatar_url,
            "role": user.role,
        }
        for user in users
    ]


# ============================================================
# MY XP AND BADGES
# ============================================================

@router.get("/users/me/xp")
async def my_xp(
    current=Depends(get_current_user),
    pg_db: AsyncSession = Depends(get_db),
):
    user = await UserService.get_user(pg_db, current["id"])

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    earned = user.badges or []

    return {
        "xp": user.xp or 0,
        "level": compute_level(user.xp or 0),
        "streak": user.streak or 0,
        "earned_badges": [
            badge
            for badge in BADGE_DEFS
            if badge["key"] in earned
        ],
        "all_badges": BADGE_DEFS,
        "recent_events": await db.xp_events.find(
            {"user_id": current["id"]},
            {"_id": 0},
        ).sort(
            "created_at",
            -1,
        ).limit(20).to_list(20),
    }


# ============================================================
# MY ENROLLMENTS
# ============================================================

@router.get("/users/me/enrollments")
async def my_enrollments(
    current=Depends(get_current_user),
):
    enrollments = await db.enrollments.find(
        {"user_id": current["id"]},
        {"_id": 0},
    ).sort(
        "created_at",
        -1,
    ).to_list(200)

    course_ids = [
        enrollment["course_id"]
        for enrollment in enrollments
    ]

    if not course_ids:
        return []

    courses = await db.courses.find(
        {"id": {"$in": course_ids}},
        {"_id": 0},
    ).to_list(200)

    course_map = {
        course["id"]: course
        for course in courses
    }

    return [
        course_map[course_id]
        for course_id in course_ids
        if course_id in course_map
    ]


# ============================================================
# MY GIG APPLICATIONS
# ============================================================

@router.get("/users/me/applications")
async def my_applications(
    current=Depends(get_current_user),
):
    applications = await db.applications.find(
        {"user_id": current["id"]},
        {"_id": 0},
    ).sort(
        "created_at",
        -1,
    ).to_list(200)

    gig_ids = [
        application["gig_id"]
        for application in applications
    ]

    if not gig_ids:
        return []

    gigs = await db.gigs.find(
        {"id": {"$in": gig_ids}},
        {"_id": 0},
    ).to_list(200)

    gig_map = {
        gig["id"]: gig
        for gig in gigs
    }

    return [
        {
            **application,
            "gig": gig_map.get(application["gig_id"]),
        }
        for application in applications
    ]


# ============================================================
# LEADERBOARD
# ============================================================

@router.get("/leaderboard")
async def leaderboard(
    limit: int = 20,
    pg_db: AsyncSession = Depends(get_db),
):
    limit = max(1, min(limit, 100))

    users = await UserService.get_leaderboard(
        pg_db,
        limit,
    )

    return [
        {
            "id": user.id,
            "username": user.username,
            "name": user.name,
            "avatar_url": user.avatar_url,
            "xp": user.xp or 0,
            "level": compute_level(user.xp or 0),
            "badge_count": len(user.badges or []),
        }
        for user in users
    ]


# ============================================================
# CURRENT USER
# ============================================================

@router.get("/users/me")
async def get_me(
    current=Depends(get_current_user),
):
    return current


# ============================================================
# PUBLIC USER PROFILE
# ============================================================

@router.get("/users/{username}")
async def get_profile(
    username: str,
    request: Request,
    pg_db: AsyncSession = Depends(get_db),
):
    """
    Get a public user profile.

    Returns the structure expected by Profile.jsx:
    user, posts, post_count, follower_count, following_count,
    is_following, is_self, level, and badges.
    """

    user = await UserService.get_user_by_username(
        pg_db,
        username.lower(),
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    posts = await db.posts.find(
        {
            "user_id": user.id,
            "media_type": {"$ne": "video"},
        },
        {"_id": 0},
    ).sort(
        "created_at",
        -1,
    ).to_list(50)

    follower_count = await UserFollowService.count_followers(
        pg_db,
        user.id,
    )

    following_count = await UserFollowService.count_following(
        pg_db,
        user.id,
    )

    viewer = await maybe_current_user(request)
    is_following = False

    if viewer and viewer["id"] != user.id:
        is_following = await UserFollowService.is_following(
            pg_db,
            viewer["id"],
            user.id,
        )

    is_self = bool(viewer and viewer["id"] == user.id)
    level = compute_level(user.xp or 0)

    badges = [
        badge
        for badge in BADGE_DEFS
        if badge["key"] in (user.badges or [])
    ]

    return {
        "user": {
            "id": user.id,
            "username": user.username,
            "name": user.name,
            "bio": user.bio,
            "avatar_url": user.avatar_url,
            "role": user.role,
            "xp": user.xp or 0,
            "streak": user.streak or 0,
            "created_at": user.created_at,
        },
        "posts": posts,
        "post_count": len(posts),
        "follower_count": follower_count,
        "following_count": following_count,
        "is_following": is_following,
        "is_self": is_self,
        "level": level,
        "badges": badges,
    }

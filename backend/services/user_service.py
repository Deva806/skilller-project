
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from models.user import User
from models.user_follow import UserFollow


class UserService:

    @staticmethod
    async def get_user(
        db: AsyncSession,
        user_id: str,
    ):
        result = await db.execute(
            select(User).where(User.id == user_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_user_by_email(
        db: AsyncSession,
        email: str,
    ):
        result = await db.execute(
            select(User).where(User.email == email)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_user_by_username(
        db: AsyncSession,
        username: str,
    ):
        result = await db.execute(
            select(User).where(User.username == username)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_user_by_referral_code(
        db: AsyncSession,
        referral_code: str,
    ):
        result = await db.execute(
            select(User).where(User.referral_code == referral_code)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def create_user(
        db: AsyncSession,
        **kwargs,
    ):
        user = User(**kwargs)
        db.add(user)

        await db.commit()
        await db.refresh(user)

        return user

    @staticmethod
    async def update_user(
        db: AsyncSession,
        user: User,
        updates: dict,
    ):
        """Update validated User model fields."""
        for key, value in updates.items():
            if not hasattr(type(user), key):
                raise ValueError(f"Invalid user field: {key}")

            setattr(user, key, value)

        await db.commit()
        await db.refresh(user)

        return user

    @staticmethod
    async def list_users(
        db: AsyncSession,
    ):
        result = await db.execute(
            select(User).order_by(User.created_at.desc())
        )
        return result.scalars().all()

    @staticmethod
    async def get_all_users(
        db: AsyncSession,
    ):
        result = await db.execute(
            select(User).order_by(User.created_at.desc())
        )
        return result.scalars().all()

    @staticmethod
    async def get_leaderboard(
        db: AsyncSession,
        limit: int = 20,
    ):
        limit = max(1, min(limit, 100))

        result = await db.execute(
            select(User)
            .order_by(User.xp.desc())
            .limit(limit)
        )
        return result.scalars().all()

    @staticmethod
    async def increment_xp(
        db: AsyncSession,
        user: User,
        amount: int,
    ):
        user.xp = (user.xp or 0) + amount

        await db.commit()
        await db.refresh(user)

        return user

    @staticmethod
    async def get_user_dict(
        db: AsyncSession,
        user_id: str,
    ):
        """Return the authenticated user's public/API representation."""
        user = await UserService.get_user(db, user_id)

        if not user:
            return None

        return {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "name": user.name,
            "bio": user.bio,
            "avatar_url": user.avatar_url,
            "role": user.role,
            "xp": user.xp,
            "badges": user.badges or [],
            "streak": user.streak,
            "email_verified": user.email_verified,
            "referral_code": user.referral_code,
            "referred_by": user.referred_by,
            "plan": user.plan,
            "premium_until": (
                user.premium_until.isoformat()
                if user.premium_until
                else None
            ),
            "created_at": (
                user.created_at.isoformat()
                if user.created_at
                else None
            ),
            # Required for JWT invalidation checks.
            "token_version": int(user.token_version or 0),
        }

    @staticmethod
    async def get_followers_count(
        db: AsyncSession,
        user_id: str,
    ):
        result = await db.execute(
            select(func.count(UserFollow.id)).where(
                UserFollow.following_id == user_id
            )
        )
        return result.scalar() or 0

    @staticmethod
    async def follower_count(
        db: AsyncSession,
        user_id: str,
    ):
        result = await db.execute(
            select(func.count())
            .select_from(UserFollow)
            .where(UserFollow.following_id == user_id)
        )
        return result.scalar() or 0

    @staticmethod
    async def get_user_summary(
        db: AsyncSession,
        user_id: str,
    ):
        user = await UserService.get_user(db, user_id)

        if not user:
            return None

        return {
            "id": user.id,
            "username": user.username,
            "name": user.name,
            "email": user.email,
            "avatar_url": user.avatar_url,
        }

    @staticmethod
    async def update_plan(
        db: AsyncSession,
        user: User,
        plan: str,
        premium_until,
    ):
        user.plan = plan
        user.premium_until = premium_until

        await db.commit()
        await db.refresh(user)

        return user

    @staticmethod
    async def list_creators(
        db: AsyncSession,
        exclude_user_id: str,
        limit: int = 20,
    ):
        limit = max(1, min(limit, 100))

        result = await db.execute(
            select(User)
            .where(
                User.id != exclude_user_id,
                User.role.in_(["creator", "admin"]),
            )
            .order_by(User.created_at.desc())
            .limit(limit)
        )
        return result.scalars().all()

    @staticmethod
    async def get_creators(
        db: AsyncSession,
        limit: int = 2000,
    ):
        limit = max(1, min(limit, 2000))

        result = await db.execute(
            select(User)
            .where(User.role.in_(["creator", "admin"]))
            .order_by(User.created_at.desc())
            .limit(limit)
        )
        return result.scalars().all()

    @staticmethod
    async def get_users_by_ids(
        db: AsyncSession,
        user_ids: list[str],
    ):
        if not user_ids:
            return []

        result = await db.execute(
            select(User).where(User.id.in_(user_ids))
        )
        return result.scalars().all()

    @staticmethod
    async def get_following_ids(
        db: AsyncSession,
        follower_id: str,
    ):
        result = await db.execute(
            select(UserFollow.following_id).where(
                UserFollow.follower_id == follower_id
            )
        )
        return list(result.scalars().all())

    @staticmethod
    async def update_streak(
        db: AsyncSession,
        user: User,
        streak: int,
        last_login_date,
    ):
        user.streak = streak
        user.last_login_date = last_login_date

        await db.commit()
        await db.refresh(user)

        return user

    @staticmethod
    async def update_password(
        db: AsyncSession,
        user: User,
        password_hash: str,
    ):
        """
        Update the password and increment token_version once.

        Existing access tokens become invalid when get_current_user
        compares their JWT version with the current database version.
        """
        user.password_hash = password_hash
        user.token_version = (user.token_version or 0) + 1

        await db.commit()
        await db.refresh(user)

        return user

    @staticmethod
    async def increment_token_version(
        db: AsyncSession,
        user: User,
    ):
        """Invalidate existing JWTs without changing the password."""
        user.token_version = (user.token_version or 0) + 1

        await db.commit()
        await db.refresh(user)

        return user

    @staticmethod
    async def increment_token_version_by_user_id(
        db: AsyncSession,
        user_id: str,
    ):
        """Atomically increment token_version for a user ID."""
        result = await db.execute(
            update(User)
            .where(User.id == user_id)
            .values(token_version=User.token_version + 1)
            .returning(User.id)
        )

        updated_user_id = result.scalar_one_or_none()

        if updated_user_id is None:
            await db.rollback()
            return False

        await db.commit()
        return True

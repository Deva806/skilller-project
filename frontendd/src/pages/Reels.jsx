import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Heart,
  MessageCircle,
  Volume2,
  VolumeX,
  Play,
} from "lucide-react";
import { api, formatApiError } from "../lib/api";
import { fileSrc } from "../lib/upload";
import { useAuthStore } from "../store/authStore";
import { toast } from "sonner";

function ReelCard({
  post,
  muted,
  setMuted,
  active,
  onLikeUpdated,
}) {
  const ref = useRef(null);
  const user = useAuthStore((state) => state.user);

  const [liked, setLiked] = useState(Boolean(post.liked));
  const [likeCount, setLikeCount] = useState(
    Number(post.like_count || 0)
  );
  const [paused, setPaused] = useState(false);
  const [liking, setLiking] = useState(false);

  useEffect(() => {
    const video = ref.current;

    if (!video) return;

    if (active) {
      video.muted = muted;

      video.play().catch(() => {});
      setPaused(false);
    } else {
      video.pause();

      try {
        video.currentTime = 0;
      } catch {
        // Ignore reset errors.
      }

      setPaused(false);
    }
  }, [active, muted]);

  const togglePlay = (event) => {
    event?.stopPropagation();

    const video = ref.current;

    if (!video) return;

    if (video.paused) {
      video.muted = muted;
      video.play().catch(() => {});
      setPaused(false);
    } else {
      video.pause();
      setPaused(true);
    }
  };

  const toggleLike = async (event) => {
    event.stopPropagation();

    if (!user) {
      toast.error("Sign in to like");
      return;
    }

    if (liking) return;

    setLiking(true);

    try {
      const response = await api.post(
        `/posts/${post.id}/like`
      );

      const nextLiked = Boolean(response.data?.liked);
      const nextCount = Number(
        response.data?.like_count ?? likeCount
      );

      setLiked(nextLiked);
      setLikeCount(nextCount);

      onLikeUpdated?.(post.id, nextLiked, nextCount);
    } catch (error) {
      toast.error(
        formatApiError(error?.response?.data?.detail) ||
          "Could not like"
      );
    } finally {
      setLiking(false);
    }
  };

  const avatar =
    post.author?.avatar_url ||
    `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(
      post.author?.name || "S"
    )}`;

  return (
    <div
      className="relative h-full w-full snap-start overflow-hidden bg-black"
      data-testid={`reel-${post.id}`}
    >
      <video
        ref={ref}
        src={fileSrc(post.media)}
        className="absolute inset-0 h-full w-full object-cover"
        loop
        playsInline
        muted={muted}
        preload="metadata"
        onClick={togglePlay}
      />

      {paused && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 grid place-items-center bg-black/30 text-white"
          aria-label="Play reel"
        >
          <Play size={56} className="fill-current" />
        </button>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-5 text-white">
        <Link
          to={`/u/${post.author?.username}`}
          className="flex items-center gap-2"
          onClick={(event) => event.stopPropagation()}
        >
          <img
            src={avatar}
            alt=""
            className="h-9 w-9 rounded-full border border-white/30 object-cover"
          />

          <div className="text-sm font-semibold">
            @{post.author?.username || "user"}
          </div>
        </Link>

        {post.caption && (
          <p className="mt-2 line-clamp-2 max-w-md text-sm leading-relaxed">
            {post.caption}
          </p>
        )}

        {Array.isArray(post.tags) &&
          post.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-white/70">
              {post.tags.slice(0, 5).map((tag) => (
                <span key={tag}>#{tag}</span>
              ))}
            </div>
          )}
      </div>

      <div className="absolute bottom-24 right-3 flex flex-col items-center gap-5 text-white">
        <button
          onClick={toggleLike}
          disabled={liking}
          data-testid={`reel-like-${post.id}`}
          className="grid place-items-center disabled:opacity-60"
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-white/15 backdrop-blur active:scale-90">
            <Heart
              size={22}
              className={
                liked
                  ? "fill-destructive text-destructive"
                  : ""
              }
            />
          </span>

          <span className="mt-1 text-xs font-semibold">
            {likeCount}
          </span>
        </button>

        <Link
          to={`/p/${post.id}`}
          className="grid place-items-center"
          data-testid={`reel-comments-${post.id}`}
          onClick={(event) => event.stopPropagation()}
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-white/15 backdrop-blur">
            <MessageCircle size={22} />
          </span>

          <span className="mt-1 text-xs font-semibold">
            {Number(post.comment_count || 0)}
          </span>
        </Link>

        <button
          onClick={(event) => {
            event.stopPropagation();
            setMuted((value) => !value);
          }}
          className="grid h-10 w-10 place-items-center rounded-full bg-white/15 backdrop-blur"
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? (
            <VolumeX size={18} />
          ) : (
            <Volume2 size={18} />
          )}
        </button>
      </div>
    </div>
  );
}

export default function Reels() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);

  const containerRef = useRef(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);

        const response = await api.get(
          "/posts/reels?limit=30"
        );

        if (!active) return;

        setPosts(
          Array.isArray(response.data)
            ? response.data
            : []
        );
        setActiveIdx(0);
      } catch (error) {
        if (active) {
          setPosts([]);

          toast.error(
            formatApiError(error?.response?.data?.detail) ||
              "Could not load reels."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;

    if (!container || posts.length === 0) {
      return undefined;
    }

    const updateActiveIndex = () => {
      const height = container.clientHeight;

      if (!height) return;

      const index = Math.round(
        container.scrollTop / height
      );

      setActiveIdx(
        Math.max(0, Math.min(index, posts.length - 1))
      );
    };

    container.addEventListener(
      "scroll",
      updateActiveIndex,
      { passive: true }
    );

    updateActiveIndex();

    return () => {
      container.removeEventListener(
        "scroll",
        updateActiveIndex
      );
    };
  }, [posts.length]);

  const handleLikeUpdated = (
    postId,
    liked,
    likeCount
  ) => {
    setPosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === postId
          ? {
              ...post,
              liked,
              like_count: likeCount,
            }
          : post
      )
    );
  };

  if (loading) {
    return (
      <div className="grid h-screen place-items-center text-muted-foreground">
        Loading reels…
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="grid h-[80vh] place-items-center px-4 text-center text-muted-foreground">
        No reels yet. Upload a vertical video to start your
        reels feed.
      </div>
    );
  }

  return (
    <div
      className="-mt-6"
      data-testid="reels-page"
    >
      <div
        ref={containerRef}
        className="mx-auto h-[calc(100vh-72px)] max-w-md snap-y snap-mandatory overflow-y-auto rounded-2xl bg-black md:h-[calc(100vh-32px)]"
        style={{ scrollSnapType: "y mandatory" }}
      >
        {posts.map((post, index) => (
          <div
            key={post.id}
            className="relative h-full w-full snap-start"
          >
            <ReelCard
              post={post}
              muted={muted}
              setMuted={setMuted}
              active={index === activeIdx}
              onLikeUpdated={handleLikeUpdated}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
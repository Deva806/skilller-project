import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Heart, MessageCircle, Play } from "lucide-react";
import { api, formatApiError } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { fileSrc } from "../lib/upload";
import StoryBar from "../components/StoryBar";
import { toast } from "sonner";

const CATEGORIES = ["All", "Design", "Code", "Product", "Reels", "Career"];

function timeAgo(iso) {
    try {
        const seconds = Math.floor(
            (Date.now() - new Date(iso).getTime()) / 1000
        );

        if (seconds < 60) return `${Math.max(seconds, 0)}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;

        return `${Math.floor(seconds / 86400)}d`;
    } catch {
        return "";
    }
}

function VideoPoster({ src }) {
    const [thumb, setThumb] = useState(null);

    useEffect(() => {
        let cancelled = false;

        if (!src) return undefined;

        const video = document.createElement("video");

        video.crossOrigin = "anonymous";
        video.preload = "metadata";
        video.src = src;
        video.muted = true;
        video.playsInline = true;

        const handleLoadedData = () => {
            try {
                video.currentTime = Math.min(
                    0.5,
                    Number.isFinite(video.duration)
                        ? video.duration / 4
                        : 0.5
                );
            } catch {
                // Ignore thumbnail seek errors.
            }
        };

        const handleSeeked = () => {
            if (cancelled) return;

            const canvas = document.createElement("canvas");
            canvas.width = 320;
            canvas.height = 180;

            try {
                const context = canvas.getContext("2d");

                if (!context) return;

                context.drawImage(
                    video,
                    0,
                    0,
                    canvas.width,
                    canvas.height
                );

                setThumb(canvas.toDataURL("image/jpeg", 0.7));
            } catch {
                // Some remote videos may block canvas extraction.
            }
        };

        video.addEventListener("loadeddata", handleLoadedData);
        video.addEventListener("seeked", handleSeeked);

        return () => {
            cancelled = true;
            video.removeEventListener("loadeddata", handleLoadedData);
            video.removeEventListener("seeked", handleSeeked);
            video.pause();
            video.removeAttribute("src");
            video.load();
        };
    }, [src]);

    if (thumb) {
        return (
            <img
                src={thumb}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
            />
        );
    }

    return (
        <video
            src={src}
            preload="metadata"
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
        />
    );
}

export default function StudentHome() {
    const user = useAuthStore((state) => state.user);
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("All");

    useEffect(() => {
        let active = true;

        const loadFeed = async () => {
            setLoading(true);

            try {
                const response = await api.get("/posts/feed?limit=60");

                if (active) {
                    setPosts(
                        Array.isArray(response.data)
                            ? response.data
                            : []
                    );
                }
            } catch (error) {
                if (active) {
                    setPosts([]);
                    toast.error(
                        formatApiError(error?.response?.data?.detail) ||
                            "Could not load your feed."
                    );
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };

        loadFeed();

        return () => {
            active = false;
        };
    }, [user?.id]);

    const filtered = useMemo(() => {
        if (filter === "All") {
            return posts;
        }

        if (filter === "Reels") {
            return posts.filter(
                (post) => post.media_type === "video"
            );
        }

        const filterText = filter.toLowerCase();

        return posts.filter((post) => {
            const tags = Array.isArray(post.tags)
                ? post.tags
                : [];

            const tagMatch = tags.some((tag) => {
                const value = String(tag).toLowerCase();

                return (
                    value.includes(filterText) ||
                    filterText.includes(value)
                );
            });

            const captionMatch = String(
                post.caption || ""
            )
                .toLowerCase()
                .includes(filterText);

            return tagMatch || captionMatch;
        });
    }, [posts, filter]);

    return (
        <div
            className="mx-auto max-w-7xl px-4 py-6"
            data-testid="student-home"
        >
            <StoryBar />

            <div className="mb-5 flex flex-wrap items-center gap-2">
                {CATEGORIES.map((category) => (
                    <button
                        key={category}
                        onClick={() => setFilter(category)}
                        data-testid={`home-filter-${category}`}
                        className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                            filter === category
                                ? "border-foreground bg-foreground text-background"
                                : "border-border hover:bg-accent"
                        }`}
                    >
                        {category}
                    </button>
                ))}

                <Link
                    to="/reels"
                    className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                    data-testid="reels-link"
                >
                    <Play
                        size={14}
                        className="fill-current"
                    />
                    Open Reels
                </Link>
            </div>

            {loading ? (
                <div className="py-20 text-center text-muted-foreground">
                    Loading…
                </div>
            ) : filtered.length === 0 ? (
                <div className="py-20 text-center text-muted-foreground">
                    Nothing here yet. Try another category.
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {filtered.map((post) => {
                        const avatar =
                            post.author?.avatar_url ||
                            `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(
                                post.author?.name || "S"
                            )}`;

                        return (
                            <Link
                                key={post.id}
                                to={`/p/${post.id}`}
                                className="group block"
                                data-testid={`home-card-${post.id}`}
                            >
                                <div className="relative aspect-video overflow-hidden rounded-xl border border-border bg-secondary">
                                    {post.media_type === "video" ? (
                                        <>
                                            <VideoPoster
                                                src={fileSrc(
                                                    post.media
                                                )}
                                            />

                                            <span className="absolute bottom-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-white">
                                                <Play
                                                    size={12}
                                                    className="fill-current"
                                                />
                                            </span>
                                        </>
                                    ) : (
                                        <img
                                            src={fileSrc(
                                                post.media
                                            )}
                                            alt=""
                                            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                            loading="lazy"
                                        />
                                    )}
                                </div>

                                <div className="mt-3 flex items-start gap-3">
                                    <img
                                        src={avatar}
                                        alt=""
                                        className="h-9 w-9 shrink-0 rounded-full border border-border object-cover"
                                        loading="lazy"
                                    />

                                    <div className="min-w-0 flex-1">
                                        <div className="line-clamp-2 text-sm font-semibold leading-snug">
                                            {post.caption ||
                                                "(no caption)"}
                                        </div>

                                        <div className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
                                            <span className="truncate">
                                                @
                                                {post.author
                                                    ?.username ||
                                                    "user"}
                                            </span>

                                            <span>·</span>

                                            <span className="inline-flex items-center gap-1">
                                                <Heart size={11} />
                                                {post.like_count || 0}
                                            </span>

                                            <span>·</span>

                                            <span className="inline-flex items-center gap-1">
                                                <MessageCircle
                                                    size={11}
                                                />
                                                {post.comment_count ||
                                                    0}
                                            </span>

                                            {post.created_at && (
                                                <>
                                                    <span>·</span>
                                                    <span>
                                                        {timeAgo(
                                                            post.created_at
                                                        )}{" "}
                                                        ago
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
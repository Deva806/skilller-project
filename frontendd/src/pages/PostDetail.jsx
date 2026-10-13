import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Heart, Send, Bookmark } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { api, formatApiError } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { toast } from "sonner";
import { fileSrc } from "../lib/upload";

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

export default function PostDetail() {
    const { postId } = useParams();
    const user = useAuthStore((state) => state.user);

    const [post, setPost] = useState(null);
    const [comment, setComment] = useState("");
    const [loading, setLoading] = useState(true);
    const [liking, setLiking] = useState(false);
    const [commenting, setCommenting] = useState(false);
    const [bookmarked, setBookmarked] = useState(false);

    useEffect(() => {
        let active = true;

        const load = async () => {
            setLoading(true);

            try {
                const response = await api.get(`/posts/${postId}`);

                if (active) {
                    setPost(response.data);
                }
            } catch (error) {
                if (active) {
                    toast.error(
                        formatApiError(error?.response?.data?.detail) ||
                            "Could not load post."
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
    }, [postId]);

    const toggleLike = async () => {
        if (!user) {
            toast.error("Sign in to like");
            return;
        }

        if (liking || !post) return;

        setLiking(true);

        try {
            const response = await api.post(
                `/posts/${postId}/like`
            );

            setPost((current) => ({
                ...current,
                liked: Boolean(response.data?.liked),
                like_count: Number(
                    response.data?.like_count ??
                        current.like_count ??
                        0
                ),
            }));
        } catch (error) {
            toast.error(
                formatApiError(error?.response?.data?.detail) ||
                    "Could not like"
            );
        } finally {
            setLiking(false);
        }
    };

    const sendComment = async (event) => {
        event.preventDefault();

        if (!user) {
            toast.error("Sign in to comment");
            return;
        }

        const text = comment.trim();

        if (!text || commenting || !post) return;

        setCommenting(true);

        try {
            const response = await api.post(
                `/posts/${postId}/comments`,
                { text }
            );

            setPost((current) => ({
                ...current,
                comments: [
                    ...(current.comments || []),
                    response.data,
                ],
                comment_count:
                    Number(current.comment_count || 0) + 1,
            }));

            setComment("");
        } catch (error) {
            toast.error(
                formatApiError(error?.response?.data?.detail) ||
                    "Could not post comment."
            );
        } finally {
            setCommenting(false);
        }
    };

    const sharePost = async () => {
        const url = window.location.href;

        try {
            if (navigator.share) {
                await navigator.share({
                    title: post?.caption || "Skiller post",
                    text: `Check out this post on Skiller`,
                    url,
                });
            } else if (navigator.clipboard) {
                await navigator.clipboard.writeText(url);
                toast.success("Post link copied");
            } else {
                toast.error("Could not copy post link.");
            }
        } catch {
            // User cancelled sharing.
        }
    };

    if (loading) {
        return (
            <div className="py-20 text-center text-muted-foreground">
                Loading post…
            </div>
        );
    }

    if (!post) {
        return (
            <div className="py-20 text-center text-muted-foreground">
                Post not found.
            </div>
        );
    }

    const author = post.author || {};

    const mediaUrl = fileSrc(post.media);

    return (
        <div
            className="mx-auto max-w-5xl px-4 py-6"
            data-testid="post-detail-page"
        >
            <Helmet>
                <title>
                    {post.caption
                        ? post.caption.slice(0, 60)
                        : `Post by @${author.username || "creator"}`}
                </title>

                <meta
                    name="description"
                    content={(
                        post.caption ||
                        `Post by @${
                            author.username || "creator"
                        } on Skiller`
                    ).slice(0, 160)}
                />

                <meta
                    property="og:type"
                    content={
                        post.media_type === "video"
                            ? "video.other"
                            : "article"
                    }
                />

                <meta
                    property="og:title"
                    content={
                        post.caption
                            ? post.caption.slice(0, 80)
                            : `Post by @${
                                  author.username || "creator"
                              }`
                    }
                />

                <meta
                    property="og:description"
                    content={(
                        post.caption ||
                        `Skiller post by @${
                            author.username || "creator"
                        }`
                    ).slice(0, 200)}
                />

                <meta
                    property="og:image"
                    content={
                        mediaUrl ||
                        "https://images.unsplash.com/photo-1648111320024-3a08e28d20ff?w=1200&q=80"
                    }
                />

                <meta
                    name="twitter:card"
                    content="summary_large_image"
                />

                <meta
                    name="twitter:image"
                    content={mediaUrl || ""}
                />

                {author.username && (
                    <meta
                        name="twitter:creator"
                        content={`@${author.username}`}
                    />
                )}
            </Helmet>

            <div className="grid grid-cols-1 gap-6 overflow-hidden rounded-2xl border border-border md:grid-cols-[1fr_360px]">
                <div className="bg-black">
                    {post.media_type === "video" ? (
                        <video
                            src={mediaUrl}
                            controls
                            playsInline
                            className="aspect-square w-full object-contain"
                        />
                    ) : (
                        <img
                            src={mediaUrl}
                            alt={post.caption || "Post"}
                            className="aspect-square w-full bg-black object-contain"
                        />
                    )}
                </div>

                <aside className="flex max-h-[80vh] flex-col">
                    <div className="flex items-center gap-3 border-b border-border p-4">
                        <Link
                            to={`/u/${author.username}`}
                            className="flex items-center gap-3"
                        >
                            <img
                                src={
                                    author.avatar_url ||
                                    `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(
                                        author.name || "S"
                                    )}`
                                }
                                alt=""
                                className="h-10 w-10 rounded-full border border-border object-cover"
                            />

                            <div>
                                <div className="text-sm font-semibold">
                                    @{author.username || "user"}
                                </div>

                                <div className="text-xs text-muted-foreground">
                                    {author.name}
                                </div>
                            </div>
                        </Link>
                    </div>

                    <div className="flex-1 space-y-3 overflow-auto p-4">
                        {post.caption && (
                            <div className="text-sm">
                                <span className="font-semibold">
                                    {author.username}
                                </span>{" "}
                                <span>{post.caption}</span>
                            </div>
                        )}

                        {(post.comments || []).map(
                            (item) => (
                                <div
                                    key={item.id}
                                    className="text-sm"
                                >
                                    <span className="font-semibold">
                                        {item.username}
                                    </span>{" "}
                                    <span>{item.text}</span>

                                    <div className="text-xs text-muted-foreground">
                                        {timeAgo(
                                            item.created_at
                                        )}{" "}
                                        ago
                                    </div>
                                </div>
                            )
                        )}
                    </div>

                    <div className="border-t border-border p-4">
                        <div className="mb-3 flex items-center gap-4">
                            <button
                                onClick={toggleLike}
                                disabled={liking}
                                data-testid="post-detail-like-btn"
                                className="active:scale-90 disabled:opacity-50"
                                aria-label={
                                    post.liked
                                        ? "Unlike post"
                                        : "Like post"
                                }
                            >
                                <Heart
                                    size={22}
                                    className={
                                        post.liked
                                            ? "animate-pop fill-destructive text-destructive"
                                            : ""
                                    }
                                />
                            </button>

                            <button
                                onClick={sharePost}
                                aria-label="Share post"
                            >
                                <Send size={22} />
                            </button>

                            <button
                                onClick={() =>
                                    setBookmarked(
                                        (value) => !value
                                    )
                                }
                                className="ml-auto"
                                aria-label={
                                    bookmarked
                                        ? "Remove bookmark"
                                        : "Bookmark post"
                                }
                            >
                                <Bookmark
                                    size={22}
                                    className={
                                        bookmarked
                                            ? "fill-current"
                                            : ""
                                    }
                                />
                            </button>
                        </div>

                        <div className="text-sm font-semibold">
                            {Number(
                                post.like_count || 0
                            )}{" "}
                            {Number(post.like_count || 0) ===
                            1
                                ? "like"
                                : "likes"}
                        </div>

                        <div className="text-xs text-muted-foreground">
                            {timeAgo(post.created_at)} ago
                        </div>

                        <form
                            onSubmit={sendComment}
                            className="mt-3 flex items-center gap-2 border-t border-border pt-3"
                        >
                            <input
                                value={comment}
                                onChange={(event) =>
                                    setComment(
                                        event.target.value
                                    )
                                }
                                placeholder="Add a comment…"
                                data-testid="post-detail-comment-input"
                                disabled={commenting}
                                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
                            />

                            <button
                                type="submit"
                                disabled={
                                    !comment.trim() ||
                                    commenting
                                }
                                data-testid="post-detail-comment-submit"
                                className="text-sm font-semibold text-primary disabled:opacity-40"
                            >
                                {commenting
                                    ? "Posting..."
                                    : "Post"}
                            </button>
                        </form>
                    </div>
                </aside>
            </div>
        </div>
    );
}
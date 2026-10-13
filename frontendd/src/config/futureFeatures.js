import {
    Bell,
    Bot,
    Compass,
    Film,
    ImagePlus,
    LayoutDashboard,
    Medal,
    MessageCircle,
    Search,
    Store,
    Users,
} from "lucide-react";

// Central registry for routes deliberately deferred because they are outside
// the current PRD. Keep their original page files; App.jsx points to this
// metadata instead of mounting those pages.
export const futureFeatures = {
    feed: { id: "feed", title: "Feed", description: "Social content feeds are planned for a future release.", icon: Users },
    reels: { id: "reels", title: "Reels", description: "Short-form creator reels are planned for a future release.", icon: Film },
    explore: { id: "explore", title: "Explore", description: "Social discovery is planned for a future release.", icon: Compass },
    upload: { id: "upload", title: "Creator uploads", description: "Social post uploads are planned for a future release.", icon: ImagePlus },
    profile: { id: "profile", title: "Social profiles", description: "Public social profiles are planned for a future release.", icon: Users },
    storefront: { id: "storefront", title: "Creator storefronts", description: "Public creator storefronts are planned for a future release.", icon: Store },
    post: { id: "post", title: "Post detail", description: "Social posts and comments are planned for a future release.", icon: ImagePlus },
    search: { id: "search", title: "Search", description: "Platform-wide social search is planned for a future release.", icon: Search },
    leaderboard: { id: "leaderboard", title: "Leaderboard", description: "Community leaderboards are planned for a future release.", icon: Medal },
    community: { id: "community", title: "Community", description: "Community groups and chat are planned for a future release.", icon: MessageCircle },
    notifications: { id: "notifications", title: "Social notifications", description: "Social notifications are planned for a future release.", icon: Bell },
    insights: { id: "insights", title: "Financial insights", description: "The current social and advertising metrics are deferred while PRD financial reporting is designed.", icon: LayoutDashboard },
    aiRecommendations: { id: "ai-recommendations", title: "AI recommendations", description: "Personalized social recommendations are planned for a future release.", icon: Bot },
    ads: { id: "ads", title: "Advertising", description: "Creator advertising is planned for a future release.", icon: LayoutDashboard },
};

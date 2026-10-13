import { create } from "zustand";
import { api, formatApiError } from "../lib/api";

export const useFeedStore = create((set, get) => ({
  posts: [],
  reels: [],
  creators: [],
  searchResults: [],
  loadingFeed: false,
  loadingReels: false,
  loadingSearch: false,
  feedError: null,
  reelsError: null,
  searchError: null,

  clearFeedError: () => set({ feedError: null }),

  fetchFeed: async (currentUsername = null) => {
    set({ loadingFeed: true, feedError: null });
    try {
      // Use Promise.allSettled to isolate feed posts and creator suggestions API calls
      const [feedResult, creatorsResult] = await Promise.allSettled([
        api.get("/posts/feed"),
        api.get("/users?limit=8"),
      ]);

      let postsData = [];
      let creatorsData = [];
      let feedErrMessage = null;

      if (feedResult.status === "fulfilled") {
        postsData = feedResult.value.data;
      } else {
        feedErrMessage = formatApiError(feedResult.reason?.response?.data?.detail) || "Feed service currently unavailable";
      }

      if (creatorsResult.status === "fulfilled" && Array.isArray(creatorsResult.value.data)) {
        creatorsData = creatorsResult.value.data
          .filter((u) => u.username !== currentUsername)
          .slice(0, 6);
      }

      set({
        posts: postsData,
        creators: creatorsData,
        feedError: feedErrMessage,
      });

      return { posts: postsData, creators: creatorsData };
    } catch (err) {
      const message = formatApiError(err.response?.data?.detail) || "Failed to load feed";
      set({ feedError: message });
      throw err;
    } finally {
      set({ loadingFeed: false });
    }
  },

  fetchReels: async (limit = 30) => {
    set({ loadingReels: true, reelsError: null });
    try {
      const { data } = await api.get(`/posts/reels?limit=${limit}`);
      set({ reels: data });
      return data;
    } catch (err) {
      const message = formatApiError(err.response?.data?.detail) || "Failed to load reels";
      set({ reelsError: message, reels: [] });
      return [];
    } finally {
      set({ loadingReels: false });
    }
  },

  searchContent: async (query, limit = 10) => {
    if (!query || !query.trim()) {
      set({ searchResults: [] });
      return [];
    }
    set({ loadingSearch: true, searchError: null });
    try {
      const { data } = await api.get(`/search?q=${encodeURIComponent(query)}&limit=${limit}`);
      set({ searchResults: data });
      return data;
    } catch (err) {
      const message = formatApiError(err.response?.data?.detail) || "Search failed";
      set({ searchError: message, searchResults: [] });
      return [];
    } finally {
      set({ loadingSearch: false });
    }
  },
}));

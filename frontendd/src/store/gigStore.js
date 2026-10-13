import { create } from "zustand";
import { api, formatApiError } from "../lib/api";

// Endpoint scope: every gig route in the 02 Sep 2026 backend handoff is wired here.
//   GET    /gigs                              marketplace listing
//   GET    /gigs/mine                         creator's own gigs
//   POST   /gigs                              create
//   PATCH  /gigs/{id}                         update
//   DELETE /gigs/{id}                         delete / delist
//   POST   /gigs/{id}/apply                   student application
//   GET    /gigs/{id}/applicants              owner applicant list
//   PATCH  /gigs/applications/{id}/status     owner status change
// The handoff defines no "my applications" route for students, so applied-state is
// kept as a local UX hint only (see APPLIED_STORAGE_KEY) and is never authoritative.

const APPLIED_STORAGE_KEY = "skiller_applied_gigs";

export const APPLICATION_STATUSES = [
  "applied",
  "shortlisted",
  "hired",
  "rejected",
];

export const GIG_SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "budget_desc", label: "Budget: high to low" },
  { value: "budget_asc", label: "Budget: low to high" },
  { value: "title", label: "Title A-Z" },
];

const DEFAULT_FILTERS = {
  search: "",
  category: "All",
  location: "All",
  minBudget: "",
  maxBudget: "",
  skill: "All",
  sort: "newest",
};

const readAppliedMap = () => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(APPLIED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeAppliedMap = (map) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(APPLIED_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage is a convenience only; a failure here must not break applying.
  }
};

const readAppliedIds = (userId) => {
  if (!userId) return [];
  const value = readAppliedMap()[String(userId)];
  return Array.isArray(value) ? value : [];
};

const buildFacet = (gigs, key) => [
  "All",
  ...new Set(gigs.map((gig) => gig?.[key]).filter(Boolean)),
];

const buildSkills = (gigs) => [
  "All",
  ...new Set(
    gigs.flatMap((gig) => (Array.isArray(gig?.skills) ? gig.skills : [])),
  ),
];

const syncGigInList = (gigs, updated) => {
  if (!updated?.id) return gigs;
  return gigs.map((gig) =>
    gig.id === updated.id ? { ...gig, ...updated } : gig,
  );
};

const isAlreadyApplied = (error) => {
  const detail = error?.response?.data?.detail;
  return typeof detail === "string" && /already applied/i.test(detail);
};

const gigTimestamp = (gig) =>
  new Date(gig?.created_at || gig?.createdAt || 0).getTime() || 0;

export const filterGigs = (gigs, filters) => {
  const query = filters.search.trim().toLowerCase();
  const min = filters.minBudget === "" ? null : Number(filters.minBudget);
  const max = filters.maxBudget === "" ? null : Number(filters.maxBudget);

  const matched = gigs.filter((gig) => {
    if (filters.category !== "All" && gig.category !== filters.category)
      return false;
    if (filters.location !== "All" && gig.location !== filters.location)
      return false;
    if (
      filters.skill !== "All" &&
      !(Array.isArray(gig.skills) ? gig.skills : []).includes(filters.skill)
    )
      return false;

    const budget = Number(gig.budget || 0);
    if (min !== null && !Number.isNaN(min) && budget < min) return false;
    if (max !== null && !Number.isNaN(max) && budget > max) return false;

    if (!query) return true;
    const haystack = [
      gig.title,
      gig.description,
      gig.category,
      gig.location,
      ...(Array.isArray(gig.skills) ? gig.skills : []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  const sorted = [...matched];
  switch (filters.sort) {
    case "budget_desc":
      sorted.sort((a, b) => Number(b.budget || 0) - Number(a.budget || 0));
      break;
    case "budget_asc":
      sorted.sort((a, b) => Number(a.budget || 0) - Number(b.budget || 0));
      break;
    case "title":
      sorted.sort((a, b) =>
        String(a.title || "").localeCompare(String(b.title || "")),
      );
      break;
    default:
      sorted.sort((a, b) => gigTimestamp(b) - gigTimestamp(a));
  }
  return sorted;
};

export const useGigStore = create((set, get) => ({
  gigs: [],
  myGigs: [],
  applicantsByGig: {},
  appliedGigIds: [],

  categories: ["All"],
  locations: ["All"],
  skills: ["All"],
  filters: { ...DEFAULT_FILTERS },

  loading: false,
  myGigsLoading: false,
  applicantsLoading: null,
  submitting: false,
  deleting: false,
  statusUpdatingId: null,

  gigLoadError: null,
  myGigsError: null,
  applicantsError: null,
  gigActionError: null,

  setFilter: (key, value) =>
    set((state) => ({ filters: { ...state.filters, [key]: value } })),
  // Kept for callers that filter by category alone.
  setCategory: (category) =>
    set((state) => ({ filters: { ...state.filters, category } })),
  resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),

  clearGigLoadError: () => set({ gigLoadError: null }),
  clearGigActionError: () => set({ gigActionError: null }),
  clearApplicantsError: () => set({ applicantsError: null }),

  hydrateAppliedGigs: (userId) => set({ appliedGigIds: readAppliedIds(userId) }),

  markGigApplied: (userId, gigId) => {
    if (!userId || !gigId) return;
    const map = readAppliedMap();
    const key = String(userId);
    const next = new Set(Array.isArray(map[key]) ? map[key] : []);
    next.add(gigId);
    map[key] = [...next];
    writeAppliedMap(map);
    set({ appliedGigIds: map[key] });
  },

  visibleGigs: () => filterGigs(get().gigs, get().filters),

  fetchGigs: async () => {
    set({ loading: true, gigLoadError: null });
    try {
      const { data } = await api.get("/gigs");
      const nextGigs = Array.isArray(data) ? data : [];
      set({
        gigs: nextGigs,
        categories: buildFacet(nextGigs, "category"),
        locations: buildFacet(nextGigs, "location"),
        skills: buildSkills(nextGigs),
      });
      return nextGigs;
    } catch (err) {
      set({
        gigLoadError:
          formatApiError(err.response?.data?.detail) || "Failed to load gigs.",
      });
      throw err;
    } finally {
      set({ loading: false });
    }
  },

  fetchMyGigs: async () => {
    set({ myGigsLoading: true, myGigsError: null });
    try {
      const { data } = await api.get("/gigs/mine");
      const nextGigs = Array.isArray(data) ? data : [];
      set({ myGigs: nextGigs });
      return nextGigs;
    } catch (err) {
      set({
        myGigsError:
          formatApiError(err.response?.data?.detail) ||
          "Failed to load your gigs.",
      });
      throw err;
    } finally {
      set({ myGigsLoading: false });
    }
  },

  createGig: async (gigPayload) => {
    set({ submitting: true, gigActionError: null });
    try {
      const { data } = await api.post("/gigs", gigPayload);
      await Promise.all([
        get().fetchGigs().catch(() => {}),
        get().fetchMyGigs().catch(() => {}),
      ]);
      return data;
    } catch (err) {
      set({
        gigActionError:
          formatApiError(err.response?.data?.detail) || "Failed to post gig.",
      });
      throw err;
    } finally {
      set({ submitting: false });
    }
  },

  updateGig: async (gigId, patch) => {
    set({ submitting: true, gigActionError: null });
    try {
      const { data } = await api.patch(`/gigs/${gigId}`, patch);
      // The PATCH response shape is not pinned by the handoff, so merge whatever
      // came back over the local record and fall back to the payload we sent.
      const merged = { id: gigId, ...patch, ...(data || {}) };
      set((state) => ({
        gigs: syncGigInList(state.gigs, merged),
        myGigs: syncGigInList(state.myGigs, merged),
      }));
      return merged;
    } catch (err) {
      set({
        gigActionError:
          formatApiError(err.response?.data?.detail) || "Failed to update gig.",
      });
      throw err;
    } finally {
      set({ submitting: false });
    }
  },

  deleteGig: async (gigId) => {
    set({ deleting: true, gigActionError: null });
    try {
      const { data } = await api.delete(`/gigs/${gigId}`);
      set((state) => {
        const applicantsByGig = { ...state.applicantsByGig };
        delete applicantsByGig[gigId];
        return {
          gigs: state.gigs.filter((gig) => gig.id !== gigId),
          myGigs: state.myGigs.filter((gig) => gig.id !== gigId),
          applicantsByGig,
        };
      });
      return data;
    } catch (err) {
      set({
        gigActionError:
          formatApiError(err.response?.data?.detail) || "Failed to delete gig.",
      });
      throw err;
    } finally {
      set({ deleting: false });
    }
  },

  // POST /gigs/{id}/apply commits the application and then fails to return
  // cleanly. Verified against the deployed backend from two directions: the
  // call answers 500 with a plain-text body, or the connection simply dies
  // after ~30s with no HTTP response at all — and in both cases the very next
  // call answers 400 "Already applied" in ~100ms, proving the write landed.
  // Whichever attempt commits is the attempt that fails, so one retry is not
  // enough; keep posting until the backend reports the application as existing.
  // Re-posting is safe because the backend refuses to create a duplicate.
  applyForGig: async (gigId, { message = "" } = {}) => {
    set({ submitting: true, gigActionError: null });
    const MAX_ATTEMPTS = 3;
    let lastError = null;

    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
          const { data } = await api.post(`/gigs/${gigId}/apply`, { message });
          return data;
        } catch (err) {
          lastError = err;
          const status = err.response?.status;

          // The backend already holds an application for this gig; whether this
          // call or an earlier failed one created it, the outcome is the same.
          if (status === 400 && isAlreadyApplied(err)) {
            return { already_applied: true, recovered: attempt > 1 };
          }

          // Retry the commit-then-fail shapes: a server error, or no response
          // at all (dropped connection / timeout), which is what the browser
          // actually sees against the deployed backend.
          if (!err.response || status >= 500) continue;

          set({
            gigActionError:
              formatApiError(err.response?.data?.detail) ||
              "Gig application failed.",
          });
          throw err;
        }
      }

      set({
        gigActionError:
          "The server did not confirm your application. Reload the gig in a moment to check before re-applying.",
      });
      throw lastError;
    } finally {
      set({ submitting: false });
    }
  },

  fetchApplicants: async (gigId) => {
    set({ applicantsLoading: gigId, applicantsError: null });
    try {
      const { data } = await api.get(`/gigs/${gigId}/applicants`);
      // The endpoint answers { gig, applications: [...] }, not a bare array.
      // Reading it as an array yielded an empty list on every gig.
      const applicants = Array.isArray(data)
        ? data
        : Array.isArray(data?.applications)
          ? data.applications
          : [];
      set((state) => ({
        applicantsByGig: { ...state.applicantsByGig, [gigId]: applicants },
      }));
      return applicants;
    } catch (err) {
      set({
        applicantsError:
          formatApiError(err.response?.data?.detail) ||
          "Failed to load applicants.",
      });
      throw err;
    } finally {
      set({ applicantsLoading: null });
    }
  },

  updateApplicationStatus: async (applicationId, status, gigId) => {
    set({ statusUpdatingId: applicationId, gigActionError: null });
    try {
      const { data } = await api.patch(
        `/gigs/applications/${applicationId}/status`,
        { status },
      );
      const nextStatus = data?.status || status;
      if (gigId) {
        set((state) => ({
          applicantsByGig: {
            ...state.applicantsByGig,
            [gigId]: (state.applicantsByGig[gigId] || []).map((application) =>
              application.id === applicationId
                ? { ...application, status: nextStatus }
                : application,
            ),
          },
        }));
      }
      return data;
    } catch (err) {
      set({
        gigActionError:
          formatApiError(err.response?.data?.detail) ||
          "Failed to update application status.",
      });
      throw err;
    } finally {
      set({ statusUpdatingId: null });
    }
  },
}));

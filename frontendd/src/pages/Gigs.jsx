import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Briefcase,
  CheckCircle2,
  IndianRupee,
  Loader2,
  MapPin,
  Plus,
  Search,
  SlidersHorizontal,
  Tag,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "../store/authStore";
import {
  useGigStore,
  filterGigs,
  GIG_SORTS,
} from "../store/gigStore";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Skeleton } from "../components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "../components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import GigFormDialog from "../components/GigFormDialog";

const APPLY_MESSAGE_LIMIT = 1200;

const money = (amount) =>
  Number(amount || 0).toLocaleString("en-IN");

const isOwnGig = (gig, user) => {
  if (!user) return false;

  const owner =
    gig.owner_id ??
    gig.creator_id ??
    gig.posted_by ??
    gig.user_id;

  return (
    owner != null &&
    String(owner) === String(user.id)
  );
};

export default function Gigs() {
  const user = useAuthStore((state) => state.user);

  const isCreator =
    user?.role === "creator" ||
    user?.role === "admin";

  const gigs = useGigStore((state) => state.gigs);
  const categories = useGigStore(
    (state) => state.categories,
  );
  const locations = useGigStore(
    (state) => state.locations,
  );
  const skills = useGigStore(
    (state) => state.skills,
  );
  const filters = useGigStore(
    (state) => state.filters,
  );

  const loading = useGigStore(
    (state) => state.loading,
  );
  const submitting = useGigStore(
    (state) => state.submitting,
  );
  const gigLoadError = useGigStore(
    (state) => state.gigLoadError,
  );
  const appliedGigIds = useGigStore(
    (state) => state.appliedGigIds,
  );

  const setFilter = useGigStore(
    (state) => state.setFilter,
  );
  const resetFilters = useGigStore(
    (state) => state.resetFilters,
  );
  const fetchGigs = useGigStore(
    (state) => state.fetchGigs,
  );
  const applyForGig = useGigStore(
    (state) => state.applyForGig,
  );
  const createGig = useGigStore(
    (state) => state.createGig,
  );
  const hydrateAppliedGigs = useGigStore(
    (state) => state.hydrateAppliedGigs,
  );
  const markGigApplied = useGigStore(
    (state) => state.markGigApplied,
  );

  const [detailGig, setDetailGig] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [applyGig, setApplyGig] = useState(null);
  const [message, setMessage] = useState("");
  const [postOpen, setPostOpen] = useState(false);
  const [showFilters, setShowFilters] =
    useState(false);

  useEffect(() => {
    fetchGigs().catch(() => {});
  }, [fetchGigs]);

  useEffect(() => {
    hydrateAppliedGigs(user?.id);
  }, [hydrateAppliedGigs, user?.id]);

  const visible = useMemo(
    () => filterGigs(gigs, filters),
    [gigs, filters],
  );

  const activeFilterCount = [
    filters.category !== "All",
    filters.location !== "All",
    filters.skill !== "All",
    filters.minBudget !== "",
    filters.maxBudget !== "",
  ].filter(Boolean).length;

  const hasApplied = (gigId) =>
    appliedGigIds.includes(gigId);

  const openDetail = (gig) => {
    setDetailGig(gig);
    setDetailOpen(true);
  };

  const openApply = (gig) => {
    if (!user) {
      toast.error("Sign in to apply for gigs");
      return;
    }

    setDetailOpen(false);
    setApplyGig(gig);
    setMessage("");
  };

  const submitApply = async () => {
    if (!applyGig) return;

    try {
      const result = await applyForGig(
        applyGig.id,
        { message },
      );

      markGigApplied(
        user?.id,
        applyGig.id,
      );

      if (
        result?.already_applied &&
        !result?.recovered
      ) {
        toast.success(
          "You had already applied to this gig.",
        );
      } else {
        toast.success("Application sent.");
      }

      setApplyGig(null);
      setMessage("");
    } catch (error) {
      const status = error.response?.status;
      const reason =
        useGigStore.getState().gigActionError;

      if (status === 401) {
        toast.error(
          "Your session expired. Sign in again to apply.",
        );
      } else if (status === 403) {
        toast.error(
          reason ||
            "This account is not allowed to apply for gigs.",
        );
      } else {
        toast.error(
          reason || "Gig application failed",
        );
      }
    }
  };

  const submitNewGig = async (payload) => {
    try {
      await createGig(payload);
      toast.success("Gig posted.");
      setPostOpen(false);
    } catch {
      toast.error(
        useGigStore.getState().gigActionError ||
          "Failed to post gig",
      );
    }
  };

  return (
    <div
      className="mx-auto max-w-6xl px-4 py-6"
      data-testid="gigs-page"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Marketplace
          </p>

          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight md:text-3xl">
            Open gigs
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            Real projects. Real budgets. Apply with one
            click.
          </p>
        </div>

        {isCreator && (
          <div className="flex flex-wrap gap-2">
            <Button
              asChild
              variant="outline"
              className="rounded-full"
              data-testid="manage-gigs-link"
            >
              <Link to="/gigs/manage">
                <Briefcase
                  size={15}
                  className="mr-1.5"
                />
                My gigs
              </Link>
            </Button>

            <Button
              onClick={() => setPostOpen(true)}
              className="rounded-full"
              data-testid="post-gig-btn"
            >
              <Plus
                size={15}
                className="mr-1.5"
              />
              Post a gig
            </Button>
          </div>
        )}
      </div>

      <div className="mb-5 space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />

            <Input
              value={filters.search}
              onChange={(event) =>
                setFilter(
                  "search",
                  event.target.value,
                )
              }
              placeholder="Search by title, skill or location"
              className="rounded-full pl-10"
              data-testid="gig-search-input"
            />

            {filters.search && (
              <button
                type="button"
                onClick={() =>
                  setFilter("search", "")
                }
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <Select
            value={filters.sort}
            onValueChange={(value) =>
              setFilter("sort", value)
            }
          >
            <SelectTrigger
              className="w-[190px] rounded-full"
              data-testid="gig-sort-select"
            >
              <SelectValue placeholder="Sort" />
            </SelectTrigger>

            <SelectContent>
              {GIG_SORTS.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            onClick={() =>
              setShowFilters((prev) => !prev)
            }
            className="rounded-full"
            data-testid="gig-filters-toggle"
          >
            <SlidersHorizontal
              size={15}
              className="mr-1.5"
            />
            Filters

            {activeFilterCount > 0 && (
              <span className="ml-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>

        <div
          className="flex flex-wrap gap-2"
          data-testid="gig-category-chips"
        >
          {categories.map((category) => (
            <button
              type="button"
              key={category}
              onClick={() =>
                setFilter("category", category)
              }
              data-testid={`gig-filter-${category}`}
              className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                filters.category === category
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-accent"
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {showFilters && (
          <div
            className="grid grid-cols-1 gap-4 rounded-2xl border border-border p-4 sm:grid-cols-2 lg:grid-cols-4"
            data-testid="gig-filters-panel"
          >
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">
                Location
              </Label>

              <Select
                value={filters.location}
                onValueChange={(value) =>
                  setFilter(
                    "location",
                    value,
                  )
                }
              >
                <SelectTrigger
                  className="rounded-xl"
                  data-testid="gig-location-filter"
                >
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  {locations.map((location) => (
                    <SelectItem
                      key={location}
                      value={location}
                    >
                      {location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">
                Skill
              </Label>

              <Select
                value={filters.skill}
                onValueChange={(value) =>
                  setFilter("skill", value)
                }
              >
                <SelectTrigger
                  className="rounded-xl"
                  data-testid="gig-skill-filter"
                >
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  {skills.map((skill) => (
                    <SelectItem
                      key={skill}
                      value={skill}
                    >
                      {skill}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="gig-min-budget"
                className="text-xs uppercase tracking-widest text-muted-foreground"
              >
                Min budget
              </Label>

              <Input
                id="gig-min-budget"
                type="number"
                min={0}
                value={filters.minBudget}
                onChange={(event) =>
                  setFilter(
                    "minBudget",
                    event.target.value,
                  )
                }
                placeholder="0"
                className="rounded-xl"
                data-testid="gig-min-budget-filter"
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="gig-max-budget"
                className="text-xs uppercase tracking-widest text-muted-foreground"
              >
                Max budget
              </Label>

              <Input
                id="gig-max-budget"
                type="number"
                min={0}
                value={filters.maxBudget}
                onChange={(event) =>
                  setFilter(
                    "maxBudget",
                    event.target.value,
                  )
                }
                placeholder="Any"
                className="rounded-xl"
                data-testid="gig-max-budget-filter"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-4">
              <Button
                variant="ghost"
                onClick={resetFilters}
                className="rounded-full"
                data-testid="gig-reset-filters"
              >
                Reset filters
              </Button>
            </div>
          </div>
        )}
      </div>

      {!loading &&
        !gigLoadError &&
        gigs.length > 0 && (
          <p
            className="mb-3 text-sm text-muted-foreground"
            data-testid="gig-count"
          >
            {visible.length} of {gigs.length} gigs
          </p>
        )}

      {loading ? (
        <div
          className="space-y-3"
          data-testid="gigs-loading"
        >
          {[0, 1, 2].map((key) => (
            <div
              key={key}
              className="rounded-2xl border border-border p-5"
            >
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-3 h-5 w-2/3" />
              <Skeleton className="mt-2 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-4/5" />
            </div>
          ))}
        </div>
      ) : gigLoadError ? (
        <div
          className="rounded-2xl border border-destructive/30 bg-destructive/5 p-10 text-center text-sm text-destructive"
          data-testid="gigs-error"
        >
          <p>{gigLoadError}</p>

          <Button
            variant="outline"
            className="mt-4 rounded-full"
            onClick={() =>
              fetchGigs().catch(() => {})
            }
            data-testid="gigs-retry-btn"
          >
            Try again
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed border-border p-12 text-center"
          data-testid="gigs-empty"
        >
          <Briefcase
            size={26}
            className="mx-auto mb-3 text-muted-foreground"
            aria-hidden
          />

          <p className="font-display text-lg font-bold">
            {gigs.length === 0
              ? "No gigs posted yet"
              : "No gigs match these filters"}
          </p>

          <p className="mt-1 text-sm text-muted-foreground">
            {gigs.length === 0
              ? "Check back soon, or post the first one."
              : "Widen the budget range or clear a filter to see more."}
          </p>

          {gigs.length > 0 && (
            <Button
              variant="outline"
              className="mt-4 rounded-full"
              onClick={resetFilters}
            >
              Reset filters
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((gig) => {
            const owned = isOwnGig(gig, user);
            const applied = hasApplied(gig.id);

            return (
              <article
                key={gig.id}
                className="flex cursor-pointer flex-col gap-4 rounded-2xl border border-border p-5 transition-all hover:border-primary/40 md:flex-row md:items-center"
                data-testid={`gig-${gig.id}`}
                onClick={() => openDetail(gig)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {gig.category && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold">
                        {gig.category}
                      </span>
                    )}

                    {gig.location && (
                      <span className="flex items-center gap-1">
                        <MapPin size={12} />
                        {gig.location}
                      </span>
                    )}

                    {owned && (
                      <span className="rounded-full border border-primary/40 px-2 py-0.5 font-semibold text-primary">
                        Your gig
                      </span>
                    )}
                  </div>

                  <h3 className="mt-2 font-display text-lg font-bold leading-tight">
                    {gig.title}
                  </h3>

                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {gig.description}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    {(gig.skills || []).map(
                      (skill) => (
                        <span
                          key={skill}
                          className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5"
                        >
                          <Tag size={10} />
                          {skill}
                        </span>
                      ),
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 md:flex-col md:items-end">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">
                      Budget
                    </div>

                    <div className="flex items-center font-display text-xl font-bold">
                      <IndianRupee size={16} />
                      {money(gig.budget)}
                    </div>
                  </div>

                  {owned ? (
                    <Button
                      asChild
                      variant="outline"
                      className="rounded-full"
                      onClick={(event) =>
                        event.stopPropagation()
                      }
                    >
                      <Link to="/gigs/manage">
                        Manage
                      </Link>
                    </Button>
                  ) : applied ? (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm text-muted-foreground"
                      data-testid={`gig-applied-${gig.id}`}
                    >
                      <CheckCircle2 size={14} />
                      Applied
                    </span>
                  ) : (
                    <Button
                      onClick={(event) => {
                        event.stopPropagation();
                        openApply(gig);
                      }}
                      className="rounded-full"
                      data-testid={`apply-gig-${gig.id}`}
                    >
                      Apply
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Sheet
        open={detailOpen}
        onOpenChange={(value) => {
          if (!value) setDetailOpen(false);
        }}
      >
        <SheetContent
          className="w-full overflow-y-auto sm:max-w-lg"
          data-testid="gig-detail-sheet"
        >
          {detailGig && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle className="font-display text-xl">
                  {detailGig.title}
                </SheetTitle>

                <SheetDescription className="flex flex-wrap items-center gap-2 text-xs">
                  {detailGig.category && (
                    <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground">
                      {detailGig.category}
                    </span>
                  )}

                  {detailGig.location && (
                    <span className="flex items-center gap-1">
                      <MapPin size={12} />
                      {detailGig.location}
                    </span>
                  )}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-5 rounded-2xl border border-border p-4">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">
                  Budget
                </div>

                <div className="mt-1 flex items-center font-display text-2xl font-bold">
                  <IndianRupee size={18} />
                  {money(detailGig.budget)}
                </div>
              </div>

              <div className="mt-5">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  About this gig
                </h3>

                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">
                  {detailGig.description ||
                    "No description provided."}
                </p>
              </div>

              {(detailGig.skills || []).length >
                0 && (
                <div className="mt-5">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Skills
                  </h3>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {detailGig.skills.map(
                      (skill) => (
                        <span
                          key={skill}
                          className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs"
                        >
                          <Tag size={10} />
                          {skill}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              )}

              <div className="mt-6">
                {isOwnGig(detailGig, user) ? (
                  <Button
                    asChild
                    variant="outline"
                    className="w-full rounded-full"
                  >
                    <Link to="/gigs/manage">
                      Manage this gig
                    </Link>
                  </Button>
                ) : hasApplied(detailGig.id) ? (
                  <div className="rounded-full border border-border px-4 py-2.5 text-center text-sm text-muted-foreground">
                    <CheckCircle2
                      size={14}
                      className="mr-1.5 inline"
                    />
                    Application sent
                  </div>
                ) : (
                  <Button
                    className="w-full rounded-full"
                    onClick={() =>
                      openApply(detailGig)
                    }
                    data-testid="gig-detail-apply-btn"
                  >
                    Apply for this gig
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog
        open={Boolean(applyGig)}
        onOpenChange={(value) => {
          if (!value && !submitting) {
            setApplyGig(null);
          }
        }}
      >
        <DialogContent data-testid="apply-dialog">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              Apply - {applyGig?.title}
            </DialogTitle>

            <DialogDescription>
              Tell the poster why you fit. Links to past
              work help.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Textarea
              rows={6}
              maxLength={APPLY_MESSAGE_LIMIT}
              placeholder="Why you? Links, experience, timeline."
              value={message}
              onChange={(event) =>
                setMessage(event.target.value)
              }
              data-testid="apply-message-input"
              className="rounded-xl"
            />

            <p className="text-right text-xs text-muted-foreground">
              {message.length}/
              {APPLY_MESSAGE_LIMIT}
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setApplyGig(null)}
              disabled={submitting}
              className="rounded-full"
            >
              Cancel
            </Button>

            <Button
              onClick={submitApply}
              disabled={submitting}
              className="rounded-full"
              data-testid="apply-submit-btn"
            >
              {submitting && (
                <Loader2
                  size={14}
                  className="mr-1.5 animate-spin"
                />
              )}

              {submitting
                ? "Sending..."
                : "Send application"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GigFormDialog
        open={postOpen}
        onOpenChange={setPostOpen}
        submitting={submitting}
        onSubmit={submitNewGig}
      />
    </div>
  );
}
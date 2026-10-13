import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Briefcase,
  ChevronDown,
  Edit3,
  IndianRupee,
  Loader2,
  Mail,
  MapPin,
  Plus,
  Tag,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useGigStore } from "../store/gigStore";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import DeleteConfirmModal from "../components/DeleteConfirmModal";
import GigFormDialog from "../components/GigFormDialog";

const money = (amount) =>
  `Rs ${Number(amount || 0).toLocaleString("en-IN")}`;

const STATUS_CLASS = {
  pending: "bg-secondary text-muted-foreground",
  applied: "bg-secondary text-muted-foreground",
  hired: "bg-primary/10 text-primary",
  shortlisted: "bg-amber-500/10 text-amber-600",
  rejected: "bg-secondary text-muted-foreground line-through",
};

const applicantCount = (gig, applicants) =>
  applicants?.length ??
  gig.application_count ??
  gig.applications_count ??
  gig.applicants_count ??
  (Array.isArray(gig.applications)
    ? gig.applications.length
    : null);

export function GigManagerSection({ embedded = false }) {
  const myGigs = useGigStore((state) => state.myGigs);
  const myGigsLoading = useGigStore(
    (state) => state.myGigsLoading,
  );
  const myGigsError = useGigStore(
    (state) => state.myGigsError,
  );

  const applicantsByGig = useGigStore(
    (state) => state.applicantsByGig,
  );
  const applicantsLoading = useGigStore(
    (state) => state.applicantsLoading,
  );
  const applicantsError = useGigStore(
    (state) => state.applicantsError,
  );

  const submitting = useGigStore(
    (state) => state.submitting,
  );
  const deleting = useGigStore(
    (state) => state.deleting,
  );
  const statusUpdatingId = useGigStore(
    (state) => state.statusUpdatingId,
  );

  const fetchMyGigs = useGigStore(
    (state) => state.fetchMyGigs,
  );
  const fetchApplicants = useGigStore(
    (state) => state.fetchApplicants,
  );
  const createGig = useGigStore(
    (state) => state.createGig,
  );
  const updateGig = useGigStore(
    (state) => state.updateGig,
  );
  const deleteGig = useGigStore(
    (state) => state.deleteGig,
  );
  const updateApplicationStatus = useGigStore(
    (state) => state.updateApplicationStatus,
  );

  const [expandedId, setExpandedId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingGig, setEditingGig] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    fetchMyGigs().catch(() => {});
  }, [fetchMyGigs]);

  const toggleGig = (gigId) => {
    const next =
      expandedId === gigId ? null : gigId;

    setExpandedId(next);

    if (next && !applicantsByGig[next]) {
      fetchApplicants(next).catch(() => {
        toast.error(
          useGigStore.getState().applicantsError ||
            "Failed to load applicants",
        );
      });
    }
  };

  const openCreate = () => {
    setEditingGig(null);
    setFormOpen(true);
  };

  const openEdit = (gig) => {
    setEditingGig(gig);
    setFormOpen(true);
  };

  const submitForm = async (payload) => {
    try {
      if (editingGig) {
        await updateGig(editingGig.id, payload);
        toast.success("Gig updated.");
      } else {
        await createGig(payload);
        toast.success("Gig posted.");
      }

      setFormOpen(false);
      setEditingGig(null);
    } catch {
      toast.error(
        useGigStore.getState().gigActionError ||
          "Could not save gig",
      );
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      await deleteGig(deleteTarget.id);
      toast.success("Gig deleted.");

      if (expandedId === deleteTarget.id) {
        setExpandedId(null);
      }

      setDeleteTarget(null);
    } catch {
      toast.error(
        useGigStore.getState().gigActionError ||
          "Could not delete gig",
      );
    }
  };

  const setStatus = async (
    application,
    status,
    gigId,
  ) => {
    try {
      await updateApplicationStatus(
        application.id,
        status,
        gigId,
      );

      toast.success(`Marked ${status}.`);
    } catch {
      toast.error(
        useGigStore.getState().gigActionError ||
          "Could not update application",
      );
    }
  };

  const totalBudget = myGigs.reduce(
    (total, gig) =>
      total + Number(gig.budget || 0),
    0,
  );

  const knownApplicants = myGigs.reduce(
    (total, gig) => {
      const count = applicantCount(
        gig,
        applicantsByGig[gig.id],
      );

      return total + (count || 0);
    },
    0,
  );

  const Heading = embedded ? "h2" : "h1";

  return (
    <div
      data-testid={
        embedded
          ? "gig-manager-section"
          : "gig-manager-page"
      }
    >
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Gig manager
          </p>

          <Heading
            className={`mt-1 font-display font-bold tracking-tight ${
              embedded ? "text-2xl" : "text-3xl"
            }`}
          >
            My gigs
          </Heading>

          <p className="mt-1 text-sm text-muted-foreground">
            Post work, review applicants and move them
            through your pipeline.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {!embedded && (
            <Button
              asChild
              variant="outline"
              className="rounded-full"
            >
              <Link to="/gigs">
                Browse marketplace
              </Link>
            </Button>
          )}

          <Button
            onClick={openCreate}
            className="rounded-full"
            data-testid="new-gig-btn"
          >
            <Plus
              size={15}
              className="mr-1.5"
            />
            Post a gig
          </Button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Metric
          label="Gigs"
          value={myGigs.length}
          icon={Briefcase}
        />

        <Metric
          label="Applicants"
          value={knownApplicants}
          icon={Users}
        />

        <Metric
          label="Budget posted"
          value={money(totalBudget)}
          icon={IndianRupee}
        />
      </div>

      {myGigsLoading ? (
        <div
          className="space-y-3"
          data-testid="my-gigs-loading"
        >
          {[0, 1].map((key) => (
            <div
              key={key}
              className="rounded-2xl border border-border p-5"
            >
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="mt-2 h-4 w-1/3" />
            </div>
          ))}
        </div>
      ) : myGigsError ? (
        <div
          className="rounded-2xl border border-destructive/30 bg-destructive/5 p-10 text-center text-sm text-destructive"
          data-testid="my-gigs-error"
        >
          <p>{myGigsError}</p>

          <Button
            variant="outline"
            className="mt-4 rounded-full"
            onClick={() =>
              fetchMyGigs().catch(() => {})
            }
            data-testid="my-gigs-retry-btn"
          >
            Try again
          </Button>
        </div>
      ) : myGigs.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed border-border p-12 text-center"
          data-testid="my-gigs-empty"
        >
          <Briefcase
            size={26}
            className="mx-auto mb-3 text-muted-foreground"
            aria-hidden
          />

          <p className="font-display text-lg font-bold">
            No gigs posted yet
          </p>

          <p className="mt-1 text-sm text-muted-foreground">
            Post your first gig and applicants will land
            here.
          </p>

          <Button
            onClick={openCreate}
            className="mt-4 rounded-full"
          >
            <Plus
              size={15}
              className="mr-1.5"
            />
            Post a gig
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {myGigs.map((gig) => {
            const applicants =
              applicantsByGig[gig.id];

            const expanded =
              expandedId === gig.id;

            const count = applicantCount(
              gig,
              applicants,
            );

            return (
              <div
                key={gig.id}
                className="overflow-hidden rounded-2xl border border-border"
                data-testid={`my-gig-${gig.id}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3 p-5">
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

                      <span className="flex items-center gap-1">
                        <IndianRupee size={12} />
                        {Number(
                          gig.budget || 0,
                        ).toLocaleString("en-IN")}
                      </span>
                    </div>

                    <div className="mt-1.5 font-display text-lg font-bold leading-tight">
                      {gig.title}
                    </div>

                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {gig.description}
                    </p>

                    {(gig.skills || []).length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs">
                        {gig.skills.map((skill) => (
                          <span
                            key={skill}
                            className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5"
                          >
                            <Tag size={10} />
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        openEdit(gig)
                      }
                      className="grid h-9 w-9 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      title="Edit gig"
                      data-testid={`edit-gig-${gig.id}`}
                    >
                      <Edit3 size={15} />
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setDeleteTarget(gig)
                      }
                      className="grid h-9 w-9 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                      title="Delete gig"
                      data-testid={`delete-gig-${gig.id}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    toggleGig(gig.id)
                  }
                  className="flex w-full items-center justify-between border-t border-border px-5 py-3 text-sm font-medium transition-colors hover:bg-accent"
                  data-testid={`toggle-applicants-${gig.id}`}
                >
                  <span className="flex items-center gap-2">
                    <Users
                      size={15}
                      className="text-muted-foreground"
                    />

                    {count === null
                      ? "View applicants"
                      : `${count} applicant${
                          count === 1
                            ? ""
                            : "s"
                        }`}
                  </span>

                  <ChevronDown
                    size={16}
                    className={`text-muted-foreground transition-transform ${
                      expanded
                        ? "rotate-180"
                        : ""
                    }`}
                  />
                </button>

                {expanded && (
                  <div className="border-t border-border">
                    {applicantsLoading ===
                    gig.id ? (
                      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                        <Loader2
                          size={15}
                          className="animate-spin"
                        />
                        Loading applicants...
                      </div>
                    ) : !applicants ? (
                      <div className="px-5 py-8 text-center text-sm text-destructive">
                        {applicantsError ||
                          "Could not load applicants."}

                        <div>
                          <Button
                            variant="outline"
                            className="mt-3 rounded-full"
                            onClick={() =>
                              fetchApplicants(
                                gig.id,
                              ).catch(() => {})
                            }
                          >
                            Try again
                          </Button>
                        </div>
                      </div>
                    ) : applicants.length ===
                      0 ? (
                      <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                        No applications yet.
                      </div>
                    ) : (
                      <div className="divide-y divide-border/60">
                        {applicants.map(
                          (application) => (
                            <ApplicantRow
                              key={
                                application.id
                              }
                              application={
                                application
                              }
                              gigId={gig.id}
                              busy={
                                statusUpdatingId ===
                                application.id
                              }
                              onSetStatus={
                                setStatus
                              }
                            />
                          ),
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <GigFormDialog
        open={formOpen}
        onOpenChange={(value) => {
          setFormOpen(value);

          if (!value) {
            setEditingGig(null);
          }
        }}
        gig={editingGig}
        submitting={submitting}
        onSubmit={submitForm}
      />

      <DeleteConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete gig"
        description="This delists the gig. Applications received for it will no longer be reachable."
        itemName={deleteTarget?.title}
        confirmText="Delete gig"
        loading={deleting}
      />
    </div>
  );
}

function ApplicantRow({
  application,
  gigId,
  busy,
  onSetStatus,
}) {
  const name =
    application.name ||
    application.user?.name ||
    "Applicant";

  const username =
    application.username ||
    application.user?.username;

  const email =
    application.email ||
    application.user?.email;

  const avatar =
    application.avatar_url ||
    application.user?.avatar_url;

  const status =
    application.status || "applied";

  return (
    <div
      className="flex flex-col gap-3 p-5 md:flex-row md:items-center"
      data-testid={`gig-app-${application.id}`}
    >
      <img
        src={
          avatar ||
          `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(
            name,
          )}`
        }
        alt=""
        className="h-10 w-10 rounded-full border border-border object-cover"
      />

      <div className="min-w-0 flex-1">
        {username ? (
          <Link
            to={`/u/${username}`}
            className="text-sm font-semibold hover:underline"
          >
            @{username}
          </Link>
        ) : (
          <span className="text-sm font-semibold">
            {name}
          </span>
        )}

        <div className="text-xs text-muted-foreground">
          {[name, email]
            .filter(Boolean)
            .join(" - ")}
        </div>

        {application.message && (
          <p className="mt-1.5 whitespace-pre-line text-sm">
            {application.message}
          </p>
        )}
      </div>

      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${
          STATUS_CLASS[status] ||
          "bg-secondary text-muted-foreground"
        }`}
        data-testid={`gig-app-status-${application.id}`}
      >
        {status}
      </span>

      <div className="flex shrink-0 items-center gap-1">
        {email && (
          <a
            href={`mailto:${email}`}
            className="grid h-8 w-8 place-items-center rounded-full border border-border hover:bg-accent"
            title="Email applicant"
          >
            <Mail size={14} />
          </a>
        )}

        <button
          type="button"
          onClick={() =>
            onSetStatus(
              application,
              "shortlisted",
              gigId,
            )
          }
          disabled={busy}
          className="rounded-full border border-border px-3 py-1 text-xs transition-colors hover:bg-accent disabled:opacity-50"
          data-testid={`shortlist-${application.id}`}
        >
          Shortlist
        </button>

        <button
          type="button"
          onClick={() =>
            onSetStatus(
              application,
              "hired",
              gigId,
            )
          }
          disabled={busy}
          className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          data-testid={`hire-${application.id}`}
        >
          Hire
        </button>

        <button
          type="button"
          onClick={() =>
            onSetStatus(
              application,
              "rejected",
              gigId,
            )
          }
          disabled={busy}
          className="rounded-full border border-border px-3 py-1 text-xs transition-colors hover:bg-accent disabled:opacity-50"
          data-testid={`reject-${application.id}`}
        >
          Reject
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted-foreground">
        <span>{label}</span>
        {Icon && <Icon size={15} />}
      </div>

      <div className="mt-2 font-display text-2xl font-bold">
        {value}
      </div>
    </div>
  );
}

export default function GigManager() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <GigManagerSection />
    </div>
  );
}
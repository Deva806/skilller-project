import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { BookOpen, Plus, TrendingUp } from "lucide-react";
import { useCourseStore } from "../store/courseStore";
import { CourseManagerSection } from "./CourseManager";

function Stat({ label, value, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          {label}
        </div>

        {Icon && (
          <Icon
            size={14}
            className="text-muted-foreground"
          />
        )}
      </div>

      <div className="mt-1 font-display text-2xl font-bold">
        {value}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const [searchParams, setSearchParams] = useSearchParams();

  const createCourse = useCourseStore(
    (state) => state.createCourse
  );

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const activeTab =
    searchParams.get("tab") === "courses"
      ? "courses"
      : "overview";

  const loadAll = async () => {
    try {
      setLoading(true);

      const statsResponse = await api.get("/dashboard/stats");
      setStats(statsResponse.data);
    } catch (error) {
      toast.error(
        error?.response?.data?.detail ||
          "Could not load dashboard"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      loadAll();
    }
  }, [user?.id]);

  const changeTab = (value) => {
    const nextParams = new URLSearchParams(searchParams);

    if (value === "courses") {
      nextParams.set("tab", "courses");
    } else {
      nextParams.delete("tab");
    }

    setSearchParams(nextParams, {
      replace: true,
    });
  };

  if (loading) {
    return (
      <div
        className="py-20 text-center text-muted-foreground"
        data-testid="dashboard-loading"
      >
        Loading dashboard…
      </div>
    );
  }

  return (
    <div
      className="mx-auto max-w-6xl px-4 py-6"
      data-testid="dashboard-page"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Creator Dashboard
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            Manage your courses and learner outcomes from one place.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            asChild
            variant="outline"
            className="rounded-full"
            data-testid="new-course-btn"
          >
            <Link to="/dashboard/courses/new">
              <Plus size={14} className="mr-1" />
              New course
            </Link>
          </Button>
        </div>
      </div>

      {stats && (
        <div
          className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4"
          data-testid="dashboard-stats-grid"
        >
          <Stat
            label="Courses"
            value={stats.courses ?? 0}
            icon={BookOpen}
          />

          <Stat
            label="Enrollments"
            value={stats.enrollments ?? 0}
            icon={TrendingUp}
          />

          <Stat
            label="XP"
            value={`${stats.xp ?? 0} (L${
              stats.level?.level ?? 0
            })`}
          />

          <Stat
            label="Role"
            value={user?.role || "creator"}
          />
        </div>
      )}

      <div className="w-full">
        <div
          className="flex w-full justify-start overflow-x-auto rounded-full bg-secondary p-1"
          data-testid="dashboard-tabs"
        >
          <button
            type="button"
            onClick={() => changeTab("overview")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "overview"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="dashboard-tab-overview"
          >
            Overview
          </button>

          <button
            type="button"
            onClick={() => changeTab("courses")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "courses"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="dashboard-tab-courses"
          >
            Courses
          </button>
        </div>

        {activeTab === "overview" && (
          <div className="mt-6">
            <div className="rounded-2xl border border-border p-6">
              <h2 className="font-display text-xl font-bold">
                Welcome back, {user?.name || user?.username || "Creator"}!
              </h2>

              <p className="mt-2 text-sm text-muted-foreground">
                Use the dashboard to create and manage your courses.
                Your course sales and creator earnings are handled
                through the platform payment system.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  asChild
                  className="rounded-full"
                >
                  <Link to="/dashboard/courses/new">
                    <Plus size={14} className="mr-1" />
                    Create course
                  </Link>
                </Button>

                <Button
                  asChild
                  variant="outline"
                  className="rounded-full"
                >
                  <Link to="/courses">
                    <BookOpen size={14} className="mr-1" />
                    View courses
                  </Link>
                </Button>

                <Button
                  asChild
                  variant="outline"
                  className="rounded-full"
                >
                  <Link to="/wallet">
                    View wallet
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "courses" && (
          <div
            className="mt-6"
            data-testid="dashboard-courses-section"
          >
            <CourseManagerSection embedded />
          </div>
        )}
      </div>
    </div>
  );
}
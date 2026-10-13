import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import {
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
} from "../components/ui/tabs";
import { Mail, Briefcase, BookOpen } from "lucide-react";
import { GigManagerSection } from "./GigManager";

export default function CRM() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = async () => {
        setLoading(true);
        setError("");

        try {
            const response = await api.get("/dashboard/crm");
            setData(response.data);
        } catch (err) {
            setError(
                err?.response?.data?.detail ||
                    err?.response?.data?.message ||
                    "Failed to load CRM data."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    if (loading) {
        return (
            <div className="py-20 text-center text-muted-foreground">
                Loading CRM…
            </div>
        );
    }

    if (error) {
        return (
            <div className="mx-auto max-w-6xl px-4 py-20 text-center">
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8">
                    <h2 className="font-display text-xl font-bold">
                        Unable to load CRM
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {error}
                    </p>
                    <button
                        onClick={load}
                        className="mt-5 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="py-20 text-center text-muted-foreground">
                No CRM data available.
            </div>
        );
    }

    const summary = data.summary || {};
    const courses = Array.isArray(data.courses) ? data.courses : [];

    return (
        <div className="mx-auto max-w-6xl px-4 py-6" data-testid="crm-page">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="font-display text-3xl font-bold tracking-tight">
                        CRM
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Manage applicants and enrolled students. Reach out,
                        shortlist and hire.
                    </p>
                </div>

                <Link
                    to="/dashboard"
                    className="rounded-full border border-border px-4 py-2 text-sm hover:bg-accent"
                >
                    ← Dashboard
                </Link>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat
                    label="Gigs"
                    value={summary.gigs ?? 0}
                    icon={Briefcase}
                />
                <Stat
                    label="Applications"
                    value={summary.applications ?? 0}
                    icon={Mail}
                />
                <Stat
                    label="Courses"
                    value={summary.courses ?? 0}
                    icon={BookOpen}
                />
                <Stat
                    label="Enrollments"
                    value={summary.enrollments ?? 0}
                    icon={BookOpen}
                />
            </div>

            <Tabs defaultValue="gigs" className="w-full">
                <TabsList
                    className="rounded-full bg-secondary p-1"
                    data-testid="crm-tabs"
                >
                    <TabsTrigger
                        value="gigs"
                        className="rounded-full"
                        data-testid="crm-tab-gigs"
                    >
                        Gigs & Applicants
                    </TabsTrigger>

                    <TabsTrigger
                        value="courses"
                        className="rounded-full"
                        data-testid="crm-tab-courses"
                    >
                        Course enrollments
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="gigs" className="mt-6">
                    <GigManagerSection embedded />
                </TabsContent>

                <TabsContent
                    value="courses"
                    className="mt-6 space-y-6"
                >
                    {courses.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                            You haven't published any course yet.
                        </div>
                    ) : (
                        courses.map((item) => {
                            const course = item.course || {};
                            const enrollments = Array.isArray(item.enrollments)
                                ? item.enrollments
                                : [];

                            return (
                                <div
                                    key={course.id}
                                    className="overflow-hidden rounded-2xl border border-border"
                                >
                                    <div className="border-b border-border p-4">
                                        <div className="font-display text-base font-bold">
                                            {course.title || "Untitled course"}
                                        </div>

                                        <div className="mt-1 text-xs text-muted-foreground">
                                            {course.category || "Uncategorized"}{" "}
                                            · {enrollments.length} enrollments
                                        </div>
                                    </div>

                                    {enrollments.length === 0 ? (
                                        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                                            No enrollments yet.
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-border/60">
                                            {enrollments.map((enrollment) => {
                                                const user =
                                                    enrollment.user || {};

                                                const username =
                                                    user.username || "user";

                                                const email =
                                                    user.email || "";

                                                const name =
                                                    user.name ||
                                                    username ||
                                                    "User";

                                                const avatar =
                                                    user.avatar_url ||
                                                    `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(
                                                        name
                                                    )}`;

                                                return (
                                                    <div
                                                        key={
                                                            enrollment.id ||
                                                            `${course.id}-${username}`
                                                        }
                                                        className="flex items-center gap-3 p-4"
                                                    >
                                                        <img
                                                            src={avatar}
                                                            alt=""
                                                            className="h-9 w-9 rounded-full border border-border object-cover"
                                                        />

                                                        <div className="min-w-0 flex-1">
                                                            <Link
                                                                to={`/u/${username}`}
                                                                className="text-sm font-semibold hover:underline"
                                                            >
                                                                @{username}
                                                            </Link>

                                                            <div className="truncate text-xs text-muted-foreground">
                                                                {email ||
                                                                    "No email available"}
                                                            </div>
                                                        </div>

                                                        {email && (
                                                            <a
                                                                href={`mailto:${email}`}
                                                                className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border hover:bg-accent"
                                                                aria-label={`Email @${username}`}
                                                            >
                                                                <Mail size={14} />
                                                            </a>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}

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
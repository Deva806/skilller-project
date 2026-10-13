import { Clock3, Sparkles } from "lucide-react";

/**
 * Shared placeholder for product areas intentionally deferred from the PRD.
 * Keep this component free of API calls so deferred routes cannot trigger
 * their previous network, WebSocket, or mutation behavior.
 */
export default function FutureFeatures({ title, description, icon: Icon = Sparkles, id }) {
    return (
        <section
            className="mx-auto flex min-h-[55vh] max-w-2xl items-center px-4 py-10"
            data-testid={`future-features-${id || "page"}`}
        >
            <div className="w-full rounded-3xl border border-dashed border-primary/40 bg-card p-8 text-center shadow-sm md:p-12">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <Icon size={28} aria-hidden="true" />
                </div>
                <span className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    <Clock3 size={13} aria-hidden="true" /> Future feature
                </span>
                <h1 className="mt-4 font-display text-3xl font-bold tracking-tight">{title}</h1>
                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                    {description}
                </p>
                <p className="mt-6 text-xs text-muted-foreground">
                    This area is planned for a later release. Its previous implementation is preserved in the codebase for reactivation.
                </p>
            </div>
        </section>
    );
}

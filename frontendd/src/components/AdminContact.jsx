import { Mail, Phone, Headset } from "lucide-react";

const ADMIN_EMAIL = "your-admin-email@example.com";
const ADMIN_PHONE = "+91XXXXXXXXXX";

export default function AdminContact() {
  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-primary/10 p-3">
          <Headset className="h-5 w-5 text-primary" />
        </div>

        <div>
          <h3 className="font-semibold">
            Need help with your payout?
          </h3>
          <p className="text-sm text-muted-foreground">
            Contact the admin for withdrawal-related queries.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <a
          href={`mailto:${ADMIN_EMAIL}`}
          className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-accent"
        >
          <Mail className="h-5 w-5 text-primary" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              Email support
            </p>
            <p className="break-all text-sm font-medium">
              {ADMIN_EMAIL}
            </p>
          </div>
        </a>

        <a
          href={`tel:${ADMIN_PHONE.replace(/[^\d+]/g, "")}`}
          className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-accent"
        >
          <Phone className="h-5 w-5 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">
              Call support
            </p>
            <p className="text-sm font-medium">
              {ADMIN_PHONE}
            </p>
          </div>
        </a>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Please include your withdrawal request details when contacting
        support. Never share your password or OTP.
      </p>
    </section>
  );
}

import { desc, ne } from "drizzle-orm";
import { requireAdminPage } from "@/app/admin/auth";
import type { AdminWaitlistSignup } from "@/app/admin/types";
import { getDb, hasDatabase } from "@/db";
import { waitlistSignups } from "@/db/schema";
import AdminDashboard from "./admin-dashboard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Founder operations | Carmelita",
  description: "Private demand, pilot and waitlist operations.",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const identity = await requireAdminPage("/admin");

  if (!hasDatabase()) {
    return (
      <main className="admin-unavailable">
        <section>
          <p className="eyebrow">FOUNDER OPERATIONS</p>
          <h1>Database connection required.</h1>
          <p>
            The admin workspace is protected, but this environment does not
            have access to the waitlist database.
          </p>
        </section>
      </main>
    );
  }

  const rows = await getDb()
    .select()
    .from(waitlistSignups)
    .where(ne(waitlistSignups.source, "codex-smoke"))
    .orderBy(desc(waitlistSignups.createdAt));

  const signups: AdminWaitlistSignup[] = rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    useCase: row.useCase,
    country: row.country,
    company: row.company,
    source: row.source,
    referral: row.referral,
    status: row.status,
    priority: row.priority,
    notes: row.notes,
    owner: row.owner,
    tags: row.tags,
    lastContactedAt: row.lastContactedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));

  return (
    <AdminDashboard
      initialSignups={signups}
      founderName={identity.displayName}
      privyEnabled={Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() || process.env.PRIVY_APP_ID?.trim())}
    />
  );
}

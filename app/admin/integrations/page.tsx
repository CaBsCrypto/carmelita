import Link from "next/link";
import { desc } from "drizzle-orm";
import { requireAdminPage } from "@/app/admin/auth";
import BrandLockup from "@/app/brand-lockup";
import { getDb, hasDatabase } from "@/db";
import { proposalStatusLabel } from "@/app/integrations/review";
import ProposalReviewControls from "./review-controls";
import styles from "./review-controls.module.css";
import { integrationRecommendations } from "@/db/schema";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Service proposals | Carmelita",
  description: "Private service proposals and integration recommendations for manual review.",
  robots: { index: false, follow: false },
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export default async function IntegrationDemandPage() {
  await requireAdminPage("/admin/integrations");

  let storageReady = false;
  let recommendations: (typeof integrationRecommendations.$inferSelect)[] = [];
  try {
    if (hasDatabase()) {
      recommendations = await getDb()
        .select()
        .from(integrationRecommendations)
        .orderBy(desc(integrationRecommendations.createdAt));
      storageReady = true;
    }
  } catch {
    // The private inbox must distinguish unavailable storage from an empty queue.
    storageReady = false;
  }

  return (
    <main className="admin-page">
      <header className="admin-topbar">
        <Link className="brand" href="/">
          <BrandLockup />
        </Link>
        <div>
          <Link className="admin-stellar-link" href="/admin">
            Founder operations
          </Link>
          <Link className="admin-stellar-link" href="/connections">
            Integration Lab
          </Link>
        </div>
      </header>

      <div className="admin-main integration-demand-admin">
        <section className="admin-heading">
          <div>
            <p className="eyebrow">INTEGRATION DEMAND</p>
            <h1>Service proposals for review.</h1>
            <p>
              Service proposals and integration recommendations, including the
              use case and contact email. Review is manual; receiving a proposal
              does not publish or activate an integration.
            </p>
          </div>
          <div className="admin-heading-actions">
            <Link href="/developers#proposal">Open proposal form</Link>
            <Link href="/admin/apps">Review registered applications</Link>
            {storageReady && <small>{recommendations.length} proposals and recommendations saved</small>}
          </div>
        </section>

        <section className="integration-demand-list">
          <header>
            <span>Integration</span>
            <span>Requested outcome</span>
            <span>Contact</span>
            <span>Received</span>
          </header>

          {!storageReady && <div className="integration-demand-empty">Proposal storage is unavailable in this environment. The review queue could not be loaded.</div>}
          {storageReady && recommendations.length === 0 && (
            <div className="integration-demand-empty">
              No proposals or integration recommendations yet.
            </div>
          )}

          {recommendations.map((recommendation) => (
            <article key={recommendation.id}>
              <div>
                <strong>{recommendation.integrationName}</strong>
                <small>{recommendation.source === "developers" ? "Service proposal" : "Integration recommendation"} · {recommendation.locale.toUpperCase()} · {proposalStatusLabel(recommendation.status)}</small>
              </div>
              <p>{recommendation.useCase || "No use case provided."}</p>
              <a href={"mailto:" + recommendation.email}>{recommendation.email}</a>
              <time dateTime={recommendation.createdAt.toISOString()}>
                {formatDate(recommendation.createdAt)}
              </time>
              {recommendation.reviewedAt && <div className={styles.details}><p><strong>Last review:</strong> <time dateTime={recommendation.reviewedAt.toISOString()}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(recommendation.reviewedAt)} UTC</time> by {recommendation.reviewActor}</p><p><strong>Private reason:</strong> {recommendation.reviewReason}</p></div>}
              <ProposalReviewControls id={recommendation.id} version={recommendation.reviewVersion} status={recommendation.status} />
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

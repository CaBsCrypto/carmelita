import Link from "next/link";
import { requireAdminPage } from "@/app/admin/auth";
import BrandLockup from "@/app/brand-lockup";
import AppReview from "./app-review";
import access from "@/app/account-access.module.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "Application review | Carmelita", robots: { index: false, follow: false } };
export default async function AppReviewPage() {
  await requireAdminPage("/admin/apps");
  return <main className={access.page}><div className={access.shell}><header className={access.header}><Link href="/" className={access.brand}><BrandLockup /></Link><Link href="/admin/integrations">Proposal review</Link></header><div className={access.content}><AppReview /></div></div></main>;
}

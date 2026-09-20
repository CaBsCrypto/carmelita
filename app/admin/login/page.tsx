import Link from "next/link";
import BrandLockup from "../../brand-lockup";
import { redirect } from "next/navigation";
import {
  getAdminIdentity,
  isPasswordAdminConfigured,
  sanitizeAdminReturnTo,
} from "@/app/admin/auth";
import AdminLoginForm from "./login-form";
import PrivyAdminLogin from "./privy-login";
import { isPrivyAdminConfigured } from "../privy-auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Founder access | Carmelita",
  description: "Private operations workspace for Carmelita.",
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const identity = await getAdminIdentity();
  if (identity) redirect("/admin");

  const params = await searchParams;
  const returnTo = sanitizeAdminReturnTo(params.returnTo);

  return (
    <main className="admin-login-page">
      <section className="admin-login-shell">
        <Link className="brand" href="/">
          <BrandLockup />
        </Link>
        <div className="admin-login-copy">
          <p className="eyebrow">FOUNDER OPERATIONS</p>
          <h1>The private side of the agent economy.</h1>
          <p>
            Review demand, qualify early users and turn the waitlist into
            interviews, pilots and proof for YC.
          </p>
        </div>
        {isPrivyAdminConfigured() ? <PrivyAdminLogin returnTo={returnTo} /> : <AdminLoginForm
          returnTo={returnTo}
          configured={isPasswordAdminConfigured()}
        />}
        <small>Private access · Server-verified session · No public indexing</small>
      </section>
    </main>
  );
}




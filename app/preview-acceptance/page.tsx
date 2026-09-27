import { notFound } from "next/navigation";
import { assertPreviewIsolation } from "@/app/preview-isolation";
import AcceptancePanel from "./panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Preview acceptance | Carmelita", robots: { index: false, follow: false } };

export default function PreviewAcceptancePage() {
  if (process.env.VERCEL_ENV !== "preview") notFound();
  assertPreviewIsolation();
  return <AcceptancePanel />;
}

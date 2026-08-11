import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { oauthSubjectLinks } from "@/db/schema";

export type OAuthSubjectLinkInput = {
  issuer: string;
  subject: string;
  privyDid: string;
};

export function normalizeOAuthIssuer(value: string) {
  const url = new URL(value.trim());
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) throw new Error("oauth_subject_issuer_invalid");
  const pathname = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
  return `${url.origin}${pathname}`;
}

export function validateOAuthSubjectLink(input: OAuthSubjectLinkInput) {
  const issuer = normalizeOAuthIssuer(input.issuer);
  const subject = input.subject.trim();
  const privyDid = input.privyDid.trim();
  if (!subject || subject.length > 512 || /\s/.test(subject)) {
    throw new Error("oauth_subject_invalid");
  }
  if (!privyDid.startsWith("did:privy:") || privyDid.length > 512 || /\s/.test(privyDid)) {
    throw new Error("oauth_subject_privy_did_invalid");
  }
  return { issuer, subject, privyDid };
}

export function assertOAuthSubjectOwnership(
  existingPrivyDid: string | null | undefined,
  requestedPrivyDid: string,
) {
  if (existingPrivyDid && existingPrivyDid !== requestedPrivyDid) {
    throw new Error("oauth_subject_link_conflict");
  }
}

export async function linkOAuthSubject(input: OAuthSubjectLinkInput) {
  const normalized = validateOAuthSubjectLink(input);
  const db = getDb();
  await db.insert(oauthSubjectLinks).values({
    id: `oasl_${randomUUID()}`,
    issuer: normalized.issuer,
    subject: normalized.subject,
    privyDid: normalized.privyDid,
  }).onConflictDoNothing();

  const [record] = await db.select().from(oauthSubjectLinks).where(and(
    eq(oauthSubjectLinks.issuer, normalized.issuer),
    eq(oauthSubjectLinks.subject, normalized.subject),
  )).limit(1);
  if (!record) throw new Error("oauth_subject_link_conflict");
  assertOAuthSubjectOwnership(record.privyDid, normalized.privyDid);
  return {
    issuer: record.issuer,
    subject: record.subject,
    privyDid: record.privyDid,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function resolveOAuthSubject(input: { issuer: string; subject: string }) {
  const issuer = normalizeOAuthIssuer(input.issuer);
  const subject = input.subject.trim();
  if (!subject || subject.length > 512 || /\s/.test(subject)) return null;
  const [record] = await getDb().select({ privyDid: oauthSubjectLinks.privyDid })
    .from(oauthSubjectLinks)
    .where(and(eq(oauthSubjectLinks.issuer, issuer), eq(oauthSubjectLinks.subject, subject)))
    .limit(1);
  return record?.privyDid ?? null;
}
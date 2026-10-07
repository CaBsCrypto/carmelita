import type { OAuthAuthorizationRequest, StytchConnectedAppsClient } from "./connected-apps-client";

export async function authorizeOwner(input: {
  identity: { id: string; email: string };
  issuer: string;
  request: OAuthAuthorizationRequest;
  consentGranted: boolean;
}, dependencies: {
  client: Pick<StytchConnectedAppsClient, "ensureUserForPrivy" | "preflightAuthorization" | "submitAuthorization">;
  prepare: (identity: { id: string; email: string }) => Promise<void>;
  link: (input: { issuer: string; subject: string; privyDid: string }) => Promise<unknown>;
}) {
  const subject = await dependencies.client.ensureUserForPrivy(input.identity.id, input.identity.email);
  if (input.consentGranted) {
    await dependencies.client.preflightAuthorization(input.request, subject);
    await dependencies.prepare(input.identity);
    await dependencies.link({ issuer: input.issuer, subject, privyDid: input.identity.id });
  }
  return dependencies.client.submitAuthorization(input.request, subject, input.consentGranted);
}

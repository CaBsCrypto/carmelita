import assert from "node:assert/strict";
import test from "node:test";
import { integrationRecommendationSchema } from "../app/integrations/schema";

test("integration recommendation normalizes a valid submission", () => {
  const result = integrationRecommendationSchema.parse({
    integrationName: "  Google Calendar  ",
    email: " Founder@Example.com ",
    useCase: "Schedule meetings from the chat.",
    locale: "es",
    source: "landing",
    consent: true,
    website: "",
  });

  assert.equal(result.integrationName, "Google Calendar");
  assert.equal(result.email, "founder@example.com");
  assert.equal(result.locale, "es");
  assert.equal(result.website, undefined);
});

test("integration recommendation requires an email and consent", () => {
  const result = integrationRecommendationSchema.safeParse({
    integrationName: "Notion",
    email: "not-an-email",
    locale: "en",
    consent: false,
  });

  assert.equal(result.success, false);
});

test("integration recommendation accepts a minimal request", () => {
  const result = integrationRecommendationSchema.parse({
    integrationName: "Slack",
    email: "person@example.com",
    consent: true,
  });
  assert.equal(result.source, "landing");
});

test("developer proposals require at least 10 trimmed use-case characters", () => {
  for (const useCase of [undefined, "", "   ", "123456789", "   short   "]) {
    const result = integrationRecommendationSchema.safeParse({
      integrationName: "Booking service",
      email: "person@example.test",
      useCase,
      source: "developers",
      consent: true,
    });
    assert.equal(result.success, false);
    if (!result.success) {
      assert.ok(result.error.issues.some((issue) => issue.path[0] === "useCase"));
    }
  }

  const result = integrationRecommendationSchema.parse({
    integrationName: "Booking service",
    email: "person@example.test",
    useCase: "  1234567890  ",
    source: "developers",
    consent: true,
  });
  assert.equal(result.useCase, "1234567890");
});

test("legacy non-developer recommendations keep optional or short use cases", () => {
  for (const source of [undefined, "landing"]) {
    for (const useCase of [undefined, "Hi"]) {
      const result = integrationRecommendationSchema.safeParse({
        integrationName: "Slack",
        email: "person@example.test",
        source,
        useCase,
        consent: true,
      });
      assert.equal(result.success, true);
    }
  }
});

test("developer proposals normalize text and reject overlong or unsupported data", () => {
  const valid = {
    integrationName: "  Booking service  ",
    email: " OWNER@Example.test ",
    useCase: "  Consult my bookings. Docs: https://service.example.test/docs  ",
    source: "developers",
    locale: "pt",
    consent: true,
  };
  const result = integrationRecommendationSchema.parse(valid);
  assert.equal(result.integrationName, "Booking service");
  assert.equal(result.email, "owner@example.test");
  assert.equal(result.useCase, "Consult my bookings. Docs: https://service.example.test/docs");
  for (const invalid of [
    { integrationName: "x" },
    { integrationName: "x".repeat(101) },
    { useCase: "x".repeat(501) },
    { locale: "fr" },
    { consent: false },
  ]) {
    assert.equal(integrationRecommendationSchema.safeParse({ ...valid, ...invalid }).success, false);
  }
});

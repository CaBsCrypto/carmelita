import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

export const integrationRecommendationSchema = z
  .object({
    integrationName: z.string().trim().min(2).max(100),
    email: z.string().trim().toLowerCase().email().max(254),
    useCase: optionalText(500),
    locale: z.enum(["en", "es", "pt"]).default("en"),
    source: optionalText(80).default("landing"),
    consent: z.literal(true),
    website: optionalText(200),
  })
  .superRefine((value, context) => {
    if (value.source === "developers" && (value.useCase?.length ?? 0) < 10) {
      context.addIssue({
        code: "custom",
        path: ["useCase"],
        message: "A service proposal requires a use case of at least 10 characters.",
      });
    }
  });

export type IntegrationRecommendation = z.infer<
  typeof integrationRecommendationSchema
>;

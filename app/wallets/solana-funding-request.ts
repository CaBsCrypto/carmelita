import { z } from "zod";
export const solanaFundingRequestSchema = z.object({
  explicitUserConfirmation: z.literal(true),
  solAmount: z.number().min(0.1).max(2).optional().default(1),
}).strict();
export async function parseSolanaFundingRequest(request: Request) {
  return solanaFundingRequestSchema.parse(await request.json().catch(() => null));
}

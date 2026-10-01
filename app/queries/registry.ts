import { marketQueries } from "./market";
import { personalQueries } from "./personal";
import { ecosystemQueries } from "./ecosystem";
import { discoveryQueries } from "./discovery";
import { metadataQueries } from "./metadata";
import { commerceQueries } from "./commerce";
import { executeQueryDefinition, type QueryDefinition, type QueryLocale, type QueryPrincipal } from "./types";
import { evaluateQueryAcceptance } from "./acceptance";

export const readQueryDefinitions: readonly QueryDefinition[] = [
  ...marketQueries, ...personalQueries, ...ecosystemQueries, ...discoveryQueries, ...metadataQueries, ...commerceQueries,
];

export function getReadQuery(id: string, definitions = readQueryDefinitions) {
  const query = definitions.find(query => query.id === id || query.toolName === id);
  if (!query) throw new Error("read_query_not_found");
  return query;
}

export async function executeReadQuery(
  id: string,
  input: unknown,
  principal: QueryPrincipal | undefined,
  options: { locale?: QueryLocale; definitions?: readonly QueryDefinition[] } = {},
) {
  return executeQueryDefinition(getReadQuery(id, options.definitions), input, principal, options.locale);
}

/** Static coverage describes installed adapters, not a user's connection or live upstream health. */
export function listReadQueries() {
  return readQueryDefinitions.map(query => {
    const { id, toolName, title, description, scope, dataScope, requirements } = query;
    const acceptance = evaluateQueryAcceptance(query, { providerKnownUnavailable: id === "avalanche.nft.floor_read" });
    return {
      id, toolName, title, description, scope, dataScope, requirements: requirements ?? [],
      channels: { carmelita: true, chatgpt: true },
      acceptance: acceptance.acceptance,
      acceptanceVerification: acceptance.verification,
    };
  });
}

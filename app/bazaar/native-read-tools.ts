import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { executeBazaarNativeRead, type NativeReadAction } from "./native-read-host";

export function registerBazaarNativeReadTools(server: McpServer, execute = executeBazaarNativeRead) {
  const cursor = z.object({ownerId:z.string().regex(/^ow_[a-f0-9]{32}$/),generation:z.number().int().positive(),value:z.string().regex(/^[A-Za-z0-9_-]{1,512}$/)}).strict();
  const tools = [
    {name:"read_bazaar_catalog",action:"catalog",description:"Read bounded Bazaar public service metadata. No purchase admission or live seller capacity is established.",schema:z.object({limit:z.number().int().min(1).max(20).optional(),query:z.string().max(200).optional(),cursor:z.string().regex(/^[A-Za-z0-9_-]{1,512}$/).optional()}).strict()},
    {name:"read_bazaar_connection",action:"preflight",description:"Verify my existing owner-issued Bazaar agent identity and effective capabilities. Missing local link returns not-linked without a remote attempt. No registration or purchase.",schema:z.object({}).strict()},
    {name:"read_bazaar_history",action:"history",description:"Read one page of my existing Bazaar purchases and sales. Uses my durable per-user link; never accepts another owner. Does not recover a single order, wake a seller, sign or pay. Reads may consume native control quota.",schema:z.object({limit:z.number().int().min(1).max(20).optional(),cursor:cursor.optional()}).strict()},
  ];
  for (const tool of tools) server.registerTool(tool.name, {
    description:tool.description,inputSchema:tool.schema,
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true},
    _meta:{securitySchemes:[{type:"oauth2",scopes:["agent:read"]}]},
  }, async (input, extra) => {
    try { const value=await execute(tool.action as NativeReadAction,input,extra.authInfo);
      return {content:[{type:"text" as const,text:JSON.stringify(value)}]};
    } catch(error) {
      const code=error instanceof Error&&/^(?:bazaar_native_[a-z_]{1,80}|mcp_principal_required|mcp_principal_invalid|mcp_scope_required:agent:read)$/.test(error.message)?error.message:"bazaar_native_read_unconfirmed";
      return {isError:true,content:[{type:"text" as const,text:JSON.stringify({error:code})}]};
    }
  });
}

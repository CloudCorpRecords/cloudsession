/**
 * cloudsession MCP server. Core subset: 9 tools.
 *
 * Low-level Server API with explicit inputSchema literals (the
 * McpServer+zod path injects $schema/additionalProperties and breaks
 * parity). Zod still validates call args. The literals match the
 * labelled core-subset fixture exactly. One SessionStore lives for
 * the life of the server process.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { callTool, SessionStore, VERSION } from "./session.js";

const ARG_SCHEMAS: Record<string, z.ZodTypeAny> = {
  start_session: z.object({
    profile: z.string().optional(),
    region: z.string().optional(),
  }),
  get_session_info: z.object({ session_id: z.string() }),
  end_session: z.object({ session_id: z.string() }),
  set_region: z.object({
    session_id: z.string(),
    region: z.string(),
  }),
  set_profile: z.object({
    session_id: z.string(),
    profile: z.string(),
  }),
  list_regions: z.object({}),
  create_plan: z.object({
    session_id: z.string(),
    title: z.string(),
    steps: z.array(z.string()).optional(),
  }),
  advance_plan_step: z.object({
    session_id: z.string(),
    plan_id: z.string(),
  }),
  get_plan: z.object({
    session_id: z.string(),
    plan_id: z.string(),
  }),
};

export const TOOLS = [
  {
    name: "start_session",
    description: "Start a new local AWS session context.",
    inputSchema: {
      type: "object" as const,
      properties: {
        profile: { type: "string", description: "AWS profile name to associate with the new session. Defaults to \"default\" when omitted." },
        region: { type: "string", description: "AWS region for the new session, such as \"us-east-1\". Must be a known region; defaults to \"us-east-1\" when omitted." },
      },
      required: [] as string[],
    },
  },
  {
    name: "get_session_info",
    description: "Get information about a session.",
    inputSchema: {
      type: "object" as const,
      properties: { session_id: { type: "string", description: "ID of the session to retrieve information about, as returned by start_session." } },
      required: ["session_id"],
    },
  },
  {
    name: "end_session",
    description: "End a session, marking it as ended so it can no longer be used for plans or updates.",
    inputSchema: {
      type: "object" as const,
      properties: { session_id: { type: "string", description: "ID of the session to end, as returned by start_session." } },
      required: ["session_id"],
    },
  },
  {
    name: "set_region",
    description: "Set the AWS region for a session.",
    inputSchema: {
      type: "object" as const,
      properties: {
        session_id: { type: "string", description: "ID of the active session to update, as returned by start_session." },
        region: { type: "string", description: "New AWS region to set on the session. Must be a known region, such as \"us-east-1\"." },
      },
      required: ["session_id", "region"],
    },
  },
  {
    name: "set_profile",
    description: "Set the AWS profile for a session.",
    inputSchema: {
      type: "object" as const,
      properties: {
        session_id: { type: "string", description: "ID of the active session to update, as returned by start_session." },
        profile: { type: "string", description: "New AWS profile name to set on the session. Must not be empty." },
      },
      required: ["session_id", "profile"],
    },
  },
  {
    name: "list_regions",
    description: "List the curated set of AWS regions.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "create_plan",
    description: "Create an execution plan inside a session.",
    inputSchema: {
      type: "object" as const,
      properties: {
        session_id: { type: "string", description: "ID of the active session to create the plan in, as returned by start_session." },
        title: { type: "string", description: "Title of the plan. Must not be empty." },
        steps: { type: "array", items: { type: "string" }, description: "Optional ordered list of plan step titles, as strings. Steps start as pending and are advanced in order." },
      },
      required: ["session_id", "title"],
    },
  },
  {
    name: "advance_plan_step",
    description: "Mark the current plan step complete and advance.",
    inputSchema: {
      type: "object" as const,
      properties: {
        session_id: { type: "string", description: "ID of the active session that owns the plan, as returned by start_session." },
        plan_id: { type: "string", description: "ID of the plan to advance, as returned by create_plan." },
      },
      required: ["session_id", "plan_id"],
    },
  },
  {
    name: "get_plan",
    description: "Get a plan and its step states.",
    inputSchema: {
      type: "object" as const,
      properties: {
        session_id: { type: "string", description: "ID of the active session that owns the plan, as returned by start_session." },
        plan_id: { type: "string", description: "ID of the plan to retrieve, as returned by create_plan." },
      },
      required: ["session_id", "plan_id"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [{
      type: "text" as const,
      text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
    }],
  };
}
function errorResult(err: unknown) {
  return {
    content: [{
      type: "text" as const,
      text: err instanceof Error ? err.message : String(err),
    }],
    isError: true,
  };
}

const store = new SessionStore();

const server = new Server(
  { name: "cloudsession", version: VERSION },
  { capabilities: { tools: {} } },
);
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const schema = ARG_SCHEMAS[name];
  if (!schema) throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  try {
    const parsed = schema.parse(args ?? {}) as Record<string, unknown>;
    return textResult(callTool(store, name, parsed));
  } catch (err) {
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}
void main();

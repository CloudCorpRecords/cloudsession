#!/usr/bin/env node
/**
 * cloudsession CLI.
 *   cloudsession <tool-name> '<json args>'
 *   cloudsession mcp
 * Local state only: each CLI invocation starts with a fresh store,
 * so multi-step flows belong in the MCP server. Exit codes:
 * 0 success, 1 error, 2 usage.
 */
import { callTool, SessionStore, VERSION } from "./session.js";

const TOOL_NAMES = [
  "start_session", "get_session_info", "end_session", "set_region",
  "set_profile", "list_regions", "create_plan", "advance_plan_step",
  "get_plan",
];

function usage(): never {
  console.error(`Usage:
  cloudsession <tool> '<json args>'   tools: ${TOOL_NAMES.join(", ")}
  cloudsession mcp
  cloudsession --version`);
  process.exit(2);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") { console.log(VERSION); return; }
  if (cmd === "mcp") { await import("./mcp.js"); return; }
  if (!cmd || !TOOL_NAMES.includes(cmd)) usage();
  let args: Record<string, unknown> = {};
  const raw = rest.join(" ").trim();
  if (raw) {
    try {
      args = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      console.error("error: args must be a JSON object");
      process.exit(1);
    }
  }
  try {
    const out = callTool(new SessionStore(), cmd, args);
    console.log(typeof out === "string" ? out : JSON.stringify(out, null, 2));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
void main();

# cloudsession — BUILD REPORT

Original: aws-core → Rebuild: cloudsession
Tier C core subset (the documented session/plan meta core only).
Local only, nothing pushed or published.

## Scope
9 tools of REAL local state logic in an in-memory SessionStore
(deterministic sequence IDs, no timestamps, no AWS calls):
start_session (defaults profile "default", region "us-east-1";
region validated against the curated list), get_session_info,
end_session (blocks further mutation; reads still work), set_region
(validated), set_profile (non-empty), list_regions (curated static
list of 29 AWS regions with names), create_plan (steps stored
pending; a step-less plan is immediately completed),
advance_plan_step (completes the current step; advancing a completed
plan is an error), get_plan (returns a deep copy; plans are scoped
to their owning session).

Omitted groups (fixture `_source` lists them): AWS API proxy/call
tools, credential and SSO login flows, documentation search helpers
bundled with the full server, prompt templates, and any tool that
calls live AWS service APIs.

Ground truth: tool schemas are docs-derived from the public
documentation of the AWS core MCP server session/plan surface.
Fixture: harness/fixtures/aws-core-tools-original.json (labelled
core-subset).

## Verified (foreground, from disk)
- Tools: 9/9 — parity.json identical_tools = 9 = total.
- Unit tests: 13/13 pass (deterministic IDs and defaults, unknown
  region/session/plan errors, ended-session mutation blocking,
  region/profile updates, the curated region list, plan lifecycle
  including completion and copy isolation, session scoping of plans,
  full callTool dispatch).
- tsc: exit 0. dist/cli.js present; `node dist/cli.js --version`
  prints 0.1.0.
- Parity: harness/parity.py vs the fixture → PASS, parity_pct 100.0
  (parity-out/parity.json).
- Stdio state-flow check: over one MCP stdio session,
  start_session {region:"eu-west-1"} returned session-1 active in
  eu-west-1; create_plan returned plan-1 in_progress;
  advance_plan_step completed step "a" (current_step 1);
  get_session_info for session-99 returned isError
  "Unknown session: session-99". This build is keyless — no
  environment variable is required.
- server.json description 56 chars (≤100); OCI entry has no version
  field; npm entry carries version 0.1.0; Dockerfile label
  io.github.CloudCorpRecords/cloudsession; full 19-file factory set
  present (node_modules is a symlink to the reference build for local
  build/test only).

## Honest gaps
- State is in-memory only: sessions and plans do not survive a
  server restart, and each CLI invocation starts with a fresh store
  (multi-step flows belong in the MCP server process).
- The region list is curated and static (29 regions); newer regions
  are rejected as unknown until the list is updated, and region
  validation is list membership, not an AWS lookup.
- Sessions carry profile/region labels only; no credential
  resolution or AWS identity check is performed (by design — that
  surface is outside the subset).
- Lockfile is a copied fleet lockfile with identity fields edited —
  clean lockfile regeneration is REQUIRED before publish.
- mcpaudit / mcpvet / shipcheck not yet run — pre-publish gate.

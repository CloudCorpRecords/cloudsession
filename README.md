# cloudsession

Local AWS session and plan state as MCP tools. cloudsession is a
clean-room rebuild of the session/plan meta core of the AWS core MCP
server, under a new name: real local state logic, fresh code, no
copied branding. No tool in this subset calls an AWS API — a session
is a local context carrying a profile name and a region, and a plan
is an ordered list of steps advanced explicitly by the caller.

## Tools (core subset, 9)

`start_session`, `get_session_info`, `end_session`, `set_region`,
`set_profile`, `list_regions`, `create_plan`, `advance_plan_step`,
`get_plan`.

Sessions start with profile `default` and region `us-east-1` unless
overridden, get deterministic IDs (`session-1`, `plan-1`, ...), and
validate regions against a curated static region list (29 regions).
Ending a session blocks further mutation while keeping it readable.
Plans track each step as pending/completed; advancing the final step
completes the plan, and advancing a completed plan is an error. State
is in-memory for the life of the server process — nothing persists
across restarts.

Not in this subset: AWS API proxy/call tools, credential and SSO
login flows, documentation search helpers, prompt templates, and any
tool that calls live AWS service APIs.

## Setup

No credentials or environment variables are required.

## CLI

```bash
npx @reneturcios/cloudsession list_regions '{}'
npx @reneturcios/cloudsession start_session '{"region":"eu-west-1"}'
npx @reneturcios/cloudsession mcp        # stdio MCP server
```

Each tool name is a subcommand taking one JSON object argument. Note
that each CLI invocation starts with a fresh store, so multi-step
session/plan flows belong in the MCP server, which keeps one store
for its lifetime.

## MCP client config

```json
{
  "mcpServers": {
    "cloudsession": {
      "command": "npx",
      "args": ["-y", "@reneturcios/cloudsession", "mcp"]
    }
  }
}
```

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/cloudsession
```

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT

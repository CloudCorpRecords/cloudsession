/**
 * cloudsession types.
 *
 * A core subset of the AWS core MCP surface: the documented
 * session/plan meta core only. Sessions and plans are local,
 * in-memory state; no AWS API is called.
 */

export interface RegionInfo {
  region: string;
  name: string;
}

export interface SessionInfo {
  session_id: string;
  profile: string;
  region: string;
  status: "active" | "ended";
  seq: number;
}

export interface PlanStep {
  title: string;
  status: "pending" | "completed";
}

export interface PlanInfo {
  plan_id: string;
  session_id: string;
  title: string;
  steps: PlanStep[];
  current_step: number;
  status: "in_progress" | "completed";
}

export interface StartSessionOptions {
  profile?: string;
  region?: string;
}

export interface SessionIdOptions {
  session_id: string;
}

export interface SetRegionOptions {
  session_id: string;
  region: string;
}

export interface SetProfileOptions {
  session_id: string;
  profile: string;
}

export interface ListRegionsOptions {
  // No arguments.
  [key: string]: never;
}

export interface CreatePlanOptions {
  session_id: string;
  title: string;
  steps?: string[];
}

export interface PlanRefOptions {
  session_id: string;
  plan_id: string;
}

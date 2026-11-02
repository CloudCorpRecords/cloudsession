/**
 * cloudsession core: the 9-tool session/plan meta core of the AWS
 * core MCP surface, implemented clean-room as REAL local state logic.
 *
 * Sessions and plans live in an in-memory store owned by the server
 * process. IDs are deterministic sequence values (session-1,
 * plan-1, ...) so behaviour is fully unit-testable offline. No AWS
 * API is called by any tool in this subset: a "session" here is a
 * local context carrying a profile name and a region, and a "plan"
 * is an ordered list of steps advanced explicitly by the caller.
 * list_regions returns a curated static region list written fresh
 * for this rebuild.
 */
import type {
  CreatePlanOptions,
  PlanInfo,
  PlanRefOptions,
  PlanStep,
  RegionInfo,
  SessionIdOptions,
  SessionInfo,
  SetProfileOptions,
  SetRegionOptions,
  StartSessionOptions,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_REGION = "us-east-1";
export const DEFAULT_PROFILE = "default";

export const REGIONS: RegionInfo[] = [
  { region: "us-east-1", name: "US East (N. Virginia)" },
  { region: "us-east-2", name: "US East (Ohio)" },
  { region: "us-west-1", name: "US West (N. California)" },
  { region: "us-west-2", name: "US West (Oregon)" },
  { region: "af-south-1", name: "Africa (Cape Town)" },
  { region: "ap-east-1", name: "Asia Pacific (Hong Kong)" },
  { region: "ap-south-1", name: "Asia Pacific (Mumbai)" },
  { region: "ap-south-2", name: "Asia Pacific (Hyderabad)" },
  { region: "ap-southeast-1", name: "Asia Pacific (Singapore)" },
  { region: "ap-southeast-2", name: "Asia Pacific (Sydney)" },
  { region: "ap-southeast-3", name: "Asia Pacific (Jakarta)" },
  { region: "ap-southeast-4", name: "Asia Pacific (Melbourne)" },
  { region: "ap-northeast-1", name: "Asia Pacific (Tokyo)" },
  { region: "ap-northeast-2", name: "Asia Pacific (Seoul)" },
  { region: "ap-northeast-3", name: "Asia Pacific (Osaka)" },
  { region: "ca-central-1", name: "Canada (Central)" },
  { region: "ca-west-1", name: "Canada West (Calgary)" },
  { region: "eu-central-1", name: "Europe (Frankfurt)" },
  { region: "eu-central-2", name: "Europe (Zurich)" },
  { region: "eu-west-1", name: "Europe (Ireland)" },
  { region: "eu-west-2", name: "Europe (London)" },
  { region: "eu-west-3", name: "Europe (Paris)" },
  { region: "eu-south-1", name: "Europe (Milan)" },
  { region: "eu-south-2", name: "Europe (Spain)" },
  { region: "eu-north-1", name: "Europe (Stockholm)" },
  { region: "il-central-1", name: "Israel (Tel Aviv)" },
  { region: "me-central-1", name: "Middle East (UAE)" },
  { region: "me-south-1", name: "Middle East (Bahrain)" },
  { region: "sa-east-1", name: "South America (Sao Paulo)" },
];

const REGION_IDS = new Set(REGIONS.map((r) => r.region));

export function isKnownRegion(region: string): boolean {
  return REGION_IDS.has(region);
}

/** In-memory session + plan store. One instance per server process. */
export class SessionStore {
  private sessions = new Map<string, SessionInfo>();
  private plans = new Map<string, PlanInfo>();
  private sessionSeq = 0;
  private planSeq = 0;

  startSession(opts: StartSessionOptions): SessionInfo {
    const region = opts.region ?? DEFAULT_REGION;
    if (!isKnownRegion(region)) {
      throw new Error(`Unknown AWS region: ${region}`);
    }
    this.sessionSeq += 1;
    const info: SessionInfo = {
      session_id: `session-${this.sessionSeq}`,
      profile: opts.profile ?? DEFAULT_PROFILE,
      region,
      status: "active",
      seq: this.sessionSeq,
    };
    this.sessions.set(info.session_id, info);
    return { ...info };
  }

  private requireSession(sessionId: string): SessionInfo {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown session: ${sessionId}`);
    return session;
  }

  private requireActiveSession(sessionId: string): SessionInfo {
    const session = this.requireSession(sessionId);
    if (session.status === "ended") {
      throw new Error(`Session has ended: ${sessionId}`);
    }
    return session;
  }

  getSessionInfo(opts: SessionIdOptions): SessionInfo {
    return { ...this.requireSession(opts.session_id) };
  }

  endSession(opts: SessionIdOptions): SessionInfo {
    const session = this.requireActiveSession(opts.session_id);
    session.status = "ended";
    return { ...session };
  }

  setRegion(opts: SetRegionOptions): SessionInfo {
    if (!isKnownRegion(opts.region)) {
      throw new Error(`Unknown AWS region: ${opts.region}`);
    }
    const session = this.requireActiveSession(opts.session_id);
    session.region = opts.region;
    return { ...session };
  }

  setProfile(opts: SetProfileOptions): SessionInfo {
    const profile = opts.profile.trim();
    if (!profile) throw new Error("profile must not be empty");
    const session = this.requireActiveSession(opts.session_id);
    session.profile = profile;
    return { ...session };
  }

  listRegions(): { regions: RegionInfo[]; count: number } {
    return { regions: REGIONS.map((r) => ({ ...r })), count: REGIONS.length };
  }

  createPlan(opts: CreatePlanOptions): PlanInfo {
    const session = this.requireActiveSession(opts.session_id);
    const title = opts.title.trim();
    if (!title) throw new Error("plan title must not be empty");
    this.planSeq += 1;
    const steps: PlanStep[] = (opts.steps ?? []).map((t) => ({
      title: t,
      status: "pending" as const,
    }));
    const plan: PlanInfo = {
      plan_id: `plan-${this.planSeq}`,
      session_id: session.session_id,
      title,
      steps,
      current_step: steps.length === 0 ? 0 : 0,
      status: steps.length === 0 ? "completed" : "in_progress",
    };
    this.plans.set(plan.plan_id, plan);
    return structuredClone(plan);
  }

  private requirePlan(opts: PlanRefOptions): PlanInfo {
    this.requireActiveSession(opts.session_id);
    const plan = this.plans.get(opts.plan_id);
    if (!plan || plan.session_id !== opts.session_id) {
      throw new Error(`Unknown plan: ${opts.plan_id} for session ${opts.session_id}`);
    }
    return plan;
  }

  advancePlanStep(opts: PlanRefOptions): PlanInfo {
    const plan = this.requirePlan(opts);
    if (plan.status === "completed") {
      throw new Error(`Plan is already completed: ${opts.plan_id}`);
    }
    plan.steps[plan.current_step].status = "completed";
    plan.current_step += 1;
    if (plan.current_step >= plan.steps.length) {
      plan.status = "completed";
    }
    return structuredClone(plan);
  }

  getPlan(opts: PlanRefOptions): PlanInfo {
    return structuredClone(this.requirePlan(opts));
  }
}

/** Dispatch a tool call by name against a store. */
export function callTool(
  store: SessionStore,
  name: string,
  args: Record<string, unknown>,
): unknown {
  switch (name) {
    case "start_session":
      return store.startSession(args as unknown as StartSessionOptions);
    case "get_session_info":
      return store.getSessionInfo(args as unknown as SessionIdOptions);
    case "end_session":
      return store.endSession(args as unknown as SessionIdOptions);
    case "set_region":
      return store.setRegion(args as unknown as SetRegionOptions);
    case "set_profile":
      return store.setProfile(args as unknown as SetProfileOptions);
    case "list_regions":
      return store.listRegions();
    case "create_plan":
      return store.createPlan(args as unknown as CreatePlanOptions);
    case "advance_plan_step":
      return store.advancePlanStep(args as unknown as PlanRefOptions);
    case "get_plan":
      return store.getPlan(args as unknown as PlanRefOptions);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

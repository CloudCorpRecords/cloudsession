import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { callTool, isKnownRegion, REGIONS, SessionStore } from "../src/session.js";
import type { PlanInfo, SessionInfo } from "../src/types.js";

describe("cloudsession core", () => {
  it("start_session applies defaults and deterministic IDs", () => {
    const store = new SessionStore();
    const s1 = store.startSession({}) as SessionInfo;
    assert.deepEqual(s1, {
      session_id: "session-1", profile: "default", region: "us-east-1",
      status: "active", seq: 1,
    });
    const s2 = store.startSession({ profile: "work", region: "eu-west-1" }) as SessionInfo;
    assert.equal(s2.session_id, "session-2");
    assert.equal(s2.profile, "work");
    assert.equal(s2.region, "eu-west-1");
  });

  it("start_session rejects unknown regions", () => {
    const store = new SessionStore();
    assert.throws(() => store.startSession({ region: "moon-1" }), /Unknown AWS region: moon-1/);
  });

  it("get_session_info returns stored state and rejects unknown sessions", () => {
    const store = new SessionStore();
    store.startSession({ profile: "dev" });
    const info = store.getSessionInfo({ session_id: "session-1" }) as SessionInfo;
    assert.equal(info.profile, "dev");
    assert.throws(() => store.getSessionInfo({ session_id: "session-9" }), /Unknown session: session-9/);
  });

  it("end_session marks the session ended and blocks further mutation", () => {
    const store = new SessionStore();
    store.startSession({});
    const ended = store.endSession({ session_id: "session-1" }) as SessionInfo;
    assert.equal(ended.status, "ended");
    assert.throws(() => store.endSession({ session_id: "session-1" }), /Session has ended: session-1/);
    assert.throws(
      () => store.setRegion({ session_id: "session-1", region: "us-west-2" }),
      /Session has ended: session-1/,
    );
    // Reading an ended session still works.
    assert.equal((store.getSessionInfo({ session_id: "session-1" }) as SessionInfo).status, "ended");
  });

  it("set_region updates the region and validates against the curated list", () => {
    const store = new SessionStore();
    store.startSession({});
    const updated = store.setRegion({ session_id: "session-1", region: "ap-southeast-2" }) as SessionInfo;
    assert.equal(updated.region, "ap-southeast-2");
    assert.throws(
      () => store.setRegion({ session_id: "session-1", region: "atlantis-1" }),
      /Unknown AWS region: atlantis-1/,
    );
  });

  it("set_profile updates the profile and rejects empty values", () => {
    const store = new SessionStore();
    store.startSession({});
    const updated = store.setProfile({ session_id: "session-1", profile: " prod " }) as SessionInfo;
    assert.equal(updated.profile, "prod");
    assert.throws(
      () => store.setProfile({ session_id: "session-1", profile: "  " }),
      /profile must not be empty/,
    );
  });

  it("list_regions returns the curated static list", () => {
    const store = new SessionStore();
    const out = store.listRegions();
    assert.equal(out.count, REGIONS.length);
    assert.ok(out.count >= 25);
    assert.ok(out.regions.some((r) => r.region === "us-east-1" && r.name.includes("Virginia")));
    assert.ok(isKnownRegion("eu-central-1"));
    assert.equal(isKnownRegion("xx-0"), false);
  });

  it("create_plan stores steps as pending with deterministic plan IDs", () => {
    const store = new SessionStore();
    store.startSession({});
    const plan = store.createPlan({
      session_id: "session-1", title: "Deploy API", steps: ["build", "test", "ship"],
    }) as PlanInfo;
    assert.equal(plan.plan_id, "plan-1");
    assert.equal(plan.status, "in_progress");
    assert.equal(plan.current_step, 0);
    assert.deepEqual(plan.steps.map((s) => s.status), ["pending", "pending", "pending"]);
    assert.deepEqual(plan.steps.map((s) => s.title), ["build", "test", "ship"]);
  });

  it("create_plan with no steps is immediately completed; empty titles are rejected", () => {
    const store = new SessionStore();
    store.startSession({});
    const plan = store.createPlan({ session_id: "session-1", title: "Trivial" }) as PlanInfo;
    assert.equal(plan.status, "completed");
    assert.throws(
      () => store.createPlan({ session_id: "session-1", title: " " }),
      /plan title must not be empty/,
    );
    assert.throws(
      () => store.createPlan({ session_id: "session-7", title: "Nope" }),
      /Unknown session: session-7/,
    );
  });

  it("advance_plan_step walks the steps and completes the plan", () => {
    const store = new SessionStore();
    store.startSession({});
    store.createPlan({ session_id: "session-1", title: "P", steps: ["a", "b"] });
    const after1 = store.advancePlanStep({ session_id: "session-1", plan_id: "plan-1" }) as PlanInfo;
    assert.equal(after1.current_step, 1);
    assert.equal(after1.status, "in_progress");
    assert.deepEqual(after1.steps.map((s) => s.status), ["completed", "pending"]);
    const after2 = store.advancePlanStep({ session_id: "session-1", plan_id: "plan-1" }) as PlanInfo;
    assert.equal(after2.status, "completed");
    assert.equal(after2.current_step, 2);
    assert.throws(
      () => store.advancePlanStep({ session_id: "session-1", plan_id: "plan-1" }),
      /Plan is already completed: plan-1/,
    );
  });

  it("get_plan returns a copy; plans are scoped to their session", () => {
    const store = new SessionStore();
    store.startSession({});
    store.startSession({});
    store.createPlan({ session_id: "session-1", title: "P", steps: ["a"] });
    const plan = store.getPlan({ session_id: "session-1", plan_id: "plan-1" }) as PlanInfo;
    assert.equal(plan.title, "P");
    plan.steps[0].status = "completed";
    const again = store.getPlan({ session_id: "session-1", plan_id: "plan-1" }) as PlanInfo;
    assert.equal(again.steps[0].status, "pending");
    assert.throws(
      () => store.getPlan({ session_id: "session-2", plan_id: "plan-1" }),
      /Unknown plan: plan-1 for session session-2/,
    );
    assert.throws(
      () => store.getPlan({ session_id: "session-1", plan_id: "plan-9" }),
      /Unknown plan: plan-9/,
    );
  });

  it("plans cannot be created or advanced after the session ends", () => {
    const store = new SessionStore();
    store.startSession({});
    store.createPlan({ session_id: "session-1", title: "P", steps: ["a"] });
    store.endSession({ session_id: "session-1" });
    assert.throws(
      () => store.createPlan({ session_id: "session-1", title: "Late" }),
      /Session has ended: session-1/,
    );
    assert.throws(
      () => store.advancePlanStep({ session_id: "session-1", plan_id: "plan-1" }),
      /Session has ended: session-1/,
    );
  });

  it("callTool dispatches every tool name and rejects unknown ones", () => {
    const store = new SessionStore();
    const started = callTool(store, "start_session", {}) as SessionInfo;
    assert.equal(started.session_id, "session-1");
    const regions = callTool(store, "list_regions", {}) as { count: number };
    assert.ok(regions.count >= 25);
    const plan = callTool(store, "create_plan", {
      session_id: "session-1", title: "Via dispatch", steps: ["only"],
    }) as PlanInfo;
    assert.equal(plan.plan_id, "plan-1");
    const advanced = callTool(store, "advance_plan_step", {
      session_id: "session-1", plan_id: "plan-1",
    }) as PlanInfo;
    assert.equal(advanced.status, "completed");
    const fetched = callTool(store, "get_plan", {
      session_id: "session-1", plan_id: "plan-1",
    }) as PlanInfo;
    assert.equal(fetched.title, "Via dispatch");
    assert.throws(() => callTool(store, "nope", {}), /Unknown tool: nope/);
  });
});

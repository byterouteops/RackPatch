import { describe, expect, it } from "vitest";
import { inventory } from "../scripts/sit-inventory";

/**
 * Every export of a "use server" file is callable from any client as a server action.
 * Each one must call an auth guard, or be on this reviewed list with the reason it is safe.
 */
const REVIEWED_UNGUARDED: Record<string, string> = {
  "bootstrap.ts:createFirstAdministrator": "refuses once any user exists (first-run setup only)",
  "bootstrap.ts:getBootstrapStatus": "returns only whether setup is needed",
  "collection.ts:listCollectionProfiles": "static list of supported device profiles",
  "pilot.ts:submitPilotRequest": "public pilot request form, rate-limited",
  "plan.ts:hashCsv": "pure hash of caller-supplied text, no data access",
};

describe("server action authorization guards", () => {
  const { actions } = inventory();

  it("finds the action modules", () => {
    expect(actions.length).toBeGreaterThan(50);
  });

  it("every exported server action calls a guard or is explicitly reviewed", () => {
    const unguarded = actions
      .filter((a) => a.guards.length === 0)
      .map((a) => `${a.file.replace("src/app/actions/", "")}:${a.name}`)
      .filter((key) => !(key in REVIEWED_UNGUARDED));
    expect(unguarded).toEqual([]);
  });

  it("internal helpers are not exported from server action files", () => {
    const names = actions.map((a) => a.name);
    expect(names).not.toContain("buildHandoverPayload");
    expect(names).not.toContain("assertPaidOrThrow");
  });
});

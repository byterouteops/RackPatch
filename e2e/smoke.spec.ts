import { expect, test } from "@playwright/test";

// Smoke tests for public pages. No login required; only the sign-in test needs a live DB.

test("landing page loads", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Know which cables are right",
  );
});

test("about page loads", async ({ page }) => {
  const res = await page.goto("/about");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "About RackPatch" })).toBeVisible();
});

test("sign-in page loads (requires DB)", async ({ page }) => {
  test.skip(!process.env.E2E_WITH_DB, "Set E2E_WITH_DB=1 when the app is connected to a database");
  const res = await page.goto("/sign-in");
  expect(res?.status()).toBe(200);
  await expect(page.getByText(/Operator sign-in|Create administrator/)).toBeVisible();
});

test("health endpoint responds", async ({ request }) => {
  const res = await request.get("/api/health");
  // 200 when the DB is reachable, 503 when it is not; both prove the route is served.
  expect([200, 503]).toContain(res.status());
  const body = await res.json();
  expect(typeof body.ok).toBe("boolean");
});

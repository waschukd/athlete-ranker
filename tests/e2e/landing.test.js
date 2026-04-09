import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test("loads and shows hero content", async ({ page }) => {
    await page.goto("/landing");
    await expect(page.locator("h1")).toContainText("See every athlete");
    await expect(page.locator("text=Get Started")).toBeVisible();
    await expect(page.locator("text=See how it works")).toBeVisible();
  });

  test("has correct meta tags", async ({ page }) => {
    await page.goto("/landing");
    const description = await page.locator('meta[name="description"]').getAttribute("content");
    expect(description).toContain("athlete evaluation");
  });

  test("Get Started links to sign in", async ({ page }) => {
    await page.goto("/landing");
    const link = page.locator("a", { hasText: "Get Started" }).first();
    await expect(link).toHaveAttribute("href", "/account/signin");
  });

  test("smooth scroll button exists", async ({ page }) => {
    await page.goto("/landing");
    await expect(page.locator("text=See how it works")).toBeVisible();
  });

  test("features section renders all 6 cards", async ({ page }) => {
    await page.goto("/landing");
    await expect(page.locator("text=Multi-Sport Support")).toBeVisible();
    await expect(page.locator("text=Role-Based Access")).toBeVisible();
    await expect(page.locator("text=Real-Time Scoring")).toBeVisible();
    await expect(page.locator("text=Automated Rankings")).toBeVisible();
    await expect(page.locator("text=Group Management")).toBeVisible();
    await expect(page.locator("text=Session Scheduling")).toBeVisible();
  });

  test("final CTA section renders", async ({ page }) => {
    await page.goto("/landing");
    await expect(page.locator("text=Ready to connect the dots?")).toBeVisible();
  });
});

test.describe("Authentication Flow", () => {
  test("unauthenticated root redirects to landing", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("**/landing");
    await expect(page.locator("h1")).toContainText("See every athlete");
  });

  test("sign in page loads", async ({ page }) => {
    await page.goto("/account/signin");
    await expect(page.locator("text=Sign in")).toBeVisible();
    await expect(page.locator('input[type="email"], input[placeholder*="email"]')).toBeVisible();
  });

  test("protected route redirects to sign in", async ({ page }) => {
    await page.goto("/association/dashboard");
    await page.waitForURL("**/account/signin");
  });

  test("invalid login shows error", async ({ page }) => {
    await page.goto("/account/signin");
    await page.fill('input[type="email"], input[placeholder*="email"]', "fake@test.com");
    await page.fill('input[type="password"], input[placeholder*="password"]', "wrongpassword");
    await page.click('button[type="submit"], button:has-text("Sign in")');
    await expect(page.locator("text=Invalid credentials").or(page.locator("text=Login failed"))).toBeVisible({ timeout: 5000 });
  });
});

test.describe("404 Page", () => {
  test("shows not found for invalid routes", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");
    // Should either show 404 or redirect to signin
    const content = await page.textContent("body");
    expect(content.includes("404") || content.includes("Sign in")).toBe(true);
  });
});

test.describe("PWA", () => {
  test("manifest is accessible", async ({ page }) => {
    const response = await page.goto("/manifest.json");
    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json.name).toBe("Sideline Star");
    expect(json.display).toBe("standalone");
  });

  test("robots.txt is accessible", async ({ page }) => {
    const response = await page.goto("/robots.txt");
    expect(response.status()).toBe(200);
    const text = await response.text();
    expect(text).toContain("Disallow: /api/");
  });

  test("service worker is accessible", async ({ page }) => {
    const response = await page.goto("/sw.js");
    expect(response.status()).toBe(200);
  });
});

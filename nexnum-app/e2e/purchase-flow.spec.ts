import { test, expect } from '@playwright/test';

// ============================================================================
// PUBLIC PAGES TESTS (No Auth Required)
// ============================================================================

test.describe('Landing Page', () => {
    test('should load homepage and display key elements', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('text=/NexNum/i').first()).toBeVisible({ timeout: 10000 });
        const getStartedBtn = page.getByRole('link', { name: /get started|sign up/i });
        await expect(getStartedBtn.first()).toBeVisible();
    });

    test('should navigate to login page', async ({ page }) => {
        await page.goto('/');
        const loginLink = page.getByRole('link', { name: /log in|login|sign in/i });
        await loginLink.first().click();
        await expect(page).toHaveURL(/login/);
    });
});

test.describe('Watch Demo Page', () => {
    test('should load demo page', async ({ page }) => {
        await page.goto('/watch-demo');
        await expect(page.locator('text=/demo|live/i').first()).toBeVisible({ timeout: 10000 });
    });
});

// ============================================================================
// AUTHENTICATED TESTS
// ============================================================================

const hasCredentials = Boolean(process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD);

// Helper function to login
async function loginUser(page: any) {
    const email = process.env.TEST_USER_EMAIL!;
    const password = process.env.TEST_USER_PASSWORD!;

    await page.goto('/login');

    // Wait for any loading screen to disappear and form to be ready
    // The login page may show "Verifying Protocol" LoadingScreen initially
    await page.waitForLoadState('networkidle');

    // Wait for email input to be visible (form is ready)
    const emailInput = page.locator('input[type="email"]');
    await emailInput.first().waitFor({ state: 'visible', timeout: 20000 });

    // Fill credentials
    await emailInput.first().fill(email);
    await page.locator('input[type="password"]').first().fill(password);

    // Submit
    await page.locator('button[type="submit"]').first().click();

    // Wait for dashboard - may take time if slow network
    await expect(page).toHaveURL(/dashboard/, { timeout: 30000 });
}

test.describe('Purchase Flow (Authenticated)', () => {
    test.skip(!hasCredentials, 'Skipping: credentials not set');
    test.setTimeout(60000); // 60s timeout for auth tests

    test('should login and access dashboard', async ({ page }) => {
        await loginUser(page);
        await expect(page.locator('text=/dashboard|wallet|balance|buy/i').first()).toBeVisible({ timeout: 10000 });
    });

    test('should complete service and country selection', async ({ page }) => {
        await loginUser(page);

        // Navigate to buy page
        await page.goto('/dashboard/buy');
        await expect(page.locator('text=/select service/i').first()).toBeVisible({ timeout: 15000 });

        // Click first service card
        const serviceCard = page.locator('[data-testid="service-card"]').first();
        await serviceCard.waitFor({ state: 'visible', timeout: 10000 });
        await serviceCard.click();

        // Wait for country selection
        await expect(page.locator('text=/select country/i').first()).toBeVisible({ timeout: 15000 });

        // Click first country
        const countryCard = page.locator('.space-y-2 > div, [data-testid="country-card"]').filter({ hasText: /\$/ }).first();
        await countryCard.click();

        // Wait for provider selection
        await expect(page.locator('text=/select provider/i').first()).toBeVisible({ timeout: 15000 });
    });

    test('should show purchase button on provider step', async ({ page }) => {
        await loginUser(page);
        await page.goto('/dashboard/buy');

        // Quick navigation
        await page.locator('[data-testid="service-card"]').first().click();
        await page.waitForTimeout(500);

        await page.locator('.space-y-2 > div').filter({ hasText: /\$/ }).first().click();
        await page.waitForTimeout(500);

        // Verify purchase button
        await expect(page.locator('text=/select provider/i').first()).toBeVisible({ timeout: 15000 });
        const purchaseBtn = page.locator('button:has-text("Buy"), button:has-text("Purchase")').first();
        await expect(purchaseBtn).toBeVisible({ timeout: 10000 });
    });
});

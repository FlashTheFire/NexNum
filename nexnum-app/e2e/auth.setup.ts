import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '../.auth/user.json');

setup('authenticate', async ({ page }) => {
    // Get credentials from environment variables
    const email = process.env.TEST_USER_EMAIL;
    const password = process.env.TEST_USER_PASSWORD;

    if (!email || !password) {
        console.warn('⚠️ TEST_USER_EMAIL or TEST_USER_PASSWORD not set. Skipping auth setup.');
        return;
    }

    // Go to login page
    await page.goto('/login');

    // Wait for login form to be visible
    await page.waitForSelector('input[type="email"], input[placeholder*="email" i]', { timeout: 10000 });

    // Fill in credentials
    await page.fill('input[type="email"], input[placeholder*="email" i]', email);
    await page.fill('input[type="password"], input[placeholder*="password" i]', password);

    // Click sign in button
    await page.click('button[type="submit"], button:has-text("Sign In")');

    // Wait for redirect to dashboard
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

    // Save authentication state
    await page.context().storageState({ path: authFile });
});

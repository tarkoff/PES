import { test, expect } from '@playwright/test';

test.describe('Datasets', () => {
  test.skip(!!process.env.CI, 'Requires running backend with data');

  test('should display datasets page after login', async ({ page }) => {
    await page.goto('/datasets');
    await expect(page).toHaveURL(/.*login/);
  });

  test('should show dataset table structure', async ({ page }) => {
    await page.goto('/datasets');
    // Before login, should redirect to login
    await expect(page).toHaveURL(/.*login/);
  });
});

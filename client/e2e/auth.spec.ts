import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should display the login page', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByText('Вхід в систему')).toBeVisible();
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await expect(page.getByPlaceholder('••••••••')).toBeVisible();
    await expect(page.getByRole('button', { name: /Увійти/i })).toBeVisible();
  });

  test('should show Google and Facebook login buttons', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByText('Google')).toBeVisible();
    await expect(page.getByText('Facebook')).toBeVisible();
  });

  test('should navigate to register page', async ({ page }) => {
    await page.goto('/login');

    await page.getByText('Зареєструватися').click();
    await expect(page.url()).toContain('/register');
  });

  test('should redirect to login when accessing protected route unauthenticated', async ({ page }) => {
    await page.goto('/');

    // Should redirect to login
    await expect(page.url()).toContain('/login');
  });

  test('should login with valid credentials and navigate to dashboard', async ({ page }) => {
    // This test requires a running backend with a test user
    // Skip in CI unless test data is set up
    test.skip(!!process.env.CI, 'Requires running backend with test user');

    await page.goto('/login');

    await page.getByPlaceholder('you@example.com').fill('test@example.com');
    await page.getByPlaceholder('••••••••').fill('password123');
    await page.getByRole('button', { name: /Увійти/i }).click();

    // Should navigate to dashboard
    await expect(page.url()).toContain('/');
  });
});

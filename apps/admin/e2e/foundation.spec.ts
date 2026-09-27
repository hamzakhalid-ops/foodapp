import { expect, test } from '@playwright/test';

test('serves the admin foundation with baseline security headers', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'QuickBite Admin' })).toBeVisible();

  const headers = response?.headers() ?? {};
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-powered-by']).toBeUndefined();
});

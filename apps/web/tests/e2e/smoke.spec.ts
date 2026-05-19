import { expect, test } from '@playwright/test';

test('console landing renders and shows the F0 placeholder', async ({ page }) => {
  await page.goto('/operations');
  await expect(page.getByRole('heading', { name: 'Operations' })).toBeVisible();
  await expect(page.getByText('Phase F0 — engineering foundations.')).toBeVisible();
});

test('client portal landing renders', async ({ page }) => {
  await page.goto('/portal');
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
});

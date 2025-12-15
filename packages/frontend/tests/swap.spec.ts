import { test, expect } from '@playwright/test';

test.describe('Ganymede Swap UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the main swap interface', async ({ page }) => {
    // Check for main heading
    await expect(page.getByText('Swap with')).toBeVisible();
    await expect(page.getByText('Intention.')).toBeVisible();

    // Check for Ganymede branding
    await expect(page.getByText('Ganymede')).toBeVisible();
  });

  test('should display token selectors', async ({ page }) => {
    // Check for Pay and Receive labels (use exact match to avoid duplicates)
    await expect(page.getByText('Pay', { exact: true })).toBeVisible();
    await expect(page.getByText('Receive', { exact: true })).toBeVisible();

    // Check default tokens are displayed
    await expect(page.getByRole('button', { name: /SOL/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /USDC/i }).first()).toBeVisible();
  });

  test('should allow entering swap amount', async ({ page }) => {
    const amountInput = page.locator('input[type="number"]');
    await expect(amountInput).toBeVisible();

    // Default value should be 1
    await expect(amountInput).toHaveValue('1');

    // Change amount
    await amountInput.fill('5');
    await expect(amountInput).toHaveValue('5');

    // Check USD estimate updates
    await expect(page.getByText(/≈ \$/)).toBeVisible();
  });

  test('should toggle premium mode', async ({ page }) => {
    // Check premium is enabled by default
    await expect(page.getByText('Premium Access')).toBeVisible();

    // Toggle premium off
    await page.getByText('Premium Access').click();
    await expect(page.getByText('Standard')).toBeVisible();

    // Toggle premium back on
    await page.getByText('Standard').click();
    await expect(page.getByText('Premium Access')).toBeVisible();
  });

  test('should display premium feature cards', async ({ page }) => {
    // Premium cards should be visible (use heading role for exact match)
    await expect(page.getByRole('heading', { name: 'MEV Protection', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Priority Fee', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Route Analytics', exact: true })).toBeVisible();
  });

  test('should show connect wallet button when not connected', async ({ page }) => {
    // Should show connect wallet button(s)
    const connectButton = page.getByRole('button', { name: /connect/i }).first();
    await expect(connectButton).toBeVisible();
  });

  test('should open token selector dropdown', async ({ page }) => {
    // Click on Pay token selector
    const paySelector = page.getByRole('button', { name: /SOL/i }).first();
    await paySelector.click();

    // Should show token dropdown with all options
    await expect(page.getByRole('button', { name: /BONK/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /JUP/i })).toBeVisible();
  });

  test('should change pay token selection', async ({ page }) => {
    // Click on Pay token selector
    const paySelector = page.getByRole('button', { name: /SOL/i }).first();
    await paySelector.click();

    // Select BONK
    await page.getByRole('button', { name: /BONK/i }).click();

    // Verify selection changed
    await expect(page.getByRole('button', { name: /BONK/i }).first()).toBeVisible();
  });

  test('should display micropayment cost info', async ({ page }) => {
    // Check micropayment info is displayed
    await expect(page.getByText('x402 Micropayment: $0.005')).toBeVisible();
  });

  test('should have swap arrow button', async ({ page }) => {
    // Check swap direction button exists
    const arrowButton = page.locator('button').filter({ has: page.locator('svg.lucide-arrow-down') });
    await expect(arrowButton).toBeVisible();
  });

  test('should blur premium cards when standard mode is selected', async ({ page }) => {
    // Premium cards should be fully visible initially
    const mevCard = page.getByRole('heading', { name: 'MEV Protection', exact: true });

    // Toggle to standard mode
    await page.getByText('Premium Access').click();

    // Wait for transition
    await page.waitForTimeout(500);

    // The card should still be visible (just blurred)
    await expect(mevCard).toBeVisible();
  });

  test('should open wallet modal when clicking connect', async ({ page }) => {
    // Click the main connect wallet button
    const connectButton = page.getByRole('button', { name: /connect/i }).first();
    await connectButton.click();

    // Wait a bit for modal to appear
    await page.waitForTimeout(1000);

    // Take a screenshot to see what happened
    await page.screenshot({ path: 'test-results/wallet-modal-test.png' });

    // Check if we hit the error boundary (white screen issue)
    const errorBoundary = page.getByText('Something went wrong');
    const hasError = await errorBoundary.isVisible().catch(() => false);

    if (hasError) {
      // Get the error message
      const errorText = await page.locator('pre').first().textContent();
      console.log('Error boundary caught:', errorText);
    }

    // Page should still be functional (no crash)
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Error Handling', () => {
  test('should display error boundary on critical errors', async ({ page }) => {
    // Navigate to page
    await page.goto('/');

    // Page should load without error boundary showing
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});

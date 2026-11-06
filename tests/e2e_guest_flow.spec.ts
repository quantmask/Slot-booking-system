import { test, expect } from '@playwright/test';

test.describe('Slotbook Guest Booking & Management Flow', () => {
  test('Complete end-to-end booking flow with hold timer and calendar confirmation', async ({ page }) => {
    // 1. Visit public booking page
    await page.goto('/alex/quick-catchup');
    await expect(page.locator('h1')).toContainText('Executive Strategy Consultation');

    // 2. Select timezone
    await page.locator('select').selectOption('America/New_York');

    // 3. Click first available slot
    const firstSlot = page.locator('button:has-text(":")').first();
    await expect(firstSlot).toBeVisible();
    await firstSlot.click();

    // 4. Fill guest details
    await page.fill('input[placeholder="Jane Doe"]', 'Playwright Tester');
    await page.fill('input[placeholder="jane@company.com"]', 'e2e@slotbook.io');

    // 5. Submit confirmation
    await page.click('button:has-text("Confirm Appointment")');

    // 6. Verify confirmation screen
    await expect(page.locator('text=Booking Confirmed')).toBeVisible();
    await expect(page.locator('text=Download .ics Calendar')).toBeVisible();
  });
});


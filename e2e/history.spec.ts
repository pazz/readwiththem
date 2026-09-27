import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { startWithSample } from './helpers'

test.beforeEach(async ({ page }) => {
  await startWithSample(page)
  await page.getByRole('button', { name: 'History' }).click()
  await page.getByRole('button', { name: 'All time' }).click()
})

test('shows the active child’s readings for the chosen period', async ({ page }) => {
  await expect(page.getByText('4 readings · 3 books')).toBeVisible()
  await page.getByRole('button', { name: 'This week' }).click()
  await expect(page.locator('.session-row')).not.toHaveCount(4)
})

test('removes a reading', async ({ page }) => {
  await page.locator('.session-row').first().getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByText('3 readings · 2 books')).toBeVisible()
})

test('copies the list as text', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('button', { name: 'Copy text' }).click()
  const text = await page.evaluate(() => navigator.clipboard.readText())
  expect(text).toContain("Freya's books")
  expect(text).toContain('- The Gruffalo — Julia Donaldson')
  expect(text).toContain('  - Loved the mouse')
})

test('downloads a spreadsheet and an image', async ({ page }) => {
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('radio', { name: 'Spreadsheet' }).click()
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download spreadsheet' }).click()])
  expect(csv.suggestedFilename()).toBe('read-with-freya-all-time.csv')
  const rows = readFileSync(await csv.path(), 'utf8')
    .trim()
    .split('\n')
  expect(rows).toHaveLength(5)

  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('radio', { name: 'Image' }).click()
  const [png] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download image' }).click()])
  expect(png.suggestedFilename()).toBe('read-with-freya-all-time.png')
})

test('prints the list', async ({ page }) => {
  await page.evaluate(() => (window.print = () => document.body.setAttribute('data-printed', '')))
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('radio', { name: 'Print / PDF' }).click()
  await expect(page.locator('.print-root li')).toHaveCount(3)
  await page.getByRole('button', { name: 'Print / save as PDF' }).click()
  await expect(page.locator('body')).toHaveAttribute('data-printed', '')
})

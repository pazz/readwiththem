import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { openSettings, startWithSample } from './helpers'

test.beforeEach(({ page }) => startWithSample(page))

test('downloads a backup that restores everything', async ({ page }) => {
  await openSettings(page)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download full backup/ }).click()])
  const backup = JSON.parse(readFileSync(await download.path(), 'utf8'))
  expect(backup.children).toHaveLength(2)
  expect(backup.sessions).toHaveLength(5)
  expect(backup.coverPhotos).toHaveLength(1)
})

test('a child’s colour becomes the accent', async ({ page }) => {
  await openSettings(page)
  await page.getByRole('button', { name: /^Children/ }).click()
  await page.getByRole('button', { name: 'Colour for Freya' }).click()
  await page.getByRole('button', { name: 'Plum' }).click()
  await expect(page.locator('html')).toHaveAttribute('style', /--child-primary: #6b4c6e/)
})

test('removing the active child falls back to another', async ({ page }) => {
  await openSettings(page)
  await page.getByRole('button', { name: /^Children/ }).click()
  await page.locator('.child-list li', { hasText: 'Freya' }).getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByRole('heading', { name: 'Read with Arlo' })).toBeVisible()
})

test('reset deletes everything and starts again', async ({ page }) => {
  await openSettings(page)
  await page.getByRole('button', { name: /Reset all data/ }).click()
  await expect(page.getByText('First, add it to your home screen')).toBeVisible()
})

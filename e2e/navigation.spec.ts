import { expect, test } from '@playwright/test'
import { openSettings, startWithSample } from './helpers'

test.beforeEach(({ page }) => startWithSample(page))

test('back returns to the previous screen', async ({ page }) => {
  await page.getByRole('button', { name: 'History' }).click()
  await expect(page).toHaveURL(/#\/history$/)
  await page.goBack()
  await expect(page.getByText('New reading for Freya')).toBeVisible()
})

test('back closes an open sheet without leaving the screen', async ({ page }) => {
  await openSettings(page)
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden()
  await expect(page.getByText('New reading for Freya')).toBeVisible()
})

test('choosing a child returns to the screen it was opened from', async ({ page }) => {
  await page.getByRole('button', { name: 'History' }).click()
  await openSettings(page)
  await page.getByRole('button', { name: /^Children/ }).click()
  await page.getByRole('button', { name: /^Arlo/ }).click()
  await expect(page).toHaveURL(/#\/history$/)
  await expect(page.getByRole('heading', { name: 'Read with Arlo' })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/#\/log$/)
})

test('a reload keeps the current screen', async ({ page }) => {
  await page.getByRole('button', { name: 'History' }).click()
  await page.reload()
  await expect(page.getByText('Period')).toBeVisible()
})

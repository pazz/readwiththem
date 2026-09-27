import { expect, test } from '@playwright/test'
import { stubNetwork } from './helpers'

test('a first visit explains the app, then adds a child and opens the log', async ({ page }) => {
  await stubNetwork(page)
  await page.goto('/')
  await expect(page.getByText('First, add it to your home screen')).toBeVisible()
  await page.getByRole('button', { name: 'Continue in the browser instead' }).click()

  await expect(page.getByText('Add a child above to get started.')).toBeVisible()
  await page.getByPlaceholder("Child's name").fill('Mo')
  await page.getByRole('button', { name: 'Add child' }).click()

  await expect(page.getByRole('heading', { name: 'Read with Mo' })).toBeVisible()
  await expect(page.getByText('New reading for Mo')).toBeVisible()
})

test('a returning visitor goes straight to the log', async ({ page }) => {
  await stubNetwork(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue in the browser instead' }).click()
  await page.getByPlaceholder("Child's name").fill('Mo')
  await page.getByRole('button', { name: 'Add child' }).click()
  await expect(page.getByText('New reading for Mo')).toBeVisible()
  await page.goto('/')
  await expect(page.getByText('New reading for Mo')).toBeVisible()
})

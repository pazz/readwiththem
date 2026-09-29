import { expect, test } from '@playwright/test'
import { startWithSample } from './helpers'

test.beforeEach(({ page }) => startWithSample(page))

test('read again logs a book in one tap and praises the parent', async ({ page }) => {
  await page.getByRole('button', { name: 'Read again' }).click()
  const covers = page.locator('.cascade-item')
  await expect(covers).toHaveText(['Stick Man', 'The Gruffalo', 'Home Made Book'])
  await covers.first().click()
  await expect(page.getByRole('status')).toContainText('Stick Man')
})

test('search, pick, rate and log a new book', async ({ page }) => {
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByPlaceholder('Search title or author').fill('broom')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByText('Room on the Broom — Julia Donaldson').click()
  await expect(page.getByRole('button', { name: 'Change' })).toBeVisible()
  await page.getByRole('radio', { name: '4 stars' }).click()
  await page.getByPlaceholder('Note (optional)').fill('Witch voice')
  await page.getByRole('button', { name: 'Log reading' }).click()

  await expect(page.getByRole('status')).toContainText('Room on the Broom')
  await expect(page.getByPlaceholder('Note (optional)')).toHaveValue('')
  await page.getByRole('button', { name: 'History' }).click()
  await expect(page.locator('.session-row').first()).toContainText('Witch voice')
})

test('finds a German book by its German title', async ({ page }) => {
  await page.route('https://inventaire.io/api/**', (r) =>
    r.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      json: { results: [{ id: 'Q491657', label: 'Die kleine Raupe Nimmersatt', description: 'Buch von Eric Carle', _score: 1000 }] },
    }),
  )
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByPlaceholder('Search title or author').fill('kleine Raupe Nimmersatt')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByText('Die kleine Raupe Nimmersatt — Eric Carle')).toBeVisible()
})

test('add a book by hand', async ({ page }) => {
  await page.getByRole('button', { name: 'Add manually' }).click()
  await page.getByLabel('Title').fill('Hand Written')
  await page.getByLabel('Author').fill('Grandma')
  await page.getByRole('button', { name: 'Log reading' }).click()
  await expect(page.getByRole('status')).toContainText('Hand Written')
})

test('logging without a book explains what is missing', async ({ page }) => {
  await page.getByRole('button', { name: 'Log reading' }).click()
  await expect(page.getByText('Search and pick a book, or enter a title manually.')).toBeVisible()
})

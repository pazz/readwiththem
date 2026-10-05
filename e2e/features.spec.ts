import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { isoDaysAgo, openSettings, sampleBackup, startWithSample, stubNetwork, writeBackupFile } from './helpers'

const toHistory = async (page: Page) => {
  await page.getByRole('button', { name: 'History' }).click()
  await page.getByRole('button', { name: 'All time' }).click()
}

test.describe('with the sample family', () => {
  test.beforeEach(({ page }) => startWithSample(page))

  test('edits a reading', async ({ page }) => {
    await toHistory(page)
    await page.locator('.session-row').first().getByRole('button', { name: 'Edit' }).click()
    const sheet = page.getByRole('dialog', { name: 'Edit reading' })
    await sheet.getByRole('button', { name: 'Yesterday' }).click()
    await sheet.getByLabel('Note').fill('Much less scary now')
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.locator('.session-row').first()).toContainText('Much less scary now')
  })

  test('clears the rating of a reading', async ({ page }) => {
    await toHistory(page)
    const row = page.locator('.session-row', { hasText: 'Scary bit' })
    await expect(row).toContainText('★★★')
    await row.getByRole('button', { name: 'Edit' }).click()
    const sheet = page.getByRole('dialog', { name: 'Edit reading' })
    await sheet.getByRole('button', { name: 'Clear rating' }).click()
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.locator('.session-row', { hasText: 'Scary bit' })).not.toContainText('★')
  })

  test('opens a book, and corrects its title and language', async ({ page }) => {
    await toHistory(page)
    await page.getByRole('button', { name: 'The Gruffalo' }).first().click()
    const sheet = page.getByRole('dialog', { name: 'The Gruffalo' })
    await expect(sheet).toContainText('Read 2 times with Freya')
    await expect(sheet).toContainText('Loved the mouse')
    await sheet.getByRole('button', { name: 'Edit title, author and language' }).click()
    await sheet.getByLabel('Title').fill('The Gruffalo (board book)')
    await sheet.getByLabel('Language').selectOption('de')
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'The Gruffalo (board book)' }).first()).toBeVisible()
    await expect(page.locator('.session-row', { hasText: 'The Gruffalo (board book)' }).first().locator('.lang-badge')).toHaveText('DE')
  })

  test('filters History by title and shows readable dates', async ({ page }) => {
    await toHistory(page)
    await page.getByLabel('Filter by title').fill('gruff')
    await expect(page.getByText('2 readings · 1 book')).toBeVisible()
    await expect(page.locator('.session-row').first()).toContainText(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2} \d{4}/)
  })

  test('logs one reading for two children at once, dated yesterday', async ({ page }) => {
    await page.getByRole('button', { name: 'Arlo' }).click()
    await page.getByRole('button', { name: 'Yesterday' }).click()
    await page.getByRole('button', { name: 'Read again' }).click()
    await page.locator('.cascade-item', { hasText: 'The Gruffalo' }).click()
    await expect(page.getByRole('status')).toBeVisible()

    await openSettings(page)
    await page.getByRole('button', { name: /^Children/ }).click()
    await page.getByRole('button', { name: /^Arlo/ }).click()
    await toHistory(page)
    await expect(page.locator('.session-row', { hasText: 'The Gruffalo' })).toHaveCount(1)
  })

  test('edits a child', async ({ page }) => {
    await openSettings(page)
    await page.getByRole('button', { name: /^Children/ }).click()
    await page.locator('.child-list li', { hasText: 'Freya' }).getByRole('button', { name: 'Edit' }).click()
    await page.getByLabel('Name').fill('Freya Rose')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { name: 'Read with Freya Rose' })).toBeVisible()
  })

  test('the reading goal is off until set, then counts the current period', async ({ page }) => {
    await toHistory(page)
    await expect(page.locator('.goal-card')).toHaveCount(0)
    await openSettings(page)
    await page.getByRole('button', { name: 'Monthly' }).click()
    await page.getByRole('spinbutton').fill('3')
    await page.goBack()
    // The sample has readings 1, 2, 20 and 40 days ago: at most three fall in this month.
    await expect(page.locator('.goal-card')).toContainText(/of 3 books with Freya this month|Goal reached: 3 books with Freya this month/)
    await openSettings(page)
    await page.getByRole('button', { name: 'Yearly' }).click()
    await page.getByRole('button', { name: 'Off' }).click()
    await page.goBack()
    await expect(page.locator('.goal-card')).toHaveCount(0)
  })

  test('reminds about backups until one is made', async ({ page }) => {
    await toHistory(page)
    const reminder = page.getByRole('note')
    await expect(reminder).toContainText('saved only on this device')
    await Promise.all([page.waitForEvent('download'), reminder.getByRole('button', { name: 'Download backup' }).click()])
    await expect(reminder).toBeHidden()
    await openSettings(page)
    await expect(page.getByText('Last backup today')).toBeVisible()
  })

  test('switches between light and dark', async ({ page }) => {
    await openSettings(page)
    await page.getByRole('button', { name: 'Dark' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await openSettings(page)
    await page.getByRole('button', { name: 'Light' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })

  test('the export remembers its format and options', async ({ page }) => {
    await toHistory(page)
    await page.getByRole('button', { name: 'Export' }).click()
    await page.getByRole('radio', { name: 'Print / PDF' }).click()
    await page.getByLabel('Include cover images').uncheck()
    await page.goBack()
    await page.reload()
    await page.getByRole('button', { name: 'Export' }).click()
    await expect(page.getByRole('radio', { name: 'Print / PDF' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByLabel('Include cover images')).not.toBeChecked()
  })

  test('imports readings from a spreadsheet, skipping ones already there', async ({ page }) => {
    const csv = writeBackupFile('')
    const { writeFileSync } = await import('node:fs')
    writeFileSync(csv, `date,child,title,author\n${isoDaysAgo(3)},Freya,Zog,Julia Donaldson\n${isoDaysAgo(3)},Mo,Zog,Julia Donaldson\n`)
    await openSettings(page)
    await page.locator('input[accept=".csv,text/csv"]').setInputFiles(csv)
    await expect(page.getByText('Added 2 readings · new: Mo')).toBeVisible()
    await page.locator('input[accept=".csv,text/csv"]').setInputFiles(csv)
    await expect(page.getByText('Added 0 readings · 2 already here')).toBeVisible()
  })

  test('the spreadsheet export imports back cleanly', async ({ page }) => {
    await toHistory(page)
    await page.getByRole('button', { name: 'Export' }).click()
    await page.getByRole('radio', { name: 'Spreadsheet' }).click()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download spreadsheet' }).click(),
    ])
    const csv = writeBackupFile('')
    const { writeFileSync } = await import('node:fs')
    writeFileSync(csv, readFileSync(await download.path()))
    await openSettings(page)
    await page.locator('input[accept=".csv,text/csv"]').setInputFiles(csv)
    await expect(page.getByText('Added 0 readings · 4 already here')).toBeVisible()
  })
})

test('shares the list as text or a spreadsheet through the system share sheet', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { shared?: { text?: string; files?: string[] } }
    navigator.share = async (data) => void (w.shared = { text: data?.text, files: data?.files?.map((f) => f.name) })
    navigator.canShare = () => true
  })
  await startWithSample(page)
  await toHistory(page)
  const shared = () => page.evaluate(() => (window as unknown as { shared?: { text?: string; files?: string[] } }).shared)

  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('button', { name: 'Share…' }).click()
  expect((await shared())?.text).toContain("Freya's books")

  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('radio', { name: 'Spreadsheet' }).click()
  await page.getByRole('button', { name: 'Share…' }).click()
  expect((await shared())?.files).toEqual(['read-with-freya-all-time.csv'])
})

test('a damaged backup is refused and changes nothing', async ({ page }) => {
  await stubNetwork(page)
  page.on('dialog', (d) => d.accept())
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue in the browser instead' }).click()
  const damaged = sampleBackup()
  damaged.sessions[0].childId = 'nobody'
  await page.locator('input[type=file]').setInputFiles(writeBackupFile(damaged))
  await expect(page.getByText(/Could not restore: That backup is damaged: reading 1 belongs to a child/)).toBeVisible()
  await expect(page.getByText('Add a child above to get started.')).toBeVisible()
})

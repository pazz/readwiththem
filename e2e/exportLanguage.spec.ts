import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { sampleBackup, startWithSample } from './helpers'

test.describe("naming each book's language in an export", () => {
  const withLanguages = (languages: Record<string, string>) => {
    const backup = sampleBackup()
    for (const edition of backup.editions) Object.assign(edition, languages[edition.id] ? { language: languages[edition.id] } : {})
    return backup
  }
  const copiedText = async (page: Page, context: BrowserContext) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.getByRole('button', { name: 'History' }).click()
    await page.getByRole('button', { name: 'All time' }).click()
    await page.getByRole('button', { name: 'Export' }).click()
  }

  test('are named when the books mix languages, and can be turned off', async ({ page, context }) => {
    await startWithSample(page, withLanguages({ e1: 'en', e2: 'en', e3: 'de' }))
    await copiedText(page, context)
    await expect(page.getByLabel("Include each book's language")).toBeChecked()
    await page.getByRole('button', { name: 'Copy text' }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('- Home Made Book — Unknown [DE]')
  })

  test('are left out when every book is in the same language, unless asked for', async ({ page, context }) => {
    await startWithSample(page, withLanguages({ e1: 'en', e2: 'en', e3: 'en' }))
    await copiedText(page, context)
    const box = page.getByLabel("Include each book's language")
    await expect(box).not.toBeChecked()
    await box.check()
    await page.getByRole('button', { name: 'Copy text' }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('- The Gruffalo — Julia Donaldson [EN]')
  })
})

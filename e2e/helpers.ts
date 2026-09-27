import { expect, type Page } from '@playwright/test'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// A 2x3 brown PNG, standing in for every cover image.
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAFElEQVR4nGOcVhHFwMDAxMDAgKAAG0gBbglfL4oAAAAASUVORK5CYII=',
  'base64',
)

export function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Serves the catalogue and cover CDNs from fixtures, so no test touches the network.
export async function stubNetwork(page: Page) {
  const cors = { 'access-control-allow-origin': '*' }
  await page.route('https://covers.openlibrary.org/**', (r) => r.fulfill({ contentType: 'image/png', headers: cors, body: PNG }))
  await page.route('https://storage.ko-fi.com/**', (r) => r.fulfill({ contentType: 'image/png', body: PNG }))
  await page.route('https://openlibrary.org/search.json**', (r) =>
    r.fulfill({
      contentType: 'application/json',
      headers: cors,
      json: { docs: [{ title: 'Room on the Broom', author_name: ['Julia Donaldson'], cover_i: 9, isbn: ['9781405021746'] }] },
    }),
  )
  await page.route('https://www.googleapis.com/**', (r) =>
    r.fulfill({ contentType: 'application/json', headers: cors, json: { items: [] } }),
  )
}

// Two children; Freya has read three books, one of them twice and one with a photographed cover.
export function sampleBackup() {
  return {
    format: 'readwiththem-backup',
    version: 2,
    exportedAt: new Date().toISOString(),
    children: [
      { id: 'c1', name: 'Freya', birthYear: 2020, colour: '#3d6b85', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'c2', name: 'Arlo', createdAt: '2026-01-02T00:00:00.000Z' },
    ],
    editions: [
      {
        id: 'e1',
        title: 'The Gruffalo',
        author: 'Julia Donaldson',
        isbn: '9781509804757',
        coverUrl: 'https://covers.openlibrary.org/b/id/1-M.jpg',
        source: 'openlibrary',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'e2',
        title: 'Stick Man',
        author: 'Julia Donaldson',
        coverUrl: 'https://covers.openlibrary.org/b/id/2-M.jpg',
        source: 'openlibrary',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      { id: 'e3', title: 'Home Made Book', author: 'Unknown', source: 'manual', createdAt: '2026-01-01T00:00:00.000Z' },
    ],
    sessions: [
      {
        id: 's1',
        childId: 'c1',
        editionId: 'e1',
        date: isoDaysAgo(20),
        note: 'Loved the mouse',
        rating: 5,
        createdAt: '2026-01-01T19:00:00.000Z',
      },
      { id: 's2', childId: 'c1', editionId: 'e1', date: isoDaysAgo(2), createdAt: '2026-01-02T19:00:00.000Z' },
      {
        id: 's3',
        childId: 'c1',
        editionId: 'e2',
        date: isoDaysAgo(1),
        note: 'Scary bit',
        rating: 3,
        createdAt: '2026-01-03T19:00:00.000Z',
      },
      { id: 's4', childId: 'c1', editionId: 'e3', date: isoDaysAgo(40), createdAt: '2026-01-04T19:00:00.000Z' },
      { id: 's5', childId: 'c2', editionId: 'e2', date: isoDaysAgo(0), createdAt: '2026-01-05T19:00:00.000Z' },
    ],
    changeLog: [],
    coverPhotos: [{ editionId: 'e3', mimeType: 'image/png', base64: PNG.toString('base64') }],
  }
}

export function writeBackupFile(data: unknown): string {
  const path = join(mkdtempSync(join(tmpdir(), 'rwt-')), 'backup.json')
  writeFileSync(path, JSON.stringify(data))
  return path
}

// Opens the app fresh, restores the sample backup and picks Freya: the usual starting point.
export async function startWithSample(page: Page) {
  await stubNetwork(page)
  page.on('dialog', (d) => d.accept())
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue in the browser instead' }).click()
  await page.locator('input[type=file]').setInputFiles(writeBackupFile(sampleBackup()))
  await page.getByRole('button', { name: /^Freya/ }).click()
  await expect(page.getByRole('heading', { name: 'Read with Freya' })).toBeVisible()
}

export const openSettings = (page: Page) => page.getByRole('button', { name: 'Settings' }).click()

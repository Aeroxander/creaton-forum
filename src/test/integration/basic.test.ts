import { test, expect, type Page } from '@playwright/test'

const BASE_URL = process.env.ONE_SERVER_URL || 'http://localhost:8082'

test.describe('Basic Integration Tests', () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
  })

  test.afterAll(async () => {
    await page.close()
  })

  test('server should serve login page', async () => {
    const response = await page.goto(`${BASE_URL}/login`, {
      waitUntil: 'domcontentloaded',
    })
    expect(response?.status()).toBe(200)
  })
})

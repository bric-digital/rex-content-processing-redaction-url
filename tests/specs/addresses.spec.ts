// @ts-nocheck

import { test, expect, BASE_CONFIG, listEntry, loadConfig, resetCaptured, startWith, waitForModuleConfiguration } from './fixtures.js'

function configWith(pageEvents) {
  return { ...BASE_CONFIG, page_events: { enabled: true, ...pageEvents } }
}

async function openTab(serviceWorker, url) {
  return serviceWorker.evaluate(async (tabUrl) => {
    const tab = await chrome.tabs.create({ url: tabUrl })
    return tab.id
  }, url)
}

async function recordsFor(serviceWorker, tabId) {
  return serviceWorker.evaluate((id) => {
    return self.__capturedEvents.filter((e) => e.name === 'rex-page-event' && e.tab_id === id)
  }, tabId)
}

async function tabOpenRecord(serviceWorker, tabId) {
  await expect.poll(async () => {
    const records = await recordsFor(serviceWorker, tabId)
    return records.some((e) => e.event_type === 'tab_open')
  }, { timeout: 5000 }).toBe(true)

  const records = await recordsFor(serviceWorker, tabId)
  return records.find((e) => e.event_type === 'tab_open')
}

async function start(serviceWorker, config) {
  await startWith(serviceWorker, config.page_events)
}

test.describe('Address configuration', () => {
  test('with no allow list, the address is kept', async ({ serviceWorker }) => {
    await start(serviceWorker, configWith({}))

    const tabId = await openTab(serviceWorker, 'https://example.org/kept')
    const record = await tabOpenRecord(serviceWorker, tabId)

    expect(record.url).toContain('example.org/kept')
    expect(record.filtered).toBe(false)
    expect('domain' in record).toBe(false)
  })

  test('an address off the allow list is replaced', async ({ serviceWorker }) => {
    await start(serviceWorker, configWith({ lists: { 'test-allow': [listEntry('example.com', 'ALLOWED')] }, allow_lists: ['test-allow'] }))

    const tabId = await openTab(serviceWorker, 'https://example.org/hidden')
    const record = await tabOpenRecord(serviceWorker, tabId)

    expect(record.url).toBe('CATEGORY:NOT_ON_ALLOWLIST')
    expect(record.filtered_by_list).toBe('NOT_ON_ALLOWLIST')
    expect(record.title).toBe('')
    expect('domain' in record).toBe(false)
  })

  test('an empty allow list keeps the address', async ({ serviceWorker }) => {
    await start(serviceWorker, configWith({ allow_lists: [] }))

    const tabId = await openTab(serviceWorker, 'https://example.org/kept')
    const record = await tabOpenRecord(serviceWorker, tabId)

    expect(record.url).toContain('example.org/kept')
    expect(record.filtered).toBe(false)
  })

  test('a filter list applies when there are no allow lists', async ({ serviceWorker }) => {
    await start(serviceWorker, configWith({ lists: { 'test-filter': [listEntry('example.com', 'TEST_FILTERED')] }, filter_lists: ['test-filter'] }))

    const filteredTabId = await openTab(serviceWorker, 'https://example.com/private')
    const filtered = await tabOpenRecord(serviceWorker, filteredTabId)
    expect(filtered.url).toBe('CATEGORY:TEST_FILTERED')
    expect(filtered.filtered_by_list).toBe('test-filter')

    const keptTabId = await openTab(serviceWorker, 'https://example.org/public')
    const kept = await tabOpenRecord(serviceWorker, keptTabId)
    expect(kept.url).toContain('example.org/public')
  })

  test('a domain-only list hides the address and the title', async ({ serviceWorker }) => {
    await start(serviceWorker, configWith({ lists: { 'test-domain-only': [listEntry('example.net', 'TEST_DOMAIN')] }, domain_only_lists: ['test-domain-only'] }))

    const tabId = await openTab(serviceWorker, 'https://example.net/page')
    const record = await tabOpenRecord(serviceWorker, tabId)

    expect(record.url).toBe('')
    expect(record.title).toBe('')
    expect(record.domain).toBe('example.net')
    expect(record.filtered_by_list).toBe('test-domain-only')
  })

  test('a domain-only list takes precedence over a filter list', async ({ serviceWorker }) => {
    await start(serviceWorker, configWith({ lists: { 'test-both-filter': [listEntry('example.edu', 'TEST_FILTERED')], 'test-both-domain-only': [listEntry('example.edu', 'TEST_DOMAIN')] },
      filter_lists: ['test-both-filter'],
      domain_only_lists: ['test-both-domain-only'],
    }))

    const tabId = await openTab(serviceWorker, 'https://example.edu/page')
    const record = await tabOpenRecord(serviceWorker, tabId)

    expect(record.url).toBe('')
    expect(record.filtered_by_list).toBe('test-both-domain-only')
  })

  test('with enabled: false a record passes through unchanged', async ({ serviceWorker }) => {
    const config = { ...BASE_CONFIG, page_events: { enabled: true, allow_all: true }, content_processing_redaction_url: { enabled: false } }
    await loadConfig(serviceWorker, config)
    await waitForModuleConfiguration(serviceWorker, config)
    await resetCaptured(serviceWorker)

    const tabId = await openTab(serviceWorker, 'https://example.org/raw')
    const record = await tabOpenRecord(serviceWorker, tabId)

    expect(record.url).toContain('example.org/raw')
    expect('filtered_by_list' in record).toBe(false)
  })

  test('before configuration arrives, the address is hidden', async ({ serviceWorker }) => {
    const configured = await serviceWorker.evaluate(() => self.rexContentProcessingRedactionUrlPlugin.config)

    await serviceWorker.evaluate(() => {
      self.dispatchEvent({ name: 'rex-page-event', event_type: 'tab_open', tab_id: -1, url: 'https://example.org/early', title: 'Early' })
    })
    await expect.poll(() => recordsFor(serviceWorker, -1).then((records) => records.length)).toBe(1)

    const [record] = await recordsFor(serviceWorker, -1)

    expect(configured).toBeNull()
    expect(record.url).toBe('CATEGORY:NO_CONFIGURATION')
    expect(record.title).toBe('')
    expect(record.filtered).toBe(true)
  })
})

async function dispatchedRecord(serviceWorker, record) {
  await serviceWorker.evaluate((given) => {
    self.dispatchEvent(given)
  }, record)
  await expect.poll(() => recordsFor(serviceWorker, record.tab_id).then((records) => records.length)).toBe(1)

  const [processed] = await recordsFor(serviceWorker, record.tab_id)

  return processed
}

test.describe('Addresses of the previous page and the opener', () => {
  const ALLOWED = 'https://kept.test'
  const HIDDEN = 'https://hidden.test'

  for (const { field, eventType } of [
    { field: 'previous_url', eventType: 'tab_url_change' },
    { field: 'opener_url', eventType: 'tab_open' },
  ]) {
    test(`${field} off the allow list is replaced`, async ({ serviceWorker }) => {
      await startWith(serviceWorker, { lists: { 'related-allow': [listEntry('kept.test', 'ALLOWED')] }, allow_lists: ['related-allow'] })

      const record = await dispatchedRecord(serviceWorker, {
        name: 'rex-page-event', event_type: eventType, tab_id: 701, url: `${ALLOWED}/now`, title: 'Now', [field]: `${HIDDEN}/before`,
      })

      expect(record.url).toBe(`${ALLOWED}/now`)
      expect(record[field]).toBe('CATEGORY:NOT_ON_ALLOWLIST')
      expect(record.filtered).toBe(true)
    })

    test(`${field} on the allow list is kept`, async ({ serviceWorker }) => {
      await startWith(serviceWorker, { lists: { 'related-allow': [listEntry('kept.test', 'ALLOWED')] }, allow_lists: ['related-allow'] })

      const record = await dispatchedRecord(serviceWorker, {
        name: 'rex-page-event', event_type: eventType, tab_id: 702, url: `${ALLOWED}/now`, title: 'Now', [field]: `${ALLOWED}/before`,
      })

      expect(record[field]).toBe(`${ALLOWED}/before`)
      expect(record.filtered).toBe(false)
    })
  }
})

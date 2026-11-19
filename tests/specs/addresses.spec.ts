// @ts-nocheck

import { test, expect, BASE_CONFIG, loadConfig, resetCaptured, startWith, waitForModuleConfiguration } from './fixtures.js'

function configWith(pageEvents) {
  return { ...BASE_CONFIG, page_events: { enabled: true, ...pageEvents } }
}

async function addListEntry(serviceWorker, listName, host, category) {
  await serviceWorker.evaluate(async ({ listName, host, category }) => {
    await self.createListEntry({
      list_name: listName,
      pattern: host,
      pattern_type: 'host',
      source: 'backend',
      metadata: { category },
    })
  }, { listName, host, category })
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
  test('with no allow list and no allow_all, the address is replaced', async ({ serviceWorker }) => {
    await start(serviceWorker, configWith({}))

    const tabId = await openTab(serviceWorker, 'https://example.org/hidden')
    const record = await tabOpenRecord(serviceWorker, tabId)

    expect(record.url).toBe('CATEGORY:NOT_ON_ALLOWLIST')
    expect(record.filtered_by_list).toBe('NOT_ON_ALLOWLIST')
    expect(record.title).toBeUndefined()
  })

  test('allow_all keeps the address', async ({ serviceWorker }) => {
    await start(serviceWorker, configWith({ allow_all: true }))

    const tabId = await openTab(serviceWorker, 'https://example.org/kept')
    const record = await tabOpenRecord(serviceWorker, tabId)

    expect(record.url).toContain('example.org/kept')
    expect(record.filtered).toBe(false)
  })

  test('a filter list takes precedence over allow_all', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'test-filter', 'example.com', 'TEST_FILTERED')
    await start(serviceWorker, configWith({ allow_all: true, filter_lists: ['test-filter'] }))

    const filteredTabId = await openTab(serviceWorker, 'https://example.com/private')
    const filtered = await tabOpenRecord(serviceWorker, filteredTabId)
    expect(filtered.url).toBe('CATEGORY:TEST_FILTERED')
    expect(filtered.filtered_by_list).toBe('test-filter')

    const keptTabId = await openTab(serviceWorker, 'https://example.org/public')
    const kept = await tabOpenRecord(serviceWorker, keptTabId)
    expect(kept.url).toContain('example.org/public')
  })

  test('a domain-only list keeps the hostname of a URL that is not allowed', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'test-domain-only', 'example.net', 'TEST_DOMAIN')
    await start(serviceWorker, configWith({ domain_only_lists: ['test-domain-only'] }))

    const tabId = await openTab(serviceWorker, 'https://example.net/page')
    const record = await tabOpenRecord(serviceWorker, tabId)

    expect(record.url).toBe('example.net')
    expect(record.title).toBe('DOMAIN ONLY')
    expect(record.filtered_by_list).toBe('test-domain-only')
  })

  test('a domain-only list takes precedence over a filter list', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'test-both-filter', 'example.edu', 'TEST_FILTERED')
    await addListEntry(serviceWorker, 'test-both-domain-only', 'example.edu', 'TEST_DOMAIN')
    await start(serviceWorker, configWith({
      allow_all: true,
      filter_lists: ['test-both-filter'],
      domain_only_lists: ['test-both-domain-only'],
    }))

    const tabId = await openTab(serviceWorker, 'https://example.edu/page')
    const record = await tabOpenRecord(serviceWorker, tabId)

    expect(record.url).toBe('example.edu')
    expect(record.filtered_by_list).toBe('test-both-domain-only')
  })

  test('with enabled: false a record passes through unchanged', async ({ serviceWorker }) => {
    const config = { ...BASE_CONFIG, page_events: { enabled: true, allow_all: true }, content_processing_url_redaction: { enabled: false } }
    await loadConfig(serviceWorker, config)
    await waitForModuleConfiguration(serviceWorker, config)
    await resetCaptured(serviceWorker)

    const tabId = await openTab(serviceWorker, 'https://example.org/raw')
    const record = await tabOpenRecord(serviceWorker, tabId)

    expect(record.url).toContain('example.org/raw')
    expect('filtered_by_list' in record).toBe(false)
  })

  test('before configuration arrives, the address is hidden', async ({ serviceWorker }) => {
    const configured = await serviceWorker.evaluate(() => self.rexContentProcessingUrlRedactionPlugin.config)

    await serviceWorker.evaluate(() => {
      self.dispatchEvent({ name: 'rex-page-event', event_type: 'tab_open', tab_id: -1, url: 'https://example.org/early', title: 'Early' })
    })
    await expect.poll(() => recordsFor(serviceWorker, -1).then((records) => records.length)).toBe(1)

    const [record] = await recordsFor(serviceWorker, -1)

    expect(configured).toBeNull()
    expect(record.url).toBe('CATEGORY:NOT_ON_ALLOWLIST')
    expect('title' in record).toBe(false)
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

  for (const { field, filteredField, eventType } of [
    { field: 'previous_url', filteredField: 'previous_url_filtered', eventType: 'tab_url_change' },
    { field: 'opener_url', filteredField: 'opener_filtered', eventType: 'tab_open' },
  ]) {
    test(`${field} off the allow list is replaced and marked filtered`, async ({ serviceWorker }) => {
      await addListEntry(serviceWorker, 'related-allow', 'kept.test', 'ALLOWED')
      await startWith(serviceWorker, { allow_lists: ['related-allow'] })

      const record = await dispatchedRecord(serviceWorker, {
        name: 'rex-page-event', event_type: eventType, tab_id: 701, url: `${ALLOWED}/now`, title: 'Now', [field]: `${HIDDEN}/before`,
      })

      expect(record.url).toBe(`${ALLOWED}/now`)
      expect(record[field]).toBe('CATEGORY:NOT_ON_ALLOWLIST')
      expect(record[filteredField]).toBe(true)
    })

    test(`${field} on the allow list is kept and marked not filtered`, async ({ serviceWorker }) => {
      await addListEntry(serviceWorker, 'related-allow', 'kept.test', 'ALLOWED')
      await startWith(serviceWorker, { allow_lists: ['related-allow'] })

      const record = await dispatchedRecord(serviceWorker, {
        name: 'rex-page-event', event_type: eventType, tab_id: 702, url: `${ALLOWED}/now`, title: 'Now', [field]: `${ALLOWED}/before`,
      })

      expect(record[field]).toBe(`${ALLOWED}/before`)
      expect(record[filteredField]).toBe(false)
    })
  }
})

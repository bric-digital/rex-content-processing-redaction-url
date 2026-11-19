// @ts-nocheck

import { test, expect, startWith } from './fixtures.js'

const ALLOWED = 'https://kept.test'
const HIDDEN = 'https://hidden.test'

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

function visit(overrides = {}) {
  return {
    name: 'rex-browsing-visit',
    url: `${HIDDEN}/page?secret=1`,
    title: 'A private title',
    domain: 'hidden.test',
    visit_id: '41',
    referring_visit_id: '40',
    visit_time: 1795015358162,
    date: 1795015358162,
    transition_type: 'link',
    tab_id: 701,
    window_id: 702,
    ...overrides,
  }
}

async function processed(serviceWorker, record) {
  await serviceWorker.evaluate((given) => {
    self.dispatchEvent(given)
  }, record)

  await expect.poll(() => serviceWorker.evaluate(({ name, id }) => (
    self.__capturedEvents.filter((e) => e.name === name && e.visit_id === id).length
  ), { name: record.name, id: record.visit_id })).toBe(1)

  return serviceWorker.evaluate(({ name, id }) => (
    self.__capturedEvents.find((e) => e.name === name && e.visit_id === id)
  ), { name: record.name, id: record.visit_id })
}

const KEPT_FIELDS = ['visit_id', 'referring_visit_id', 'visit_time', 'date', 'transition_type', 'tab_id', 'window_id']

test.describe('rex-browsing-visit addresses', () => {
  test('an address off the allow list is replaced, its title and domain are removed and the rest stays', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'browsing-allow', 'kept.test', 'ALLOWED')
    await startWith(serviceWorker, { allow_lists: ['browsing-allow'] })

    const given = visit()
    const record = await processed(serviceWorker, given)

    expect(record.url).toBe('CATEGORY:NOT_ON_ALLOWLIST')
    expect(record.filtered).toBe(true)
    expect(record.filtered_by_list).toBe('NOT_ON_ALLOWLIST')
    expect('title' in record).toBe(false)
    expect('domain' in record).toBe(false)

    for (const field of KEPT_FIELDS) {
      expect(record[field]).toEqual(given[field])
    }
  })

  test('an address on the allow list keeps its address, title and domain', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'browsing-allow', 'kept.test', 'ALLOWED')
    await startWith(serviceWorker, { allow_lists: ['browsing-allow'] })

    const record = await processed(serviceWorker, visit({ url: `${ALLOWED}/page`, title: 'Kept', domain: 'kept.test' }))

    expect(record.url).toBe(`${ALLOWED}/page`)
    expect(record.title).toBe('Kept')
    expect(record.domain).toBe('kept.test')
    expect(record.filtered).toBe(false)
    expect(record.allowed_by_list).toBe('browsing-allow')
  })

  test('a filter list replaces the address with its category, also under allow_all', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'browsing-filter', 'hidden.test', 'EMAIL')
    await startWith(serviceWorker, { allow_all: true, filter_lists: ['browsing-filter'] })

    const record = await processed(serviceWorker, visit())

    expect(record.url).toBe('CATEGORY:EMAIL')
    expect(record.filtered_by_list).toBe('browsing-filter')
    expect('title' in record).toBe(false)
    expect('domain' in record).toBe(false)
  })

  test('a domain-only list keeps the hostname and the domain, and hides the title', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'browsing-domain-only', 'hidden.test', 'ANY')
    await startWith(serviceWorker, { allow_all: true, domain_only_lists: ['browsing-domain-only'] })

    const record = await processed(serviceWorker, visit())

    expect(record.url).toBe('hidden.test')
    expect(record.title).toBe('DOMAIN ONLY')
    expect(record.domain).toBe('hidden.test')
    expect(record.filtered_by_list).toBe('browsing-domain-only')
  })

  test('before configuration arrives, the address is hidden and the visit is still recorded', async ({ serviceWorker }) => {
    const configured = await serviceWorker.evaluate(() => self.rexContentProcessingUrlRedactionPlugin.config)
    const record = await processed(serviceWorker, visit({ visit_id: '42' }))

    expect(configured).toBeNull()
    expect(record.url).toBe('CATEGORY:NOT_ON_ALLOWLIST')
    expect(record.visit_time).toBe(1795015358162)
  })

  test('with enabled false the record passes through unchanged', async ({ serviceWorker }) => {
    await startWith(serviceWorker, {})
    await serviceWorker.evaluate(() => self.rexContentProcessingUrlRedactionPlugin.processor.disable())

    const given = visit({ visit_id: '43' })
    const record = await processed(serviceWorker, given)

    expect(record).toEqual(given)
  })

  test('the record the module receives is not changed (control)', async ({ serviceWorker }) => {
    await startWith(serviceWorker, {})
    const given = visit({ visit_id: '44' })

    const unchanged = await serviceWorker.evaluate(async (record) => {
      const before = JSON.stringify(record)
      const manager = self.REXContentProcessorManager.getInstance()
      await manager.processContent(record)
      return JSON.stringify(record) === before
    }, given)

    expect(unchanged).toBe(true)
  })
})

test.describe('other rex-browsing records', () => {
  for (const name of ['rex-browsing-opener', 'rex-browsing-page']) {
    test(`${name}: an address off the allow list is replaced and marked filtered`, async ({ serviceWorker }) => {
      await addListEntry(serviceWorker, 'browsing-allow', 'kept.test', 'ALLOWED')
      await startWith(serviceWorker, { allow_lists: ['browsing-allow'] })

      const record = await processed(serviceWorker, { name, url: `${HIDDEN}/first`, visit_id: '51', referring_visit_id: '50', visit_time: 1795015358162, date: 1795015358162, transition: 'link' })

      expect(record.url).toBe('CATEGORY:NOT_ON_ALLOWLIST')
      expect(record.filtered).toBe(true)
      expect(record.visit_id).toBe('51')
      expect(record.referring_visit_id).toBe('50')
      expect(record.visit_time).toBe(1795015358162)
    })

    test(`${name}: an address on the allow list is kept`, async ({ serviceWorker }) => {
      await addListEntry(serviceWorker, 'browsing-allow', 'kept.test', 'ALLOWED')
      await startWith(serviceWorker, { allow_lists: ['browsing-allow'] })

      const record = await processed(serviceWorker, { name, url: `${ALLOWED}/first`, visit_id: '52', visit_time: 1795015358162, date: 1795015358162 })

      expect(record.url).toBe(`${ALLOWED}/first`)
      expect(record.filtered).toBe(false)
    })
  }

  test('a record that is not a page or browsing record passes through unchanged (control)', async ({ serviceWorker }) => {
    await startWith(serviceWorker, {})
    const given = { name: 'pdk-app-event', event_name: 'rex-browsing-visit-ceiling-exceeded', visit_id: '53', event_details: { domain: 'hidden.test' } }

    const record = await processed(serviceWorker, given)

    expect(record).toEqual(given)
  })
})

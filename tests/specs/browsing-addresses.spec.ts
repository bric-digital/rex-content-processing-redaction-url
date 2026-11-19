// @ts-nocheck

import { test, expect, listEntry, startWith } from './fixtures.js'

const ALLOWED = 'https://kept.test'
const HIDDEN = 'https://hidden.test'

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
  test('an address off the allow list is replaced, its title and domain are blanked and the rest stays', async ({ serviceWorker }) => {
    await startWith(serviceWorker, { lists: { 'browsing-allow': [listEntry('kept.test', 'ALLOWED')] }, allow_lists: ['browsing-allow'] })

    const given = visit()
    const record = await processed(serviceWorker, given)

    expect(record.url).toBe('CATEGORY:NOT_ON_ALLOWLIST')
    expect(record.filtered).toBe(true)
    expect(record.filtered_by_list).toBe('NOT_ON_ALLOWLIST')
    expect(record.title).toBe('')
    expect(record.domain).toBe('')

    for (const field of KEPT_FIELDS) {
      expect(record[field]).toEqual(given[field])
    }
  })

  test('an address on the allow list keeps its address, title and domain', async ({ serviceWorker }) => {
    await startWith(serviceWorker, { lists: { 'browsing-allow': [listEntry('kept.test', 'ALLOWED')] }, allow_lists: ['browsing-allow'] })

    const record = await processed(serviceWorker, visit({ url: `${ALLOWED}/page`, title: 'Kept', domain: 'kept.test' }))

    expect(record.url).toBe(`${ALLOWED}/page`)
    expect(record.title).toBe('Kept')
    expect(record.domain).toBe('kept.test')
    expect(record.filtered).toBe(false)
    expect(record.allowed_by_list).toBe('browsing-allow')
  })

  test('a filter list replaces the address with its category', async ({ serviceWorker }) => {
    await startWith(serviceWorker, { lists: { 'browsing-filter': [listEntry('hidden.test', 'EMAIL')] }, filter_lists: ['browsing-filter'] })

    const record = await processed(serviceWorker, visit())

    expect(record.url).toBe('CATEGORY:EMAIL')
    expect(record.filtered_by_list).toBe('browsing-filter')
    expect(record.title).toBe('')
    expect(record.domain).toBe('')
  })

  test('a domain-only list hides the address and the title and keeps the registered domain', async ({ serviceWorker }) => {
    await startWith(serviceWorker, { lists: { 'browsing-domain-only': [listEntry('hidden.test', 'ANY')] }, domain_only_lists: ['browsing-domain-only'] })

    const record = await processed(serviceWorker, visit())

    expect(record.url).toBe('')
    expect(record.title).toBe('')
    expect(record.domain).toBe('hidden.test')
    expect(record.filtered_by_list).toBe('browsing-domain-only')
  })

  test('before configuration arrives, the address is hidden and the visit is still recorded', async ({ serviceWorker }) => {
    const configured = await serviceWorker.evaluate(() => self.rexContentProcessingUrlRedactionPlugin.config)
    const record = await processed(serviceWorker, visit({ visit_id: '42' }))

    expect(configured).toBeNull()
    expect(record.url).toBe('CATEGORY:NO_CONFIGURATION')
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

test.describe('rex-browsing-visit records without a usable address', () => {
  test('a numeric url passes through unchanged', async ({ serviceWorker }) => {
    await startWith(serviceWorker, { lists: { 'browsing-allow': [listEntry('kept.test', 'ALLOWED')] }, allow_lists: ['browsing-allow'] })

    const given = visit({ visit_id: '61', url: 12345 })

    expect(await processed(serviceWorker, given)).toEqual(given)
  })

  test('a missing url passes through unchanged', async ({ serviceWorker }) => {
    await startWith(serviceWorker, { lists: { 'browsing-allow': [listEntry('kept.test', 'ALLOWED')] }, allow_lists: ['browsing-allow'] })

    const { url, ...given } = visit({ visit_id: '62' })

    expect(await processed(serviceWorker, given)).toEqual(given)
  })

  for (const [label, address] of [['an empty', ''], ['an invalid', 'not a url']]) {
    test(`${label} url keeps its url and title`, async ({ serviceWorker }) => {
      await startWith(serviceWorker, { lists: { 'browsing-allow': [listEntry('kept.test', 'ALLOWED')] }, allow_lists: ['browsing-allow'] })

      const given = visit({ visit_id: '63', url: address })
      const record = await processed(serviceWorker, given)

      expect(record.url).toBe(address)
      expect(record.title).toBe(given.title)
      expect(record.filtered).toBe(false)

      for (const field of KEPT_FIELDS) {
        expect(record[field]).toEqual(given[field])
      }
    })
  }
})

test.describe('other rex-browsing records', () => {
  for (const name of ['rex-browsing-opener', 'rex-browsing-page']) {
    test(`${name}: an address off the allow list is replaced and marked filtered`, async ({ serviceWorker }) => {
      await startWith(serviceWorker, { lists: { 'browsing-allow': [listEntry('kept.test', 'ALLOWED')] }, allow_lists: ['browsing-allow'] })

      const record = await processed(serviceWorker, { name, url: `${HIDDEN}/first`, visit_id: '51', referring_visit_id: '50', visit_time: 1795015358162, date: 1795015358162, transition: 'link' })

      expect(record.url).toBe('CATEGORY:NOT_ON_ALLOWLIST')
      expect(record.filtered).toBe(true)
      expect(record.visit_id).toBe('51')
      expect(record.referring_visit_id).toBe('50')
      expect(record.visit_time).toBe(1795015358162)
    })

    test(`${name}: an address on the allow list is kept`, async ({ serviceWorker }) => {
      await startWith(serviceWorker, { lists: { 'browsing-allow': [listEntry('kept.test', 'ALLOWED')] }, allow_lists: ['browsing-allow'] })

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

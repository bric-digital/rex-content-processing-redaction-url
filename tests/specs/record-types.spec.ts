// @ts-nocheck

import { test, expect, listEntry, startWith } from './fixtures.js'

const ALLOWED = 'https://kept.test'
const HIDDEN = 'https://hidden.test'
const NOT_ON_ALLOWLIST = 'CATEGORY:NOT_ON_ALLOWLIST'
const ALLOW_ONLY_KEPT = { lists: { 'record-allow': [listEntry('kept.test', 'ALLOWED')] }, allow_lists: ['record-allow'] }

let nextId = 0

function withId(record) {
  nextId += 1

  return { ...record, test_id: `record-types-${nextId}` }
}

async function processed(serviceWorker, record) {
  await serviceWorker.evaluate((given) => {
    self.dispatchEvent(given)
  }, record)

  await expect.poll(() => serviceWorker.evaluate((id) => (
    self.__capturedEvents.filter((e) => e.test_id === id).length
  ), record.test_id)).toBe(1)

  return serviceWorker.evaluate((id) => (
    self.__capturedEvents.find((e) => e.test_id === id)
  ), record.test_id)
}

const DEFAULT_TYPE_CASES = [
  {
    label: 'rex-history-visit',
    addressFields: ['url', 'recorded_url'],
    blankedFields: ['title', 'domain'],
    record: { name: 'rex-history-visit', url: `${HIDDEN}/a?q=1`, recorded_url: `${HIDDEN}/a?q=1`, title: 'Private', domain: 'hidden.test', visit_id: '1', date: 1795015358162 },
  },
  {
    label: 'rex-history-visit-aggregate',
    addressFields: ['url', 'recorded_url'],
    blankedFields: ['title', 'domain'],
    record: { name: 'rex-history-visit-aggregate', url: `${HIDDEN}/a`, recorded_url: `${HIDDEN}/a`, title: 'Private', domain: 'hidden.test', visit_count: 40, date: 1795015358162 },
  },
  {
    label: 'rex-page-event',
    addressFields: ['url', 'previous_url', 'opener_url', 'link_url', 'destination_url'],
    blankedFields: ['title'],
    record: {
      name: 'rex-page-event',
      event_type: 'click',
      url: `${HIDDEN}/now`,
      title: 'Private',
      previous_url: `${HIDDEN}/before`,
      opener_url: `${HIDDEN}/opener`,
      link_url: `${HIDDEN}/link`,
      destination_url: `${HIDDEN}/destination`,
      link_text: 'Click here',
      tab_id: 9,
      date: 1795015358162,
    },
  },
  {
    label: 'rex-browsing-visit',
    addressFields: ['url'],
    blankedFields: ['title', 'domain'],
    record: { name: 'rex-browsing-visit', url: `${HIDDEN}/p`, title: 'Private', domain: 'hidden.test', visit_id: '41', referring_visit_id: '40', visit_time: 1795015358162, date: 1795015358162, tab_id: 701 },
  },
  {
    label: 'rex-browsing-opener',
    addressFields: ['url'],
    blankedFields: ['domain'],
    record: { name: 'rex-browsing-opener', url: `${HIDDEN}/p`, domain: 'hidden.test', visit_id: '51', referring_visit_id: '50', visit_time: 1795015358162, date: 1795015358162, transition: 'link' },
  },
  {
    label: 'rex-browsing-page',
    addressFields: ['url'],
    blankedFields: ['domain'],
    record: { name: 'rex-browsing-page', url: `${HIDDEN}/p`, domain: 'hidden.test', tab_id: 7, visit_time: 1795015358162, date: 1795015358162 },
  },
]

test.describe('default record types', () => {
  for (const { label, addressFields, blankedFields, record } of DEFAULT_TYPE_CASES) {
    test(`${label}: an address off the allow list is replaced and every other field is kept`, async ({ serviceWorker }) => {
      await startWith(serviceWorker, ALLOW_ONLY_KEPT)

      const given = withId(record)
      const result = await processed(serviceWorker, given)

      for (const field of addressFields) {
        expect(result[field]).toBe(NOT_ON_ALLOWLIST)
      }

      for (const field of blankedFields) {
        expect(result[field]).toBe('')
      }

      expect(result.filtered).toBe(true)

      const changed = [...addressFields, ...blankedFields, 'filtered', 'filtered_by_list']

      for (const [field, value] of Object.entries(given)) {
        if (changed.includes(field) === false) {
          expect(result[field]).toEqual(value)
        }
      }
    })
  }

  test('rex-history-visit: recorded_url equals url when the address is kept', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)

    const result = await processed(serviceWorker, withId({
      name: 'rex-history-visit', url: `${ALLOWED}/p`, recorded_url: `${ALLOWED}/p`, title: 'Kept', domain: 'kept.test',
    }))

    expect(result.url).toBe(`${ALLOWED}/p`)
    expect(result.recorded_url).toBe(`${ALLOWED}/p`)
    expect(result.filtered).toBe(false)
  })

  test('a copy gets the value of url even when it held something else', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)

    const result = await processed(serviceWorker, withId({
      name: 'rex-history-visit', url: `${HIDDEN}/p`, recorded_url: 'other', title: 'T', domain: 'hidden.test',
    }))

    expect(result.recorded_url).toBe(NOT_ON_ALLOWLIST)
  })

  test('rex-page-event: an allowed page keeps url and a link off the allow list is replaced', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)

    const result = await processed(serviceWorker, withId({
      name: 'rex-page-event', event_type: 'click', url: `${ALLOWED}/now`, title: 'Now', link_url: `${HIDDEN}/out`, link_text: 'Out',
    }))

    expect(result.url).toBe(`${ALLOWED}/now`)
    expect(result.title).toBe('Now')
    expect(result.link_url).toBe(NOT_ON_ALLOWLIST)
    expect(result.link_text).toBe('Out')
    expect(result.event_type).toBe('click')
    expect(result.filtered).toBe(true)
  })

  test('rex-page-event: previous_url and opener_url are replaced and no per-field flags are written', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)

    const result = await processed(serviceWorker, withId({
      name: 'rex-page-event', event_type: 'tab_open', url: `${ALLOWED}/now`, title: 'Now', previous_url: `${HIDDEN}/before`, opener_url: `${ALLOWED}/opener`,
    }))

    expect(result.previous_url).toBe(NOT_ON_ALLOWLIST)
    expect(result.opener_url).toBe(`${ALLOWED}/opener`)
    expect('previous_url_filtered' in result).toBe(false)
    expect('opener_filtered' in result).toBe(false)
  })

  test('rex-browsing-opener on a domain-only list gains the registered domain and loses its address', async ({ serviceWorker }) => {
    await startWith(serviceWorker, {
      lists: { 'record-domain-only': [listEntry('example.com', 'ANY')] },
      domain_only_lists: ['record-domain-only'],
    })

    const result = await processed(serviceWorker, withId({
      name: 'rex-browsing-opener', url: 'https://example.com/private', visit_id: '60', date: 1795015358162,
    }))

    expect(result.url).toBe('')
    expect(result.domain).toBe('example.com')
    expect(result.filtered_by_list).toBe('record-domain-only')
    expect(result.visit_id).toBe('60')
  })

  test('a filter list replaces the address with its category', async ({ serviceWorker }) => {
    await startWith(serviceWorker, {
      lists: { 'record-filter': [listEntry('hidden.test', 'EMAIL')] },
      filter_lists: ['record-filter'],
    })

    const result = await processed(serviceWorker, withId({
      name: 'rex-browsing-visit', url: `${HIDDEN}/p`, title: 'T', domain: 'hidden.test',
    }))

    expect(result.url).toBe('CATEGORY:EMAIL')
    expect(result.filtered_by_list).toBe('record-filter')
  })
})

test.describe('states', () => {
  test('before startWith is called the address is hidden', async ({ serviceWorker }) => {
    const given = withId({ name: 'rex-browsing-visit', url: `${HIDDEN}/p`, title: 'T', domain: 'hidden.test', visit_time: 5 })
    const result = await processed(serviceWorker, given)

    expect(result.url).toBe('CATEGORY:NO_CONFIGURATION')
    expect(result.title).toBe('')
    expect(result.domain).toBe('')
    expect(result.filtered).toBe(true)
    expect(result.visit_time).toBe(5)
  })

  test('with configuration present and lists not loaded the address is hidden', async ({ serviceWorker }) => {
    await startWith(serviceWorker, { lists: null, allow_lists: ['record-allow'] })

    expect(await serviceWorker.evaluate(() => self.listsLoaded())).toBe(false)

    const result = await processed(serviceWorker, withId({
      name: 'rex-history-visit', url: `${ALLOWED}/p`, recorded_url: `${ALLOWED}/p`, title: 'T', domain: 'kept.test',
    }))

    expect(result.url).toBe('CATEGORY:NO_CONFIGURATION')
    expect(result.recorded_url).toBe('CATEGORY:NO_CONFIGURATION')
    expect(result.title).toBe('')
    expect(result.domain).toBe('')
    expect(result.filtered).toBe(true)
  })

  test('a named list with no entries leaves the record unchanged by default', async ({ serviceWorker }) => {
    await startWith(serviceWorker, { lists: { 'record-empty': [] }, allow_lists: ['record-empty'] })

    const given = withId({ name: 'rex-browsing-visit', url: `${HIDDEN}/p`, title: 'T', domain: 'hidden.test' })

    expect(await processed(serviceWorker, given)).toEqual(given)
  })

  test('a named list with no entries leaves the record unchanged under on_failure pass', async ({ serviceWorker }) => {
    await startWith(serviceWorker, { lists: { 'record-empty': [] }, allow_lists: ['record-empty'], on_failure: 'pass' })

    const given = withId({ name: 'rex-browsing-visit', url: `${HIDDEN}/p`, title: 'T', domain: 'hidden.test' })

    expect(await processed(serviceWorker, given)).toEqual(given)
  })

  test('a named list with no entries hides the address under on_failure hide', async ({ serviceWorker }) => {
    await startWith(serviceWorker, { lists: { 'record-empty': [] }, allow_lists: ['record-empty'], on_failure: 'hide' })

    const result = await processed(serviceWorker, withId({
      name: 'rex-history-visit', url: `${HIDDEN}/p`, recorded_url: `${HIDDEN}/p`, title: 'T', domain: 'hidden.test', visit_id: '9',
    }))

    expect(result.url).toBe('CATEGORY:REDACTION_FAILED')
    expect(result.recorded_url).toBe('CATEGORY:REDACTION_FAILED')
    expect(result.title).toBe('')
    expect(result.domain).toBe('')
    expect(result.filtered).toBe(true)
    expect(result.visit_id).toBe('9')
  })

  test('a failure on an other address hides the whole record under on_failure hide', async ({ serviceWorker }) => {
    await startWith(serviceWorker, {
      lists: { 'record-empty': [] },
      allow_lists: ['record-empty'],
      on_failure: 'hide',
      record_types: [{ name: 'custom-record', fields: { url: 'address', other_addresses: ['next'] } }],
    })

    const result = await processed(serviceWorker, withId({ name: 'custom-record', address: 'not a url', next: `${HIDDEN}/p` }))

    expect(result.address).toBe('CATEGORY:REDACTION_FAILED')
    expect(result.next).toBe('CATEGORY:REDACTION_FAILED')
  })

  test('a record with an unknown name arrives unchanged', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)

    const given = withId({ name: 'something-else', url: `${HIDDEN}/p`, title: 'T' })

    expect(await processed(serviceWorker, given)).toEqual(given)
  })

  test('a record whose url is a number arrives unchanged', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)

    const given = withId({ name: 'rex-browsing-visit', url: 12345, title: 'T' })

    expect(await processed(serviceWorker, given)).toEqual(given)
  })

  test('a record whose url is missing arrives unchanged', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)

    const given = withId({ name: 'rex-browsing-visit', title: 'T' })

    expect(await processed(serviceWorker, given)).toEqual(given)
  })

  test('a ceiling diagnostic with a nested address passes through unchanged', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)

    const given = withId({ name: 'pdk-app-event', event_name: 'rex-history-visit-ceiling-exceeded', event_details: { recorded_url: `${HIDDEN}/p`, domain: 'hidden.test' } })

    expect(await processed(serviceWorker, given)).toEqual(given)
  })

  test('with enabled false the record passes through unchanged', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)
    await serviceWorker.evaluate(() => self.rexContentProcessingUrlRedactionPlugin.processor.disable())

    const given = withId({ name: 'rex-browsing-visit', url: `${HIDDEN}/p`, title: 'T', domain: 'hidden.test' })

    expect(await processed(serviceWorker, given)).toEqual(given)
  })

  test('the record the processor receives is not changed', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)
    const given = withId({ name: 'rex-page-event', url: `${HIDDEN}/p`, title: 'T', link_url: `${HIDDEN}/l` })

    const unchanged = await serviceWorker.evaluate(async (record) => {
      const before = JSON.stringify(record)
      await self.REXContentProcessorManager.getInstance().processContent(record)

      return JSON.stringify(record) === before
    }, given)

    expect(unchanged).toBe(true)
  })
})

test.describe('fields of a record type', () => {
  test('a stale label on the record is blanked when the result does not provide it', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)

    const result = await processed(serviceWorker, withId({
      name: 'rex-browsing-visit',
      url: `${ALLOWED}/p`,
      title: 'T',
      domain: 'kept.test',
      filtered_by_list: 'old-list',
      filtered_by_list_entry: { pattern: 'old' },
    }))

    expect(result.filtered_by_list).toBe('')
    expect(result.filtered_by_list_entry).toBe('')
    expect(result.allowed_by_list).toBe('record-allow')
  })

  test('a label the record never had is not added when the result does not provide it', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)

    const result = await processed(serviceWorker, withId({ name: 'rex-browsing-visit', url: `${ALLOWED}/p`, title: 'T', domain: 'kept.test' }))

    expect('filtered_by_list' in result).toBe(false)
    expect('filtered_by_list_entry' in result).toBe(false)
  })

  test('a title is written only when the record has one', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)

    const result = await processed(serviceWorker, withId({ name: 'rex-browsing-visit', url: `${HIDDEN}/p`, domain: 'hidden.test' }))

    expect('title' in result).toBe(false)
    expect(result.url).toBe(NOT_ON_ALLOWLIST)
  })

  test('an other address that is not a string is skipped and the rest are processed', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)

    const result = await processed(serviceWorker, withId({
      name: 'rex-page-event', url: `${ALLOWED}/now`, title: 'Now', previous_url: 7, opener_url: `${HIDDEN}/o`, link_url: null,
    }))

    expect(result.previous_url).toBe(7)
    expect(result.link_url).toBeNull()
    expect(result.opener_url).toBe(NOT_ON_ALLOWLIST)
    expect('destination_url' in result).toBe(false)
  })

  test('a copy that is not a string is skipped', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)

    const result = await processed(serviceWorker, withId({
      name: 'rex-history-visit', url: `${HIDDEN}/p`, recorded_url: 5, title: 'T', domain: 'hidden.test',
    }))

    expect(result.recorded_url).toBe(5)
    expect(result.url).toBe(NOT_ON_ALLOWLIST)
  })
})

test.describe('record_types in configuration', () => {
  const record_types = [{ name: 'custom-record', fields: { url: 'address', title: 'label', domain: 'site', copies: ['address_copy'] } }]

  test('replaces the defaults', async ({ serviceWorker }) => {
    await startWith(serviceWorker, { ...ALLOW_ONLY_KEPT, record_types })

    const custom = await processed(serviceWorker, withId({
      name: 'custom-record', address: `${HIDDEN}/p`, address_copy: `${HIDDEN}/p`, label: 'T', site: 'hidden.test', kept: 1,
    }))

    expect(custom.address).toBe(NOT_ON_ALLOWLIST)
    expect(custom.address_copy).toBe(NOT_ON_ALLOWLIST)
    expect(custom.label).toBe('')
    expect(custom.site).toBe('')
    expect(custom.kept).toBe(1)

    const givenDefault = withId({ name: 'rex-browsing-visit', url: `${HIDDEN}/p`, title: 'T', domain: 'hidden.test' })

    expect(await processed(serviceWorker, givenDefault)).toEqual(givenDefault)
  })

  test('an event_name restricts the type to that event', async ({ serviceWorker }) => {
    await startWith(serviceWorker, {
      ...ALLOW_ONLY_KEPT,
      record_types: [{ name: 'custom-event', event_name: 'wanted', fields: { url: 'address' } }],
    })

    const wanted = await processed(serviceWorker, withId({ name: 'custom-event', event_name: 'wanted', address: `${HIDDEN}/p` }))
    const other = withId({ name: 'custom-event', event_name: 'other', address: `${HIDDEN}/p` })

    expect(wanted.address).toBe(NOT_ON_ALLOWLIST)
    expect(await processed(serviceWorker, other)).toEqual(other)
  })
})

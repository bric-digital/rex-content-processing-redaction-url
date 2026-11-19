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

async function capturedCount(serviceWorker, testId) {
  return serviceWorker.evaluate((id) => self.__capturedEvents.filter((e) => e.test_id === id).length, testId)
}

async function processed(serviceWorker, record) {
  await serviceWorker.evaluate((given) => {
    self.dispatchEvent(given)
  }, record)

  await expect.poll(() => capturedCount(serviceWorker, record.test_id)).toBe(1)

  const sentinel = withId({ name: 'sentinel' })

  await serviceWorker.evaluate((given) => {
    self.dispatchEvent(given)
  }, sentinel)
  await expect.poll(() => capturedCount(serviceWorker, sentinel.test_id)).toBe(1)

  expect(await capturedCount(serviceWorker, record.test_id)).toBe(1)

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
    blankedFields: ['title', 'domain'],
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

test.describe('a domain field the record does not have', () => {
  const DOMAIN_ONLY_EXAMPLE = { lists: { 'record-domain-only': [listEntry('example.com', 'ANY', 'domain')] }, domain_only_lists: ['record-domain-only'] }
  const FILTER_HIDDEN = { lists: { 'record-filter': [listEntry('hidden.test', 'EMAIL')] }, filter_lists: ['record-filter'] }
  const EMPTY_ALLOW_HIDE = { lists: { 'record-empty': [] }, allow_lists: ['record-empty'], on_failure: 'hide' }

  for (const name of ['rex-page-event', 'rex-browsing-opener']) {
    test(`${name}: is added with the registered domain when the address is shown`, async ({ serviceWorker }) => {
      await startWith(serviceWorker, ALLOW_ONLY_KEPT)

      const result = await processed(serviceWorker, withId({ name, url: `https://www.kept.test/p` }))

      expect(result.url).toBe('https://www.kept.test/p')
      expect(result.domain).toBe('kept.test')
    })

    test(`${name}: is added blank when the address is off the allow list`, async ({ serviceWorker }) => {
      await startWith(serviceWorker, ALLOW_ONLY_KEPT)

      const result = await processed(serviceWorker, withId({ name, url: `${HIDDEN}/p` }))

      expect(result.url).toBe(NOT_ON_ALLOWLIST)
      expect(result.domain).toBe('')
    })

    test(`${name}: is added blank when the address is on a filter list`, async ({ serviceWorker }) => {
      await startWith(serviceWorker, FILTER_HIDDEN)

      const result = await processed(serviceWorker, withId({ name, url: `${HIDDEN}/p` }))

      expect(result.url).toBe('CATEGORY:EMAIL')
      expect(result.domain).toBe('')
    })

    test(`${name}: is added with the registered domain on a domain-only match`, async ({ serviceWorker }) => {
      await startWith(serviceWorker, DOMAIN_ONLY_EXAMPLE)

      const result = await processed(serviceWorker, withId({ name, url: 'https://mail.example.com/p' }))

      expect(result.url).toBe('')
      expect(result.domain).toBe('example.com')
    })

    test(`${name}: is added blank before configuration`, async ({ serviceWorker }) => {
      const result = await processed(serviceWorker, withId({ name, url: `${ALLOWED}/p` }))

      expect(result.url).toBe('CATEGORY:NO_CONFIGURATION')
      expect(result.domain).toBe('')
    })

    test(`${name}: is added blank after a failure under on_failure hide`, async ({ serviceWorker }) => {
      await startWith(serviceWorker, EMPTY_ALLOW_HIDE)

      const result = await processed(serviceWorker, withId({ name, url: `${ALLOWED}/p` }))

      expect(result.url).toBe('CATEGORY:REDACTION_FAILED')
      expect(result.domain).toBe('')
    })

    test(`${name}: is not added after a failure under on_failure pass`, async ({ serviceWorker }) => {
      await startWith(serviceWorker, { lists: { 'record-empty': [] }, allow_lists: ['record-empty'], on_failure: 'pass' })

      const given = withId({ name, url: `${ALLOWED}/p` })

      expect(await processed(serviceWorker, given)).toEqual(given)
    })

    for (const [address, host] of [['http://192.0.2.7/p', '192.0.2.7'], ['http://localhost:8080/p', 'localhost']]) {
      test(`${name}: is added with the host for the shown address ${JSON.stringify(address)}, which has no registered domain`, async ({ serviceWorker }) => {
        await startWith(serviceWorker)

        const result = await processed(serviceWorker, withId({ name, url: address }))

        expect(result.url).toBe(address)
        expect(result.domain).toBe(host)
      })
    }

    for (const address of ['about:blank', '']) {
      test(`${name}: is added blank for the shown address ${JSON.stringify(address)}, which has no host`, async ({ serviceWorker }) => {
        await startWith(serviceWorker)

        const result = await processed(serviceWorker, withId({ name, url: address }))

        expect(result.url).toBe(address)
        expect(result.domain).toBe('')
      })
    }
  }

  test('describes the url field, not the other addresses', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)

    const result = await processed(serviceWorker, withId({
      name: 'rex-page-event', url: `${ALLOWED}/now`, previous_url: `${HIDDEN}/before`, opener_url: 'https://other.test/opener',
    }))

    expect(result.previous_url).toBe(NOT_ON_ALLOWLIST)
    expect(result.domain).toBe('kept.test')
  })

  test('is written inside the container of a record type that has one', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)

    const result = await processed(serviceWorker, withId({
      name: 'pdk-app-event', event_name: 'rex-history-visit-ceiling-exceeded', event_details: { recorded_url: `${ALLOWED}/p`, visit_count: 120 },
    }))

    expect(result.event_details.domain).toBe('kept.test')
    expect('domain' in result).toBe(false)
  })

  test('a record type that names no domain field gains a field named domain', async ({ serviceWorker }) => {
    await startWith(serviceWorker, { ...ALLOW_ONLY_KEPT, record_types: [{ name: 'custom-record', fields: { url: 'address' } }] })

    const shown = await processed(serviceWorker, withId({ name: 'custom-record', address: `${ALLOWED}/p` }))
    const hidden = await processed(serviceWorker, withId({ name: 'custom-record', address: `${HIDDEN}/p` }))

    expect(shown.domain).toBe('kept.test')
    expect(hidden.address).toBe(NOT_ON_ALLOWLIST)
    expect(hidden.domain).toBe('')
  })

  test('a record type that names its domain field gains the field under that name', async ({ serviceWorker }) => {
    await startWith(serviceWorker, { ...ALLOW_ONLY_KEPT, record_types: [{ name: 'custom-record', fields: { url: 'address', domain: 'site' } }] })

    const shown = await processed(serviceWorker, withId({ name: 'custom-record', address: `${ALLOWED}/p` }))
    const hidden = await processed(serviceWorker, withId({ name: 'custom-record', address: `${HIDDEN}/p` }))

    expect(shown.site).toBe('kept.test')
    expect('domain' in shown).toBe(false)
    expect(hidden.site).toBe('')
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

  test('with no list named the rules run without waiting for lists to load', async ({ serviceWorker }) => {
    await startWith(serviceWorker, { lists: null })

    expect(await serviceWorker.evaluate(() => self.listsLoaded())).toBe(false)

    const given = withId({ name: 'rex-browsing-visit', url: `${HIDDEN}/p`, title: 'T', domain: 'hidden.test' })
    const result = await processed(serviceWorker, given)

    expect(result.url).toBe(given.url)
    expect(result.title).toBe('T')
    expect(result.filtered).toBe(false)
  })

  test('a named list missing from loaded lists leaves the record unchanged under on_failure pass', async ({ serviceWorker }) => {
    await startWith(serviceWorker, { lists: { 'record-present': [listEntry('kept.test', 'ALLOWED')] }, allow_lists: ['record-absent'], on_failure: 'pass' })

    const given = withId({ name: 'rex-browsing-visit', url: `${HIDDEN}/p`, title: 'T', domain: 'hidden.test' })

    expect(await processed(serviceWorker, given)).toEqual(given)
  })

  test('a named list missing from loaded lists hides the address under on_failure hide', async ({ serviceWorker }) => {
    await startWith(serviceWorker, { lists: { 'record-present': [listEntry('kept.test', 'ALLOWED')] }, allow_lists: ['record-absent'], on_failure: 'hide' })

    const result = await processed(serviceWorker, withId({ name: 'rex-browsing-visit', url: `${HIDDEN}/p`, title: 'T', domain: 'hidden.test' }))

    expect(result.url).toBe('CATEGORY:REDACTION_FAILED')
    expect(result.title).toBe('')
    expect(result.domain).toBe('')
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

  test('with enabled false the record passes through unchanged', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)
    await serviceWorker.evaluate(() => self.rexContentProcessingRedactionUrlPlugin.processor.disable())

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

function historyCeiling(address, domain) {
  return withId({
    name: 'pdk-app-event',
    event_name: 'rex-history-visit-ceiling-exceeded',
    event_details: { recorded_url: address, domain, visit_count: 120, ceiling: 100, window_start: 1795015000000, window_end: 1795015358162, date: 1795015358162 },
  })
}

function browsingCeiling(domain) {
  return withId({
    name: 'pdk-app-event',
    event_name: 'rex-browsing-visit-ceiling-exceeded',
    event_details: { domain, visit_count: 120, ceiling: 100, visits_in_drain: 30, date: 1795015358162 },
  })
}

function expectOtherFieldsKept(result, given, changedInner) {
  const { event_details: givenInner, ...givenTop } = given
  const { event_details: resultInner, ...resultTop } = result

  expect(resultTop).toEqual(givenTop)

  for (const [field, value] of Object.entries(givenInner)) {
    if (changedInner.includes(field) === false) {
      expect(resultInner[field]).toEqual(value)
    }
  }
}

test.describe('visit ceiling events', () => {
  test('rex-history: an address off the allow list is replaced inside event_details', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)

    const given = historyCeiling(`${HIDDEN}/p?q=1`, 'hidden.test')
    const result = await processed(serviceWorker, given)

    expect(result.event_details.recorded_url).toBe(NOT_ON_ALLOWLIST)
    expect(result.event_details.domain).toBe('')
    expect(result.event_details.filtered).toBe(true)
    expectOtherFieldsKept(result, given, ['recorded_url', 'domain', 'filtered', 'filtered_by_list'])
  })

  test('rex-history: an allowed address is kept with its domain', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)

    const given = historyCeiling(`${ALLOWED}/p`, 'kept.test')
    const result = await processed(serviceWorker, given)

    expect(result.event_details.recorded_url).toBe(`${ALLOWED}/p`)
    expect(result.event_details.domain).toBe('kept.test')
    expect(result.event_details.filtered).toBe(false)
    expectOtherFieldsKept(result, given, ['filtered', 'allowed_by_list', 'allowed_by_list_entry'])
  })

  test('rex-history: before configuration the address is hidden', async ({ serviceWorker }) => {
    const given = historyCeiling(`${HIDDEN}/p`, 'hidden.test')
    const result = await processed(serviceWorker, given)

    expect(result.event_details.recorded_url).toBe('CATEGORY:NO_CONFIGURATION')
    expect(result.event_details.domain).toBe('')
    expect(result.event_details.filtered).toBe(true)
    expectOtherFieldsKept(result, given, ['recorded_url', 'domain', 'filtered'])
  })

  test('rex-browsing: a domain off the allow list is blanked inside event_details', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)

    const given = browsingCeiling('hidden.test')
    const result = await processed(serviceWorker, given)

    expect(result.event_details.domain).toBe('')
    expect(result.event_details.filtered).toBe(true)
    expectOtherFieldsKept(result, given, ['domain', 'filtered'])
  })

  test('rex-browsing: an allowed domain is kept', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)

    const given = browsingCeiling('kept.test')
    const result = await processed(serviceWorker, given)

    expect(result.event_details.domain).toBe('kept.test')
    expect(result.event_details.filtered).toBe(false)
    expectOtherFieldsKept(result, given, ['filtered'])
  })

  test('rex-browsing: before configuration the domain is blanked', async ({ serviceWorker }) => {
    const given = browsingCeiling('hidden.test')
    const result = await processed(serviceWorker, given)

    expect(result.event_details.domain).toBe('')
    expect(result.event_details.filtered).toBe(true)
    expectOtherFieldsKept(result, given, ['domain', 'filtered'])
  })

  test('rex-browsing: a failure leaves the event unchanged under pass', async ({ serviceWorker }) => {
    await startWith(serviceWorker, { lists: { 'record-empty': [] }, allow_lists: ['record-empty'], on_failure: 'pass' })

    const given = browsingCeiling('hidden.test')

    expect(await processed(serviceWorker, given)).toEqual(given)
  })

  test('rex-browsing: a failure blanks the domain under hide', async ({ serviceWorker }) => {
    await startWith(serviceWorker, { lists: { 'record-empty': [] }, allow_lists: ['record-empty'], on_failure: 'hide' })

    const result = await processed(serviceWorker, browsingCeiling('hidden.test'))

    expect(result.event_details.domain).toBe('')
    expect(result.event_details.filtered).toBe(true)
  })

  test('a pdk-app-event with a different event_name passes through unchanged', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)

    const given = withId({ name: 'pdk-app-event', event_name: 'something-else', event_details: { recorded_url: `${HIDDEN}/p`, domain: 'hidden.test' } })

    expect(await processed(serviceWorker, given)).toEqual(given)
  })

  test('a ceiling event whose event_details is not an object passes through unchanged', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)

    const given = withId({ name: 'pdk-app-event', event_name: 'rex-history-visit-ceiling-exceeded', event_details: 'text' })

    expect(await processed(serviceWorker, given)).toEqual(given)
  })

  test('the event the processor receives is not changed', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)
    const given = historyCeiling(`${HIDDEN}/p`, 'hidden.test')

    const unchanged = await serviceWorker.evaluate(async (record) => {
      const before = JSON.stringify(record)
      await self.REXContentProcessorManager.getInstance().processContent(record)

      return JSON.stringify(record) === before
    }, given)

    expect(unchanged).toBe(true)
  })
})

function skipped(domain) {
  return withId({
    name: 'pdk-app-event',
    event_name: 'rex-history-skipped',
    event_details: {
      domain,
      failed_step: 'visit-lookup',
      error_name: 'Error',
      error_message: 'failed',
      url_length: 40,
      hostname_length: 11,
      title_length: 8,
      scheme: 'https',
      has_query: true,
      visit_count: 3,
      history_item_id: '77',
      date: 1795015358162,
    },
  })
}

test.describe('rex-history-skipped', () => {
  test('a domain off the allow list is blanked and every other field is kept', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)

    const given = skipped('hidden.test')
    const result = await processed(serviceWorker, given)

    expect(result.event_details.domain).toBe('')
    expect(result.event_details.filtered).toBe(true)
    expectOtherFieldsKept(result, given, ['domain', 'filtered'])
  })

  test('an allowed domain is kept', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)

    const given = skipped('kept.test')
    const result = await processed(serviceWorker, given)

    expect(result.event_details.domain).toBe('kept.test')
    expect(result.event_details.filtered).toBe(false)
    expectOtherFieldsKept(result, given, ['filtered'])
  })

  test('a domain that is not a host is left as it was', async ({ serviceWorker }) => {
    await startWith(serviceWorker, ALLOW_ONLY_KEPT)

    const given = skipped('not available')
    const result = await processed(serviceWorker, given)

    expect(result.event_details.domain).toBe('not available')
    expect(result.event_details.filtered).toBe(false)
    expectOtherFieldsKept(result, given, ['filtered'])
  })
})

test.describe('settings that are not valid', () => {
  const HIDDEN_VISIT = { name: 'rex-browsing-visit', url: `${HIDDEN}/p`, title: 'T', domain: 'hidden.test' }

  test('record_types given as an object uses the default record types', async ({ serviceWorker }) => {
    await startWith(serviceWorker, { ...ALLOW_ONLY_KEPT, record_types: { name: 'rex-browsing-visit' } })

    const result = await processed(serviceWorker, withId(HIDDEN_VISIT))

    expect(result.url).toBe(NOT_ON_ALLOWLIST)
  })

  test('record_types with an entry that has no fields uses the default record types', async ({ serviceWorker }) => {
    await startWith(serviceWorker, { ...ALLOW_ONLY_KEPT, record_types: [{ name: 'custom-record' }] })

    const result = await processed(serviceWorker, withId(HIDDEN_VISIT))

    expect(result.url).toBe(NOT_ON_ALLOWLIST)
  })

  test('on_failure that is neither pass nor hide hides the record when a list has no entries', async ({ serviceWorker }) => {
    await startWith(serviceWorker, { lists: { 'record-empty': [] }, allow_lists: ['record-empty'], on_failure: 'Hide' })

    const result = await processed(serviceWorker, withId(HIDDEN_VISIT))

    expect(result.url).toBe('CATEGORY:REDACTION_FAILED')
  })
})

test.describe('an error while handling a matched record', () => {
  function recordThatThrowsOnTitle() {
    const record = { name: 'rex-browsing-visit', url: 'https://hidden.test/p', domain: 'hidden.test' }

    Object.defineProperty(record, 'title', {
      enumerable: false,
      get() {
        throw new Error('title unreadable')
      },
    })

    return record
  }

  async function processDirectly(serviceWorker) {
    return serviceWorker.evaluate(async (source) => {
      const record = new Function(`return (${source})()`)()
      const processor = self.rexContentProcessingRedactionUrlPlugin.processor
      const result = await processor.processContent(record)

      return { same: result === record, url: result.url, domain: result.domain }
    }, recordThatThrowsOnTitle.toString())
  }

  test('the record is returned as received under pass', async ({ serviceWorker }) => {
    await startWith(serviceWorker, { ...ALLOW_ONLY_KEPT, on_failure: 'pass' })

    expect(await processDirectly(serviceWorker)).toEqual({ same: true, url: 'https://hidden.test/p', domain: 'hidden.test' })
  })

  test('the addresses are replaced under hide', async ({ serviceWorker }) => {
    await startWith(serviceWorker, { ...ALLOW_ONLY_KEPT, on_failure: 'hide' })

    expect(await processDirectly(serviceWorker)).toEqual({ same: false, url: 'CATEGORY:REDACTION_FAILED', domain: '' })
  })
})

test.describe('other addresses before configuration', () => {
  test('are replaced with the no configuration label and non-strings are skipped', async ({ serviceWorker }) => {
    const result = await processed(serviceWorker, withId({
      name: 'rex-page-event', url: `${HIDDEN}/p`, title: 'T', previous_url: `${HIDDEN}/a`, opener_url: 4, link_url: `${HIDDEN}/l`,
    }))

    expect(result.url).toBe('CATEGORY:NO_CONFIGURATION')
    expect(result.previous_url).toBe('CATEGORY:NO_CONFIGURATION')
    expect(result.link_url).toBe('CATEGORY:NO_CONFIGURATION')
    expect(result.opener_url).toBe(4)
  })
})

test.describe('a domain-only type judges the parsed hostname', () => {
  const record_types = [{ name: 'custom-domain', fields: { domain: 'site' } }]
  const BLOCKED_ALLOW = { lists: { 'record-allow': [listEntry('kept.test', 'ALLOWED')] }, allow_lists: ['record-allow'], record_types }

  for (const value of ['blocked.com/x', 'u@blocked.com', 'blocked.com\t']) {
    test(`${JSON.stringify(value)} off the allow list is blanked`, async ({ serviceWorker }) => {
      await startWith(serviceWorker, BLOCKED_ALLOW)

      const result = await processed(serviceWorker, withId({ name: 'custom-domain', site: value, kept: 1 }))

      expect(result.site).toBe('')
      expect(result.filtered).toBe(true)
      expect(result.kept).toBe(1)
    })

    test(`${JSON.stringify(value)} before the named lists load is blanked`, async ({ serviceWorker }) => {
      await serviceWorker.evaluate((types) => {
        self.rexContentProcessingRedactionUrlPlugin.processor.config = { enabled: true, allow_lists: ['record-allow'], record_types: types }
      }, record_types)

      const result = await processed(serviceWorker, withId({ name: 'custom-domain', site: value }))

      expect(result.site).toBe('')
      expect(result.filtered).toBe(true)
    })
  }

  test('a value with no usable hostname is left as it was in every state', async ({ serviceWorker }) => {
    await serviceWorker.evaluate((types) => {
      self.rexContentProcessingRedactionUrlPlugin.processor.config = { enabled: true, record_types: types }
    }, record_types)

    const before = await processed(serviceWorker, withId({ name: 'custom-domain', site: 'not available' }))

    expect(before.site).toBe('not available')
    expect(before.filtered).toBe(false)

    await startWith(serviceWorker, { ...BLOCKED_ALLOW, on_failure: 'hide' })

    const result = await processed(serviceWorker, withId({ name: 'custom-domain', site: 'not available' }))

    expect(result.site).toBe('not available')
    expect(result.filtered).toBe(false)
  })
})

test.describe('settings that cannot be used', () => {
  test('record_types as an empty array uses the default record types', async ({ serviceWorker }) => {
    await startWith(serviceWorker, { ...ALLOW_ONLY_KEPT, record_types: [] })

    const result = await processed(serviceWorker, withId({ name: 'rex-browsing-visit', url: `${HIDDEN}/p`, title: 'T', domain: 'hidden.test' }))

    expect(result.url).toBe(NOT_ON_ALLOWLIST)
  })

  for (const section of [null, 'text', 4, []]) {
    test(`a module section of ${JSON.stringify(section)} does not throw and leaves addresses hidden`, async ({ serviceWorker }) => {
      await startWith(serviceWorker, {})

      const threw = await serviceWorker.evaluate((value) => {
        try {
          self.rexContentProcessingRedactionUrlPlugin.applyConfiguration({ content_processing_redaction_url: value })

          return false
        } catch {
          return true
        }
      }, section)

      expect(threw).toBe(false)

      const result = await processed(serviceWorker, withId({ name: 'rex-browsing-visit', url: `${HIDDEN}/p`, title: 'T', domain: 'hidden.test' }))

      expect(result.url).toBe('CATEGORY:NO_CONFIGURATION')
    })
  }
})

test.describe('a domain-only type keeps only the host', () => {
  const record_types = [{ name: 'custom-domain', fields: { domain: 'site' } }]
  const FILTER_BLOCKED = { lists: { 'record-filter': [listEntry('blocked.com', 'BLOCKED')] }, filter_lists: ['record-filter'], record_types }

  for (const value of ['http://blocked.com', 'https://blocked.com/x']) {
    test(`${value} on a filter list with no allow list is blanked`, async ({ serviceWorker }) => {
      await startWith(serviceWorker, FILTER_BLOCKED)

      const result = await processed(serviceWorker, withId({ name: 'custom-domain', site: value }))

      expect(result.site).toBe('')
      expect(result.filtered).toBe(true)
    })
  }

  for (const [value, kept] of [['10.0.0.5/path?q=secret', '10.0.0.5'], ['user:pw@localhost/x', 'localhost'], ['sub.kept.test/p?q=1', 'kept.test']]) {
    test(`${value} is written as ${kept} and not filtered`, async ({ serviceWorker }) => {
      await startWith(serviceWorker, FILTER_BLOCKED)

      const result = await processed(serviceWorker, withId({ name: 'custom-domain', site: value }))

      expect(result.site).toBe(kept)
      expect(result.filtered).toBe(false)
    })
  }

  test('a real host is blanked in the failure state under hide', async ({ serviceWorker }) => {
    await startWith(serviceWorker, { lists: { 'record-empty': [] }, allow_lists: ['record-empty'], on_failure: 'hide', record_types })

    const result = await processed(serviceWorker, withId({ name: 'custom-domain', site: 'hidden.test' }))

    expect(result.site).toBe('')
    expect(result.filtered).toBe(true)
  })
})

const SECTION_VISIT = { name: 'rex-browsing-visit', url: `${HIDDEN}/p`, title: 'T', domain: 'hidden.test' }

async function settleInitialRead(serviceWorker) {
  await startWith(serviceWorker, {})
}

async function updateConfiguration(serviceWorker, update) {
  await serviceWorker.evaluate(async ({ present, section }) => {
    const stored = await self.rexCorePlugin.fetchConfiguration()
    const configuration = {}

    for (const [key, value] of Object.entries(stored)) {
      if (key !== 'content_processing_redaction_url') {
        configuration[key] = value
      }
    }

    if (present === true) {
      configuration.content_processing_redaction_url = section
    }

    await new Promise((resolve) => {
      self.rexCorePlugin.handleMessage({ messageType: 'updateConfiguration', configuration }, null, resolve)
    })

    await self.rexContentProcessingRedactionUrlPlugin.refreshConfiguration()
  }, update)
}

function withSection(section) {
  return { present: true, section }
}

test.describe('a section that cannot be used after one that could', () => {
  test('enabled false then an empty section hides the address', async ({ serviceWorker }) => {
    await settleInitialRead(serviceWorker)
    await updateConfiguration(serviceWorker, withSection({ enabled: false }))
    await updateConfiguration(serviceWorker, withSection({}))

    const result = await processed(serviceWorker, withId(SECTION_VISIT))

    expect(result.url).toBe('CATEGORY:NO_CONFIGURATION')
    expect(result.filtered).toBe(true)
  })

  test('enabled true then a null section hides the address', async ({ serviceWorker }) => {
    await settleInitialRead(serviceWorker)
    await updateConfiguration(serviceWorker, withSection({ enabled: true }))
    await updateConfiguration(serviceWorker, withSection(null))

    const result = await processed(serviceWorker, withId(SECTION_VISIT))

    expect(result.url).toBe('CATEGORY:NO_CONFIGURATION')
    expect(result.filtered).toBe(true)
  })

  test('enabled true then a configuration without the section hides the address', async ({ serviceWorker }) => {
    await settleInitialRead(serviceWorker)
    await updateConfiguration(serviceWorker, withSection({ enabled: true }))
    await updateConfiguration(serviceWorker, { present: false, section: null })

    const result = await processed(serviceWorker, withId(SECTION_VISIT))

    expect(result.url).toBe('CATEGORY:NO_CONFIGURATION')
    expect(result.filtered).toBe(true)
  })

  test('a null section then a valid one applies the rules', async ({ serviceWorker }) => {
    await settleInitialRead(serviceWorker)
    await updateConfiguration(serviceWorker, withSection(null))
    await updateConfiguration(serviceWorker, withSection({ enabled: true }))

    const given = withId(SECTION_VISIT)
    const result = await processed(serviceWorker, given)

    expect(result.url).toBe(given.url)
    expect(result.filtered).toBe(false)
  })
})

test.describe('the enabled setting', () => {
  const VISIT = SECTION_VISIT

  for (const section of [{}, { enabled: 'yes' }]) {
    test(`${JSON.stringify(section)} hides the address`, async ({ serviceWorker }) => {
      await settleInitialRead(serviceWorker)
      await updateConfiguration(serviceWorker, withSection(section))

      const result = await processed(serviceWorker, withId(VISIT))

      expect(result.url).toBe('CATEGORY:NO_CONFIGURATION')
    })
  }

  test('enabled false passes the record through unchanged', async ({ serviceWorker }) => {
    await settleInitialRead(serviceWorker)
    await updateConfiguration(serviceWorker, withSection({ enabled: false }))

    const given = withId(VISIT)

    expect(await processed(serviceWorker, given)).toEqual(given)
  })

  test('enabled true with no lists leaves the address unchanged and not filtered', async ({ serviceWorker }) => {
    await startWith(serviceWorker, {})

    const given = withId(VISIT)
    const result = await processed(serviceWorker, given)

    expect(result.url).toBe(given.url)
    expect(result.filtered).toBe(false)
  })
})

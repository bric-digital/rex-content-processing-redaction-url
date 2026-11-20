// @ts-nocheck

import { test, expect, BASE_CONFIG, configFor, listEntry, loadConfig, waitForListsLoaded, waitForModuleConfiguration } from './fixtures.js'

const SERVER_PORT = 9191
const SERVER = `http://127.0.0.1:${SERVER_PORT}`

const ALLOWED_HOST = 'www.example.com'
const FILTERED_HOST = 'www.example.org'
const DOMAIN_ONLY_HOST = 'www.example.net'
const OFF_ALLOW_LIST_HOST = 'www.example.edu'
const HOSTS = [ALLOWED_HOST, FILTERED_HOST, DOMAIN_ONLY_HOST, OFF_ALLOW_LIST_HOST]

const PASSIVE_DATA_KIT = {
  enabled: true,
  identifier: 'rex-content-processing-redaction-url-test',
  endpoint: `${SERVER}/data/add-bundle.json`,
}

const LISTS = {
  'server-allow': [listEntry('example.com', 'ALLOWED', 'domain'), listEntry('example.org', 'ALLOWED', 'domain')],
  'server-filter': [listEntry('example.org', 'TEST_FILTERED', 'domain')],
  'server-domain-only': [listEntry('example.net', 'TEST_DOMAIN', 'domain')],
}

const RULES = {
  lists: LISTS,
  allow_lists: ['server-allow'],
  filter_lists: ['server-filter'],
  domain_only_lists: ['server-domain-only'],
}

test.use({ hostResolverRules: HOSTS.map((host) => `MAP ${host} 127.0.0.1`).join(', ') })

function addressOn(host) {
  return `http://${host}:${SERVER_PORT}/pages/visit`
}

async function clearServer() {
  await fetch(`${SERVER}/data/points.json`, { method: 'DELETE' })
}

async function pointsOnServer() {
  const response = await fetch(`${SERVER}/data/points.json`)
  const stored = await response.json()

  return stored.points
}

async function loadRecordsOnServer(tabId) {
  const points = await pointsOnServer()

  return points.filter((point) => point.name === 'rex-page-event' && point.event_type === 'load' && point.tab_id === tabId)
}

async function startUpload(serviceWorker) {
  await serviceWorker.evaluate(() => {
    self.rexPDKPlugin.uploadQueuedDataPoints().catch(() => undefined)
  })
}

async function visit(serviceWorker, address) {
  return serviceWorker.evaluate(async (url) => {
    const tab = await chrome.tabs.create({ url })

    return tab.id
  }, address)
}

async function loadRecordOnServer(serviceWorker, tabId) {
  await expect.poll(async () => {
    await startUpload(serviceWorker)

    return (await loadRecordsOnServer(tabId)).length
  }, { timeout: 20000 }).toBe(1)

  const [record] = await loadRecordsOnServer(tabId)

  return record
}

async function visitedRecordOnServer(serviceWorker, host) {
  const tabId = await visit(serviceWorker, addressOn(host))

  return loadRecordOnServer(serviceWorker, tabId)
}

async function waitForStoredLists(serviceWorker) {
  for (const listName of Object.keys(LISTS)) {
    await expect.poll(() => serviceWorker.evaluate((name) => self.hasListEntries(name), listName), { timeout: 10000 }).toBe(true)
  }
}

async function startWithRules(serviceWorker, rules = RULES) {
  const config = { ...configFor(rules), passive_data_kit: PASSIVE_DATA_KIT }

  await loadConfig(serviceWorker, config)
  await waitForModuleConfiguration(serviceWorker, config)
  await waitForListsLoaded(serviceWorker)
  await waitForStoredLists(serviceWorker)
  await clearServer()
}

async function startWithoutRedactionSection(serviceWorker) {
  const config = { ...BASE_CONFIG, passive_data_kit: PASSIVE_DATA_KIT }

  await loadConfig(serviceWorker, config)
  await expect.poll(() => serviceWorker.evaluate(() => self.rexPageEventsPlugin.config?.enabled), { timeout: 10000 }).toBe(true)
  await clearServer()
}

test.describe('records the server received', () => {
  test('an address on a domain-only list arrives with a blank address and title and its registered domain', async ({ serviceWorker }) => {
    await startWithRules(serviceWorker)

    const record = await visitedRecordOnServer(serviceWorker, DOMAIN_ONLY_HOST)

    expect(record.url).toBe('')
    expect(record.title).toBe('')
    expect(record.domain).toBe('example.net')
    expect(record.filtered_by_list).toBe('server-domain-only')
  })

  test('an address off the allow list arrives as CATEGORY:NOT_ON_ALLOWLIST with a blank title and domain', async ({ serviceWorker }) => {
    await startWithRules(serviceWorker)

    const record = await visitedRecordOnServer(serviceWorker, OFF_ALLOW_LIST_HOST)

    expect(record.url).toBe('CATEGORY:NOT_ON_ALLOWLIST')
    expect(record.title).toBe('')
    expect(record.domain).toBe('')
  })

  test('with not_on_allowlist_behavior domain_only an address off the allow list arrives with a blank address and title, its registered domain and the not-on-allowlist label', async ({ serviceWorker }) => {
    await startWithRules(serviceWorker, { ...RULES, not_on_allowlist_behavior: 'domain_only' })

    const record = await visitedRecordOnServer(serviceWorker, OFF_ALLOW_LIST_HOST)

    expect(record.url).toBe('')
    expect(record.title).toBe('')
    expect(record.domain).toBe('example.edu')
    expect(record.filtered).toBe(true)
    expect(record.filtered_by_list).toBe('NOT_ON_ALLOWLIST')
  })

  test('with not_on_allowlist_behavior domain_only an address off the allow list and on a filter list arrives as its category with a blank title and domain', async ({ serviceWorker }) => {
    const lists = { ...LISTS, 'server-filter': [...LISTS['server-filter'], listEntry('example.edu', 'TEST_OFF_LIST_FILTERED', 'domain')] }

    await startWithRules(serviceWorker, { ...RULES, lists, not_on_allowlist_behavior: 'domain_only' })

    const record = await visitedRecordOnServer(serviceWorker, OFF_ALLOW_LIST_HOST)

    expect(record.url).toBe('CATEGORY:TEST_OFF_LIST_FILTERED')
    expect(record.title).toBe('')
    expect(record.domain).toBe('')
    expect(record.filtered).toBe(true)
    expect(record.filtered_by_list).toBe('server-filter')
    expect(JSON.stringify(record)).not.toContain('example.edu')
  })

  test('an address on a filter list arrives as its category with a blank title and domain', async ({ serviceWorker }) => {
    await startWithRules(serviceWorker)

    const record = await visitedRecordOnServer(serviceWorker, FILTERED_HOST)

    expect(record.url).toBe('CATEGORY:TEST_FILTERED')
    expect(record.title).toBe('')
    expect(record.domain).toBe('')
    expect(record.filtered_by_list).toBe('server-filter')
    expect(JSON.stringify(record)).not.toContain('example.org')
  })

  test('an allowed address arrives unchanged with its title and registered domain', async ({ serviceWorker }) => {
    await startWithRules(serviceWorker)

    const record = await visitedRecordOnServer(serviceWorker, ALLOWED_HOST)

    expect(record.url).toBe(addressOn(ALLOWED_HOST))
    expect(record.title).toBe('Test page')
    expect(record.domain).toBe('example.com')
    expect(record.filtered).toBe(false)
  })

  test('without a redaction section in the configuration an address arrives as CATEGORY:NO_CONFIGURATION', async ({ serviceWorker }) => {
    await startWithoutRedactionSection(serviceWorker)

    const record = await visitedRecordOnServer(serviceWorker, ALLOWED_HOST)

    expect(record.url).toBe('CATEGORY:NO_CONFIGURATION')
    expect(record.title).toBe('')
    expect(record.domain).toBe('')
  })

  test('every visit arrives as one record, whatever the rules did to its address', async ({ serviceWorker }) => {
    await startWithRules(serviceWorker)

    const tabIds = []

    for (const host of HOSTS) {
      tabIds.push(await visit(serviceWorker, addressOn(host)))
    }

    const records = []

    for (const tabId of tabIds) {
      records.push(await loadRecordOnServer(serviceWorker, tabId))
    }

    expect(records.map((record) => record.url)).toEqual([
      addressOn(ALLOWED_HOST),
      'CATEGORY:TEST_FILTERED',
      '',
      'CATEGORY:NOT_ON_ALLOWLIST',
    ])

    for (const tabId of tabIds) {
      expect(await loadRecordsOnServer(tabId)).toHaveLength(1)
    }
  })
})

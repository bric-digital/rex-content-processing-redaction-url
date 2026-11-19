// @ts-nocheck

import { test as base, chromium, type BrowserContext } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url';

export const test = base.extend<{
  backForwardCache: boolean
  context: BrowserContext
  extensionId: string,
  serviceWorker:ServiceWorker,
}>({
  backForwardCache: [false, { option: true }],
  context: async ({ backForwardCache }, use) => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const pathToExtension = path.join(__dirname, '../extension')

    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      ignoreDefaultArgs: backForwardCache === true ? ['--disable-back-forward-cache'] : [],
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });

    await use(context)
    await context.close()
  },
  extensionId: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker)
      serviceWorker = await context.waitForEvent('serviceworker');

    const extensionId = serviceWorker.url().split('/')[2];
    await use(extensionId);
  },
  serviceWorker: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker');
    }

    await use(serviceWorker)
  },
});

export const expect = test.expect;

export const BASE_CONFIG = {
  configuration_url: 'config.json',
  identifier: 'rex-content-processing-url-redaction-test',
  page_events: {
    enabled: true,
    allow_all: true,
  },
  ui: [{
    title: 'Test',
    identifier: 'main',
    default: true,
  }],
}

export const DUPLICATE_SETTLE_MS = 1000

export async function expectExactlyOne(readRecords, pollOptions = {}) {
  await expect.poll(async () => (await readRecords()).length, pollOptions).toBe(1)
  await new Promise((resolve) => setTimeout(resolve, DUPLICATE_SETTLE_MS))

  const records = await readRecords()

  expect(records).toHaveLength(1)

  return records
}

export async function loadConfig(serviceWorker, config) {
  return serviceWorker.evaluate(async (configArg) => {
    return new Promise((resolve) => {
      self.rexCorePlugin.handleMessage({
        messageType: 'loadInitialConfiguration',
        configuration: configArg,
      }, this, (response) => resolve(response))
    })
  }, config)
}

const MODULE_KEYS = {
  rexPageEventsPlugin: 'page_events',
  rexContentProcessingUrlRedactionPlugin: 'content_processing_url_redaction',
}

export async function waitForModuleConfiguration(serviceWorker, config) {
  const expected = Object.entries(MODULE_KEYS).map(([plugin, key]) => [plugin, config[key]])

  await expect.poll(() => serviceWorker.evaluate((pairs) => {
    const sortedJson = (value) => JSON.stringify(value, (key, nested) => {
      if (nested === null || typeof nested !== 'object' || Array.isArray(nested)) {
        return nested
      }

      return Object.fromEntries(Object.entries(nested).sort(([a], [b]) => a.localeCompare(b)))
    })

    return pairs.every(([plugin, value]) => sortedJson(self[plugin]?.config) === sortedJson(value))
  }, expected), { timeout: 10000 }).toBe(true)
}

const REDACTION_FIELDS = ['allow_lists', 'filter_lists', 'domain_only_lists', 'on_failure', 'record_types']

export function listEntry(pattern, category, patternType = 'host') {
  return { pattern, pattern_type: patternType, metadata: { category } }
}

export function configFor(pageEvents = {}) {
  const pageEventsConfig = { enabled: true, allow_all: true }
  const redactionConfig = { enabled: true }

  if (pageEvents.event_types !== undefined) {
    pageEventsConfig.event_types = pageEvents.event_types
  }

  for (const field of REDACTION_FIELDS) {
    if (pageEvents[field] !== undefined) {
      redactionConfig[field] = pageEvents[field]
    }
  }

  const config = { ...BASE_CONFIG, page_events: pageEventsConfig, content_processing_url_redaction: redactionConfig }

  if (pageEvents.lists !== null) {
    config.lists = pageEvents.lists ?? {}
  }

  return config
}

export async function waitForListsLoaded(serviceWorker) {
  await serviceWorker.evaluate(() => self.rexListsPlugin.refreshConfiguration())
  await expect.poll(() => serviceWorker.evaluate(() => self.listsLoaded()), { timeout: 10000 }).toBe(true)
}

export async function startWith(serviceWorker, pageEvents = {}) {
  const config = configFor(pageEvents)

  await loadConfig(serviceWorker, config)
  await waitForModuleConfiguration(serviceWorker, config)

  if (config.lists !== undefined) {
    await waitForListsLoaded(serviceWorker)
  }

  await resetCaptured(serviceWorker)
}

export async function resetCaptured(serviceWorker) {
  await serviceWorker.evaluate(() => {
    self.__capturedEvents = []
  })
}

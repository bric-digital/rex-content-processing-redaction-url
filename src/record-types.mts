import { type REXContentProcessingRedactionUrlConfiguration, type RecordType } from './types.mjs'

const LOG_PREFIX = '[rex-content-processing-redaction-url]'

export const DEFAULT_RECORD_TYPES: RecordType[] = [
  { name: 'rex-history-visit', fields: { url: 'url', title: 'title', domain: 'domain', copies: ['recorded_url'] } },
  { name: 'rex-history-visit-aggregate', fields: { url: 'url', title: 'title', domain: 'domain', copies: ['recorded_url'] } },
  { name: 'rex-page-event', fields: { url: 'url', title: 'title', domain: 'domain', other_addresses: ['previous_url', 'opener_url', 'link_url', 'destination_url'] } },
  { name: 'rex-browsing-visit', fields: { url: 'url', title: 'title', domain: 'domain' } },
  { name: 'rex-browsing-opener', fields: { url: 'url', domain: 'domain' } },
  { name: 'rex-browsing-page', fields: { url: 'url', domain: 'domain' } },
  { name: 'pdk-app-event', event_name: 'rex-history-visit-ceiling-exceeded', container: 'event_details', fields: { url: 'recorded_url', domain: 'domain' } },
  { name: 'pdk-app-event', event_name: 'rex-browsing-visit-ceiling-exceeded', container: 'event_details', fields: { url: 'url', domain: 'domain' } },
  { name: 'pdk-app-event', event_name: 'rex-browsing-visit-ceiling-exceeded', container: 'event_details', fields: { domain: 'domain' } },
  { name: 'pdk-app-event', event_name: 'rex-history-skipped', container: 'event_details', fields: { domain: 'domain' } },
]

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Array.isArray(value) === false
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every((entry) => typeof entry === 'string'))
}

function isValidFields(fields: unknown): boolean {
  if (isObject(fields) === false) {
    return false
  }

  const given = fields as Record<string, unknown>

  return (typeof given.url === 'string' || typeof given.domain === 'string')
    && isOptionalString(given.url)
    && isOptionalString(given.domain)
    && isOptionalString(given.title)
    && isOptionalStringArray(given.copies)
    && isOptionalStringArray(given.other_addresses)
}

function isValidRecordType(entry: unknown): boolean {
  if (isObject(entry) === false) {
    return false
  }

  const given = entry as Record<string, unknown>

  return typeof given.name === 'string'
    && isOptionalString(given.event_name)
    && isOptionalString(given.container)
    && isValidFields(given.fields)
}

export function recordTypesToUse(configured: unknown): RecordType[] {
  if (configured === undefined) {
    return DEFAULT_RECORD_TYPES
  }

  if (Array.isArray(configured) && configured.length > 0 && configured.every(isValidRecordType)) {
    return configured as RecordType[]
  }

  console.warn(`${LOG_PREFIX} record_types is not valid, using the default record types`)

  return DEFAULT_RECORD_TYPES
}

function matches(type: RecordType, record: Record<string, unknown>): boolean {
  if (type.name !== record.name) {
    return false
  }

  return type.event_name === undefined || type.event_name === record.event_name
}

export function recordTypesOf(config: REXContentProcessingRedactionUrlConfiguration | null, content: unknown): RecordType[] {
  if (typeof content !== 'object' || content === null) {
    return []
  }

  const types = config?.record_types ?? DEFAULT_RECORD_TYPES

  return types.filter((type) => matches(type, content as Record<string, unknown>))
}

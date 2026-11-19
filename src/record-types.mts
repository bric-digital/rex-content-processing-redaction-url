import { type REXContentProcessingUrlRedactionConfiguration, type RecordType } from './types.mjs'

export const DEFAULT_RECORD_TYPES: RecordType[] = [
  { name: 'rex-history-visit', fields: { url: 'url', title: 'title', domain: 'domain', copies: ['recorded_url'] } },
  { name: 'rex-history-visit-aggregate', fields: { url: 'url', title: 'title', domain: 'domain', copies: ['recorded_url'] } },
  { name: 'rex-page-event', fields: { url: 'url', title: 'title', other_addresses: ['previous_url', 'opener_url', 'link_url', 'destination_url'] } },
  { name: 'rex-browsing-visit', fields: { url: 'url', title: 'title', domain: 'domain' } },
  { name: 'rex-browsing-opener', fields: { url: 'url', domain: 'domain' } },
  { name: 'rex-browsing-page', fields: { url: 'url', domain: 'domain' } },
]

function matches(type: RecordType, record: Record<string, unknown>): boolean {
  if (type.name !== record.name) {
    return false
  }

  return type.event_name === undefined || type.event_name === record.event_name
}

export function recordTypeOf(config: REXContentProcessingUrlRedactionConfiguration | null, content: unknown): RecordType | null {
  if (typeof content !== 'object' || content === null) {
    return null
  }

  const types = config?.record_types ?? DEFAULT_RECORD_TYPES

  for (const type of types) {
    if (matches(type, content as Record<string, unknown>)) {
      return type
    }
  }

  return null
}

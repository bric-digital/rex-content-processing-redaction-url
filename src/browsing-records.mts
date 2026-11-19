import { type AddressRecord, redactAddressFields } from './address-fields.mjs'
import { type REXContentProcessingUrlRedactionConfiguration } from './types.mjs'

const BROWSING_RECORD_NAMES: readonly string[] = ['rex-browsing-visit', 'rex-browsing-opener', 'rex-browsing-page']

const CATEGORY_PREFIX = 'CATEGORY:'

export function isBrowsingRecord(content: unknown): content is AddressRecord {
  return typeof content === 'object' && content !== null && 'name' in content
    && typeof content.name === 'string' && BROWSING_RECORD_NAMES.includes(content.name)
}

// The record is never dropped: its times, visit ids and tab fields stay, so a visit still counts.
export async function redactBrowsingRecord(config: REXContentProcessingUrlRedactionConfiguration, record: AddressRecord): Promise<AddressRecord> {
  const redacted: AddressRecord = { ...record }
  const redaction = await redactAddressFields(config, redacted)

  if (redaction.url.startsWith(CATEGORY_PREFIX)) {
    delete redacted.domain
  }

  return redacted
}

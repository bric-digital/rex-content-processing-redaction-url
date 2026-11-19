import { type RedactionResult, redact } from './address-lists.mjs'
import { type REXContentProcessingUrlRedactionConfiguration } from './types.mjs'

export type AddressRecord = Record<string, unknown>

export async function redactAddressFields(config: REXContentProcessingUrlRedactionConfiguration, record: AddressRecord): Promise<RedactionResult> {
  const url = typeof record.url === 'string' ? record.url : ''
  const title = typeof record.title === 'string' ? record.title : ''
  const redaction = await redact(config, url, title)

  record.url = redaction.url
  record.filtered = redaction.filtered

  if ('title' in record) {
    if (redaction.title === undefined) {
      delete record.title
    } else {
      record.title = redaction.title
    }
  }

  delete record.filtered_by_list
  delete record.allowed_by_list

  if (redaction.filtered_by_list !== undefined) {
    record.filtered_by_list = redaction.filtered_by_list
  }

  if (redaction.allowed_by_list !== undefined) {
    record.allowed_by_list = redaction.allowed_by_list
  }

  return redaction
}

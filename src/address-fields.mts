import { resolveAddress } from './address-rules.mjs'
import { type AddressResult, type REXContentProcessingUrlRedactionConfiguration } from './types.mjs'

export type AddressRecord = Record<string, unknown>

const NO_CONFIGURATION_RESULT: AddressResult = {
  url: 'CATEGORY:NO_CONFIGURATION',
  title: '',
  domain: '',
  filtered: true,
  failed: false,
}

export function resolveAddressOrHide(config: REXContentProcessingUrlRedactionConfiguration | null, url: string, title: string): Promise<AddressResult> {
  if (config === null) {
    return Promise.resolve(NO_CONFIGURATION_RESULT)
  }

  return resolveAddress(config, url, title)
}

export async function redactAddressFields(config: REXContentProcessingUrlRedactionConfiguration | null, record: AddressRecord): Promise<AddressResult> {
  const url = typeof record.url === 'string' ? record.url : ''
  const title = typeof record.title === 'string' ? record.title : ''
  const result = await resolveAddressOrHide(config, url, title)

  record.url = result.url
  record.filtered = result.filtered

  if ('title' in record) {
    record.title = result.title
  }

  if ('domain' in record) {
    record.domain = result.domain
  }

  if (result.filtered_by_list !== undefined) {
    record.filtered_by_list = result.filtered_by_list
  }

  if (result.allowed_by_list !== undefined) {
    record.allowed_by_list = result.allowed_by_list
  }

  return result
}

import { recordTypesToUse } from './record-types.mjs'
import { type OnFailure, type REXContentProcessingUrlRedactionConfiguration } from './types.mjs'

const LOG_PREFIX = '[rex-content-processing-url-redaction]'
const ON_FAILURE_VALUES: unknown[] = ['pass', 'hide']

function onFailureToUse(configured: unknown): OnFailure | undefined {
  if (configured === undefined || ON_FAILURE_VALUES.includes(configured)) {
    return configured as OnFailure | undefined
  }

  console.warn(`${LOG_PREFIX} on_failure is not pass or hide, using hide`)

  return 'hide'
}

export function normalizeConfiguration(configured: REXContentProcessingUrlRedactionConfiguration): REXContentProcessingUrlRedactionConfiguration {
  return {
    ...configured,
    on_failure: onFailureToUse(configured.on_failure),
    record_types: recordTypesToUse(configured.record_types),
  }
}

export const CONFIGURATION_KEY = 'content_processing_url_redaction'

export const CONFIGURATION_DETAILS = {
  [CONFIGURATION_KEY]: {
    enabled: 'Boolean, required. When true, addresses in records of the configured record types are hidden by the lists below. When false, records pass through unchanged. When absent or not a boolean, the section is treated as missing. Until the configuration arrives and rex-lists has loaded its lists, every address becomes CATEGORY:NO_CONFIGURATION.',
    allow_lists: 'Array of rex-lists list names, optional. Addresses on these lists keep their address; every other address becomes CATEGORY:NOT_ON_ALLOWLIST. With no allow lists, every address is allowed. Default [].',
    filter_lists: 'Array of rex-lists list names, optional. Matching addresses become CATEGORY:<category>. Default [].',
    domain_only_lists: 'Array of rex-lists list names, optional. Matching addresses lose their address and title and keep their registered domain. Takes precedence over the other lists. Default [].',
    on_failure: 'String, optional: pass or hide. What happens to a record when a list named above has no entries or a lookup fails. pass leaves the record unchanged; hide replaces its addresses with CATEGORY:REDACTION_FAILED. Default pass. Any other value is treated as hide.',
    record_types: 'Array of record types, optional. Each has name, optional event_name, and fields: url (the field holding the address), and optionally title, domain, copies (fields set to the same value as url) and other_addresses (fields each resolved on their own). When present and valid it replaces the default record types; otherwise the defaults are used. container names an object field of the record that holds the fields. A type with domain and no url is a domain-only record.',
  },
}

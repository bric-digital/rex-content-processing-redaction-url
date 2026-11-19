import { recordTypesToUse } from './record-types.mjs'
import { type NotOnAllowlistBehavior, type OnFailure, type REXContentProcessingRedactionUrlConfiguration } from './types.mjs'

const LOG_PREFIX = '[rex-content-processing-redaction-url]'
const ON_FAILURE_VALUES: unknown[] = ['pass', 'hide']
const NOT_ON_ALLOWLIST_BEHAVIOR_VALUES: unknown[] = ['category', 'domain_only']

function onFailureToUse(configured: unknown): OnFailure | undefined {
  if (configured === undefined || ON_FAILURE_VALUES.includes(configured)) {
    return configured as OnFailure | undefined
  }

  console.warn(`${LOG_PREFIX} on_failure is not pass or hide, using hide`)

  return 'hide'
}

function notOnAllowlistBehaviorToUse(configured: unknown): NotOnAllowlistBehavior | undefined {
  if (configured === undefined || NOT_ON_ALLOWLIST_BEHAVIOR_VALUES.includes(configured)) {
    return configured as NotOnAllowlistBehavior | undefined
  }

  console.warn(`${LOG_PREFIX} not_on_allowlist_behavior is not category or domain_only, using category`)

  return 'category'
}

export function normalizeConfiguration(configured: REXContentProcessingRedactionUrlConfiguration): REXContentProcessingRedactionUrlConfiguration {
  return {
    ...configured,
    on_failure: onFailureToUse(configured.on_failure),
    not_on_allowlist_behavior: notOnAllowlistBehaviorToUse(configured.not_on_allowlist_behavior),
    record_types: recordTypesToUse(configured.record_types),
  }
}

export const CONFIGURATION_KEY = 'content_processing_redaction_url'

export const CONFIGURATION_DETAILS = {
  [CONFIGURATION_KEY]: {
    enabled: 'Boolean, required. When true, addresses in records of the configured record types are hidden by the lists below. When false, records pass through unchanged. When absent or not a boolean, or when the section is missing or not an object, every address becomes CATEGORY:NO_CONFIGURATION. Before the configuration arrives, and while lists named below have not loaded in rex-lists, every address becomes CATEGORY:NO_CONFIGURATION; with no list named, the rules run at once.',
    allow_lists: 'Array of rex-lists list names, optional. Addresses on these lists keep their address; every other address is handled by not_on_allowlist_behavior. With no allow lists, every address is allowed. Default [].',
    filter_lists: 'Array of rex-lists list names, optional. Matching addresses become CATEGORY:<category>. Default [].',
    domain_only_lists: 'Array of rex-lists list names, optional. Matching addresses lose their address and title and keep their registered domain. Takes precedence over the other lists. Default [].',
    on_failure: 'String, optional: pass or hide. What happens to a record when a list named above has no entries or a lookup fails. pass leaves the record unchanged; hide replaces its addresses with CATEGORY:REDACTION_FAILED. Default pass. Any other value is treated as hide.',
    not_on_allowlist_behavior: 'String, optional: category or domain_only. What happens to an address that is on no allow list. category replaces it with CATEGORY:NOT_ON_ALLOWLIST and blanks its title and domain; domain_only blanks the address and title and keeps the registered domain. In both, filtered_by_list is NOT_ON_ALLOWLIST. Default category. Any other value is treated as category.',
    record_types: 'Array of record types, optional. Each has name, optional event_name, and fields: url (the field holding the address), and optionally title, domain, copies (fields set to the same value as url) and other_addresses (fields each resolved on their own). When present and valid it replaces the default record types; otherwise the defaults are used. container names an object field of the record that holds the fields. A type with domain and no url is a domain-only record.',
  },
}

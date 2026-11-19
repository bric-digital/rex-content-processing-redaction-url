export const CONFIGURATION_KEY = 'content_processing_url_redaction'

export const CONFIGURATION_DETAILS = {
  [CONFIGURATION_KEY]: {
    enabled: 'Boolean. When true, addresses in rex-page-event and rex-browsing records are hidden by the lists below. When false, records pass through unchanged. Until the configuration arrives, every address becomes CATEGORY:NO_CONFIGURATION.',
    allow_lists: 'Array of rex-lists list names, optional. Addresses on these lists keep their address; every other address becomes CATEGORY:NOT_ON_ALLOWLIST. With no allow lists, every address is allowed. Default [].',
    filter_lists: 'Array of rex-lists list names, optional. Matching addresses become CATEGORY:<category>. Default [].',
    domain_only_lists: 'Array of rex-lists list names, optional. Matching addresses lose their address and title and keep their registered domain. Takes precedence over the other lists. Default [].',
  },
}

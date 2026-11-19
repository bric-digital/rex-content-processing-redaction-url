export const CONFIGURATION_KEY = 'content_processing_url_redaction'

export const CONFIGURATION_DETAILS = {
  [CONFIGURATION_KEY]: {
    enabled: 'Boolean. When true, addresses in rex-page-event and rex-browsing records are hidden by the lists below. When false, records pass through unchanged. Until the configuration arrives, every address is hidden.',
    allow_lists: 'Array of rex-lists list names, optional. Addresses on these lists keep their address; every other address becomes CATEGORY:NOT_ON_ALLOWLIST. Default [].',
    allow_all: 'Boolean, optional. When true, every address is allowed and allow_lists is not consulted. Default false.',
    filter_lists: 'Array of rex-lists list names, optional. Matching addresses become CATEGORY:<category>, also under allow_all. Default [].',
    domain_only_lists: 'Array of rex-lists list names, optional. Matching addresses keep their hostname, and the title becomes DOMAIN ONLY. Takes precedence over the other lists. Default [].',
  },
}

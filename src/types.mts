export interface REXContentProcessingUrlRedactionConfiguration {
  enabled: boolean
  allow_lists?: string[]
  allow_all?: boolean
  filter_lists?: string[]
  domain_only_lists?: string[]
}

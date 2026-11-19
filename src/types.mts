import { type ListEntry } from '@bric/rex-lists'

export type OnFailure = 'pass' | 'hide'

export interface AddressFields {
  url?: string
  title?: string
  domain?: string
  copies?: string[]
  other_addresses?: string[]
}

export interface RecordType {
  name: string
  event_name?: string
  container?: string
  fields: AddressFields
}

export interface REXContentProcessingUrlRedactionConfiguration {
  enabled: boolean
  allow_lists?: string[]
  filter_lists?: string[]
  domain_only_lists?: string[]
  on_failure?: OnFailure
  record_types?: RecordType[]
}

export interface AddressResult {
  url: string
  title: string
  domain: string
  filtered: boolean
  failed: boolean
  domain_only_match?: boolean
  filtered_by_list?: string
  filtered_by_list_entry?: ListEntry
  allowed_by_list?: string
  allowed_by_list_entry?: ListEntry
}

import { type AddressFields, type AddressResult } from './types.mjs'

export type AddressRecord = Record<string, unknown>

const DEFAULT_DOMAIN_FIELD = 'domain'
const LABEL_FIELDS = ['filtered_by_list', 'filtered_by_list_entry', 'allowed_by_list', 'allowed_by_list_entry'] as const

function writeLabels(record: AddressRecord, result: AddressResult): void {
  for (const field of LABEL_FIELDS) {
    const value = result[field]

    if (value !== undefined) {
      record[field] = value
    } else if (field in record) {
      record[field] = ''
    }
  }
}

function writeCopies(record: AddressRecord, fields: AddressFields, result: AddressResult): void {
  for (const field of fields.copies ?? []) {
    if (typeof record[field] === 'string') {
      record[field] = result.url
    }
  }
}

export function applyMainResult(record: AddressRecord, urlField: string, fields: AddressFields, result: AddressResult): void {
  record[urlField] = result.url

  writeCopies(record, fields, result)

  if (fields.title !== undefined && fields.title in record) {
    record[fields.title] = result.title
  }

  record[fields.domain ?? DEFAULT_DOMAIN_FIELD] = result.domain

  writeLabels(record, result)
}

export function applyOtherResult(record: AddressRecord, field: string, result: AddressResult): void {
  record[field] = result.url
}

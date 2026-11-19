import { REXContentProcessor } from '@bric/rex-content-processing/library'
import { listsLoaded } from '@bric/rex-lists'

import { type AddressRecord, applyMainResult, applyOtherResult } from './apply-result.mjs'
import { resolveAddress } from './address-rules.mjs'
import { recordTypeOf } from './record-types.mjs'
import { type AddressFields, type AddressResult, type RecordType, type REXContentProcessingUrlRedactionConfiguration } from './types.mjs'

const NO_CONFIGURATION = 'CATEGORY:NO_CONFIGURATION'
const REDACTION_FAILED = 'CATEGORY:REDACTION_FAILED'

interface ResolvedRecord {
  main: AddressResult
  others: Map<string, AddressResult>
}

function hiddenResult(label: string): AddressResult {
  return { url: label, title: '', domain: '', filtered: true, failed: false }
}

function stringFields(record: AddressRecord, names: string[] | undefined): string[] {
  return (names ?? []).filter((name) => typeof record[name] === 'string')
}

function titleOf(record: AddressRecord, fields: AddressFields): string {
  const title = fields.title === undefined ? undefined : record[fields.title]

  return typeof title === 'string' ? title : ''
}

function applyResolved(record: AddressRecord, urlField: string, fields: AddressFields, resolved: ResolvedRecord): AddressRecord {
  const applied: AddressRecord = { ...record }

  applyMainResult(applied, urlField, fields, resolved.main)

  let filtered = resolved.main.filtered

  for (const [field, result] of resolved.others) {
    applyOtherResult(applied, field, result)
    filtered = filtered || result.filtered
  }

  applied.filtered = filtered

  return applied
}

function hideAddresses(record: AddressRecord, urlField: string, fields: AddressFields, label: string): AddressRecord {
  const others = new Map<string, AddressResult>()

  for (const field of stringFields(record, fields.other_addresses)) {
    others.set(field, hiddenResult(label))
  }

  return applyResolved(record, urlField, fields, { main: hiddenResult(label), others })
}

async function resolveRecord(config: REXContentProcessingUrlRedactionConfiguration, record: AddressRecord, urlField: string, fields: AddressFields): Promise<ResolvedRecord> {
  const main = await resolveAddress(config, record[urlField] as string, titleOf(record, fields))
  const others = new Map<string, AddressResult>()

  for (const field of stringFields(record, fields.other_addresses)) {
    others.set(field, await resolveAddress(config, record[field] as string, ''))
  }

  return { main, others }
}

function hasFailure(resolved: ResolvedRecord): boolean {
  return resolved.main.failed || [...resolved.others.values()].some((result) => result.failed)
}

function hideDomain(record: AddressRecord, domainField: string): AddressRecord {
  return { ...record, [domainField]: '', filtered: true }
}

function domainAfter(record: AddressRecord, domainField: string, result: AddressResult): AddressRecord {
  const blanked = result.url.startsWith('CATEGORY:')

  return { ...record, [domainField]: blanked ? '' : result.domain, filtered: blanked }
}

function scopeOf(record: AddressRecord, type: RecordType): AddressRecord | null {
  if (type.container === undefined) {
    return record
  }

  const inner = record[type.container]

  if (typeof inner !== 'object' || inner === null || Array.isArray(inner)) {
    return null
  }

  return inner as AddressRecord
}

export class REXContentProcessingUrlRedactionProcessor extends REXContentProcessor {
  config: REXContentProcessingUrlRedactionConfiguration | null = null

  name(): string {
    return 'REXContentProcessingUrlRedactionProcessor'
  }

  async processContent(content: unknown): Promise<unknown> {
    const type = recordTypeOf(this.config, content)

    if (type === null) {
      return content
    }

    const record = content as AddressRecord
    const scope = scopeOf(record, type)

    if (scope === null) {
      return content
    }

    const redacted = await this.redactScope(scope, type.fields)

    if (redacted === null) {
      return content
    }

    return type.container === undefined ? redacted : { ...record, [type.container]: redacted }
  }

  private redactScope(scope: AddressRecord, fields: AddressFields): Promise<AddressRecord | null> {
    if (fields.url !== undefined) {
      return typeof scope[fields.url] === 'string' ? this.redactAddresses(scope, fields.url, fields) : Promise.resolve(null)
    }

    if (fields.domain !== undefined) {
      const domain = scope[fields.domain]

      return typeof domain === 'string' && domain !== '' ? this.redactDomain(scope, fields.domain, domain) : Promise.resolve(null)
    }

    return Promise.resolve(null)
  }

  private async redactAddresses(scope: AddressRecord, urlField: string, fields: AddressFields): Promise<AddressRecord | null> {
    const config = this.config

    if (config === null || await listsLoaded() === false) {
      return hideAddresses(scope, urlField, fields, NO_CONFIGURATION)
    }

    const resolved = await resolveRecord(config, scope, urlField, fields)

    if (hasFailure(resolved)) {
      return config.on_failure === 'hide' ? hideAddresses(scope, urlField, fields, REDACTION_FAILED) : null
    }

    return applyResolved(scope, urlField, fields, resolved)
  }

  private async redactDomain(scope: AddressRecord, domainField: string, domain: string): Promise<AddressRecord | null> {
    const config = this.config

    if (config === null || await listsLoaded() === false) {
      return hideDomain(scope, domainField)
    }

    const result = await resolveAddress(config, `https://${domain}/`, '')

    if (result.failed) {
      return config.on_failure === 'hide' ? hideDomain(scope, domainField) : null
    }

    return domainAfter(scope, domainField, result)
  }
}

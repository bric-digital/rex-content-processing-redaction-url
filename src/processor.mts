import { REXContentProcessor } from '@bric/rex-content-processing/library'
import { listsLoaded } from '@bric/rex-lists/service-worker'

import { type AddressRecord, applyMainResult, applyOtherResult } from './apply-result.mjs'
import { resolveAddress } from './address-rules.mjs'
import { recordTypeOf } from './record-types.mjs'
import { type AddressFields, type AddressResult, type RecordType, type REXContentProcessingRedactionUrlConfiguration } from './types.mjs'

const LOG_PREFIX = '[rex-content-processing-redaction-url]'
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

async function resolveRecord(config: REXContentProcessingRedactionUrlConfiguration, record: AddressRecord, urlField: string, fields: AddressFields): Promise<ResolvedRecord> {
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

function domainAfter(record: AddressRecord, domainField: string, hostname: string, result: AddressResult): AddressRecord {
  if (result.url.startsWith('CATEGORY:')) {
    return { ...record, [domainField]: '', filtered: true }
  }

  return { ...record, [domainField]: result.domain === '' ? hostname : result.domain, filtered: false }
}

const SCHEME_PREFIX = /^[a-z][a-z0-9+.-]*:\/\//i

function hostnameOf(domain: string): string | null {
  try {
    const address = SCHEME_PREFIX.test(domain) ? domain : `https://${domain}/`
    const hostname = new URL(address).hostname

    return hostname === '' || hostname.includes('%') ? null : hostname
  } catch {
    return null
  }
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

function isRedactable(scope: AddressRecord, fields: AddressFields): boolean {
  if (fields.url !== undefined) {
    return typeof scope[fields.url] === 'string'
  }

  if (fields.domain !== undefined) {
    const domain = scope[fields.domain]

    return typeof domain === 'string' && domain !== ''
  }

  return false
}

function hiddenScope(scope: AddressRecord, fields: AddressFields, label: string): AddressRecord {
  if (fields.url !== undefined) {
    return hideAddresses(scope, fields.url, fields, label)
  }

  return hideDomain(scope, fields.domain as string)
}

function withScope(record: AddressRecord, type: RecordType, scope: AddressRecord): AddressRecord {
  return type.container === undefined ? scope : { ...record, [type.container]: scope }
}

async function listsAreLoaded(): Promise<boolean> {
  try {
    return await listsLoaded()
  } catch (error) {
    console.warn(`${LOG_PREFIX} could not read whether lists are loaded`, error)

    return false
  }
}

function hasNames(names: string[] | undefined): boolean {
  return Array.isArray(names) && names.length > 0
}

function namesAnyList(config: REXContentProcessingRedactionUrlConfiguration): boolean {
  return hasNames(config.allow_lists) || hasNames(config.filter_lists) || hasNames(config.domain_only_lists)
}

export class REXContentProcessingRedactionUrlProcessor extends REXContentProcessor {
  config: REXContentProcessingRedactionUrlConfiguration | null = null
  warnedListsNotLoaded = false

  name(): string {
    return 'REXContentProcessingRedactionUrlProcessor'
  }

  useConfiguration(config: REXContentProcessingRedactionUrlConfiguration | null) {
    this.config = config
    this.warnedListsNotLoaded = false
  }

  private async readyToApplyRules(config: REXContentProcessingRedactionUrlConfiguration): Promise<boolean> {
    if (namesAnyList(config) === false) {
      return true
    }

    if (await listsAreLoaded() === true) {
      return true
    }

    if (this.warnedListsNotLoaded === false) {
      this.warnedListsNotLoaded = true
      console.warn(`${LOG_PREFIX} lists are named in the configuration and have not finished loading; addresses are hidden until they have`)
    }

    return false
  }

  async processContent(content: unknown): Promise<unknown> {
    try {
      const type = recordTypeOf(this.config, content)

      if (type === null) {
        return content
      }

      return await this.processMatched(content as AddressRecord, type)
    } catch (error) {
      console.warn(`${LOG_PREFIX} could not process a record`, error)

      return this.failureResult(content)
    }
  }

  private failureResult(content: unknown): unknown {
    try {
      const type = recordTypeOf(this.config, content)

      if (type === null || this.config?.on_failure !== 'hide') {
        return content
      }

      const record = content as AddressRecord
      const scope = scopeOf(record, type)

      if (scope === null || isRedactable(scope, type.fields) === false) {
        return content
      }

      return withScope(record, type, hiddenScope(scope, type.fields, REDACTION_FAILED))
    } catch {
      return content
    }
  }

  private async processMatched(record: AddressRecord, type: RecordType): Promise<unknown> {
    const scope = scopeOf(record, type)

    if (scope === null || isRedactable(scope, type.fields) === false) {
      return record
    }

    const redacted = await this.redactScope(scope, type.fields)

    return redacted === null ? record : withScope(record, type, redacted)
  }

  private redactScope(scope: AddressRecord, fields: AddressFields): Promise<AddressRecord | null> {
    if (fields.url !== undefined) {
      return this.redactAddresses(scope, fields.url, fields)
    }

    return this.redactDomain(scope, fields.domain as string, scope[fields.domain as string] as string)
  }

  private async redactAddresses(scope: AddressRecord, urlField: string, fields: AddressFields): Promise<AddressRecord | null> {
    const config = this.config

    if (config === null || await this.readyToApplyRules(config) === false) {
      return hideAddresses(scope, urlField, fields, NO_CONFIGURATION)
    }

    const resolved = await resolveRecord(config, scope, urlField, fields)

    if (hasFailure(resolved)) {
      return config.on_failure === 'hide' ? hideAddresses(scope, urlField, fields, REDACTION_FAILED) : null
    }

    return applyResolved(scope, urlField, fields, resolved)
  }

  private async redactDomain(scope: AddressRecord, domainField: string, domain: string): Promise<AddressRecord | null> {
    const hostname = hostnameOf(domain)

    if (hostname === null) {
      return { ...scope, filtered: false }
    }

    const config = this.config

    if (config === null || await this.readyToApplyRules(config) === false) {
      return hideDomain(scope, domainField)
    }

    const result = await resolveAddress(config, `https://${hostname}/`, '')

    if (result.failed) {
      return config.on_failure === 'hide' ? hideDomain(scope, domainField) : null
    }

    return domainAfter(scope, domainField, hostname, result)
  }
}

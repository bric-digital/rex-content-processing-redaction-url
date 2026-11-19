import { REXContentProcessor } from '@bric/rex-content-processing/library'
import { listsLoaded } from '@bric/rex-lists'

import { type AddressRecord, applyMainResult, applyOtherResult } from './apply-result.mjs'
import { resolveAddress } from './address-rules.mjs'
import { recordTypeOf } from './record-types.mjs'
import { type AddressFields, type AddressResult, type REXContentProcessingUrlRedactionConfiguration } from './types.mjs'

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

function applyResolved(record: AddressRecord, fields: AddressFields, resolved: ResolvedRecord): AddressRecord {
  const applied: AddressRecord = { ...record }

  applyMainResult(applied, fields, resolved.main)

  let filtered = resolved.main.filtered

  for (const [field, result] of resolved.others) {
    applyOtherResult(applied, field, result)
    filtered = filtered || result.filtered
  }

  applied.filtered = filtered

  return applied
}

function hide(record: AddressRecord, fields: AddressFields, label: string): AddressRecord {
  const others = new Map<string, AddressResult>()

  for (const field of stringFields(record, fields.other_addresses)) {
    others.set(field, hiddenResult(label))
  }

  return applyResolved(record, fields, { main: hiddenResult(label), others })
}

async function resolveRecord(config: REXContentProcessingUrlRedactionConfiguration, record: AddressRecord, fields: AddressFields): Promise<ResolvedRecord> {
  const title = titleOf(record, fields)
  const main = await resolveAddress(config, record[fields.url] as string, title)
  const others = new Map<string, AddressResult>()

  for (const field of stringFields(record, fields.other_addresses)) {
    others.set(field, await resolveAddress(config, record[field] as string, ''))
  }

  return { main, others }
}

function hasFailure(resolved: ResolvedRecord): boolean {
  return resolved.main.failed || [...resolved.others.values()].some((result) => result.failed)
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

    if (typeof record[type.fields.url] !== 'string') {
      return content
    }

    const config = this.config

    if (config === null || await listsLoaded() === false) {
      return hide(record, type.fields, 'CATEGORY:NO_CONFIGURATION')
    }

    const resolved = await resolveRecord(config, record, type.fields)

    if (hasFailure(resolved)) {
      return config.on_failure === 'hide' ? hide(record, type.fields, 'CATEGORY:REDACTION_FAILED') : content
    }

    return applyResolved(record, type.fields, resolved)
  }
}

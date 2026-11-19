import { REXContentProcessor } from '@bric/rex-content-processing/library'

import { type AddressRecord, redactAddressFields } from './address-fields.mjs'
import { redact } from './address-lists.mjs'
import { isBrowsingRecord, redactBrowsingRecord } from './browsing-records.mjs'
import { type REXContentProcessingUrlRedactionConfiguration } from './types.mjs'

const EVENT_NAME = 'rex-page-event'

const HIDE_EVERY_ADDRESS: REXContentProcessingUrlRedactionConfiguration = { enabled: true }

type PageEventRecord = AddressRecord

function isPageEventRecord(content: unknown): content is PageEventRecord {
  return typeof content === 'object' && content !== null && 'name' in content && content.name === EVENT_NAME
}

export class REXContentProcessingUrlRedactionProcessor extends REXContentProcessor {
  config: REXContentProcessingUrlRedactionConfiguration | null = null

  name(): string {
    return 'REXContentProcessingUrlRedactionProcessor'
  }

  processContent(content: unknown): Promise<unknown> {
    if (isPageEventRecord(content)) {
      return this.redactRecord(content)
    }

    if (isBrowsingRecord(content)) {
      return redactBrowsingRecord(this.activeConfiguration(), content)
    }

    return Promise.resolve(content)
  }

  private activeConfiguration(): REXContentProcessingUrlRedactionConfiguration {
    return this.config ?? HIDE_EVERY_ADDRESS
  }

  private async redactRecord(record: PageEventRecord): Promise<PageEventRecord> {
    const config = this.activeConfiguration()
    const redacted: PageEventRecord = { ...record }

    await redactAddressFields(config, redacted)
    await redactRelatedAddress(config, redacted, 'previous_url', 'previous_url_filtered')
    await redactRelatedAddress(config, redacted, 'opener_url', 'opener_filtered')

    return redacted
  }
}

async function redactRelatedAddress(
  config: REXContentProcessingUrlRedactionConfiguration,
  record: PageEventRecord,
  field: string,
  filteredField: string
): Promise<void> {
  const address = record[field]

  if (typeof address !== 'string') {
    return
  }

  const redaction = await redact(config, address, '')

  record[field] = redaction.url
  record[filteredField] = redaction.filtered
}

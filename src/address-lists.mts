import { type ListEntry, matchDomainAgainstList } from '@bric/rex-lists'

import { type REXContentProcessingUrlRedactionConfiguration } from './types.mjs'

const LOG_PREFIX = '[rex-content-processing-url-redaction]'

export interface RedactionResult {
  url: string
  title?: string
  filtered: boolean
  filtered_by_list?: string
  allowed_by_list?: string
}

interface ListMatch {
  listName: string
  entry: ListEntry
}

interface ListLookup {
  match: ListMatch | null
  failed: boolean
}

function extractHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

async function findListMatch(url: string, listNames: string[], listLabel: string): Promise<ListLookup> {
  let failed = false

  for (const listName of listNames) {
    try {
      const entry = await matchDomainAgainstList(url, listName)

      if (entry !== null) {
        return { match: { listName, entry }, failed }
      }
    } catch (err) {
      console.warn(`${LOG_PREFIX} ${listLabel} list error on ${listName}`, err)
      failed = true
    }
  }

  return { match: null, failed }
}

async function applyDomainOnlyLists(config: REXContentProcessingUrlRedactionConfiguration, url: string): Promise<RedactionResult | null> {
  const { match } = await findListMatch(url, config.domain_only_lists ?? [], 'domain_only')

  if (match === null) {
    return null
  }

  return {
    url: extractHostname(url),
    title: 'DOMAIN ONLY',
    filtered: true,
    filtered_by_list: match.listName,
  }
}

async function allowCheck(config: REXContentProcessingUrlRedactionConfiguration, url: string): Promise<{ allowed: boolean; allowedBy?: string }> {
  if (config.allow_all === true) {
    return { allowed: true }
  }

  const { match } = await findListMatch(url, config.allow_lists ?? [], 'allow')

  if (match === null) {
    return { allowed: false }
  }

  return { allowed: true, allowedBy: match.listName }
}

export interface FilterListLookup {
  match: RedactionResult | null
  failed: boolean
}

export async function lookUpFilterLists(config: REXContentProcessingUrlRedactionConfiguration, url: string): Promise<FilterListLookup> {
  const { match, failed } = await findListMatch(url, config.filter_lists ?? [], 'filter')

  if (match === null) {
    return { match: null, failed }
  }

  const category = match.entry.metadata?.category ?? null

  return {
    match: {
      url: `CATEGORY:${category ?? 'null'}`,
      filtered: true,
      filtered_by_list: match.listName,
    },
    failed,
  }
}

export async function redact(config: REXContentProcessingUrlRedactionConfiguration, url: string, title: string): Promise<RedactionResult> {
  if (url === '') {
    return { url, title, filtered: false }
  }

  const domainOnly = await applyDomainOnlyLists(config, url)
  if (domainOnly !== null) {
    return domainOnly
  }

  const { allowed, allowedBy } = await allowCheck(config, url)
  if (allowed === false) {
    return {
      url: 'CATEGORY:NOT_ON_ALLOWLIST',
      filtered: true,
      filtered_by_list: 'NOT_ON_ALLOWLIST',
    }
  }
  const allowedByField = allowedBy === undefined ? {} : { allowed_by_list: allowedBy }

  const filtered = (await lookUpFilterLists(config, url)).match
  if (filtered !== null) {
    return { ...filtered, ...allowedByField }
  }
  return { url, title, filtered: false, ...allowedByField }
}

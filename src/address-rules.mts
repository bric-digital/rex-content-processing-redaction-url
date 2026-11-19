import { type ListEntry, hasListEntries, matchDomainAgainstList, registeredDomainOf } from '@bric/rex-lists'

import { type AddressResult, type REXContentProcessingRedactionUrlConfiguration } from './types.mjs'

const LOG_PREFIX = '[rex-content-processing-redaction-url]'

const NOT_ON_ALLOWLIST = 'NOT_ON_ALLOWLIST'

interface ListMatch {
  listName: string
  entry: ListEntry
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

function categoryLabel(category: string | null): string {
  return `CATEGORY:${category ?? 'null'}`
}

async function findListMatch(url: string, listNames: string[]): Promise<ListMatch | null> {
  for (const listName of listNames) {
    const entry = await matchDomainAgainstList(url, listName)

    if (entry !== null) {
      return { listName, entry }
    }
  }

  return null
}

async function hasEmptyList(config: REXContentProcessingRedactionUrlConfiguration): Promise<boolean> {
  const listNames = [...(config.allow_lists ?? []), ...(config.filter_lists ?? []), ...(config.domain_only_lists ?? [])]

  for (const listName of listNames) {
    if (await hasListEntries(listName) === false) {
      return true
    }
  }

  return false
}

function unchangedResult(url: string, title: string, domain: string): AddressResult {
  return { url, title, domain, filtered: false, failed: false }
}

function failedResult(url: string, title: string, domain: string): AddressResult {
  return { url, title, domain, filtered: false, failed: true }
}

function domainOnlyResult(match: ListMatch, domain: string): AddressResult {
  return {
    url: '',
    title: '',
    domain,
    filtered: true,
    failed: false,
    filtered_by_list: match.listName,
    filtered_by_list_entry: match.entry,
  }
}

function domainOnlyFallbackResult(domain: string): AddressResult {
  return {
    url: '',
    title: '',
    domain,
    filtered: true,
    failed: false,
    filtered_by_list: NOT_ON_ALLOWLIST,
  }
}

function notOnAllowListResult(): AddressResult {
  return {
    url: `CATEGORY:${NOT_ON_ALLOWLIST}`,
    title: '',
    domain: '',
    filtered: true,
    failed: false,
    filtered_by_list: NOT_ON_ALLOWLIST,
  }
}

function filterListResult(match: ListMatch, allowMatch: ListMatch | null): AddressResult {
  const result: AddressResult = {
    url: categoryLabel(match.entry.metadata?.category ?? null),
    title: '',
    domain: '',
    filtered: true,
    failed: false,
    filtered_by_list: match.listName,
    filtered_by_list_entry: match.entry,
  }

  return withAllowMatch(result, allowMatch)
}

function withAllowMatch(result: AddressResult, allowMatch: ListMatch | null): AddressResult {
  if (allowMatch === null) {
    return result
  }

  return { ...result, allowed_by_list: allowMatch.listName, allowed_by_list_entry: allowMatch.entry }
}

async function applyRules(config: REXContentProcessingRedactionUrlConfiguration, url: string, title: string, domain: string): Promise<AddressResult> {
  if (await hasEmptyList(config)) {
    return failedResult(url, title, domain)
  }

  const domainOnlyMatch = await findListMatch(url, config.domain_only_lists ?? [])

  if (domainOnlyMatch !== null) {
    return domainOnlyResult(domainOnlyMatch, domain)
  }

  const allowLists = config.allow_lists ?? []
  const allowMatch = await findListMatch(url, allowLists)

  const notOnAllowList = allowLists.length > 0 && allowMatch === null

  if (notOnAllowList && config.not_on_allowlist_behavior !== 'domain_only') {
    return notOnAllowListResult()
  }

  const filterMatch = await findListMatch(url, config.filter_lists ?? [])

  if (filterMatch !== null) {
    return filterListResult(filterMatch, allowMatch)
  }

  if (notOnAllowList) {
    return domainOnlyFallbackResult(domain)
  }

  return withAllowMatch(unchangedResult(url, title, domain), allowMatch)
}

export async function resolveAddress(config: REXContentProcessingRedactionUrlConfiguration, url: string, title: string): Promise<AddressResult> {
  if (isValidUrl(url) === false) {
    return unchangedResult(url, title, '')
  }

  const domain = registeredDomainOf(url)

  try {
    return await applyRules(config, url, title, domain)
  } catch (err) {
    console.warn(`${LOG_PREFIX} list lookup failed`, err)

    return failedResult(url, title, domain)
  }
}

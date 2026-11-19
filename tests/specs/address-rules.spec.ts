// @ts-nocheck

import { test, expect } from './fixtures.js'

async function addListEntry(serviceWorker, listName, pattern, category, patternType = 'host') {
  await serviceWorker.evaluate(async ({ listName, pattern, category, patternType }) => {
    const metadata = category === undefined ? {} : { category }

    await self.createListEntry({
      list_name: listName,
      pattern,
      pattern_type: patternType,
      source: 'backend',
      metadata,
    })
  }, { listName, pattern, category, patternType })
}

async function resolve(serviceWorker, config, url, title) {
  return serviceWorker.evaluate(({ config, url, title }) => {
    return self.resolveAddress({ enabled: true, ...config }, url, title)
  }, { config, url, title })
}

test.describe('Address rules', () => {
  test('an empty address is unchanged and not filtered', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'a', 'kept.test', 'ALLOWED')

    expect(await resolve(serviceWorker, { allow_lists: ['a'] }, '', 'T'))
      .toMatchObject({ url: '', title: 'T', domain: '', filtered: false, failed: false })
  })

  test('an address that is not a valid URL is unchanged and no list is consulted', async ({ serviceWorker }) => {
    const result = await resolve(serviceWorker, { allow_lists: ['never-loaded'] }, 'not a url', 'T')

    expect(result).toMatchObject({ url: 'not a url', title: 'T', domain: '', filtered: false, failed: false })
  })

  test('a named list with no entries fails and leaves the address unchanged', async ({ serviceWorker }) => {
    expect(await resolve(serviceWorker, { allow_lists: ['never-loaded'] }, 'https://any.test/p', 'T'))
      .toMatchObject({ failed: true, filtered: false, url: 'https://any.test/p', title: 'T', domain: 'any.test' })
  })

  for (const listField of ['allow_lists', 'filter_lists', 'domain_only_lists']) {
    test(`an empty list named in ${listField} fails`, async ({ serviceWorker }) => {
      expect(await resolve(serviceWorker, { [listField]: ['never-loaded'] }, 'https://any.test/p', 'T'))
        .toMatchObject({ failed: true, filtered: false, url: 'https://any.test/p' })
    })
  }

  test('an empty list fails even when another named list would match', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'd', 'example.com', 'ANY')

    expect(await resolve(serviceWorker, { domain_only_lists: ['d'], allow_lists: ['never-loaded'] }, 'https://example.com/p', 'T'))
      .toMatchObject({ failed: true, filtered: false, url: 'https://example.com/p' })
  })

  test('a domain-only match keeps the registered domain and hides the address and title', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'd', 'mail.example.co.uk', 'ANY')

    expect(await resolve(serviceWorker, { domain_only_lists: ['d'] }, 'https://mail.example.co.uk/x?y=1', 'T'))
      .toMatchObject({ url: '', title: '', domain: 'example.co.uk', filtered: true, filtered_by_list: 'd', failed: false })
  })

  test('a domain-only match on an address with no registered domain leaves the domain empty', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'ip', '127.0.0.1', 'ANY')

    expect(await resolve(serviceWorker, { domain_only_lists: ['ip'] }, 'http://127.0.0.1/x', 'T'))
      .toMatchObject({ url: '', title: '', domain: '' })
  })

  test('a domain-only match carries its list entry', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'd', 'example.com', 'ANY')

    const result = await resolve(serviceWorker, { domain_only_lists: ['d'] }, 'https://example.com/p', 'T')

    expect(result.filtered_by_list_entry).toMatchObject({ list_name: 'd', pattern: 'example.com' })
  })

  test('a domain-only match wins over an allow list that does not match', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'a', 'kept.test', 'ALLOWED')
    await addListEntry(serviceWorker, 'd', 'hidden.test', 'ANY')

    expect(await resolve(serviceWorker, { allow_lists: ['a'], domain_only_lists: ['d'] }, 'https://hidden.test/p', 'T'))
      .toMatchObject({ url: '', title: '', domain: 'hidden.test', filtered: true, filtered_by_list: 'd', failed: false })
  })

  test('an address on no allow list is replaced by the not-on-allowlist label', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'a', 'kept.test', 'ALLOWED')

    expect(await resolve(serviceWorker, { allow_lists: ['a'] }, 'https://hidden.test/p', 'T'))
      .toMatchObject({ url: 'CATEGORY:NOT_ON_ALLOWLIST', title: '', domain: '', filtered: true, filtered_by_list: 'NOT_ON_ALLOWLIST', failed: false })
  })

  test('a filter list match replaces the address with its category', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'f', 'hidden.test', 'news')

    const result = await resolve(serviceWorker, { filter_lists: ['f'] }, 'https://hidden.test/p', 'T')

    expect(result).toMatchObject({ url: 'CATEGORY:news', title: '', domain: '', filtered: true, filtered_by_list: 'f', failed: false })
    expect(result.filtered_by_list_entry).toMatchObject({ list_name: 'f', pattern: 'hidden.test' })
  })

  test('a filter list entry without a category gives CATEGORY:null', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'f', 'hidden.test', undefined)

    expect(await resolve(serviceWorker, { filter_lists: ['f'] }, 'https://hidden.test/p', 'T'))
      .toMatchObject({ url: 'CATEGORY:null', title: '', domain: '', filtered: true })
  })

  test('a filter list match on an allowed address also reports the allow list', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'a', 'kept.test', 'ALLOWED')
    await addListEntry(serviceWorker, 'f', 'kept.test', 'news')

    const result = await resolve(serviceWorker, { allow_lists: ['a'], filter_lists: ['f'] }, 'https://kept.test/p', 'T')

    expect(result).toMatchObject({ url: 'CATEGORY:news', filtered: true, filtered_by_list: 'f', allowed_by_list: 'a' })
    expect(result.allowed_by_list_entry).toMatchObject({ list_name: 'a', pattern: 'kept.test' })
  })

  test('an address on an allow list and no filter list is unchanged and reports the allow list', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'a', 'kept.test', 'ALLOWED')

    const result = await resolve(serviceWorker, { allow_lists: ['a'] }, 'https://www.kept.test/p', 'T')

    expect(result).toMatchObject({ url: 'https://www.kept.test/p', title: 'T', domain: 'kept.test', filtered: false, allowed_by_list: 'a', failed: false })
    expect(result.allowed_by_list_entry).toMatchObject({ list_name: 'a', pattern: 'kept.test' })
  })

  test('with no allow lists every address is allowed', async ({ serviceWorker }) => {
    expect(await resolve(serviceWorker, {}, 'https://any.test/p', 'T'))
      .toMatchObject({ url: 'https://any.test/p', title: 'T', domain: 'any.test', filtered: false, failed: false })
  })

  test('an empty allow_lists array allows every address', async ({ serviceWorker }) => {
    expect(await resolve(serviceWorker, { allow_lists: [] }, 'https://any.test/p', 'T'))
      .toMatchObject({ url: 'https://any.test/p', title: 'T', domain: 'any.test', filtered: false, failed: false })
  })

  test('a filter list still applies when there are no allow lists', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'f', 'hidden.test', 'news')

    expect(await resolve(serviceWorker, { filter_lists: ['f'] }, 'https://hidden.test/p', 'T'))
      .toMatchObject({ url: 'CATEGORY:news', filtered: true })
  })
})

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

  test('a lookup that throws fails and leaves the address unchanged', async ({ serviceWorker }) => {
    await serviceWorker.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open('webmunk_lists', 99)

      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
      request.onerror = () => reject(request.error)
    }))

    expect(await resolve(serviceWorker, { allow_lists: ['a'] }, 'https://any.test/p', 'T'))
      .toMatchObject({ failed: true, filtered: false, url: 'https://any.test/p', title: 'T', domain: 'any.test' })
  })

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

  test('a domain-only match on an address with no registered domain keeps the host', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'ip', '127.0.0.1', 'ANY')

    expect(await resolve(serviceWorker, { domain_only_lists: ['ip'] }, 'http://127.0.0.1/x', 'T'))
      .toMatchObject({ url: '', title: '', domain: '127.0.0.1' })
  })

  for (const [address, host] of [['http://192.0.2.7/p', '192.0.2.7'], ['http://localhost:8080/p', 'localhost']]) {
    test(`the shown address ${address}, which has no registered domain, keeps the host ${host} as its domain`, async ({ serviceWorker }) => {
      expect(await resolve(serviceWorker, {}, address, 'T'))
        .toMatchObject({ url: address, title: 'T', domain: host, filtered: false, failed: false })
    })

    test(`the address ${address} off the allow list gets a blank domain`, async ({ serviceWorker }) => {
      await addListEntry(serviceWorker, 'a', 'example.com', 'ALLOWED')

      expect(await resolve(serviceWorker, { allow_lists: ['a'] }, address, 'T'))
        .toMatchObject({ url: 'CATEGORY:NOT_ON_ALLOWLIST', title: '', domain: '', filtered: true })
    })
  }

  test('a shown address with no host gets a blank domain', async ({ serviceWorker }) => {
    expect(await resolve(serviceWorker, {}, 'about:blank', 'T'))
      .toMatchObject({ url: 'about:blank', title: 'T', domain: '', filtered: false, failed: false })
  })

  test('a domain-only match carries its list entry', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'd', 'example.com', 'ANY')

    const result = await resolve(serviceWorker, { domain_only_lists: ['d'] }, 'https://example.com/p', 'T')

    expect(result.filtered_by_list_entry).toMatchObject({ list_name: 'd', pattern: 'example.com' })
  })

  test('a domain-only match wins over an allow list that has entries but does not match the address', async ({ serviceWorker }) => {
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

  test('with not_on_allowlist_behavior category an address on no allow list is replaced by the not-on-allowlist label', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'a', 'example.com', 'ALLOWED')

    expect(await resolve(serviceWorker, { allow_lists: ['a'], not_on_allowlist_behavior: 'category' }, 'https://www.example.edu/p', 'T'))
      .toMatchObject({ url: 'CATEGORY:NOT_ON_ALLOWLIST', title: '', domain: '', filtered: true, filtered_by_list: 'NOT_ON_ALLOWLIST', failed: false })
  })

  test('with not_on_allowlist_behavior domain_only an address on no allow list keeps only its registered domain and still reports that it was on no allow list', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'a', 'example.com', 'ALLOWED')

    const result = await resolve(serviceWorker, { allow_lists: ['a'], not_on_allowlist_behavior: 'domain_only' }, 'https://www.example.edu/p?q=1', 'T')

    expect(result).toMatchObject({ url: '', title: '', domain: 'example.edu', filtered: true, filtered_by_list: 'NOT_ON_ALLOWLIST', failed: false })
    expect(result.filtered_by_list_entry).toBeUndefined()
    expect(result.allowed_by_list).toBeUndefined()
    expect(result.allowed_by_list_entry).toBeUndefined()
  })

  test('with not_on_allowlist_behavior domain_only an address with no registered domain on no allow list keeps its host', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'a', 'example.com', 'ALLOWED')

    expect(await resolve(serviceWorker, { allow_lists: ['a'], not_on_allowlist_behavior: 'domain_only' }, 'http://192.0.2.7/p', 'T'))
      .toMatchObject({ url: '', title: '', domain: '192.0.2.7', filtered: true, filtered_by_list: 'NOT_ON_ALLOWLIST' })
  })

  test('with not_on_allowlist_behavior domain_only an address on no allow list and on a filter list is replaced by its category', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'a', 'example.com', 'ALLOWED')
    await addListEntry(serviceWorker, 'f', 'example.org', 'news')

    const result = await resolve(serviceWorker, { allow_lists: ['a'], filter_lists: ['f'], not_on_allowlist_behavior: 'domain_only' }, 'https://www.example.org/p', 'T')

    expect(result).toMatchObject({ url: 'CATEGORY:news', title: '', domain: '', filtered: true, filtered_by_list: 'f', failed: false })
    expect(result.filtered_by_list_entry).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain('example.org')
    expect(result.allowed_by_list).toBeUndefined()
    expect(result.allowed_by_list_entry).toBeUndefined()
  })

  test('with not_on_allowlist_behavior domain_only a filter list entry without a category gives CATEGORY:null for an address on no allow list', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'a', 'example.com', 'ALLOWED')
    await addListEntry(serviceWorker, 'f', 'example.org', undefined)

    expect(await resolve(serviceWorker, { allow_lists: ['a'], filter_lists: ['f'], not_on_allowlist_behavior: 'domain_only' }, 'https://example.org/p', 'T'))
      .toMatchObject({ url: 'CATEGORY:null', title: '', domain: '', filtered: true, filtered_by_list: 'f' })
  })

  test('with not_on_allowlist_behavior domain_only an address on no allow list and no filter list keeps only its registered domain', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'a', 'example.com', 'ALLOWED')
    await addListEntry(serviceWorker, 'f', 'example.org', 'news')

    expect(await resolve(serviceWorker, { allow_lists: ['a'], filter_lists: ['f'], not_on_allowlist_behavior: 'domain_only' }, 'https://www.example.edu/p', 'T'))
      .toMatchObject({ url: '', title: '', domain: 'example.edu', filtered: true, filtered_by_list: 'NOT_ON_ALLOWLIST' })
  })

  test('with not_on_allowlist_behavior domain_only a domain-only list match wins over a filter list for an address on no allow list', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'a', 'example.com', 'ALLOWED')
    await addListEntry(serviceWorker, 'd', 'example.org', 'ANY')
    await addListEntry(serviceWorker, 'f', 'example.org', 'news')

    expect(await resolve(serviceWorker, { allow_lists: ['a'], domain_only_lists: ['d'], filter_lists: ['f'], not_on_allowlist_behavior: 'domain_only' }, 'https://example.org/p', 'T'))
      .toMatchObject({ url: '', title: '', domain: 'example.org', filtered: true, filtered_by_list: 'd' })
  })

  test('with not_on_allowlist_behavior domain_only a named filter list with no entries fails for an address on no allow list', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'a', 'example.com', 'ALLOWED')

    expect(await resolve(serviceWorker, { allow_lists: ['a'], filter_lists: ['never-loaded'], not_on_allowlist_behavior: 'domain_only' }, 'https://example.org/p', 'T'))
      .toMatchObject({ failed: true, filtered: false, url: 'https://example.org/p', title: 'T', domain: 'example.org' })
  })

  for (const behavior of [undefined, 'category']) {
    test(`with not_on_allowlist_behavior ${behavior} an address on no allow list and on a filter list gets only the not-on-allowlist label`, async ({ serviceWorker }) => {
      await addListEntry(serviceWorker, 'a', 'example.com', 'ALLOWED')
      await addListEntry(serviceWorker, 'f', 'example.org', 'news')

      expect(await resolve(serviceWorker, { allow_lists: ['a'], filter_lists: ['f'], not_on_allowlist_behavior: behavior }, 'https://example.org/p', 'T'))
        .toEqual({ url: 'CATEGORY:NOT_ON_ALLOWLIST', title: '', domain: '', filtered: true, failed: false, filtered_by_list: 'NOT_ON_ALLOWLIST' })
    })
  }

  test('with not_on_allowlist_behavior domain_only a domain-only list match still reports its list', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'a', 'example.com', 'ALLOWED')
    await addListEntry(serviceWorker, 'd', 'example.net', 'ANY')

    expect(await resolve(serviceWorker, { allow_lists: ['a'], domain_only_lists: ['d'], not_on_allowlist_behavior: 'domain_only' }, 'https://example.net/p', 'T'))
      .toMatchObject({ url: '', title: '', domain: 'example.net', filtered: true, filtered_by_list: 'd' })
  })

  test('with not_on_allowlist_behavior domain_only an allowed address is unchanged and a filter list still applies to it', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'a', 'example.com', 'ALLOWED')
    await addListEntry(serviceWorker, 'a', 'example.org', 'ALLOWED')
    await addListEntry(serviceWorker, 'f', 'example.org', 'news')

    const config = { allow_lists: ['a'], filter_lists: ['f'], not_on_allowlist_behavior: 'domain_only' }

    expect(await resolve(serviceWorker, config, 'https://example.com/p', 'T'))
      .toMatchObject({ url: 'https://example.com/p', title: 'T', domain: 'example.com', filtered: false, allowed_by_list: 'a' })
    expect(await resolve(serviceWorker, config, 'https://example.org/p', 'T'))
      .toMatchObject({ url: 'CATEGORY:news', title: '', domain: '', filtered: true, filtered_by_list: 'f', allowed_by_list: 'a' })
  })

  test('with not_on_allowlist_behavior domain_only and no allow lists every address is allowed', async ({ serviceWorker }) => {
    expect(await resolve(serviceWorker, { not_on_allowlist_behavior: 'domain_only' }, 'https://example.edu/p', 'T'))
      .toMatchObject({ url: 'https://example.edu/p', title: 'T', domain: 'example.edu', filtered: false })
  })

  test('a filter list match replaces the address with its category', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'f', 'hidden.test', 'news')

    const result = await resolve(serviceWorker, { filter_lists: ['f'] }, 'https://hidden.test/p', 'T')

    expect(result).toEqual({ url: 'CATEGORY:news', title: '', domain: '', filtered: true, filtered_by_list: 'f', failed: false })
  })

  for (const [patternType, pattern] of [['domain', 'example.org'], ['host', 'mail.example.org'], ['host_path_prefix', 'mail.example.org/inbox'], ['exact_url', 'https://mail.example.org/inbox/7?q=1'], ['regex', '^https://mail\\.example\\.org/']]) {
    test(`a filter list match on a ${patternType} pattern carries neither the matched entry nor the host`, async ({ serviceWorker }) => {
      await addListEntry(serviceWorker, 'f', pattern, 'news', patternType)

      const result = await resolve(serviceWorker, { filter_lists: ['f'] }, 'https://mail.example.org/inbox/7?q=1', 'T')

      expect(result).toEqual({ url: 'CATEGORY:news', title: '', domain: '', filtered: true, filtered_by_list: 'f', failed: false })
      expect(JSON.stringify(result)).not.toContain('example')
    })
  }

  test('a domain-only match on a pattern that is the kept domain carries its list entry', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'd', 'example.com', 'ANY', 'domain')

    const result = await resolve(serviceWorker, { domain_only_lists: ['d'] }, 'https://mail.example.com/inbox', 'T')

    expect(result).toMatchObject({ url: '', title: '', domain: 'example.com', filtered_by_list: 'd' })
    expect(result.filtered_by_list_entry).toMatchObject({ list_name: 'd', pattern: 'example.com' })
  })

  for (const [patternType, pattern] of [['host', 'mail.example.com'], ['host_path_prefix', 'mail.example.com/inbox'], ['exact_url', 'https://mail.example.com/inbox/7?q=1'], ['regex', '^https://mail\\.example\\.com/']]) {
    test(`a domain-only match on a ${patternType} pattern that holds more than the kept domain carries no list entry`, async ({ serviceWorker }) => {
      await addListEntry(serviceWorker, 'd', pattern, 'ANY', patternType)

      const result = await resolve(serviceWorker, { domain_only_lists: ['d'] }, 'https://mail.example.com/inbox/7?q=1', 'T')

      expect(result).toEqual({ url: '', title: '', domain: 'example.com', filtered: true, failed: false, filtered_by_list: 'd' })
    })
  }

  test('a filter list entry without a category gives CATEGORY:null', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'f', 'hidden.test', undefined)

    expect(await resolve(serviceWorker, { filter_lists: ['f'] }, 'https://hidden.test/p', 'T'))
      .toMatchObject({ url: 'CATEGORY:null', title: '', domain: '', filtered: true })
  })

  test('a filter list match on an allowed address also reports the allow list', async ({ serviceWorker }) => {
    await addListEntry(serviceWorker, 'a', 'kept.test', 'ALLOWED')
    await addListEntry(serviceWorker, 'f', 'kept.test', 'news')

    const result = await resolve(serviceWorker, { allow_lists: ['a'], filter_lists: ['f'] }, 'https://kept.test/p', 'T')

    expect(result).toEqual({ url: 'CATEGORY:news', title: '', domain: '', filtered: true, failed: false, filtered_by_list: 'f', allowed_by_list: 'a' })
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

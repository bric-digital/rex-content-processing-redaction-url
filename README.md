# rex-content-processing-redaction-url

REX content processor that hides web addresses in records by allow, filter and domain-only lists from `rex-lists`, before a collector stores them.

## Overview

Collectors store records as they arrive, so a record that carries a web address stores it unless something changes it first. This module registers a `REXContentProcessor` with `rex-content-processing`. A collector that runs content processors on each record before storing it, such as `rex-data-collection` (and so `rex-local-download`) or `rex-passive-data-kit`, stores the addresses as this processor leaves them. An extension that does not include this module sends unredacted addresses.

- A record is processed when its `name` (and its `event_name`, if the record type has one) matches a record type. When several record types match, the first one the record can be judged by is used: a type whose `url` field the record holds as a string, or a domain-only type whose `domain` field it holds as a non-empty string. Every other record passes through unchanged. The default record types are `rex-history-visit`, `rex-history-visit-aggregate`, `rex-page-event`, `rex-browsing-visit`, `rex-browsing-opener`, `rex-browsing-page` and the `pdk-app-event` visit ceiling events of `rex-history` and `rex-browsing` and its `rex-history-skipped` event.
- A record is never dropped and no field is removed. Only the address fields named by its record type change, together with `filtered` and the list labels. Every record whose address is judged also carries a domain field afterwards.
- Before the configuration arrives, every address becomes `CATEGORY:NO_CONFIGURATION`. When the configuration names lists and `rex-lists` has not finished loading the lists of the current configuration, every address becomes `CATEGORY:NO_CONFIGURATION` too; this includes the moments after a configuration change that alters lists. When it names no list, the rules run at once and every address is allowed.
- When a list named in the configuration has no entries, or a lookup fails, the record passes through unchanged unless `on_failure` is `hide`, which replaces its addresses with `CATEGORY:REDACTION_FAILED`.
- A record whose address field is missing or is not a string passes through unchanged.
- Only an explicit `enabled: false` turns the processor off: records then pass through unchanged. With a missing section, a section that is `null`, not an object or an array, or an object whose `enabled` is absent or not a boolean (a warning is logged when it is present), the processor is on and hides every address with `CATEGORY:NO_CONFIGURATION`, even after an earlier valid section. With `enabled: true` the rules apply.
- The processor returns a new record and never changes the record it receives, because the event bus gives the same record to every module.

### Where it runs

The processor acts only where a collector runs content processors. A module that receives records through `logEvent` without running them, such as a debugging view, sees raw addresses.

### Record types

A record type says which fields of a record hold addresses:

```json
{
  "name": "rex-page-event",
  "fields": {
    "url": "url",
    "title": "title",
    "domain": "domain",
    "other_addresses": ["previous_url", "opener_url", "link_url", "destination_url"]
  }
}
```

- `url`: the field holding the record's address. Its value decides `domain`, `title` and the list labels.
- `title`: written only when the record has it.
- `domain`: the field that receives the registered domain of `url`. It is always written, and a record without the field gains it: the registered domain when the address is shown or is on a domain-only list, and `''` when the address is hidden or has no host. An address whose host has no registered domain (an IP address or `localhost`) gets the host itself. A record type that names no `domain` field gets the field named `domain`. It describes `url` only, never the `other_addresses`.
- `copies`: fields set to the same value as `url` in every state, such as `recorded_url`.
- `other_addresses`: fields each resolved on its own by the same rules and replaced by the result. When any of them was changed, `filtered` is `true`. An entry that is absent or not a string is skipped.
- `event_name`: restricts the type to records with that `event_name`.
- `container`: the name of an object field of the record that holds the fields above, such as `event_details`. The object is copied, and `filtered` and the list labels are written inside it. A record whose container is not an object passes through unchanged.

A type with `domain` and no `url` is a domain-only record. When its domain is a non-empty string, its hostname is judged by the same rules as the address `https://<hostname>/`, and only `domain` is written. A value that starts with a scheme, such as `http://blocked.com`, is parsed as it is; otherwise it is parsed as `https://<value>/`, so `blocked.com/x` and `user@blocked.com` are judged as `blocked.com`. When the address is allowed or on a domain-only list, the field keeps the registered domain (`sub.kept.test` becomes `kept.test`), or the hostname when there is no registered domain (an IP address or `localhost`); the original string is never written back. When the address is replaced, the field becomes `''` and `filtered` is `true`; otherwise `filtered` is `false`. Before configuration, or under `on_failure: "hide"` after a failure, the domain becomes `''`. A domain with no usable hostname, such as `not available`, is left as it was with `filtered: false` in every state. The `rex-history-skipped` event is a domain-only type by default. The visit ceiling events of `rex-history` and `rex-browsing` hold an address (`recorded_url` and `url`), so their types name both `url` and `domain`. A `rex-browsing` visit ceiling event without a string `url`, as an older `rex-browsing` sends it, is handled by a second default type for that event, a domain-only type, so its domain is still judged. A domain-only type is judged as `https://<hostname>/`, so a filter entry narrower than a registered domain does not blank it.

A label field the record already has (`filtered_by_list`, `allowed_by_list` and their `_entry` fields) is written as `''` when the result does not provide it, so no stale label stays. A label the record does not have is not added.

## Redaction

When any of the configured lists match an address, the record is still stored; only the address fields are changed. Dwell time is always recorded.

Rules, in this order:

| Case | `url` | `title` | `domain` | Other fields |
|---|---|---|---|---|
| `url` is `''` or not a valid URL | unchanged | unchanged | `''` | `filtered: false` |
| A named list has no entries, or a lookup throws | handled by `on_failure` | handled by `on_failure` | handled by `on_failure` | the record is unchanged, or `CATEGORY:REDACTION_FAILED` under `hide` |
| On a domain-only list | `''` | `''` | registered domain | `filtered: true`, `filtered_by_list` |
| Allow lists named, no match | `CATEGORY:NOT_ON_ALLOWLIST` | `''` | `''` | `filtered: true`, `filtered_by_list: "NOT_ON_ALLOWLIST"` |
| Allow lists named, no match, with `not_on_allowlist_behavior: "domain_only"` | `''` | `''` | registered domain | `filtered: true`, `filtered_by_list: "NOT_ON_ALLOWLIST"` |
| On a filter list | `CATEGORY:<category>` (`CATEGORY:null` without a category) | `''` | `''` | `filtered: true`, `filtered_by_list`, `allowed_by_list` if any |
| Otherwise | unchanged | unchanged | registered domain | `filtered: false`, `allowed_by_list` if any |

With no `allow_lists`, every address is allowed. Where the table says registered domain, an address whose host has no registered domain (an IP address such as `192.0.2.7`, or `localhost`) gets the host itself, and an address with no host, such as `about:blank`, gets `''`. A field is never removed from a record: a hidden `title` or `domain` is written as `''`. The `domain` column applies to every record in the table, whether or not the record arrived with a `domain` field. Before configuration and under `on_failure: "hide"` the domain is `''` too. A record that passes through unchanged (`enabled: false`, a failure under `on_failure: "pass"`, or an address field that is missing or not a string) gains no field.

An address on no allow list is not looked up on the filter lists, under either value of `not_on_allowlist_behavior`. Under `domain_only` it has the same form as a domain-only list match, and `filtered_by_list` tells the two apart: it is `NOT_ON_ALLOWLIST` for an address on no allow list and the list name for a domain-only list match. A domain-only record type carries no list labels, so its two cases look the same: the domain is kept and `filtered` is `false`.

Fields named in `other_addresses` follow the same rules as `url`. Within one list, `rex-lists` matches the most specific pattern type first.

## Configuration

This module reads the `content_processing_redaction_url` section of the configuration. `configurationDetails()` describes each field.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `enabled` | boolean | Yes | none | When `true`, addresses are hidden by the lists below. When `false`, records pass through unchanged. When absent or not a boolean, the section counts as missing. |
| `allow_lists` | string[] | No | `[]` | Names of `rex-lists` lists whose addresses are kept. Every other address is handled by `not_on_allowlist_behavior`. With no lists, every address is allowed. |
| `filter_lists` | string[] | No | `[]` | Names of `rex-lists` lists whose matching addresses become `CATEGORY:<category>`. |
| `domain_only_lists` | string[] | No | `[]` | Matching addresses lose their address and title and keep their registered domain. |
| `on_failure` | `pass` or `hide` | No | `pass` | Any other value is treated as `hide`. What happens to a record when a named list has no entries or a lookup fails: `pass` leaves it unchanged, `hide` replaces its addresses with `CATEGORY:REDACTION_FAILED`. |
| `not_on_allowlist_behavior` | `category` or `domain_only` | No | `category` | Any other value is treated as `category`, and a warning is logged. What happens to an address that is on no allow list: `category` replaces it with `CATEGORY:NOT_ON_ALLOWLIST` and blanks its title and domain, `domain_only` blanks the address and title and keeps the registered domain. |
| `record_types` | object[] | No | the default record types | Replaces the default record types. When it is not valid, or is an empty array, the defaults are used and a warning is logged; turn the processor off with `enabled: false`. |

`config.sample.json` gives every field at its default.

With `enabled: true`, a record is handled in one of three states:

1. The configuration names no list in `allow_lists`, `filter_lists` or `domain_only_lists`: the rules run without waiting for `rex-lists`, and every address is allowed.
2. The configuration names at least one list and `rex-lists` has not finished loading the lists of the current configuration, including the moments after a configuration change that alters lists: every address becomes `CATEGORY:NO_CONFIGURATION`. The first time this happens after a configuration is applied, a warning is logged.
3. The configuration names at least one list and `rex-lists` has loaded its lists: the rules run. A named list with no entries is a failure, handled by `on_failure`.

Only an explicit `enabled: false` turns the processor off. Whenever a configuration arrives whose section is missing, empty, not an object, or has an `enabled` that is not a boolean, the processor is on and hides every address with `CATEGORY:NO_CONFIGURATION`, whatever an earlier section said.

## Installation

Add the module to an extension's `package.json`:

```json
"@bric/rex-content-processing-redaction-url": "github:bric-digital/rex-content-processing-redaction-url"
```

and import its service-worker part in the service-worker entry file, together with the lists module, which loads the lists from configuration. Reference each imported plugin so the bundler keeps it:

```ts
import listsPlugin from '@bric/rex-lists/service-worker'
import redactionUrlPlugin from '@bric/rex-content-processing-redaction-url/service-worker'

console.log(`Imported ${listsPlugin} into service worker context...`)
console.log(`Imported ${redactionUrlPlugin} into service worker context...`)
```

Until it has loaded the lists the configuration names, every address stays hidden.

It needs `@bric/rex-content-processing` and a collector that runs content processors, such as `rex-data-collection` or `rex-passive-data-kit`.

## Limits

- Do not name a generated list, one a module fills at run time such as `rex-history`'s top domains, in this module's lists. It is empty until it is generated, and an empty named list is a failure.
- `filtered_by_list_entry` and `allowed_by_list_entry` carry the matched list entry. An entry whose pattern type is `exact_url` (an exact address) or `regex` (a regular expression) can itself contain the address that was hidden.
- When an extension has two installed copies of `@bric/rex-content-processing`, this processor registers with a copy that no collector calls, and nothing is redacted. The extension must have one copy; `npm ls @bric/rex-content-processing` shows them.

## Testing

```
npm install
npm test
npm run lint
```

`pretest` bundles the test extension in `tests/extension/`, which loads `rex-page-events`, `rex-lists`, `rex-passive-data-kit`, this module and a capture module that runs the content processors on a copy of each record in order, as a collector does. `npm test` also starts a local test server (`tests/scripts/run-server.js`, port 9191) that serves test pages and stores the records `rex-passive-data-kit` uploads. Tests supply lists through the `lists` section of the configuration. The specs:

- `record-types.spec.ts`: each default record type, `record_types` in configuration, and the states (before configuration, lists not loaded, failure with each `on_failure`, unknown records, non-string addresses).
- `addresses.spec.ts`: the list rules on `rex-page-event` records, that `enabled: false` passes records through, and that addresses are hidden before configuration arrives.
- `browsing-addresses.spec.ts`: the list rules on `rex-browsing-visit`, `rex-browsing-opener` and `rex-browsing-page` records, and that other records pass through.
- `address-rules.spec.ts`: the rules for one address.
- `server-records.spec.ts`: end to end. Pages are visited under `example` host names mapped to the test server, `rex-page-events` records each visit, `rex-passive-data-kit` uploads the records, and the assertions read what the server stored: each list rule, a configuration without this module's section, and one record for every visit.

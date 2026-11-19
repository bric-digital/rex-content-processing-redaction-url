# rex-content-processing-url-redaction

REX content processor that hides web addresses in records by allow, filter and domain-only lists from `rex-lists`, before a collector stores them.

## Overview

Collectors store records as they arrive, so a record that carries a web address stores it unless something changes it first. This module registers a `REXContentProcessor` with `rex-content-processing`. A collector that runs content processors on each record before storing it, such as `rex-data-collection` (and so `rex-local-download`), stores the addresses as this processor leaves them. An extension that does not include this module sends unredacted addresses.

- A record is processed when its `name` (and its `event_name`, if the record type has one) matches a record type. Every other record passes through unchanged. The default record types are `rex-history-visit`, `rex-history-visit-aggregate`, `rex-page-event`, `rex-browsing-visit`, `rex-browsing-opener`, `rex-browsing-page` and the `pdk-app-event` visit ceiling events of `rex-history` and `rex-browsing` and its `rex-history-skipped` event.
- A record is never dropped and no field is removed. Only the address fields named by its record type change, together with `filtered` and the list labels.
- Before the configuration arrives, and while `rex-lists` has not yet loaded its lists, every address becomes `CATEGORY:NO_CONFIGURATION`.
- When a list named in the configuration has no entries, or a lookup fails, the record passes through unchanged unless `on_failure` is `hide`, which replaces its addresses with `CATEGORY:REDACTION_FAILED`.
- A record whose address field is missing or is not a string passes through unchanged.
- Once the configuration sets `enabled` to anything but `true`, the processor unregisters and records pass through unchanged.
- The processor returns a new record and never changes the record it receives, because the event bus gives the same record to every module.

### Where it runs

The processor acts only where a collector runs content processors. A module that receives records through `logEvent` without running them, such as a debugging view, sees raw addresses. The processor must not run with a version of `rex-page-events` that still hides addresses itself: a hidden address such as `CATEGORY:NOT_ON_ALLOWLIST` is not on any allow list, so it would be hidden again with different list fields.

### Record types

A record type says which fields of a record hold addresses:

```json
{
  "name": "rex-page-event",
  "fields": {
    "url": "url",
    "title": "title",
    "other_addresses": ["previous_url", "opener_url", "link_url", "destination_url"]
  }
}
```

- `url`: the field holding the record's address. Its value decides `domain`, `title` and the list labels.
- `title`: written only when the record has it.
- `domain`: the registered domain, or `''` when the address is hidden; written whenever the type names it.
- `copies`: fields set to the same value as `url` in every state, such as `recorded_url`.
- `other_addresses`: fields each resolved on its own by the same rules and replaced by the result. When any of them was changed, `filtered` is `true`. An entry that is absent or not a string is skipped.
- `event_name`: restricts the type to records with that `event_name`.
- `container`: the name of an object field of the record that holds the fields above, such as `event_details`. The object is copied, and `filtered` and the list labels are written inside it. A record whose container is not an object passes through unchanged.

A type with `domain` and no `url` is a domain-only record. When its domain is a non-empty string, its hostname is judged by the same rules as the address `https://<hostname>/`, and only `domain` is written. A value that starts with a scheme, such as `http://blocked.com`, is parsed as it is; otherwise it is parsed as `https://<value>/`, so `blocked.com/x` and `user@blocked.com` are judged as `blocked.com`. When the address is allowed or on a domain-only list, the field keeps the registered domain (`sub.kept.test` becomes `kept.test`), or the hostname when there is no registered domain (an IP address or `localhost`); the original string is never written back. When the address is replaced, the field becomes `''` and `filtered` is `true`; otherwise `filtered` is `false`. Before configuration, or under `on_failure: "hide"` after a failure, the domain becomes `''`. A domain with no usable hostname, such as `not available`, is left as it was with `filtered: false` in every state. The `rex-history-skipped` event and the `rex-browsing` visit ceiling event are domain-only types by default; the `rex-history` visit ceiling event also holds an address, so it names both `url` and `domain`. A domain-only type is judged as `https://<hostname>/`, so a filter entry narrower than a registered domain does not blank it.

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
| On a filter list | `CATEGORY:<category>` (`CATEGORY:null` without a category) | `''` | `''` | `filtered: true`, `filtered_by_list`, `allowed_by_list` if any |
| Otherwise | unchanged | unchanged | registered domain | `filtered: false`, `allowed_by_list` if any |

With no `allow_lists`, every address is allowed. The registered domain of an IP address or `localhost` is `''`. A field is never removed from a record: a hidden `title` or `domain` is written as `''`.

Fields named in `other_addresses` follow the same rules as `url`. Within one list, `rex-lists` matches the most specific pattern type first.

## Configuration

This module reads the `content_processing_url_redaction` section of the configuration. `configurationDetails()` describes each field.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `enabled` | boolean | Yes | none | When `true`, addresses are hidden by the lists below. When anything else, records pass through unchanged. Until the configuration arrives and the lists have loaded, every address becomes `CATEGORY:NO_CONFIGURATION`. |
| `allow_lists` | string[] | No | `[]` | Names of `rex-lists` lists whose addresses are kept. Every other address becomes `CATEGORY:NOT_ON_ALLOWLIST`. With no lists, every address is allowed. |
| `filter_lists` | string[] | No | `[]` | Names of `rex-lists` lists whose matching addresses become `CATEGORY:<category>`. |
| `domain_only_lists` | string[] | No | `[]` | Matching addresses lose their address and title and keep their registered domain. |
| `on_failure` | `pass` or `hide` | No | `pass` | Any other value is treated as `hide`. What happens to a record when a named list has no entries or a lookup fails: `pass` leaves it unchanged, `hide` replaces its addresses with `CATEGORY:REDACTION_FAILED`. |
| `record_types` | object[] | No | the default record types | Replaces the default record types. When it is not valid, or is an empty array, the defaults are used and a warning is logged; turn the processor off with `enabled: false`. |

`config.sample.json` gives every field at its default.

## Installation

Add the module to an extension's `package.json`:

```json
"@bric/rex-content-processing-url-redaction": "github:bric-digital/rex-content-processing-url-redaction"
```

and import its service-worker part:

```ts
await import('@bric/rex-content-processing-url-redaction/service-worker')
```

The extension must also import the lists module, which loads the lists from configuration:

```ts
await import('@bric/rex-lists/service-worker')
```

Until it has loaded the lists, every address stays hidden.

It needs `@bric/rex-content-processing` and a collector that runs content processors, such as `rex-data-collection`.

## Testing

```
npm install
npm test
npm run lint
```

`pretest` bundles the test extension in `tests/extension/`, which loads `rex-page-events`, `rex-lists`, this module and a capture module that runs the content processors on each record in order, as a collector does. Tests supply lists through the `lists` section of the configuration. The specs:

- `record-types.spec.ts`: each default record type, `record_types` in configuration, and the states (before configuration, lists not loaded, failure with each `on_failure`, unknown records, non-string addresses).
- `addresses.spec.ts`: the list rules on `rex-page-event` records, that `enabled: false` passes records through, and that addresses are hidden before configuration arrives.
- `browsing-addresses.spec.ts`: the list rules on `rex-browsing-visit`, `rex-browsing-opener` and `rex-browsing-page` records, and that other records pass through.
- `address-rules.spec.ts`: the rules for one address.

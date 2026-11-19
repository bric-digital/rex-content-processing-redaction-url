# rex-content-processing-url-redaction

REX content processor that hides addresses in `rex-page-event` and `rex-browsing` records by allow, filter and domain-only lists from `rex-lists`, before a collector stores them.

## Overview

`rex-page-events` puts raw addresses on the event bus. This module registers a `REXContentProcessor` with `rex-content-processing`. A collector that runs content processors on each record before storing it, such as `rex-data-collection` (and so `rex-local-download`), stores the addresses as this processor leaves them.

- Records named `rex-page-event`, `rex-browsing-visit`, `rex-browsing-opener` and `rex-browsing-page` are processed; every other record passes through unchanged.
- On `rex-page-event` records the processor handles `url`, `title`, `previous_url` and `opener_url`. It adds `filtered`, `filtered_by_list`, `allowed_by_list`, `previous_url_filtered` and `opener_filtered`.
- On `rex-browsing-visit` the processor hides `url` and `title` by the same rules, and writes `domain` as the registered domain, or `''` when the address is replaced. On `rex-browsing-opener` and `rex-browsing-page` it hides `url`. A browsing record is never dropped: its times, `visit_id`, `referring_visit_id`, `tab_id` and `window_id` stay, so every visit still counts.
- Until its configuration arrives, every address becomes `CATEGORY:NO_CONFIGURATION`. Once the configuration sets `enabled` to anything but `true`, the processor unregisters and records pass through unchanged.
- The processor returns a new record and never changes the record it receives, because the event bus gives the same record to every module.

### Where it runs

The processor acts only where a collector runs content processors. A module that receives records through `logEvent` without running them, such as a debugging view, sees raw addresses. The processor must not run with a version of `rex-page-events` that still hides addresses itself: a hidden address such as `CATEGORY:NOT_ON_ALLOWLIST` is not on any allow list, so it would be hidden again with different list fields.

## Redaction

When any of the configured lists match an address, the record is still stored; only the address fields are changed. Dwell time is always recorded.

Rules, in this order:

| Case | `url` | `title` | `domain` | Other fields |
|---|---|---|---|---|
| `url` is `''` or not a valid URL | unchanged | unchanged | `''` | `filtered: false` |
| A named list has no entries, or a lookup throws | unchanged | unchanged | registered domain | `failed: true`, `filtered: false` |
| On a domain-only list | `''` | `''` | registered domain | `filtered: true`, `filtered_by_list` |
| Allow lists named, no match | `CATEGORY:NOT_ON_ALLOWLIST` | `''` | `''` | `filtered: true`, `filtered_by_list: "NOT_ON_ALLOWLIST"` |
| On a filter list | `CATEGORY:<category>` (`CATEGORY:null` without a category) | `''` | `''` | `filtered: true`, `filtered_by_list`, `allowed_by_list` if any |
| Otherwise | unchanged | unchanged | registered domain | `filtered: false`, `allowed_by_list` if any |

With no `allow_lists`, every address is allowed. The registered domain of an IP address or `localhost` is `''`. A field is never removed from a record: a hidden `title` or `domain` is written as `''`.

`previous_url` and `opener_url` follow the same rules as `url`; `previous_url_filtered` and `opener_filtered` say whether they were hidden. Within one list, `rex-lists` matches the most specific pattern type first.

## Configuration

This module reads the `content_processing_url_redaction` section of the configuration. `configurationDetails()` describes each field.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `enabled` | boolean | Yes | none | When `true`, addresses are hidden by the lists below. When anything else, records pass through unchanged. Until the configuration arrives, every address becomes `CATEGORY:NO_CONFIGURATION`. |
| `allow_lists` | string[] | No | `[]` | Names of `rex-lists` lists whose addresses are kept. Every other address becomes `CATEGORY:NOT_ON_ALLOWLIST`. With no lists, every address is allowed. |
| `filter_lists` | string[] | No | `[]` | Names of `rex-lists` lists whose matching addresses become `CATEGORY:<category>`. |
| `domain_only_lists` | string[] | No | `[]` | Matching addresses lose their address and title and keep their registered domain. |

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

It needs `@bric/rex-content-processing` and a collector that runs content processors, such as `rex-data-collection`.

## Testing

```
npm install
npm test
npm run lint
```

`pretest` bundles the test extension in `tests/extension/`, which loads `rex-page-events`, this module and a capture module that runs the content processors on each record in order, as a collector does. The specs:

- `addresses.spec.ts`: the list rules for `url` and `title`, `previous_url` and `opener_url`; that `enabled: false` passes records through; that addresses are hidden before configuration arrives.
- `browsing-addresses.spec.ts`: the list rules for `rex-browsing-visit`, `rex-browsing-opener` and `rex-browsing-page` records, that the visit keeps its times and ids, and that other records pass through.

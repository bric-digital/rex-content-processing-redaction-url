// @ts-nocheck

import rexCorePlugin, {
  dispatchEvent,
  registerREXModule,
  REXServiceWorkerModule,
} from '@bric/rex-core/service-worker'
import { REXContentProcessorManager } from '@bric/rex-content-processing/library'
import { createListEntry, hasListEntries } from '@bric/rex-lists'
import rexListsPlugin, { listsLoaded } from '@bric/rex-lists/service-worker'
import rexPageEventsPlugin from '@bric/rex-page-events/service-worker'
import rexPDKPlugin from '@bric/rex-passive-data-kit/service-worker'
import rexContentProcessingRedactionUrlPlugin from '@bric/rex-content-processing-redaction-url/service-worker'
import { resolveAddress } from '../../src/address-rules.mts'

self['__capturedEvents'] = []

let processing = Promise.resolve()

class EventCaptureModule extends REXServiceWorkerModule {
  moduleName() {
    return 'EventCapture'
  }
  setup() { /* no-op */ }
  handleMessage() { return false }
  logEvent(event) {
    const received = structuredClone(event)

    processing = processing
      .then(() => REXContentProcessorManager.getInstance().processContent(received))
      .then((processed) => {
        self['__capturedEvents'].push(processed)
      })
  }
}

registerREXModule(new EventCaptureModule())

self['rexCorePlugin'] = rexCorePlugin
self['rexPageEventsPlugin'] = rexPageEventsPlugin
self['rexContentProcessingRedactionUrlPlugin'] = rexContentProcessingRedactionUrlPlugin
self['rexPDKPlugin'] = rexPDKPlugin
self['createListEntry'] = createListEntry
self['hasListEntries'] = hasListEntries
self['listsLoaded'] = listsLoaded
self['rexListsPlugin'] = rexListsPlugin
self['resolveAddress'] = resolveAddress
self['REXContentProcessorManager'] = REXContentProcessorManager
self['dispatchEvent'] = dispatchEvent

rexCorePlugin.setup()

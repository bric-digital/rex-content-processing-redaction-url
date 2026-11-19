// @ts-nocheck

import rexCorePlugin, {
  dispatchEvent,
  registerREXModule,
  REXServiceWorkerModule,
} from '@bric/rex-core/service-worker'
import { REXContentProcessorManager } from '@bric/rex-content-processing/library'
import { createListEntry } from '@bric/rex-lists'
import rexPageEventsPlugin from '@bric/rex-page-events/service-worker'
import rexContentProcessingUrlRedactionPlugin from '@bric/rex-content-processing-url-redaction/service-worker'

self['__capturedEvents'] = []

let processing = Promise.resolve()

class EventCaptureModule extends REXServiceWorkerModule {
  moduleName() {
    return 'EventCapture'
  }
  setup() { /* no-op */ }
  handleMessage() { return false }
  logEvent(event) {
    processing = processing
      .then(() => REXContentProcessorManager.getInstance().processContent(event))
      .then((processed) => {
        self['__capturedEvents'].push(processed)
      })
  }
}

registerREXModule(new EventCaptureModule())

self['rexCorePlugin'] = rexCorePlugin
self['rexPageEventsPlugin'] = rexPageEventsPlugin
self['rexContentProcessingUrlRedactionPlugin'] = rexContentProcessingUrlRedactionPlugin
self['createListEntry'] = createListEntry
self['REXContentProcessorManager'] = REXContentProcessorManager
self['dispatchEvent'] = dispatchEvent

rexCorePlugin.setup()

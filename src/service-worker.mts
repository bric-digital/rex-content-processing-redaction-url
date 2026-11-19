import { type REXConfiguration } from '@bric/rex-core/common'
import rexCorePlugin, { REXServiceWorkerModule, registerREXModule } from '@bric/rex-core/service-worker'

import { CONFIGURATION_DETAILS, CONFIGURATION_KEY } from './configuration.mjs'
import { REXContentProcessingUrlRedactionProcessor } from './processor.mjs'
import { type REXContentProcessingUrlRedactionConfiguration } from './types.mjs'

const CONFIGURATION_TIMEOUT_MS = 10000

class REXContentProcessingUrlRedactionModule extends REXServiceWorkerModule {
  config: REXContentProcessingUrlRedactionConfiguration | null = null
  processor: REXContentProcessingUrlRedactionProcessor = new REXContentProcessingUrlRedactionProcessor()

  moduleName() {
    return 'ContentProcessingUrlRedactionModule'
  }

  setup() {
    this.processor.enable()
    this.refreshConfiguration()
  }

  configurationDetails() {
    return CONFIGURATION_DETAILS
  }

  refreshConfiguration() {
    rexCorePlugin.handleMessage({
      messageType: 'waitForConfiguration',
      event: { timeout: CONFIGURATION_TIMEOUT_MS }
    }, null, (configuration: REXConfiguration) => {
      this.applyConfiguration(configuration)
    })
  }

  private applyConfiguration(configuration: REXConfiguration | undefined) {
    const redactionConfig = configuration?.[CONFIGURATION_KEY] as REXContentProcessingUrlRedactionConfiguration | undefined

    if (redactionConfig === undefined) {
      return
    }

    this.config = redactionConfig

    if (redactionConfig.enabled === true) {
      this.processor.config = redactionConfig
      this.processor.enable()
    } else {
      this.processor.disable()
    }
  }
}

const plugin = new REXContentProcessingUrlRedactionModule()

registerREXModule(plugin)

export default plugin

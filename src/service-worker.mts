import { type REXConfiguration } from '@bric/rex-core/common'
import rexCorePlugin, { REXServiceWorkerModule, registerREXModule } from '@bric/rex-core/service-worker'

import { CONFIGURATION_DETAILS, CONFIGURATION_KEY, normalizeConfiguration } from './configuration.mjs'
import { REXContentProcessingUrlRedactionProcessor } from './processor.mjs'
import { type REXContentProcessingUrlRedactionConfiguration } from './types.mjs'

const LOG_PREFIX = '[rex-content-processing-url-redaction]'
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

  refreshConfiguration(): Promise<void> {
    return new Promise((resolve) => {
      rexCorePlugin.handleMessage({
        messageType: 'waitForConfiguration',
        event: { timeout: CONFIGURATION_TIMEOUT_MS }
      }, null, (configuration: REXConfiguration) => {
        this.applyConfiguration(configuration)
        resolve()
      })
    })
  }

  private applyConfiguration(configuration: REXConfiguration | undefined) {
    if (configuration === undefined || configuration === null) {
      return
    }

    const section = configuration[CONFIGURATION_KEY]

    if (typeof section !== 'object' || section === null || Array.isArray(section)) {
      this.hideEveryAddress()

      return
    }

    const redactionConfig = section as REXContentProcessingUrlRedactionConfiguration

    if (typeof redactionConfig.enabled !== 'boolean') {
      if (redactionConfig.enabled !== undefined) {
        console.warn(`${LOG_PREFIX} enabled is not true or false, treating the configuration as missing`)
      }

      this.hideEveryAddress()

      return
    }

    this.config = redactionConfig

    if (redactionConfig.enabled === true) {
      this.processor.useConfiguration(normalizeConfiguration(redactionConfig))
      this.processor.enable()
    } else {
      this.processor.disable()
    }
  }

  private hideEveryAddress() {
    this.config = null
    this.processor.useConfiguration(null)
    this.processor.enable()
  }
}

const plugin = new REXContentProcessingUrlRedactionModule()

registerREXModule(plugin)

export default plugin

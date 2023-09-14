/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Docker, runOption } from './backend'

export const DEFAULT_IMAGE = 'ironfish:latest'

export type IronFishCliConfig = {
  /**
  The name of the config file to use
  */
  configName?: string

  /**
  The path to the data directory
  */
  dataDir?: string
}

export type NodeConfig = {
  /**
  The basic shared config for any IronFish command
  */
  cliconfig?: IronFishCliConfig

  /**
   * Path to a JSON file containing the network definition of a
   * custom network to connect to
   */
  customNetwork?: string

  /**
   * Network ID of an official Iron Fish network to connect to
   */
  networkId?: string
}

export class Cluster {
  public readonly name: string

  private readonly backend: Docker

  constructor(options: { name: string; backend?: Docker }) {
    this.name = options.name
    this.backend = options.backend ?? new Docker()
  }

  private networkName(): string {
    return this.name
  }

  private containerName(name: string): string {
    return `${this.name}_${name}`
  }

  async init(): Promise<void> {
    return this.backend.createNetwork(this.networkName(), { attachable: true, internal: true })
  }

  async spawn(options: { name: string; image?: string; config?: NodeConfig }): Promise<void> {
    const name = this.containerName(options.name)

    const args: string[] = []
    const runOptions: runOption = {
      name,
      networks: [this.networkName()],
    }

    if (options?.config) {
      const config = options.config

      if (config.customNetwork) {
        args.push(`--customNetwork=${config.customNetwork}`)
      }

      if (config.networkId) {
        args.push(`--networkId=${config.networkId}`)
      }

      if (config.cliconfig) {
        if (config.cliconfig.configName) {
          args.push(`--config=${config.cliconfig.configName}`)
        }

        if (config.cliconfig.dataDir) {
          args.push(`--datadir=${config.cliconfig.dataDir}`)
          runOptions.volume = config.cliconfig.dataDir
        }
      }
    }

    if (args.length > 0) {
      runOptions.args = args
    }

    return this.backend.runDetached(options.image ?? DEFAULT_IMAGE, runOptions)
  }
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ConfigOptions } from '@ironfish/sdk'
import { promises } from 'fs'
import { resolve, join } from 'path'
import { Docker, Labels, RunOptions } from './backend'
import * as naming from './naming'
import { Node } from './node'

export const DEFAULT_IMAGE = 'ironfish:latest'
export const DEFAULT_BOOTSTRAP_NODE_NAME = 'bootstrap'
export const CLUSTER_LABEL = 'fishtank.cluster'
export const NODE_ROLE_LABEL = 'fishtank.node.role'
export const BOOTSTRAP_NODE_ROLE = 'bootstrap'

export type BootstrapOptions = {
  nodeName?: string
  nodeImage?: string
}
export const DEFAULT_CONTAINER_DATADIR = '/root/.ironfish'

export type NetworkDefinition = {
  id: number
}

export class Cluster {
  public readonly name: string

  private readonly backend: Docker

  constructor(options: { name: string; backend?: Docker }) {
    naming.assertValidName(options.name)
    this.name = options.name
    this.backend = options.backend ?? new Docker()
  }

  async init(options?: { bootstrap?: boolean | BootstrapOptions }): Promise<void> {
    await this.backend.createNetwork(naming.networkName(this), {
      attachable: true,
      internal: true,
      labels: { [CLUSTER_LABEL]: this.name },
    })

    if (typeof options?.bootstrap === 'undefined' || options?.bootstrap === true) {
      return this.bootstrap()
    } else if (typeof options?.bootstrap === 'object') {
      return this.bootstrap(options?.bootstrap)
    }
  }

  async bootstrap(options?: BootstrapOptions): Promise<void> {
    await this.internalSpawn({
      name: options?.nodeName ?? DEFAULT_BOOTSTRAP_NODE_NAME,
      image: options?.nodeImage,
      extraLabels: {
        [NODE_ROLE_LABEL]: BOOTSTRAP_NODE_ROLE,
      },
    })
  }

  private async getBootstrapNodes(): Promise<Node[]> {
    return (
      await this.backend.list({
        labels: {
          [CLUSTER_LABEL]: this.name,
          [NODE_ROLE_LABEL]: BOOTSTRAP_NODE_ROLE,
        },
      })
    ).map((container) => new Node(this, container.name.slice(this.name.length + 1)))
  }

  async spawn(options: {
    name: string
    image?: string
    config?: Partial<ConfigOptions>
    networkDefinition?: Partial<NetworkDefinition>
  }): Promise<Node> {
    const extraArgs = []
    for (const bootstrapNode of await this.getBootstrapNodes()) {
      extraArgs.push('--bootstrap', bootstrapNode.name)
    }
    return this.internalSpawn({ extraArgs, ...options })
  }

  private async internalSpawn(options: {
    name: string
    image?: string
    config?: Partial<ConfigOptions>
    networkDefinition?: Partial<NetworkDefinition>
    extraArgs?: string[]
    extraLabels?: Labels
  }): Promise<Node> {
    naming.assertValidName(options.name)
    const node = new Node(this, options.name)
    const containerName = naming.containerName(this, options.name)

    const runOptions: RunOptions = {
      args: ['start', ...(options.extraArgs ?? [])],
      name: containerName,
      networks: [naming.networkName(this)],
      hostname: options.name,
      labels: { [CLUSTER_LABEL]: this.name, ...options.extraLabels },
    }

    const args: string[] = []

    if (options.config) {
      const configString = JSON.stringify(options.config)

      const dest = join(tmpdir(), 'fishtank', this.name, options.name, '.ironfish')
      await promises.mkdir(dest, {
        recursive: true,
      })

      await promises.writeFile(resolve(node.dataDir, 'config.json'), configString)

      if (runOptions.volumes === undefined) {
        runOptions.volumes = new Map<string, string>([[dest, DEFAULT_CONTAINER_DATADIR]])
      } else {
        runOptions.volumes.set(dest, DEFAULT_CONTAINER_DATADIR)
      }
    }

    if (options.networkDefinition) {
      const networkDefinitionString = JSON.stringify(options.networkDefinition)

      const dest = join(tmpdir(), 'fishtank', this.name, options.name, '.ironfish')
      await promises.mkdir(dest, {
        recursive: true,
      })

      await promises.writeFile(resolve(dest, 'customNetwork.json'), networkDefinitionString)

      let containerPath = DEFAULT_CONTAINER_DATADIR
      if (runOptions.volumes === undefined) {
        runOptions.volumes = new Map<string, string>([[dest, containerPath]])
      } else if (runOptions.volumes.has(dest)) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        containerPath = runOptions.volumes.get(dest)!
      } else {
        runOptions.volumes.set(dest, containerPath)
      }
      args.push(`--customNetwork=${resolve(containerPath, 'customNetwork.json')}`)
    }

    if (args.length > 0) {
      runOptions.args = ['start'].concat(args)
    }

    await this.backend.runDetached(options.image ?? DEFAULT_IMAGE, runOptions)

    return new Node(this, containerName)
  }

  async teardown(): Promise<void> {
    // Remove containers
    const containers = (
      await this.backend.list({ labels: { [CLUSTER_LABEL]: this.name } })
    ).map((container) => container.name)
    await this.backend.remove(containers, { force: true, volumes: true })

    // Remove networks
    await this.backend.removeNetworks([naming.networkName(this)], { force: true })

    // Remove cluster folder
    const dest = join(tmpdir(), 'fishtank', this.name)
    await promises.rm(dest, { recursive: true })
  }
}

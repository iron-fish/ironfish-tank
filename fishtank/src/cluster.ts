/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ConfigOptions, InternalOptions } from '@ironfish/sdk'
import { promises } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { Docker, Labels } from './backend'
import * as naming from './naming'
import { INTERNAL_RPC_TCP_PORT, Node } from './node'

export const DEFAULT_IMAGE = 'ironfish:latest'
export const DEFAULT_BOOTSTRAP_NODE_NAME = 'bootstrap'
export const CLUSTER_LABEL = 'fishtank.cluster'
export const NODE_ROLE_LABEL = 'fishtank.node.role'
export const BOOTSTRAP_NODE_ROLE = 'bootstrap'
export const CONTAINER_DATADIR = '/root/.ironfish'

export type BootstrapOptions = {
  nodeName?: string
  nodeImage?: string
}

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
    internal?: Partial<InternalOptions>
    networkDefinition?: Partial<NetworkDefinition>
  }): Promise<Node> {
    const config = options.config || {}
    if (typeof config.bootstrapNodes === 'undefined') {
      config.bootstrapNodes = (await this.getBootstrapNodes()).map((node) => node.name)
    }
    return this.internalSpawn({ ...options, config })
  }

  private async internalSpawn(options: {
    name: string
    image?: string
    config?: Partial<ConfigOptions>
    internal?: Partial<InternalOptions>
    networkDefinition?: Partial<NetworkDefinition>
    extraArgs?: string[]
    extraLabels?: Labels
  }): Promise<Node> {
    naming.assertValidName(options.name)
    const node = new Node(this, options.name)
    const containerName = naming.containerName(this, options.name)

    const runOptions = {
      args: ['start', ...(options.extraArgs ?? [])],
      name: containerName,
      networks: [naming.networkName(this)],
      hostname: options.name,
      ports: { tcp: [INTERNAL_RPC_TCP_PORT] },
      labels: { [CLUSTER_LABEL]: this.name, ...options.extraLabels },
      volumes: new Map<string, string>(),
    }

    await promises.mkdir(node.dataDir, { recursive: true })
    runOptions.volumes.set(node.dataDir, CONTAINER_DATADIR)

    const config = options.config || {}
    config.networkId ??= 2
    config.enableRpcTcp ??= true
    config.enableRpcTls ??= false
    config.rpcTcpHost ??= ''

    await promises.writeFile(resolve(node.dataDir, 'config.json'), JSON.stringify(config))

    if (options.internal) {
      await promises.writeFile(
        resolve(node.dataDir, 'internal.json'),
        JSON.stringify(options.internal),
      )
    }

    if (options.networkDefinition) {
      await promises.writeFile(
        resolve(node.dataDir, 'customNetwork.json'),
        JSON.stringify(options.networkDefinition),
      )
      runOptions.args.push('--customNetwork', resolve(CONTAINER_DATADIR, 'customNetwork.json'))
    }

    await this.backend.runDetached(options.image ?? DEFAULT_IMAGE, runOptions)

    return node
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
    await promises.rm(dest, { force: true, recursive: true })
  }
}

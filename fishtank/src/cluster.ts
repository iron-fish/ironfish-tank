/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ConfigOptions, InternalOptions, NetworkDefinition } from '@ironfish/sdk'
import { promises } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { Docker, Labels } from './backend'
import * as naming from './naming'
import { DEFAULT_WAIT_TIMEOUT, INTERNAL_RPC_TCP_PORT, Node } from './node'

export const DEFAULT_IMAGE = 'ironfish:latest'
export const DEFAULT_BOOTSTRAP_NODE_NAME = 'bootstrap'
export const CLUSTER_LABEL = 'fishtank.cluster'
export const NODE_ROLE_LABEL = 'fishtank.node.role'
export const BOOTSTRAP_NODE_ROLE = 'bootstrap'
export const CONTAINER_DATADIR = '/root/.ironfish'

export type BootstrapOptions = {
  nodeName?: string
  nodeImage?: string
  waitForStart?: boolean
  initChain?: boolean
  networkDefinition?: Partial<NetworkDefinition>
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

    if (typeof options?.bootstrap === 'object') {
      return this.bootstrap(options?.bootstrap)
    } else if (options?.bootstrap ?? true) {
      return this.bootstrap()
    }
  }

  async bootstrap(options?: BootstrapOptions): Promise<void> {
    const node = await this.internalSpawn({
      name: options?.nodeName ?? DEFAULT_BOOTSTRAP_NODE_NAME,
      image: options?.nodeImage,
      config: { miningForce: true },
      extraLabels: {
        [NODE_ROLE_LABEL]: BOOTSTRAP_NODE_ROLE,
      },
      waitForStart: options?.waitForStart,
      networkDefinition: options?.networkDefinition,
    })

    if (options?.initChain ?? true) {
      await node.mineUntil({ blockSequence: 2 })
    }
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
    waitForStart?: boolean
  }): Promise<Node> {
    const config = options.config || {}
    config.bootstrapNodes ??= (await this.getBootstrapNodes()).map((node) => node.name)
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
    waitForStart?: boolean
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
    config.poolDifficulty ??= '1500000'

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

    if (options.waitForStart ?? true) {
      await node.waitForStart()
    }

    return node
  }

  async getNodes(): Promise<Node[]> {
    return (
      await this.backend.list({
        labels: {
          [CLUSTER_LABEL]: this.name,
        },
      })
    ).map((container) => new Node(this, container.name.slice(this.name.length + 1)))
  }

  async getNode(name: string): Promise<Node | undefined> {
    const nodes = await this.getNodes()
    return nodes.find((n) => n.name === name)
  }

  async waitForConvergence(options?: {
    timeout?: number
    nodes?: readonly Node[]
  }): Promise<void> {
    const nodes = options?.nodes ?? (await this.getNodes())
    const timeout = options?.timeout ?? DEFAULT_WAIT_TIMEOUT

    const start = performance.now()
    await Node.waitForSync(nodes, { timeout })
    const leftover = timeout - (performance.now() - start)
    await Promise.all(nodes.map((node) => node.waitForScan({ timeout: leftover })))
  }

  async teardown(): Promise<void> {
    // Remove containers
    const containers = (
      await this.backend.list({ labels: { [CLUSTER_LABEL]: this.name } })
    ).map((container) => container.name)
    await this.backend.remove(containers, { force: true, volumes: true })

    // Remove networks
    await this.backend.removeNetworks([naming.networkName(this)], { force: true })

    // Remove the contents of the cluster folder. Do it through a container
    // because the current user may not have the right permissions to remove
    // files created by other containers (because containers run with UID 0 in
    // their UID namespace, and so they create files and directories owned by
    // root, but this process may or may not be running as root).
    const workdir = join(tmpdir(), 'fishtank')
    await promises.mkdir(workdir, { recursive: true })
    await this.backend.run('alpine:latest', {
      entrypoint: '/bin/rm',
      args: ['-rf', `/cluster/${this.name}`],
      name: naming.containerName(this, 'cleanup'),
      labels: { [CLUSTER_LABEL]: this.name },
      volumes: new Map<string, string>([[workdir, '/cluster']]),
    })
  }
}

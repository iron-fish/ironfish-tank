/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ConfigOptions, IJSON, InternalOptions, NetworkDefinition } from '@ironfish/sdk'
import { randomBytes } from 'crypto'
import { promises } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { Docker, Labels } from './backend'
import { getConfig } from './config'
import * as naming from './naming'
import { INTERNAL_RPC_TCP_PORT, Node } from './node'
import { DEFAULT_WAIT_TIMEOUT, TimeoutError } from './waitLoop'

export const DEFAULT_BOOTSTRAP_NODE_NAME = 'bootstrap'
export const CLUSTER_LABEL = 'fishtank.cluster'
export const NODE_ROLE_LABEL = 'fishtank.node.role'
export const BOOTSTRAP_NODE_ROLE = 'bootstrap'
export const CONTAINER_DATADIR = '/root/.ironfish'

const randomNodeName = (prefix: string): string => {
  return `${prefix}-${randomBytes(4).toString('hex')}`
}

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

  async getNodeVersion(options?: { image?: string }): Promise<string> {
    const image = options?.image ?? getConfig().defaultImage
    const { stdout } = await this.backend.run(image, {
      args: ['version'],
      name: naming.containerName(this, 'version'),
      labels: { [CLUSTER_LABEL]: this.name },
    })
    return stdout
  }

  async spawn(
    options: {
      image?: string
      config?: Partial<ConfigOptions>
      internal?: Partial<InternalOptions>
      networkDefinition?: Partial<NetworkDefinition>
      waitForStart?: boolean
    } & ({ name: string } | { namePrefix: string }),
  ): Promise<Node> {
    const config = options.config || {}
    config.bootstrapNodes ??= (await this.getBootstrapNodes()).map((node) => node.name)
    const name = 'name' in options ? options.name : randomNodeName(options.namePrefix)
    return this.internalSpawn({ ...options, name, config })
  }

  private async internalSpawn(options: {
    name: string
    image?: string
    config?: Partial<ConfigOptions>
    internal?: Partial<InternalOptions>
    networkId?: number
    networkDefinition?: Partial<NetworkDefinition>
    extraArgs?: string[]
    extraLabels?: Labels
    waitForStart?: boolean
  }): Promise<Node> {
    naming.assertValidName(options.name)
    const node = new Node(this, options.name)
    const containerName = naming.containerName(this, options.name)

    const runOptions = {
      args: ['start'],
      name: containerName,
      networks: [naming.networkName(this)],
      hostname: options.name,
      ports: { tcp: [INTERNAL_RPC_TCP_PORT] },
      labels: { [CLUSTER_LABEL]: this.name, ...options.extraLabels },
      volumes: new Map<string, string>(),
    }

    await promises.mkdir(node.dataDir, { recursive: true })
    runOptions.volumes.set(node.dataDir, CONTAINER_DATADIR)

    const config = structuredClone(options.config) || {}
    config.enableRpcTcp ??= true
    config.enableRpcIpc ??= false
    config.enableRpcTls ??= false
    config.rpcTcpHost ??= ''
    config.preemptiveBlockMining ??= false

    await promises.writeFile(resolve(node.dataDir, 'config.json'), IJSON.stringify(config))

    if (options.internal) {
      await promises.writeFile(
        resolve(node.dataDir, 'internal.json'),
        IJSON.stringify(options.internal),
      )
    }

    if (options.networkDefinition) {
      await promises.writeFile(
        resolve(node.dataDir, 'customNetwork.json'),
        IJSON.stringify(options.networkDefinition),
      )
      runOptions.args.push('--customNetwork', resolve(CONTAINER_DATADIR, 'customNetwork.json'))
    } else {
      runOptions.args.push('--networkId', (options.networkId ?? 2).toString())
    }

    runOptions.args.push(...getConfig().extraStartArgs, ...(options.extraArgs ?? []))

    await this.backend.runDetached(options.image ?? getConfig().defaultImage, runOptions)

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
    mineOnFailure?: boolean
  }): Promise<void> {
    const nodes = options?.nodes ?? (await this.getNodes())
    const timeout = options?.timeout ?? DEFAULT_WAIT_TIMEOUT

    const start = performance.now()
    try {
      await Node.waitForSync(nodes, { timeout })
    } catch (err) {
      const mineOnFailure = options?.mineOnFailure ?? true
      if (mineOnFailure && err instanceof TimeoutError) {
        // Workaround for a defect in the Iron Fish node implementation that
        // makes the node drop new incoming blocks if it's currently syncing.
        // When that happens, the node may be out-of-sync without realizing it,
        // and without making any attempt to fetch the blocks it's missing. In
        // that situation, waitForSync will timeout.
        //
        // If we detect this situation, we add at least one more block to the
        // chain. While this happens, no nodes should be syncing (that's an
        // assumption) and so they should all receive the newest block, and
        // properly handle it. Nodes that were missing some blocks will realize
        // that and fetch all the missing blocks.
        //
        // In an ideal world, this workaround shouldn't be needed; this code
        // should be removed once the syncing logic is improved in the node.
        //
        // Note that this workaround does not properly respect the timeout set
        // on `options.timeout`, but doubles it.
        await nodes[0].mineUntil({ additionalBlocks: 1 })
        await this.waitForConvergence({ ...options, mineOnFailure: false })
      }
    }
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

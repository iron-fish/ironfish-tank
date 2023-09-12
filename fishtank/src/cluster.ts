/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Docker, Labels } from './backend'
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

  async init(options?: { bootstrap?: boolean | BootstrapOptions }): Promise<void> {
    await this.backend.createNetwork(this.networkName(), {
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

  async spawn(options: { name: string; image?: string }): Promise<Node> {
    const extraArgs = []
    for (const bootstrapNode of await this.getBootstrapNodes()) {
      extraArgs.push('--bootstrap', bootstrapNode.name)
    }
    return this.internalSpawn({ extraArgs, ...options })
  }

  private async internalSpawn(options: {
    name: string
    image?: string
    extraArgs?: string[]
    extraLabels?: Labels
  }): Promise<Node> {
    const containerName = this.containerName(options.name)
    const args = ['start', ...(options.extraArgs ?? [])]
    await this.backend.runDetached(options.image ?? DEFAULT_IMAGE, {
      args,
      name: containerName,
      networks: [this.networkName()],
      hostname: options.name,
      labels: {
        [CLUSTER_LABEL]: this.name,
        ...options.extraLabels,
      },
    })
    return new Node(this, options.name)
  }

  async teardown(): Promise<void> {
    // Remove containers
    const containers = (
      await this.backend.list({ labels: { [CLUSTER_LABEL]: this.name } })
    ).map((container) => container.name)
    await this.backend.remove(containers, { force: true, volumes: true })

    // Remove networks
    await this.backend.removeNetworks([this.networkName()], { force: true })
  }
}

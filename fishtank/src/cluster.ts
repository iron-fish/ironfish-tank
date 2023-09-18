/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ConfigOptions } from '@ironfish/sdk'
import { promises } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { Docker, RunOptions } from './backend'
import { Node } from './node'

export const DEFAULT_IMAGE = 'ironfish:latest'
export const CLUSTER_LABEL = 'fishtank.cluster'

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
    return this.backend.createNetwork(this.networkName(), {
      attachable: true,
      internal: true,
      labels: { [CLUSTER_LABEL]: this.name },
    })
  }

  async spawn(options: {
    name: string
    image?: string
    config?: Partial<ConfigOptions>
  }): Promise<Node> {
    const containerName = this.containerName(options.name)

    const runOptions: RunOptions = {
      name: containerName,
      networks: [this.networkName()],
      hostname: options.name,
      labels: { [CLUSTER_LABEL]: this.name },
    }

    if (options.config) {
      const args: string[] = []

      const configString = JSON.stringify(options.config)

      const dest = join(tmpdir(), 'fishtank', containerName, '.ironfish')
      await promises.mkdir(dest, {
        recursive: true,
      })

      await promises.writeFile(resolve(dest, 'config.json'), configString)

      args.push('--datadir=/fishtank/.ironfish')
      runOptions.volumes = new Map<string, string>([[dest, '/fishtank/.ironfish']])
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
    await this.backend.removeNetworks([this.networkName()], { force: true })
  }
}

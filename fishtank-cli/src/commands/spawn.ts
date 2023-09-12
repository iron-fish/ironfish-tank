/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Command, Config } from '@oclif/core'
import { Flags } from '@oclif/core'
import { Cluster, DEFAULT_IMAGE } from 'fishtank'

export abstract class Spawn extends Command {
  static description = 'Spin up a new node inside a cluster'

  static args = [
    {
      name: 'name',
      required: true,
      description: 'A unique name to identify the node inside the cluster',
    },
  ]

  static flags = {
    cluster: Flags.string({
      char: 'c',
      required: true,
      description: 'The name of the cluster where to add the node to',
    }),
    image: Flags.string({
      char: 'i',
      required: false,
      default: DEFAULT_IMAGE,
      description: 'The name of the Docker image to use to spawn the container',
    }),
  }

  constructor(argv: string[], config: Config) {
    super(argv, config)
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Spawn)
    const nodeName = args.name as string
    const cluster = new Cluster({ name: flags.cluster })
    await cluster.spawn({ name: nodeName, image: flags.image })
  }
}

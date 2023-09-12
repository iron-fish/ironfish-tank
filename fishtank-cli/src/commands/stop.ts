/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Command, Config } from '@oclif/core'
import { Cluster } from 'fishtank'

export abstract class Stop extends Command {
  static description = 'Removes all resources associated to a cluster'

  static args = [
    {
      name: 'name',
      required: true,
      description: 'The name of the cluster to stop',
    },
  ]

  constructor(argv: string[], config: Config) {
    super(argv, config)
  }

  async run(): Promise<void> {
    const { args } = await this.parse(Stop)
    const clusterName = args.name as string
    const cluster = new Cluster({ name: clusterName })
    return cluster.teardown()
  }
}

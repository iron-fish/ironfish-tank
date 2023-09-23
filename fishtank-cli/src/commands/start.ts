/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Command, Config, Flags } from '@oclif/core'
import { Cluster } from 'fishtank'

export abstract class Start extends Command {
  static description = 'Spin up a new cluster'

  static args = [
    {
      name: 'name',
      required: true,
      description: 'The name of the cluster to create',
    },
  ]

  static flags = {
    noBootstrap: Flags.boolean({
      char: 'B',
      description:
        'Do not start any bootstrap node and do not mine any block during the creation of the cluster',
    }),
  }

  constructor(argv: string[], config: Config) {
    super(argv, config)
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Start)
    const clusterName = args.name as string
    const cluster = new Cluster({ name: clusterName })
    await cluster.init({ bootstrap: !flags.noBootstrap })
    this.exit(0)
  }
}

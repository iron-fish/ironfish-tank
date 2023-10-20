/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CurrencyUtils } from '@ironfish/sdk'
import { Command, Config, Flags } from '@oclif/core'
import { Cluster } from 'fishtank'

export abstract class MineUntil extends Command {
  static description = 'Mine on the node until a condition is met'

  static flags = {
    nodeName: Flags.string({
      char: 'n',
      description: 'Bootstrap node name',
      parse: (input: string) => Promise.resolve(input.trim()),
      required: true,
    }),
    sequence: Flags.integer({
      char: 's',
      description: 'Mine until the head of the main chain is at least this value',
    }),
    transaction: Flags.string({
      char: 't',
      description: 'Mine until this transaction is mined on a block',
    }),
    balance: Flags.string({
      char: 'b',
      description: 'Mine until the account balance is at least this value',
    }),
  }

  static args = [
    {
      name: 'name',
      required: true,
      description: 'The name of the cluster to create',
    },
  ]

  constructor(argv: string[], config: Config) {
    super(argv, config)
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(MineUntil)

    let until:
      | { blockSequence: number }
      | { transactionMined: string }
      | { accountBalance: bigint }
    if (flags.sequence !== undefined) {
      until = { blockSequence: flags.sequence }
    } else if (flags.transaction !== undefined) {
      until = { transactionMined: flags.transaction }
    } else if (flags.balance !== undefined) {
      until = { accountBalance: CurrencyUtils.decode(flags.balance) }
    } else {
      this.error(
        'Missing condition on when to mine until. Please provide --sequence, --transaction, or --balance.',
      )
    }

    const clusterName = args.name as string
    const cluster = new Cluster({ name: clusterName })
    await cluster.init()

    const node = await cluster.spawn({ name: flags.nodeName })
    await node.mineUntil(until)

    this.exit(0)
  }
}

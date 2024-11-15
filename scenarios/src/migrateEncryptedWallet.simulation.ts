/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Cluster } from 'fishtank'
import { withTestCluster } from '.'

describe('migrations on encrypted wallets', () => {
  it('should run successfully', async () => {
    return withTestCluster(async (cluster: Cluster) => {
      await cluster.init()

      // start node on latest version before encrypted wallet migrations
      let node1 = await cluster.spawn({
        name: 'node-1',
        image: 'ghcr.io/iron-fish/ironfish:v2.6.0',
      })

      let node1Rpc = await node1.connectRpc()

      // mine blocks to establish nonzero balance
      await node1.mineUntil({ accountBalance: 1n })

      const node1BalanceBefore = (
        await node1Rpc.wallet.getAccountBalance({ account: 'default' })
      ).content.unconfirmed

      // verify that wallet is NOT locked
      const unlockedStatus = await node1Rpc.wallet.getAccountsStatus()
      expect(unlockedStatus.content.locked).toBe(false)

      // encrypt wallet
      const passphrase = 'encrypted-wallet'
      await node1Rpc.wallet.encrypt({ passphrase })

      // verify that wallet is locked
      const lockedStatus = await node1Rpc.wallet.getAccountsStatus()
      expect(lockedStatus.content.locked).toBe(true)

      // stop node
      await node1.remove()

      // TODO: replace branch image with default image after release of first
      // encrypted wallet migration
      const migrationImage =
        '546281846244.dkr.ecr.us-east-1.amazonaws.com/ironfish:migrate-encrypted-wallet'

      // run migrations on latest image and include the wallet passphrase
      const migrations = await node1.runCommand({
        baseName: 'migrations',
        image: migrationImage,
        args: ['migrations:start', '--passphrase', passphrase],
      })
      expect(migrations.stdout).not.toContain('Cannot run migration on encrypted wallet')
      expect(migrations.stdout).toContain('Successfully applied')

      // start node on latest image to verify that node starts successfully
      node1 = await cluster.spawn({
        name: 'node-1',
        image: migrationImage,
      })

      node1Rpc = await node1.connectRpc()

      // unlock wallet
      await node1Rpc.wallet.unlock({ passphrase })

      // verify that balance is unchanged after migrations
      const node1BalanceAfter = (
        await node1Rpc.wallet.getAccountBalance({ account: 'default' })
      ).content.unconfirmed

      expect(node1BalanceAfter).toEqual(node1BalanceBefore)
    })
  })
})

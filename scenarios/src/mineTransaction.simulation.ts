/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { CurrencyUtils } from '@ironfish/sdk'
import { Cluster } from 'fishtank'
import { waitForScanning, waitForSync, withTestCluster } from '.'

describe('transactions', () => {
  it('can be mined', async () => {
    return withTestCluster(async (cluster: Cluster) => {
      await cluster.init()

      const node1 = await cluster.spawn({ name: 'node-1' })
      const node2 = await cluster.spawn({ name: 'node-2' })

      const node1Rpc = await node1.connectRpc()
      const node2Rpc = await node2.connectRpc()

      await node1.mineUntil({ accountBalance: 200_000_000n })

      const node2Address = (await node2Rpc.wallet.getAccountPublicKey({ account: 'default' }))
        .content.publicKey

      const createTxResponse = await node1Rpc.wallet.createTransaction({
        account: 'default',
        outputs: [
          {
            publicAddress: node2Address,
            amount: CurrencyUtils.encode(100_000_000n),
            memo: 'some memo',
            assetId: Asset.nativeId().toString('hex'),
          },
        ],
        fee: CurrencyUtils.encode(500n),
        expiration: 100,
      })

      const postTxResponse = await node1Rpc.wallet.postTransaction({
        transaction: createTxResponse.content.transaction,
        account: 'default',
      })

      expect(postTxResponse.content.accepted).toBe(true)
      expect(postTxResponse.content.broadcasted).toBe(true)

      await node1.mineUntil({ transactionMined: postTxResponse.content.hash })
      await waitForSync(node1Rpc, node2Rpc)
      await waitForScanning(node2Rpc)

      const node2BalanceAfterTx = await node2Rpc.wallet.getAccountBalance()
      expect(BigInt(node2BalanceAfterTx.content.unconfirmed)).toBe(100_000_000n)
    })
  })
})

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createRootLogger } from '@ironfish/sdk'
import { Cluster } from 'fishtank'

export async function simulate(): Promise<void> {
  const logger = createRootLogger()
  const cluster = new Cluster({ name: 'cluster-send' })

  try {
    await cluster.init()
    const sender = await cluster.spawn({
      name: 'node-sender',
      config: { networkId: 2, enableRpcIpc: true, enableRpcTcp: true },
    })
    const receiver = await cluster.spawn({
      name: 'node-receiver',
      config: { networkId: 2, enableRpcIpc: true, enableRpcTcp: true },
    })

    const senderRpc = await sender.connectRpc()
    const receiverRpc = await receiver.connectRpc()
    const receiverAccount = (await receiverRpc.wallet.getDefaultAccount()).content.account?.name
    const receiverAddress = (
      await receiverRpc.wallet.getAccountPublicKey({ account: receiverAccount })
    ).content.publicKey

    const response = (
      await senderRpc.wallet.sendTransaction({
        outputs: [
          {
            publicAddress: receiverAddress,
            amount: '0.00000001',
            memo: 'send tx simulation',
          },
        ],
        account: '',
      })
    ).content

    logger.log(`Send transaction ${response.transaction} with hash ${response.hash}`)
    await cluster.teardown()
  } catch (e) {
    await cluster.teardown()
    throw e
  }
}

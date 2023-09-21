/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Cluster } from 'fishtank'

export async function simulate(): Promise<void> {
  const cluster = new Cluster({ name: 'cluster-a' })
  await cluster.init()
  const sender = await cluster.spawn({ name: 'node-sender', config: { networkId: 2 } })
  const receiver = await cluster.spawn({ name: 'node-receiver', config: { networkId: 2 } })

  const senderRpc = await sender.connectRpc()
  const receiverRpc = await receiver.connectRpc()
  const receiverRpc = await rpc.node.
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { CurrencyUtils, RpcBlockHeader } from '@ironfish/sdk'
import { Cluster, Node } from 'fishtank'
import { getNetworkDefinition, withTestCluster } from '.'

const randomElem = <T>(array: readonly T[]): T => {
  return array[Math.floor(Math.random() * array.length)]
}

const randomAmount = (min = 1n, max = 1000n): bigint => {
  expect(min).toBeLessThan(max)
  const range = Number(max - min)
  return BigInt(Math.floor(Math.random() * range)) + min
}

const sendRandomTransaction = async (nodes: readonly Node[]): Promise<void> => {
  const fromRpc = await randomElem(nodes).connectRpc()
  const toRpc = await randomElem(nodes).connectRpc()
  const toAddress = (await toRpc.wallet.getAccountPublicKey({ account: 'default' })).content
    .publicKey
  const amount = randomAmount()
  const fee = randomAmount()

  const createTxResponse = await fromRpc.wallet.createTransaction({
    account: 'default',
    outputs: [
      {
        publicAddress: toAddress,
        amount: CurrencyUtils.encode(amount),
        memo: 'memo',
        assetId: Asset.nativeId().toString('hex'),
      },
    ],
    fee: CurrencyUtils.encode(fee),
  })

  await fromRpc.wallet.postTransaction({
    transaction: createTxResponse.content.transaction,
    account: 'default',
  })
}

const getChainHead = async (node: Node): Promise<{ hash: string; sequence: number }> => {
  const rpc = await node.connectRpc()
  const status = await rpc.node.getStatus()
  return status.content.blockchain.head
}

const getChainHeight = async (node: Node): Promise<number> => {
  return (await getChainHead(node)).sequence
}

const getMainChain = async (node: Node): Promise<RpcBlockHeader[]> => {
  const rpc = await node.connectRpc()
  const chain = rpc.chain.exportChainStream({}).contentStream()
  const blocks = []

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await chain.next()
    if (done) {
      break
    }
    if (value?.block) {
      const block = value.block
      if (block.main) {
        blocks.push(block)
      }
    }
  }

  return blocks
}

/**
 * Checks that the chains of `node1` and `node2` have forked at
 * `chainForkHeight`. All blocks before `chainForkHeight` should be the same
 * for both chains, all the subsequent blocks should differ.
 */
const expectChainFork = async (
  node1: Node,
  node2: Node,
  chainForkHeight: number,
): Promise<void> => {
  const chain1 = await getMainChain(node1)
  const chain2 = await getMainChain(node2)

  for (let sequence = 1; sequence < chainForkHeight; sequence++) {
    const block1 = chain1[sequence - 1]
    const block2 = chain2[sequence - 1]
    expect(block1.sequence).toBe(sequence)
    expect(block2.sequence).toBe(sequence)
    expect(block1).toStrictEqual(block2)
  }

  for (let sequence = chainForkHeight; ; sequence++) {
    const block1 = chain1[sequence - 1]
    const block2 = chain2[sequence - 1]
    if (!block1 || !block2) {
      expect(sequence).toBeGreaterThan(chainForkHeight)
      break
    }
    expect(block1.sequence).toBe(sequence)
    expect(block2.sequence).toBe(sequence)
    expect(block1).not.toStrictEqual(block2)
  }
}

describe('hard fork 1', () => {
  it('happens with v2 transactions', async () => {
    return withTestCluster(async (cluster: Cluster) => {
      const hardForkHeight = 30
      const networkDefinition = getNetworkDefinition({ enableAssetOwnership: hardForkHeight })

      await cluster.init({ bootstrap: { networkDefinition } })

      // Spin up a few nodes that will use v1 transactions up until
      // `hardForkHeight`, and v2 transactions afterwards
      const numNodes = 3
      const nodes = await Promise.all(
        [...Array(numNodes).keys()].map((i) =>
          cluster.spawn({ name: `node-${i}`, networkDefinition }),
        ),
      )

      // Spin up a few nodes that will use v1 transactions forever
      const rogueNetworkDefinition = getNetworkDefinition({ enableAssetOwnership: 'never' })
      const rogueNodes = await Promise.all(
        [...Array(numNodes).keys()].map((i) =>
          cluster.spawn({ name: `rogue-node-${i}`, networkDefinition: rogueNetworkDefinition }),
        ),
      )

      // Mine some $IRON so that the nodes can send transactions
      const allNodes = [...nodes, ...rogueNodes]
      for (const node of allNodes) {
        await node.mineUntil({ accountBalance: 1_000_000n })
      }
      await cluster.waitForConvergence()
      // Make sure the hard fork hasn't happened yet due to mining
      expect(await getChainHeight(nodes[0])).toBeLessThan(hardForkHeight)

      // Send some transactions to/from random nodes
      const numTransactions = 10
      await Promise.all(
        [...Array(numTransactions).keys()].map(() => sendRandomTransaction(allNodes)),
      )

      // Mine and make the hard fork happen
      await Promise.all(
        allNodes.map((node) => node.mineUntil({ blockSequence: hardForkHeight + 5 })),
      )
      await cluster.waitForConvergence({ nodes })
      await cluster.waitForConvergence({ nodes: rogueNodes })
      expect(await getChainHeight(nodes[0])).toBeGreaterThan(hardForkHeight)

      // Check that the chain split at `hardForkHeight`
      await expectChainFork(nodes[0], rogueNodes[0], hardForkHeight)
    })
  })
})

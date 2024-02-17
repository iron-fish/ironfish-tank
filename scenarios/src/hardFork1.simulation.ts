/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import {
  CurrencyUtils,
  MintAssetRequest,
  MintAssetResponse,
  RpcBlockHeader,
  Transaction,
} from '@ironfish/sdk'
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

const mintCustomAsset = async (
  node: Node,
  options?: Partial<MintAssetRequest>,
): Promise<MintAssetResponse> => {
  const rpc = await node.connectRpc()
  const amount = randomAmount()
  const fee = randomAmount()

  const mintResponse = await rpc.wallet.mintAsset({
    account: 'default',
    name: 'Some Random Asset',
    value: CurrencyUtils.encode(amount),
    fee: CurrencyUtils.encode(fee),
    ...options,
  })

  return mintResponse.content
}

const transferCustomAssetOwnership = async (
  assetId: string,
  fromNode: Node,
  toNode: Node,
  options?: Partial<MintAssetRequest>,
): Promise<MintAssetResponse> => {
  const fromRpc = await fromNode.connectRpc()
  const toRpc = await toNode.connectRpc()
  const toAddress = (await toRpc.wallet.getAccountPublicKey({ account: 'default' })).content
    .publicKey
  const amount = randomAmount()
  const fee = randomAmount()

  const mintResponse = await fromRpc.wallet.mintAsset({
    account: 'default',
    assetId,
    value: CurrencyUtils.encode(amount),
    transferOwnershipTo: toAddress,
    fee: CurrencyUtils.encode(fee),
    ...options,
  })

  return mintResponse.content
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
        expect(block.sequence).toBe(blocks.length)
      }
    }
  }

  return blocks
}

const getTransactionsVersions = async (
  node: Node,
  blocks: RpcBlockHeader[],
): Promise<Set<number>> => {
  const rpc = await node.connectRpc()
  const transactionVersions = new Set<number>()
  for (const block of blocks) {
    const getBlockResponse = await rpc.chain.getBlock({ hash: block.hash, serialized: true })
    for (const blockTx of getBlockResponse.content.block.transactions) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const serializedTx = blockTx.serialized!
      const tx = new Transaction(Buffer.from(serializedTx, 'hex'))
      transactionVersions.add(tx.version())
    }
  }
  return transactionVersions
}

const expectTransactionsVersion = async (
  node: Node,
  blockRange: { from: number; to: number | null },
  expectedVersion: number,
): Promise<void> => {
  const blocks = (await getMainChain(node)).slice(
    // Array indexes start from 0, but block indexes start from 1, so adjust
    // accordingly
    blockRange.from - 1,
    blockRange.to ? blockRange.to : undefined,
  )
  const versions = await getTransactionsVersions(node, blocks)
  expect([...versions]).toEqual([expectedVersion])
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
  it.skip('v2 transactions are activated after enableAssetOwnership', async () => {
    return withTestCluster(async (cluster: Cluster) => {
      const hardForkHeight = 30
      const networkDefinition = getNetworkDefinition({ enableAssetOwnership: hardForkHeight })

      await cluster.init({ bootstrap: { networkDefinition } })

      // Spin up a few nodes
      const numNodes = 4
      const nodes = await Promise.all(
        [...Array(numNodes).keys()].map((i) =>
          cluster.spawn({ name: `node-${i}`, networkDefinition }),
        ),
      )

      // Mine some $IRON so that the nodes can send transactions
      for (const node of nodes) {
        await node.mineUntil({ accountBalance: 1_000_000n })
      }
      await cluster.waitForConvergence()
      // Make sure the hard fork hasn't happened yet due to mining
      expect(await getChainHeight(nodes[0])).toBeLessThan(hardForkHeight)

      // Mint a new asset
      const assetCreator = randomElem(nodes)
      const assetCreatorRpc = await assetCreator.connectRpc()
      const assetCreatorAddress = (
        await assetCreatorRpc.wallet.getAccountPublicKey({ account: 'default' })
      ).content.publicKey
      const mintResponse = await mintCustomAsset(assetCreator)
      const assetId = mintResponse.asset.id
      await Promise.all(
        nodes.map((node) =>
          node.mineUntil({ transactionMined: mintResponse.transaction.hash }),
        ),
      )
      await cluster.waitForConvergence()
      // Make sure the hard fork hasn't happened yet due to mining
      expect(await getChainHeight(nodes[0])).toBeLessThan(hardForkHeight)

      // Ensure that the asset creator owns the asset
      const assetDetails = (await assetCreatorRpc.wallet.getAsset({ id: assetId })).content
      expect(assetDetails.creator).toBe(assetCreatorAddress)
      expect(assetDetails.owner).toBe(assetCreatorAddress)
      for (const node of nodes) {
        const rpc = await node.connectRpc()
        const assetDetails = (await rpc.chain.getAsset({ id: assetId })).content
        expect(assetDetails.creator).toBe(assetCreatorAddress)
        expect(assetDetails.owner).toBe(assetCreatorAddress)
      }

      // Ensure that creating a mint with transferOwnershipTo is not possible yet
      const newAssetOwner = randomElem(nodes.filter((node) => node !== assetCreator))
      const newAssetOwnerRpc = await newAssetOwner.connectRpc()
      const newAssetOwnerAddress = (
        await newAssetOwnerRpc.wallet.getAccountPublicKey({ account: 'default' })
      ).content.publicKey
      await expect(
        transferCustomAssetOwnership(assetId, assetCreator, newAssetOwner, {
          expiration: hardForkHeight - 1,
        }),
      ).rejects.toThrow('Version 1 transactions cannot contain transferOwnershipTo')

      // Mine and make the hard fork happen
      await Promise.all(nodes.map((node) => node.mineUntil({ blockSequence: hardForkHeight })))
      await cluster.waitForConvergence({ nodes })
      expect(await getChainHeight(nodes[0])).toBeGreaterThanOrEqual(hardForkHeight)

      // Retry creating a mint with transferOwnershipTo; this time it should succeed
      const transferOwnershipResponse = await transferCustomAssetOwnership(
        assetId,
        assetCreator,
        newAssetOwner,
      )
      await Promise.all(
        nodes.map((node) =>
          node.mineUntil({ transactionMined: transferOwnershipResponse.transaction.hash }),
        ),
      )
      await cluster.waitForConvergence()

      // Ensure that the asset creator no longer owns the asset, and that he new owner was recorded
      const newAssetDetails = (await assetCreatorRpc.wallet.getAsset({ id: assetId })).content
      expect(newAssetDetails.creator).toBe(assetCreatorAddress)
      expect(newAssetDetails.owner).toBe(newAssetOwnerAddress)
      for (const node of nodes) {
        const rpc = await node.connectRpc()
        const newAssetDetails = (await rpc.chain.getAsset({ id: assetId })).content
        expect(newAssetDetails.creator).toBe(assetCreatorAddress)
        expect(newAssetDetails.owner).toBe(newAssetOwnerAddress)
      }
    })
  })

  it('chain forks when nodes have different consensus rules', async () => {
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

      // Send some more transactions to/from random nodes
      await Promise.all(
        [...Array(numTransactions).keys()].map(() => sendRandomTransaction(allNodes)),
      )

      // Mine a few more blocks to make sure the transactions are mined
      await Promise.all(
        allNodes.map((node) => node.mineUntil({ blockSequence: hardForkHeight + 10 })),
      )
      await cluster.waitForConvergence({ nodes })
      await cluster.waitForConvergence({ nodes: rogueNodes })

      // Verify that:
      // 1. before the hard fork, all blocks are using V1 transactions
      // 2. after the hard fork, blocks from the `nodes` are are using V2
      //    transactions, blocks from the `rogueNodes` are using V1
      //    transactions
      await expectTransactionsVersion(nodes[0], { from: 1, to: hardForkHeight - 1 }, 1)
      await expectTransactionsVersion(nodes[0], { from: hardForkHeight, to: null }, 2)
      await expectTransactionsVersion(rogueNodes[0], { from: 1, to: null }, 1)
    })
  })

  it.skip('adjusts the difficulty of the hard-fork block', async () => {
    return withTestCluster(async (cluster: Cluster) => {
      const hardForkHeight = 5

      await cluster.init()

      const node = await cluster.spawn({ name: 'node' })
      const nodeRpc = await node.connectRpc()

      await node.mineUntil({ blockSequence: hardForkHeight - 1 })

      // Mine until just before the hard fork activation
      expect(await getChainHeight(node)).toBeLessThan(hardForkHeight)

      // Get the difficulty so we can compare it to the difficulty
      // post-activation
      const getDifficultyResponse1 = await nodeRpc.chain.getDifficulty()
      const preHardForkDifficulty = BigInt(getDifficultyResponse1.content.difficulty)

      // Mine another block to activate the sequence
      await node.mineUntil({ blockSequence: hardForkHeight })

      // Make sure the hard fork has happened
      expect(await getChainHeight(node)).toEqual(hardForkHeight)

      // Get the difficulty to compare to the pre-activation number
      const getDifficultyResponse2 = await nodeRpc.chain.getDifficulty()
      const postHardForkDifficulty = BigInt(getDifficultyResponse2.content.difficulty)

      // Divide by less than 100 just to give some room for error in case of
      // lucky block mine or something
      expect(postHardForkDifficulty).toBeLessThan(preHardForkDifficulty / 95n)
    })
  })
})

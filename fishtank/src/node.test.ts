/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ConfigOptions, FullNode, IronfishSdk, RpcTcpAdapter } from '@ironfish/sdk'
import { promises } from 'fs'
import { AddressInfo } from 'net'
import { Docker } from './backend'
import { Cluster } from './cluster'
import { Node } from './node'

const withFullNode = async (
  options: { dataDir: string; configOverrides?: Partial<ConfigOptions> },
  callback: (fullNode: FullNode) => Promise<void>,
) => {
  await promises.rm(options.dataDir, { force: true, recursive: true })

  const fullNodeSdk = await IronfishSdk.init(options)
  const fullNode = await fullNodeSdk.node()
  await fullNode.openDB()
  await fullNode.start()

  try {
    await callback(fullNode)
  } finally {
    await fullNode.shutdown()
    await promises.rm(options.dataDir, { recursive: true })
  }
}

describe('Node', () => {
  beforeEach(() => {
    Node.prototype.waitForStart = jest.fn().mockReturnValue(Promise.resolve())
  })

  describe('connectRpc', () => {
    it('connects to the node IPC socket', async () => {
      const backend = new Docker()
      const cluster = new Cluster({ name: 'my-test-cluster', backend })
      const node = new Node(cluster, 'my-test-node')
      const internalNodeName = 'some-random-name-07eb9a7f'

      // Start a full node that we can connect to
      await withFullNode(
        {
          dataDir: node.dataDir,
          configOverrides: {
            nodeName: internalNodeName,
            enableRpcTcp: true,
            enableRpcIpc: false,
            enableRpcTls: false,
            rpcTcpPort: 0,
          },
        },
        async (fullNode) => {
          // Get the TCP port bound by the node
          let rpcTcpPort = 0
          for (const adapter of fullNode.rpc.adapters) {
            if (adapter instanceof RpcTcpAdapter && adapter.server) {
              rpcTcpPort = (adapter.server.address() as AddressInfo).port
            }
          }

          jest.spyOn(backend, 'inspect').mockReturnValue(
            Promise.resolve({
              id: 'aaaa',
              name: internalNodeName,
              image: 'img',
              ports: {
                tcp: new Map<number, number>([[8020, rpcTcpPort]]),
                udp: new Map<number, number>(),
              },
            }),
          )

          // Connect to the node via the TCP socket
          const rpc = await node.connectRpc()

          // Perform some operation over the IPC socket to make sure we are
          // really connected to the correct node. Here we check the status and
          // verify that the returned peer name is matching our expected value
          const status = await rpc.node.getStatus()
          expect(status).toMatchObject({
            content: {
              node: {
                nodeName: internalNodeName,
                status: 'started',
              },
            },
          })
        },
      )
    })
  })

  describe('mineUntil', () => {
    const checkMiningProcess = (runDetached: jest.SpyInstance, remove: jest.SpyInstance) => {
      expect(runDetached).toHaveBeenCalledWith(
        'some-image',
        expect.objectContaining({
          name: expect.stringMatching(/^my-test-cluster_my-test-node-miner-/),
          args: [
            'miners:start',
            '--rpc.tcp',
            '--rpc.tcp.host',
            'my-test-node',
            '--no-rpc.tcp.tls',
          ],
          labels: {
            ['fishtank.cluster']: 'my-test-cluster',
          },
          networks: ['my-test-cluster'],
        }),
      )
      expect(remove).toHaveBeenCalledWith(
        [expect.stringMatching(/^my-test-cluster_my-test-node-miner-/)],
        { force: true },
      )
    }

    describe('with blockSequence', () => {
      it('mines until the condition is satisfied', async () => {
        const backend = new Docker()
        const cluster = new Cluster({ name: 'my-test-cluster', backend })
        const node = new Node(cluster, 'my-test-node')

        const getStatus = jest
          .fn()
          .mockReturnValueOnce(
            Promise.resolve({
              content: { blockchain: { head: { sequence: 100 } } },
            }),
          )
          .mockReturnValueOnce(
            Promise.resolve({
              content: { blockchain: { head: { sequence: 200 } } },
            }),
          )
        const rpc = { node: { getStatus } }
        node.connectRpc = jest.fn().mockReturnValue(Promise.resolve(rpc))
        node.getImage = jest.fn().mockReturnValue(Promise.resolve('some-image'))

        const runDetached = jest
          .spyOn(backend, 'runDetached')
          .mockReturnValue(Promise.resolve())
        const remove = jest.spyOn(backend, 'remove').mockReturnValue(Promise.resolve())

        await node.mineUntil({ blockSequence: 123 })

        checkMiningProcess(runDetached, remove)
        expect(getStatus).toHaveBeenCalledTimes(2)
      })

      it('does not run a miner if the condition is already satisfied', async () => {
        const backend = new Docker()
        const cluster = new Cluster({ name: 'my-test-cluster', backend })
        const node = new Node(cluster, 'my-test-node')

        const getStatus = jest.fn().mockReturnValue(
          Promise.resolve({
            content: { blockchain: { head: { sequence: 123 } } },
          }),
        )
        const rpc = { node: { getStatus } }
        node.connectRpc = jest.fn().mockReturnValue(Promise.resolve(rpc))

        const runDetached = jest
          .spyOn(backend, 'runDetached')
          .mockReturnValue(Promise.resolve())

        await node.mineUntil({ blockSequence: 123 })

        expect(runDetached).not.toHaveBeenCalled()
        expect(getStatus).toHaveBeenCalledTimes(1)
      })
    })

    describe('with additionalBlocks', () => {
      it('mines until the condition is satisfied', async () => {
        const backend = new Docker()
        const cluster = new Cluster({ name: 'my-test-cluster', backend })
        const node = new Node(cluster, 'my-test-node')

        const getStatus = jest
          .fn()
          .mockReturnValueOnce(
            Promise.resolve({
              content: { blockchain: { head: { sequence: 100 } } },
            }),
          )
          .mockReturnValueOnce(
            Promise.resolve({
              content: { blockchain: { head: { sequence: 100 } } },
            }),
          )
          .mockReturnValueOnce(
            Promise.resolve({
              content: { blockchain: { head: { sequence: 200 } } },
            }),
          )
        const rpc = { node: { getStatus } }
        node.connectRpc = jest.fn().mockReturnValue(Promise.resolve(rpc))
        node.getImage = jest.fn().mockReturnValue(Promise.resolve('some-image'))

        const runDetached = jest
          .spyOn(backend, 'runDetached')
          .mockReturnValue(Promise.resolve())
        const remove = jest.spyOn(backend, 'remove').mockReturnValue(Promise.resolve())

        await node.mineUntil({ additionalBlocks: 50 })

        checkMiningProcess(runDetached, remove)
        expect(getStatus).toHaveBeenCalledTimes(3)
      })
    })

    describe('with transactionMined', () => {
      it('mines until the condition is satisfied', async () => {
        const backend = new Docker()
        const cluster = new Cluster({ name: 'my-test-cluster', backend })
        const node = new Node(cluster, 'my-test-node')

        const waitForEnd = jest
          .fn()
          .mockReturnValueOnce(Promise.reject({ status: 404 }))
          .mockReturnValueOnce(Promise.resolve({}))
        const getTransaction = jest.fn().mockReturnValue({ waitForEnd })
        const rpc = { chain: { getTransaction } }
        node.connectRpc = jest.fn().mockReturnValue(Promise.resolve(rpc))
        node.getImage = jest.fn().mockReturnValue(Promise.resolve('some-image'))

        const runDetached = jest
          .spyOn(backend, 'runDetached')
          .mockReturnValue(Promise.resolve())
        const remove = jest.spyOn(backend, 'remove').mockReturnValue(Promise.resolve())

        await node.mineUntil({ transactionMined: 'abcdef' })

        checkMiningProcess(runDetached, remove)
        expect(getTransaction).toHaveBeenCalledTimes(2)
        expect(getTransaction).toHaveBeenCalledWith({ transactionHash: 'abcdef' })
        expect(getTransaction).toHaveBeenCalledWith({ transactionHash: 'abcdef' })
      })

      it('does not run a miner if the condition is already satisfied', async () => {
        const backend = new Docker()
        const cluster = new Cluster({ name: 'my-test-cluster', backend })
        const node = new Node(cluster, 'my-test-node')

        const waitForEnd = jest.fn().mockReturnValue(Promise.resolve({}))
        const getTransaction = jest.fn().mockReturnValue({ waitForEnd })
        const rpc = { chain: { getTransaction } }
        node.connectRpc = jest.fn().mockReturnValue(Promise.resolve(rpc))

        const runDetached = jest
          .spyOn(backend, 'runDetached')
          .mockReturnValue(Promise.resolve())

        await node.mineUntil({ transactionMined: 'abcdef' })

        expect(runDetached).not.toHaveBeenCalled()
        expect(getTransaction).toHaveBeenCalledTimes(1)
        expect(getTransaction).toHaveBeenCalledWith({ transactionHash: 'abcdef' })
      })
    })

    describe('with accountBalance', () => {
      it('mines until the condition is satisfied', async () => {
        const backend = new Docker()
        const cluster = new Cluster({ name: 'my-test-cluster', backend })
        const node = new Node(cluster, 'my-test-node')

        const getAccountBalance = jest
          .fn()
          .mockReturnValueOnce(Promise.resolve({ content: { available: '100' } }))
          .mockReturnValueOnce(Promise.resolve({ content: { available: '500' } }))
        const rpc = { wallet: { getAccountBalance } }
        node.connectRpc = jest.fn().mockReturnValue(Promise.resolve(rpc))
        node.getImage = jest.fn().mockReturnValue(Promise.resolve('some-image'))

        const runDetached = jest
          .spyOn(backend, 'runDetached')
          .mockReturnValue(Promise.resolve())
        const remove = jest.spyOn(backend, 'remove').mockReturnValue(Promise.resolve())

        await node.mineUntil({ accountBalance: 200n })

        checkMiningProcess(runDetached, remove)
        expect(getAccountBalance).toHaveBeenCalledTimes(2)
      })

      it('does not run a miner if the condition is already satisfied', async () => {
        const backend = new Docker()
        const cluster = new Cluster({ name: 'my-test-cluster', backend })
        const node = new Node(cluster, 'my-test-node')

        const getAccountBalance = jest
          .fn()
          .mockReturnValue(Promise.resolve({ content: { available: '500' } }))
        const rpc = { wallet: { getAccountBalance } }
        node.connectRpc = jest.fn().mockReturnValue(Promise.resolve(rpc))

        const runDetached = jest
          .spyOn(backend, 'runDetached')
          .mockReturnValue(Promise.resolve())

        await node.mineUntil({ accountBalance: 200n })

        expect(runDetached).not.toHaveBeenCalled()
        expect(getAccountBalance).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('remove', () => {
    it('forcefully removes the container and all its volumes', async () => {
      const backend = new Docker()
      const cluster = new Cluster({ name: 'my-test-cluster', backend })

      jest.spyOn(backend, 'runDetached').mockReturnValue(Promise.resolve())
      const remove = jest.spyOn(backend, 'remove').mockReturnValue(Promise.resolve())

      const node = await cluster.spawn({ name: 'my-test-container' })
      await node.remove()

      expect(remove).toHaveBeenCalledWith(['my-test-cluster_my-test-container'], {
        force: true,
        volumes: true,
      })
    })
  })
})

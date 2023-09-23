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

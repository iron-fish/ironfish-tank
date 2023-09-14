/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Docker } from './backend'
import { Cluster, NodeConfig } from './cluster'

describe('Cluster', () => {
  describe('spawn', () => {
    it('launches a detached container with the default image', async () => {
      const backend = new Docker()
      const cluster = new Cluster({ name: 'my-test-cluster', backend })

      const runDetached = jest.spyOn(backend, 'runDetached').mockReturnValue(Promise.resolve())

      await cluster.spawn({ name: 'my-test-container' })

      expect(runDetached).toHaveBeenCalledWith('ironfish:latest', {
        name: 'my-test-cluster_my-test-container',
        networks: ['my-test-cluster'],
      })
    })

    it('launches a detached container with node config', async () => {
      const backend = new Docker()
      const cluster = new Cluster({ name: 'my-test-cluster', backend })

      const runDetached = jest.spyOn(backend, 'runDetached').mockReturnValue(Promise.resolve())

      const nodeConfig: NodeConfig = {
        networkId: '0',
        cliconfig: {
          dataDir: '~/.test_ironfish',
          configName: './config.json',
        },
      }
      await cluster.spawn({ name: 'my-test-container', config: nodeConfig })

      const volumes = new Map<string, string>([['~/.test_ironfish', '~/.test_ironfish']])
      expect(runDetached).toHaveBeenCalledWith('ironfish:latest', {
        name: 'my-test-cluster_my-test-container',
        networks: ['my-test-cluster'],
        volumes: volumes,
        args: [
          'start',
          '--networkId=0',
          '--config=./config.json',
          '--datadir=~/.test_ironfish',
        ],
      })
    })

    it('launches a detached container without datadir', async () => {
      const backend = new Docker()
      const cluster = new Cluster({ name: 'my-test-cluster', backend })

      const runDetached = jest.spyOn(backend, 'runDetached').mockReturnValue(Promise.resolve())

      const nodeConfig: NodeConfig = {
        networkId: '0',
        cliconfig: {
          configName: './config.json',
        },
      }
      await cluster.spawn({ name: 'my-test-container', config: nodeConfig })

      expect(runDetached).toHaveBeenCalledWith('ironfish:latest', {
        name: 'my-test-cluster_my-test-container',
        networks: ['my-test-cluster'],
        args: ['start', '--networkId=0', '--config=./config.json'],
      })
    })
  })
})

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ConfigOptions } from '@ironfish/sdk'
import { promises } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { Docker } from './backend'
import { Cluster } from './cluster'

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
        hostname: 'my-test-container',
        labels: { 'fishtank.cluster': 'my-test-cluster' },
      })
    })

    it('launches a detached container with node config', async () => {
      const backend = new Docker()
      const cluster = new Cluster({ name: 'my-test-cluster', backend })

      const runDetached = jest.spyOn(backend, 'runDetached').mockReturnValue(Promise.resolve())

      const nodeConfig: Partial<ConfigOptions> = {
        networkId: 0,
      }
      await cluster.spawn({ name: 'my-test-container', config: nodeConfig })

      const containerDatadir = join(
        tmpdir(),
        'fishtank',
        'my-test-cluster_my-test-container',
        '.ironfish',
      )
      const volumes = new Map<string, string>([[containerDatadir, '/root/.ironfish']])
      expect(
        await promises.readFile(resolve(containerDatadir, 'config.json'), { encoding: 'utf8' }),
      ).toEqual('{"networkId":0}')
      expect(runDetached).toHaveBeenCalledWith('ironfish:latest', {
        name: 'my-test-cluster_my-test-container',
        networks: ['my-test-cluster'],
        hostname: 'my-test-container',
        labels: { 'fishtank.cluster': 'my-test-cluster' },
        volumes: volumes,
      })
    })
  })

  describe('teardown', () => {
    it('removes all resources created by the cluster', async () => {
      const backend = new Docker()
      const cluster = new Cluster({ name: 'my-test-cluster', backend })

      const list = jest.spyOn(backend, 'list').mockReturnValue(
        Promise.resolve([
          { id: 'aaaa', name: 'my-test-cluster_node-1', image: 'img' },
          { id: 'bbbb', name: 'my-test-cluster_node-2', image: 'img' },
          { id: 'cccc', name: 'my-test-cluster_node-3', image: 'img' },
        ]),
      )

      const remove = jest.spyOn(backend, 'remove').mockReturnValue(Promise.resolve())

      await cluster.teardown()

      expect(list).toHaveBeenCalledWith({
        labels: { 'fishtank.cluster': 'my-test-cluster' },
      })
      expect(remove).toHaveBeenCalledWith(
        ['my-test-cluster_node-1', 'my-test-cluster_node-2', 'my-test-cluster_node-3'],
        { force: true, volumes: true },
      )
    })
  })
})

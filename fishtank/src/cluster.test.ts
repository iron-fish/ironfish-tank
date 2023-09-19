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
  describe('init', () => {
    it('creates the network and launches a bootstrap node', async () => {
      const backend = new Docker()
      const cluster = new Cluster({ name: 'my-test-cluster', backend })

      const createNetwork = jest
        .spyOn(backend, 'createNetwork')
        .mockReturnValue(Promise.resolve())
      const runDetached = jest.spyOn(backend, 'runDetached').mockReturnValue(Promise.resolve())

      await cluster.init()

      expect(createNetwork).toHaveBeenCalledWith('my-test-cluster', {
        attachable: true,
        internal: true,
        labels: { 'fishtank.cluster': 'my-test-cluster' },
      })
      expect(runDetached).toHaveBeenCalledWith('ironfish:latest', {
        args: ['start'],
        name: 'my-test-cluster_bootstrap',
        networks: ['my-test-cluster'],
        hostname: 'bootstrap',
        labels: { 'fishtank.cluster': 'my-test-cluster', 'fishtank.node.role': 'bootstrap' },
      })
    })

    it('only creates the network if bootstrap was not requested', async () => {
      const backend = new Docker()
      const cluster = new Cluster({ name: 'my-test-cluster', backend })

      const createNetwork = jest
        .spyOn(backend, 'createNetwork')
        .mockReturnValue(Promise.resolve())
      const runDetached = jest.spyOn(backend, 'runDetached').mockReturnValue(Promise.resolve())

      await cluster.init({ bootstrap: false })

      expect(createNetwork).toHaveBeenCalledWith('my-test-cluster', {
        attachable: true,
        internal: true,
        labels: { 'fishtank.cluster': 'my-test-cluster' },
      })
      expect(runDetached).not.toHaveBeenCalled()
    })
  })

  describe('bootstrap', () => {
    it('launches a bootstrap node', async () => {
      const backend = new Docker()
      const cluster = new Cluster({ name: 'my-test-cluster', backend })

      const runDetached = jest.spyOn(backend, 'runDetached').mockReturnValue(Promise.resolve())

      await cluster.bootstrap()

      expect(runDetached).toHaveBeenCalledWith('ironfish:latest', {
        args: ['start'],
        name: 'my-test-cluster_bootstrap',
        networks: ['my-test-cluster'],
        hostname: 'bootstrap',
        labels: { 'fishtank.cluster': 'my-test-cluster', 'fishtank.node.role': 'bootstrap' },
      })
    })

    it('launches a bootstrap node with the given name', async () => {
      const backend = new Docker()
      const cluster = new Cluster({ name: 'my-test-cluster', backend })

      const runDetached = jest.spyOn(backend, 'runDetached').mockReturnValue(Promise.resolve())

      await cluster.bootstrap({ nodeName: 'my-bootstrap-node' })

      expect(runDetached).toHaveBeenCalledWith('ironfish:latest', {
        args: ['start'],
        name: 'my-test-cluster_my-bootstrap-node',
        networks: ['my-test-cluster'],
        hostname: 'my-bootstrap-node',
        labels: { 'fishtank.cluster': 'my-test-cluster', 'fishtank.node.role': 'bootstrap' },
      })
    })

    it('launches a bootstrap node with the given image', async () => {
      const backend = new Docker()
      const cluster = new Cluster({ name: 'my-test-cluster', backend })

      const runDetached = jest.spyOn(backend, 'runDetached').mockReturnValue(Promise.resolve())

      await cluster.bootstrap({ nodeImage: 'some-image' })

      expect(runDetached).toHaveBeenCalledWith('some-image', {
        args: ['start'],
        name: 'my-test-cluster_bootstrap',
        networks: ['my-test-cluster'],
        hostname: 'bootstrap',
        labels: { 'fishtank.cluster': 'my-test-cluster', 'fishtank.node.role': 'bootstrap' },
      })
    })
  })

  describe('spawn', () => {
    it('launches a detached container with the default image', async () => {
      const backend = new Docker()
      const cluster = new Cluster({ name: 'my-test-cluster', backend })

      const list = jest
        .spyOn(backend, 'list')
        .mockReturnValue(
          Promise.resolve([
            { id: 'aaaa', name: 'my-test-cluster_my-bootstrap-node', image: 'img' },
          ]),
        )
      const runDetached = jest.spyOn(backend, 'runDetached').mockReturnValue(Promise.resolve())

      const node = await cluster.spawn({ name: 'my-test-container' })

      expect(node.name).toEqual('my-test-container')
      expect(list).toHaveBeenCalledWith({
        labels: { 'fishtank.cluster': 'my-test-cluster', 'fishtank.node.role': 'bootstrap' },
      })
      expect(runDetached).toHaveBeenCalledWith('ironfish:latest', {
        args: ['start', '--bootstrap', 'my-bootstrap-node'],
        name: 'my-test-cluster_my-test-container',
        networks: ['my-test-cluster'],
        hostname: 'my-test-container',
        labels: { 'fishtank.cluster': 'my-test-cluster' },
      })
    })

    it('launches a detached container with the provided configuration', async () => {
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
        args: ['start'],
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

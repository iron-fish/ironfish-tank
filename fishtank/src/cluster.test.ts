/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ConfigOptions } from '@ironfish/sdk'
import { existsSync, promises } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { Docker } from './backend'
import { Cluster } from './cluster'
import { Node } from './node'

const getDataDir = (clusterName: string, nodeName: string): string => {
  return join(tmpdir(), 'fishtank', clusterName, nodeName, '.ironfish')
}

const getVolumes = (clusterName: string, nodeName: string): Map<string, string> => {
  const dataDir = getDataDir(clusterName, nodeName)
  return new Map<string, string>([[dataDir, '/root/.ironfish']])
}

describe('Cluster', () => {
  beforeAll(() => {
    Docker.prototype['cmd'] = jest
      .fn()
      .mockImplementation((args: readonly string[]) =>
        Promise.reject(
          `Docker commands should not be executed directly in this test, got ${JSON.stringify(
            args,
          )}`,
        ),
      )
  })

  beforeAll(() => {
    Node.prototype.waitForStart = jest.fn().mockReturnValue(Promise.resolve())
  })

  describe('constructor', () => {
    it('refuses to create a cluster with an invalid name', () => {
      expect(() => new Cluster({ name: '' })).toThrow('Invalid name')
      expect(() => new Cluster({ name: 'abc def' })).toThrow('Invalid name')
      expect(() => new Cluster({ name: 'abc:def' })).toThrow('Invalid name')
      expect(() => new Cluster({ name: 'abc/def' })).toThrow('Invalid name')
      expect(() => new Cluster({ name: 'abc.def' })).toThrow('Invalid name')
    })
  })

  describe('init', () => {
    it('creates the network, launches a bootstrap node, and initializes the chain', async () => {
      const backend = new Docker()
      const cluster = new Cluster({ name: 'my-test-cluster', backend })

      const createNetwork = jest
        .spyOn(backend, 'createNetwork')
        .mockReturnValue(Promise.resolve())
      const runDetached = jest.spyOn(backend, 'runDetached').mockReturnValue(Promise.resolve())
      const mineUntil = jest
        .spyOn(Node.prototype, 'mineUntil')
        .mockClear()
        .mockReturnValue(Promise.resolve())

      await cluster.init()

      expect(createNetwork).toHaveBeenCalledWith('my-test-cluster', {
        attachable: true,
        labels: { 'fishtank.cluster': 'my-test-cluster' },
      })
      expect(runDetached).toHaveBeenCalledWith('ironfish:latest', {
        args: ['start'],
        name: 'my-test-cluster_bootstrap',
        networks: ['my-test-cluster'],
        hostname: 'bootstrap',
        ports: { tcp: [8020] },
        labels: { 'fishtank.cluster': 'my-test-cluster', 'fishtank.node.role': 'bootstrap' },
        volumes: getVolumes('my-test-cluster', 'bootstrap'),
      })
      expect(mineUntil).toHaveBeenCalledWith({ blockSequence: 2 })
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
        labels: { 'fishtank.cluster': 'my-test-cluster' },
      })
      expect(runDetached).not.toHaveBeenCalled()
    })
  })

  describe('bootstrap', () => {
    it('launches a bootstrap node, and initializes the chain', async () => {
      const backend = new Docker()
      const cluster = new Cluster({ name: 'my-test-cluster', backend })

      const runDetached = jest.spyOn(backend, 'runDetached').mockReturnValue(Promise.resolve())
      const mineUntil = jest
        .spyOn(Node.prototype, 'mineUntil')
        .mockClear()
        .mockReturnValue(Promise.resolve())

      await cluster.bootstrap()

      expect(runDetached).toHaveBeenCalledWith('ironfish:latest', {
        args: ['start'],
        name: 'my-test-cluster_bootstrap',
        networks: ['my-test-cluster'],
        hostname: 'bootstrap',
        ports: { tcp: [8020] },
        labels: { 'fishtank.cluster': 'my-test-cluster', 'fishtank.node.role': 'bootstrap' },
        volumes: getVolumes('my-test-cluster', 'bootstrap'),
      })
      expect(mineUntil).toHaveBeenCalledWith({ blockSequence: 2 })
    })

    it('skips initialization of the chain if not requested', async () => {
      const backend = new Docker()
      const cluster = new Cluster({ name: 'my-test-cluster', backend })

      const runDetached = jest.spyOn(backend, 'runDetached').mockReturnValue(Promise.resolve())
      const mineUntil = jest
        .spyOn(Node.prototype, 'mineUntil')
        .mockClear()
        .mockReturnValue(Promise.resolve())

      await cluster.bootstrap({ initChain: false })

      expect(runDetached).toHaveBeenCalledWith('ironfish:latest', {
        args: ['start'],
        name: 'my-test-cluster_bootstrap',
        networks: ['my-test-cluster'],
        hostname: 'bootstrap',
        ports: { tcp: [8020] },
        labels: { 'fishtank.cluster': 'my-test-cluster', 'fishtank.node.role': 'bootstrap' },
        volumes: getVolumes('my-test-cluster', 'bootstrap'),
      })
      expect(mineUntil).not.toHaveBeenCalled()
    })

    it('launches a bootstrap node with the given name', async () => {
      const backend = new Docker()
      const cluster = new Cluster({ name: 'my-test-cluster', backend })

      const runDetached = jest.spyOn(backend, 'runDetached').mockReturnValue(Promise.resolve())

      await cluster.bootstrap({ nodeName: 'my-bootstrap-node', initChain: false })

      expect(runDetached).toHaveBeenCalledWith('ironfish:latest', {
        args: ['start'],
        name: 'my-test-cluster_my-bootstrap-node',
        networks: ['my-test-cluster'],
        hostname: 'my-bootstrap-node',
        ports: { tcp: [8020] },
        labels: { 'fishtank.cluster': 'my-test-cluster', 'fishtank.node.role': 'bootstrap' },
        volumes: getVolumes('my-test-cluster', 'my-bootstrap-node'),
      })
    })

    it('launches a bootstrap node with the given image', async () => {
      const backend = new Docker()
      const cluster = new Cluster({ name: 'my-test-cluster', backend })

      const runDetached = jest.spyOn(backend, 'runDetached').mockReturnValue(Promise.resolve())

      await cluster.bootstrap({ nodeImage: 'some-image', initChain: false })

      expect(runDetached).toHaveBeenCalledWith('some-image', {
        args: ['start'],
        name: 'my-test-cluster_bootstrap',
        networks: ['my-test-cluster'],
        hostname: 'bootstrap',
        ports: { tcp: [8020] },
        labels: { 'fishtank.cluster': 'my-test-cluster', 'fishtank.node.role': 'bootstrap' },
        volumes: getVolumes('my-test-cluster', 'bootstrap'),
      })
    })
  })

  describe('spawn', () => {
    afterEach(async () => {
      return promises.rm(join(tmpdir(), 'fishtank', 'my-test-cluster'), {
        force: true,
        recursive: true,
      })
    })

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
      const dataDir = getDataDir('my-test-cluster', 'my-test-container')

      expect(
        await promises
          .readFile(resolve(dataDir, 'config.json'), { encoding: 'utf8' })
          .then(JSON.parse),
      ).toEqual({
        networkId: 2,
        enableRpcTcp: true,
        enableRpcTls: false,
        rpcTcpHost: '',
        poolDifficulty: '1500000',
        bootstrapNodes: ['my-bootstrap-node'],
      })
      expect(node.name).toEqual('my-test-container')
      expect(list).toHaveBeenCalledWith({
        labels: { 'fishtank.cluster': 'my-test-cluster', 'fishtank.node.role': 'bootstrap' },
      })
      expect(runDetached).toHaveBeenCalledWith('ironfish:latest', {
        args: ['start'],
        name: 'my-test-cluster_my-test-container',
        networks: ['my-test-cluster'],
        hostname: 'my-test-container',
        ports: { tcp: [8020] },
        labels: { 'fishtank.cluster': 'my-test-cluster' },
        volumes: getVolumes('my-test-cluster', 'my-test-container'),
      })
    })

    it('launches a detached container with the provided configuration', async () => {
      const backend = new Docker()
      const cluster = new Cluster({ name: 'my-test-cluster', backend })

      jest.spyOn(backend, 'list').mockReturnValue(Promise.resolve([]))
      const runDetached = jest.spyOn(backend, 'runDetached').mockReturnValue(Promise.resolve())

      const config = {
        networkId: 123,
      }
      await cluster.spawn({ name: 'my-test-container', config })

      const dataDir = getDataDir('my-test-cluster', 'my-test-container')
      expect(
        await promises
          .readFile(resolve(dataDir, 'config.json'), { encoding: 'utf8' })
          .then(JSON.parse),
      ).toEqual(config)
      expect(runDetached).toHaveBeenCalledWith('ironfish:latest', {
        args: ['start'],
        name: 'my-test-cluster_my-test-container',
        networks: ['my-test-cluster'],
        hostname: 'my-test-container',
        ports: { tcp: [8020] },
        labels: { 'fishtank.cluster': 'my-test-cluster' },
        volumes: getVolumes('my-test-cluster', 'my-test-container'),
      })
    })

    it('launches a detached container with the provided internal settings', async () => {
      const backend = new Docker()
      const cluster = new Cluster({ name: 'my-test-cluster', backend })

      jest.spyOn(backend, 'list').mockReturnValue(Promise.resolve([]))
      const runDetached = jest.spyOn(backend, 'runDetached').mockReturnValue(Promise.resolve())

      const internal = {
        rpcAuthToken: 'token',
      }
      await cluster.spawn({ name: 'my-test-container', internal })

      const dataDir = getDataDir('my-test-cluster', 'my-test-container')
      expect(
        await promises
          .readFile(resolve(dataDir, 'internal.json'), { encoding: 'utf8' })
          .then(JSON.parse),
      ).toEqual(internal)
      expect(runDetached).toHaveBeenCalledWith('ironfish:latest', {
        args: ['start'],
        name: 'my-test-cluster_my-test-container',
        networks: ['my-test-cluster'],
        hostname: 'my-test-container',
        ports: { tcp: [8020] },
        labels: { 'fishtank.cluster': 'my-test-cluster' },
        volumes: getVolumes('my-test-cluster', 'my-test-container'),
      })
    })

    it('launches a detached container with custom network definition', async () => {
      const backend = new Docker()
      const cluster = new Cluster({ name: 'my-test-cluster', backend })

      jest.spyOn(backend, 'list').mockReturnValue(Promise.resolve([]))
      const runDetached = jest.spyOn(backend, 'runDetached').mockReturnValue(Promise.resolve())

      const networkDefinition = {
        id: 123,
      }
      await cluster.spawn({ name: 'my-test-container', networkDefinition })

      const dataDir = getDataDir('my-test-cluster', 'my-test-container')
      expect(
        await promises
          .readFile(resolve(dataDir, 'customNetwork.json'), { encoding: 'utf8' })
          .then(JSON.parse),
      ).toEqual(networkDefinition)
      expect(runDetached).toHaveBeenCalledWith('ironfish:latest', {
        args: ['start', '--customNetwork', '/root/.ironfish/customNetwork.json'],
        name: 'my-test-cluster_my-test-container',
        networks: ['my-test-cluster'],
        hostname: 'my-test-container',
        ports: { tcp: [8020] },
        labels: { 'fishtank.cluster': 'my-test-cluster' },
        volumes: getVolumes('my-test-cluster', 'my-test-container'),
      })
    })

    it('defaults to DEVNET', async () => {
      const backend = new Docker()
      const cluster = new Cluster({ name: 'my-test-cluster', backend })

      jest.spyOn(backend, 'list').mockReturnValue(Promise.resolve([]))
      jest.spyOn(backend, 'runDetached').mockReturnValue(Promise.resolve())
      await cluster.spawn({ name: 'my-test-container' })

      const dataDir = getDataDir('my-test-cluster', 'my-test-container')
      expect(
        await promises
          .readFile(resolve(dataDir, 'config.json'), { encoding: 'utf8' })
          .then(JSON.parse),
      ).toMatchObject({
        networkId: 2,
      })
    })
  })

  describe('teardown', () => {
    it('removes all resources created by the cluster', async () => {
      const backend = new Docker()
      const cluster = new Cluster({ name: 'my-test-cluster', backend })

      jest.spyOn(backend, 'list').mockReturnValue(Promise.resolve([]))
      jest.spyOn(backend, 'runDetached').mockReturnValue(Promise.resolve())

      const nodeConfig: Partial<ConfigOptions> = {
        networkId: 0,
      }
      await cluster.spawn({ name: 'my-test-container', config: nodeConfig })
      expect(existsSync(join(tmpdir(), 'fishtank', cluster.name))).toEqual(true)

      const list = jest.spyOn(backend, 'list').mockReturnValue(
        Promise.resolve([
          { id: 'aaaa', name: 'my-test-cluster_node-1', image: 'img' },
          { id: 'bbbb', name: 'my-test-cluster_node-2', image: 'img' },
          { id: 'cccc', name: 'my-test-cluster_node-3', image: 'img' },
        ]),
      )
      const remove = jest.spyOn(backend, 'remove').mockReturnValue(Promise.resolve())
      const removeNetworks = jest
        .spyOn(backend, 'removeNetworks')
        .mockReturnValue(Promise.resolve())

      await cluster.teardown()

      expect(list).toHaveBeenCalledWith({
        labels: { 'fishtank.cluster': 'my-test-cluster' },
      })
      expect(remove).toHaveBeenCalledWith(
        ['my-test-cluster_node-1', 'my-test-cluster_node-2', 'my-test-cluster_node-3'],
        { force: true, volumes: true },
      )
      expect(removeNetworks).toHaveBeenCalledWith(['my-test-cluster'], { force: true })

      expect(existsSync(join(tmpdir(), 'fishtank', cluster.name))).toEqual(false)
    })
  })
})

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { promises } from 'fs'
import { tmpdir } from 'os'
import { join, parse } from 'path'
import { Docker } from './backend'
import { Cluster, NodeConfig } from './cluster'

describe('Cluster', () => {
  describe('spawn', () => {
    const datadir = `${__dirname}/.ironfish`

    beforeAll(async () => {
      await promises.mkdir(datadir, {
        recursive: true,
      })
    })

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
          dataDir: datadir,
          configName: './config.json',
        },
      }
      await cluster.spawn({ name: 'my-test-container', config: nodeConfig })

      const parsedPath = parse(datadir)
      const containerDatadir = join(
        tmpdir(),
        'fishtank',
        'my-test-cluster_my-test-container',
        parsedPath.name,
      )
      const volumes = new Map<string, string>([[containerDatadir, containerDatadir]])
      expect(runDetached).toHaveBeenCalledWith('ironfish:latest', {
        name: 'my-test-cluster_my-test-container',
        networks: ['my-test-cluster'],
        volumes: volumes,
        args: [
          'start',
          '--networkId=0',
          '--config=./config.json',
          `--datadir=${containerDatadir}`,
        ],
      })
    })

    it('launches a detached container without cliconfig', async () => {
      const backend = new Docker()
      const cluster = new Cluster({ name: 'my-test-cluster', backend })

      const runDetached = jest.spyOn(backend, 'runDetached').mockReturnValue(Promise.resolve())

      const nodeConfig: NodeConfig = {
        networkId: '0',
      }
      await cluster.spawn({ name: 'my-test-container', config: nodeConfig })

      expect(runDetached).toHaveBeenCalledWith('ironfish:latest', {
        name: 'my-test-cluster_my-test-container',
        networks: ['my-test-cluster'],
        args: ['start', '--networkId=0'],
      })
    })

    it('launches a detached container with datadir in cliconfig', async () => {
      const backend = new Docker()
      const cluster = new Cluster({ name: 'my-test-cluster', backend })

      const runDetached = jest.spyOn(backend, 'runDetached').mockReturnValue(Promise.resolve())

      const nodeConfig: NodeConfig = {
        networkId: '0',
        cliconfig: {
          dataDir: datadir,
        },
      }
      await cluster.spawn({ name: 'my-test-container', config: nodeConfig })

      const parsedPath = parse(datadir)
      const containerDatadir = join(
        tmpdir(),
        'fishtank',
        'my-test-cluster_my-test-container',
        parsedPath.name,
      )
      const volumes = new Map<string, string>([[containerDatadir, containerDatadir]])
      expect(runDetached).toHaveBeenCalledWith('ironfish:latest', {
        name: 'my-test-cluster_my-test-container',
        networks: ['my-test-cluster'],
        volumes: volumes,
        args: ['start', '--networkId=0', `--datadir=${containerDatadir}`],
      })
    })

    it('launches a detached container with just config name', async () => {
      const backend = new Docker()
      const cluster = new Cluster({ name: 'my-test-cluster', backend })
      const nodeConfig: NodeConfig = {
        cliconfig: {
          configName: 'config.json',
        },
      }
      await expect(
        cluster.spawn({ name: 'my-test-container', config: nodeConfig }),
      ).rejects.toThrow('Need to set datadir when config name file is provided.')
    })
  })
})

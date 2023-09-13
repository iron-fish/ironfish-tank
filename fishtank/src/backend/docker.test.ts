/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Docker } from './docker'

describe('Docker Backend', () => {
  it('throws an error if Docker fails', async () => {
    const docker = new Docker({ executable: '/this/path/does/not/exist' })
    await expect(docker.runDetached('hello-world')).rejects.toThrow(
      "Command '/this/path/does/not/exist run --quiet --detach hello-world' exited with status ENOENT",
    )
  })

  describe('runDetached', () => {
    it('launches the entrypoint of the container by default', async () => {
      const docker = new Docker()
      docker['cmd'] = jest.fn()

      await docker.runDetached('hello-world:latest')
      expect(docker['cmd']).toHaveBeenCalledWith(
        ['run', '--quiet', '--detach', 'hello-world:latest'],
        {},
      )
    })

    it('passes arguments to the entrypoint of the container', async () => {
      const docker = new Docker()
      docker['cmd'] = jest.fn()

      await docker.runDetached('hello-world:latest', { args: ['a', 'b', 'c'] })
      expect(docker['cmd']).toHaveBeenCalledWith(
        ['run', '--quiet', '--detach', 'hello-world:latest', 'a', 'b', 'c'],
        {},
      )
    })

    it('gives the container the requested name', async () => {
      const docker = new Docker()
      docker['cmd'] = jest.fn()

      await docker.runDetached('hello-world:latest', { name: 'some-name' })
      expect(docker['cmd']).toHaveBeenCalledWith(
        ['run', '--quiet', '--detach', '--name', 'some-name', 'hello-world:latest'],
        {},
      )
    })

    it('attaches the container to the requested networks', async () => {
      const docker = new Docker()
      docker['cmd'] = jest.fn()

      await docker.runDetached('hello-world:latest', {
        networks: ['network-a', 'network-b', 'network-c'],
      })
      expect(docker['cmd']).toHaveBeenCalledWith(
        [
          'run',
          '--quiet',
          '--detach',
          '--network',
          'network-a',
          '--network',
          'network-b',
          '--network',
          'network-c',
          'hello-world:latest',
        ],
        {},
      )
    })

    it('gives the container the requested hostname', async () => {
      const docker = new Docker()
      docker['cmd'] = jest.fn()

      await docker.runDetached('hello-world:latest', {
        name: 'some-name',
        hostname: 'some-hostname',
      })
      expect(docker['cmd']).toHaveBeenCalledWith(
        [
          'run',
          '--quiet',
          '--detach',
          '--name',
          'some-name',
          '--hostname',
          'some-hostname',
          'hello-world:latest',
        ],
        {},
      )
    })
  })

  describe('list', () => {
    it('returns information about all containers', async () => {
      const docker = new Docker()
      docker['cmd'] = jest.fn().mockReturnValue({
        stdout:
          '{"Command":"...","CreatedAt":"2023-08-10 12:02:39 -0700 PDT","ID":"b0a1425e5e9f56746826fa9e037e5cc4eb2e472a0cd5a0bbedfffd55de0415b5","Image":"ironfish:latest","LocalVolumes":"1","Mounts":"b7ae1c8b5a1a3cc3428ee5a39c358f12bc0ec263a6a8feff3fbb0a4d91fee84d","Names":"test-cluster_test-node","Networks":"test_cluster","Ports":"","RunningFor":"4 weeks ago","Size":"0B","State":"exited","Status":"Exited (0) 4 weeks ago"}\n' +
          '{"Command":"...","CreatedAt":"2023-08-10 12:02:39 -0700 PDT","ID":"02dbd848851d3e276980a5a014f5371b0e32b46e4b3a09c5b3219daccb5dd552","Image":"ironfish:1.3.2","LocalVolumes":"1","Mounts":"800c9adead7f30ef6748bcb641951a699aa586eca280b7f7da5e07fe68ac703e","Names":"test-cluster_bootstrap-node","Networks":"test_cluster","Ports":"","RunningFor":"4 weeks ago","Size":"0B","State":"exited","Status":"Exited (0) 4 weeks ago"}\n',
      })

      const containers = await docker.list()
      expect(docker['cmd']).toHaveBeenCalledWith(
        ['ps', '--no-trunc', '--all', '--format=json'],
        {},
      )
      expect(containers).toEqual([
        {
          id: 'b0a1425e5e9f56746826fa9e037e5cc4eb2e472a0cd5a0bbedfffd55de0415b5',
          name: 'test-cluster_test-node',
          image: 'ironfish:latest',
        },
        {
          id: '02dbd848851d3e276980a5a014f5371b0e32b46e4b3a09c5b3219daccb5dd552',
          name: 'test-cluster_bootstrap-node',
          image: 'ironfish:1.3.2',
        },
      ])
    })
  })

  describe('remove', () => {
    it('removes the specified containers', async () => {
      const docker = new Docker()
      docker['cmd'] = jest.fn()

      await docker.remove(['container-1', 'container-2', 'container-3'])
      expect(docker['cmd']).toHaveBeenCalledWith(
        ['rm', 'container-1', 'container-2', 'container-3'],
        {},
      )
    })

    it('forcefully removes the specified containers', async () => {
      const docker = new Docker()
      docker['cmd'] = jest.fn()

      await docker.remove(['container-1', 'container-2', 'container-3'], { force: true })
      expect(docker['cmd']).toHaveBeenCalledWith(
        ['rm', '--force', 'container-1', 'container-2', 'container-3'],
        {},
      )
    })

    it('removes the specified containers and their volumes', async () => {
      const docker = new Docker()
      docker['cmd'] = jest.fn()

      await docker.remove(['container-1', 'container-2', 'container-3'], { volumes: true })
      expect(docker['cmd']).toHaveBeenCalledWith(
        ['rm', '--volumes', 'container-1', 'container-2', 'container-3'],
        {},
      )
    })

    it('does not do anything if no identifiers are passed', async () => {
      const docker = new Docker()
      docker['cmd'] = jest.fn()

      await docker.remove([])
      expect(docker['cmd']).not.toHaveBeenCalled()
    })
  })

  describe('createNetwork', () => {
    it('creates a network with the bridge driver', async () => {
      const docker = new Docker()
      docker['cmd'] = jest.fn()

      await docker.createNetwork('a-test-network')
      expect(docker['cmd']).toHaveBeenCalledWith(
        ['network', 'create', '--driver', 'bridge', 'a-test-network'],
        {},
      )
    })

    it('creates a network with the given driver', async () => {
      const docker = new Docker()
      docker['cmd'] = jest.fn()

      await docker.createNetwork('a-test-network', { driver: 'foo' })
      expect(docker['cmd']).toHaveBeenCalledWith(
        ['network', 'create', '--driver', 'foo', 'a-test-network'],
        {},
      )
    })

    it('creates an attachable network', async () => {
      const docker = new Docker()
      docker['cmd'] = jest.fn()

      await docker.createNetwork('a-test-network', { attachable: true })
      expect(docker['cmd']).toHaveBeenCalledWith(
        ['network', 'create', '--driver', 'bridge', '--attachable', 'a-test-network'],
        {},
      )
    })

    it('creates an internal network', async () => {
      const docker = new Docker()
      docker['cmd'] = jest.fn()

      await docker.createNetwork('a-test-network', { internal: true })
      expect(docker['cmd']).toHaveBeenCalledWith(
        ['network', 'create', '--driver', 'bridge', '--internal', 'a-test-network'],
        {},
      )
    })
  })

  describe('networkRemove', () => {
    it('removes the specified networks', async () => {
      const docker = new Docker()
      docker['cmd'] = jest.fn()

      await docker.removeNetworks(['network-1', 'network-2', 'network-3'])
      expect(docker['cmd']).toHaveBeenCalledWith(
        ['network', 'remove', 'network-1', 'network-2', 'network-3'],
        {},
      )
    })

    it('forcefully removes the specified networks', async () => {
      const docker = new Docker()
      docker['cmd'] = jest.fn()

      await docker.removeNetworks(['network-1', 'network-2', 'network-3'], { force: true })
      expect(docker['cmd']).toHaveBeenCalledWith(
        ['network', 'remove', '--force', 'network-1', 'network-2', 'network-3'],
        {},
      )
    })

    it('does not do anything if no identifiers are passed', async () => {
      const docker = new Docker()
      docker['cmd'] = jest.fn()

      await docker.removeNetworks([])
      expect(docker['cmd']).not.toHaveBeenCalled()
    })
  })
})

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
})
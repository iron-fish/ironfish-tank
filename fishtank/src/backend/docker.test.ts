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
})

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Docker } from './backend'
import { Cluster } from './cluster'

describe('Node', () => {
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

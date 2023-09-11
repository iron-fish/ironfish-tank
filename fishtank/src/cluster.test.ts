/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
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
      })
    })
  })
})

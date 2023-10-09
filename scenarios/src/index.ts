/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { RpcClient } from '@ironfish/sdk'
import { Cluster } from 'fishtank'

const POLL_INTERVAL = 200 // 0.2 seconds

/**
 * Return the name of the current Jest test that is being executed. The name is
 * sanitized to remove special characters so that it can be safely used as a
 * `Cluster` name.
 */
const currentTestName = (): string => {
  const testName = expect.getState().currentTestName
  if (!testName) {
    throw new Error('This method is expected to be called from a Jest test run')
  }
  return testName.replace(/\s/g, '-')
}

/**
 * Executes a closure with a given `Cluster`.
 *
 * The cluster is torn down before calling the closure (to ensure that the
 * cluster is clean before running any test), and after calling the closure
 * (for cleanup).
 */
export const withCluster = async (
  cluster: Cluster,
  callback: (cluster: Cluster) => Promise<void>,
): Promise<void> => {
  await cluster.teardown()
  try {
    await callback(cluster)
  } finally {
    await cluster.teardown()
  }
}

/**
 * Executes a closure with a new test cluster.
 *
 * The test cluster is named after the current Jest test that is being
 * executed.
 */
export const withTestCluster = (
  callback: (cluster: Cluster) => Promise<void>,
): Promise<void> => {
  const cluster = new Cluster({ name: currentTestName() })
  return withCluster(cluster, callback)
}

/**
 * Pauses execution for the given number of milliseconds.
 */
const sleep = (time: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, time))
}

/**
 * Waits until the given client is done scanning account transactions.
 */
export const waitForScanning = async (client: RpcClient): Promise<void> => {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const status = await client.node.getStatus()
    if (status.content.blockchain.head.hash === status.content.accounts.head.hash) {
      return
    }
    await sleep(POLL_INTERVAL)
  }
}

/**
 * Waits until all given clients have their chain in sync with each other.
 */
export const waitForSync = async (...clients: RpcClient[]): Promise<void> => {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const statuses = await Promise.all(clients.map((client) => client.node.getStatus()))
    const allSynced = statuses
      .map((status) => status.content.blockchain.synced)
      .reduce((acc, value) => acc && value, true)
    if (allSynced) {
      const heads = new Set(statuses.map((status) => status.content.blockchain.head.hash))
      if (heads.size <= 1) {
        return
      }
    }
    await sleep(POLL_INTERVAL)
  }
}

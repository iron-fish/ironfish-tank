/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ConsensusParameters, DEVNET, NetworkDefinition, Target } from '@ironfish/sdk'
import { Cluster } from 'fishtank'
import { getTestConfig } from './config'

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
    if (getTestConfig().cleanup) {
      await cluster.teardown()
    }
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

export const getNetworkDefinition = (
  consensus?: Partial<ConsensusParameters>,
): NetworkDefinition => {
  const networkDefinition = { ...DEVNET }
  networkDefinition.id = 123
  networkDefinition.genesis.header.target = Target.maxTarget().asBigInt().toString()
  if (consensus) {
    networkDefinition.consensus = {
      ...networkDefinition.consensus,
      ...consensus,
    }
  }
  return networkDefinition
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Cluster } from './cluster'

export function isValidName(name: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(name)
}

export function assertValidName(name: string): void {
  if (!isValidName(name)) {
    throw new Error(
      `Invalid name: ${JSON.stringify(
        name,
      )}; names may only contain letters, numbers, underscores or hypens`,
    )
  }
}

/**
 * Returns the name of the Docker network used for a cluster.
 */
export function networkName(cluster: Cluster): string {
  assertValidName(cluster.name)
  return cluster.name
}

/**
 * Returns the name of the Docker container used to host a node in a cluster.
 */
export function containerName(cluster: Cluster, nodeName: string): string {
  assertValidName(cluster.name)
  assertValidName(nodeName)
  return `${cluster.name}_${nodeName}`
}

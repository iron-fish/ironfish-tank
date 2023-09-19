/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Docker } from './backend'
import { Cluster } from './cluster'
import * as naming from './naming'

export class Node {
  public readonly cluster: Cluster
  public readonly name: string

  private readonly backend: Docker

  constructor(cluster: Cluster, name: string) {
    this.cluster = cluster
    this.name = name
    this.backend = cluster['backend']
  }

  private get containerName(): string {
    return naming.containerName(this.cluster, this.name)
  }

  remove(): Promise<void> {
    return this.backend.remove([this.containerName], { force: true, volumes: true })
  }
}

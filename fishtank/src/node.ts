/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishSdk, RpcClient } from '@ironfish/sdk'
import { tmpdir } from 'os'
import { join } from 'path'
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

  get dataDir(): string {
    return join(tmpdir(), 'fishtank', this.containerName, '.ironfish')
  }

  get ipcSocketPath(): string {
    return join(this.dataDir, 'ironfish.ipc')
  }

  async connectRpc(): Promise<RpcClient> {
    const sdk = await IronfishSdk.init({
      dataDir: this.dataDir,
      configOverrides: {
        enableRpcTcp: false,
        ipcPath: this.ipcSocketPath,
      },
    })
    return sdk.connectRpc(false, true)
  }

  remove(): Promise<void> {
    return this.backend.remove([this.containerName], { force: true, volumes: true })
  }
}

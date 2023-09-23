/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishSdk, RpcSocketClient } from '@ironfish/sdk'
import { tmpdir } from 'os'
import { join } from 'path'
import { Docker } from './backend'
import { Cluster } from './cluster'
import * as naming from './naming'

export const INTERNAL_RPC_TCP_PORT = 8020

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
    return join(tmpdir(), 'fishtank', this.cluster.name, this.name, '.ironfish')
  }

  async getRpcTcpPort(): Promise<number> {
    const info = await this.backend.inspect(this.containerName)
    const port = info.ports?.tcp.get(INTERNAL_RPC_TCP_PORT)
    if (port) {
      return port
    } else {
      throw new Error('Node is not exposing any RPC port')
    }
  }

  async connectRpc(): Promise<RpcSocketClient> {
    const rpcTcpPort = await this.getRpcTcpPort()
    const sdk = await IronfishSdk.init({
      dataDir: this.dataDir,
      configOverrides: {
        enableRpcTcp: true,
        enableRpcIpc: false,
        enableRpcTls: false,
        rpcTcpPort,
      },
    })
    return sdk.connectRpc(false, true) as Promise<RpcSocketClient>
  }

  remove(): Promise<void> {
    return this.backend.remove([this.containerName], { force: true, volumes: true })
  }
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishSdk, RpcSocketClient } from '@ironfish/sdk'
import { randomBytes } from 'crypto'
import { tmpdir } from 'os'
import { join } from 'path'
import { Docker } from './backend'
import { Cluster, CLUSTER_LABEL, CONTAINER_DATADIR } from './cluster'
import * as naming from './naming'

const DEFAULT_WAIT_TIMEOUT = 5 * 1000 // 5 seconds
const WAIT_POLL_INTERVAL = 200 // 0.2 seconds
const MINE_POLL_INTERVAL = 200 // 0.2 seconds

export const INTERNAL_RPC_TCP_PORT = 8020

export const sleep = (time: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, time))
}

const randomSuffix = (): string => {
  return randomBytes(2).toString('hex')
}

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

  private get networkName(): string {
    return naming.networkName(this.cluster)
  }

  get dataDir(): string {
    return join(tmpdir(), 'fishtank', this.cluster.name, this.name, '.ironfish')
  }

  async getImage(): Promise<string> {
    const info = await this.backend.inspect(this.containerName)
    return info.image
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

  async getNodeStatus(): Promise<'started' | 'stopped' | 'error'> {
    let rpc
    try {
      rpc = await this.connectRpc()
    } catch {
      return 'stopped'
    }
    try {
      const status = await rpc.node.getStatus()
      return status.content.node.status
    } catch {
      return 'error'
    } finally {
      rpc.close()
    }
  }

  async isStarted(): Promise<boolean> {
    return (await this.getNodeStatus()) === 'started'
  }

  async waitForStart(options?: { timeout?: number }): Promise<void> {
    let stop = false
    const timeout = options?.timeout ?? DEFAULT_WAIT_TIMEOUT
    const timer = setTimeout(() => {
      stop = true
    }, timeout)
    try {
      while (!stop) {
        if (await this.isStarted()) {
          return
        }
        await sleep(WAIT_POLL_INTERVAL)
      }
    } finally {
      clearTimeout(timer)
    }
    throw new Error(`Timeout of ${timeout}ms exceeded`)
  }

  async mineUntil(
    until:
      | { blockSequence: number }
      | { transactionMined: string }
      | { accountBalance: bigint },
  ): Promise<void> {
    const rpc = await this.connectRpc()

    const isDone = ((): (() => Promise<boolean>) => {
      if ('blockSequence' in until) {
        return async (): Promise<boolean> => {
          const status = await rpc.node.getStatus()
          return status.content.blockchain.head.sequence >= until.blockSequence
        }
      }
      if ('transactionMined' in until) {
        return async (): Promise<boolean> => {
          try {
            await rpc.chain
              .getTransaction({ transactionHash: until.transactionMined })
              .waitForEnd()
          } catch (err) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (!!err && typeof err === 'object' && err.status === 404) {
              return false
            }
            throw err
          }
          return true
        }
      }
      if ('accountBalance' in until) {
        return async (): Promise<boolean> => {
          const balance = await rpc.wallet.getAccountBalance()
          return BigInt(balance.content.available) >= until.accountBalance
        }
      }
      throw 'unreachable statement'
    })()

    if (await isDone()) {
      return
    }

    const poolProcess = await this.spawnCompanionProcess({
      baseName: 'pool',
      args: [
        'miners:pools:start',
        '--rpc.tcp',
        '--rpc.tcp.host',
        this.name,
        '--no-rpc.tcp.tls',
      ],
    })

    const minerProcess = await this.spawnCompanionProcess({
      baseName: 'miner',
      args: [
        'miners:start',
        '--rpc.tcp',
        '--rpc.tcp.host',
        this.name,
        '--no-rpc.tcp.tls',
        '--pool',
        poolProcess.name,
      ],
    })

    while (!(await isDone())) {
      await sleep(MINE_POLL_INTERVAL)
    }

    await minerProcess.remove()
    await poolProcess.remove()
  }

  private async spawnCompanionProcess(options: {
    baseName: string
    args: readonly string[]
  }): Promise<CompanionProcess> {
    const suffix = `${options.baseName}-${randomSuffix()}`
    const name = `${this.name}-${suffix}`
    const containerName = `${this.containerName}-${suffix}`
    const image = await this.getImage()
    const volumes = new Map<string, string>()
    volumes.set(this.dataDir, CONTAINER_DATADIR)

    await this.backend.runDetached(image, {
      args: options.args,
      name: containerName,
      hostname: name,
      networks: [this.networkName],
      volumes,
      labels: { [CLUSTER_LABEL]: this.cluster.name },
    })

    return new CompanionProcess(name, containerName, this.backend)
  }

  remove(): Promise<void> {
    return this.backend.remove([this.containerName], { force: true, volumes: true })
  }
}

class CompanionProcess {
  readonly name: string
  readonly containerName: string

  private readonly backend: Docker

  constructor(name: string, containerName: string, backend: Docker) {
    this.name = name
    this.containerName = containerName
    this.backend = backend
  }

  remove(): Promise<void> {
    return this.backend.remove([this.containerName], { force: true })
  }
}

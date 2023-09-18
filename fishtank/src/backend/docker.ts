/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as child_process from 'child_process'
import { ChildProcess, ExecFileOptions } from 'child_process'
import { promisify } from 'util'

const DEFAULT_COMMAND = 'docker'

type ExecFilePromiseReturn = { child: ChildProcess; stdout: string; stderr: string }

type ExecFilePromiseError = {
  cmd: string
  code: number | string
  stdout: string
  stderr: string
}

export type RunOptions = {
  args?: readonly string[]
  name?: string
  networks?: readonly string[]
  hostname?: string
  labels?: Labels
  volumes?: Map<string, string>
}

const execFile = promisify<string, readonly string[], ExecFileOptions, ExecFilePromiseReturn>(
  child_process.execFile,
)

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
const isExecFilePromiseError = (e: any): e is ExecFilePromiseError => {
  return (
    !!e &&
    typeof e === 'object' &&
    typeof e['cmd'] === 'string' &&
    (typeof e['code'] === 'number' || typeof e['code'] === 'string') &&
    typeof e['stdout'] === 'string' &&
    typeof e['stderr'] === 'string'
  )
}

export class DockerError extends Error {
  constructor(
    public readonly command: string,
    public readonly exitCode: number | string,
    public stdout: string,
    public stderr: string,
  ) {
    super(`Command '${command}' exited with status ${exitCode}:\n${stderr}`)
  }
}

export type Labels = { [key: string]: string }

export type ContainerDetails = { id: string; name: string; image: string }

const labelsToArgs = (labels: Labels): string[] => {
  const args = []
  for (const key in labels) {
    const value = labels[key]
    args.push('--label', `${key}=${value}`)
  }
  return args
}

export class Docker {
  private readonly executable: string

  constructor(options?: { executable?: string }) {
    this.executable = options?.executable ?? DEFAULT_COMMAND
  }

  private async cmd(
    args: readonly string[],
    options: ExecFileOptions,
  ): Promise<ExecFilePromiseReturn> {
    try {
      return await execFile(this.executable, args, options)
    } catch (e: unknown) {
      if (isExecFilePromiseError(e)) {
        throw new DockerError(e.cmd, e.code, e.stdout, e.stderr)
      }
      throw e
    }
  }

  async runDetached(image: string, options?: RunOptions): Promise<void> {
    const runArgs = ['run', '--quiet', '--detach']
    if (options?.name) {
      runArgs.push('--name', options.name)
    }
    if (options?.networks) {
      for (const network of options.networks) {
        runArgs.push('--network', network)
      }
    }
    if (options?.hostname) {
      runArgs.push('--hostname', options.hostname)
    }
    if (options?.volumes) {
      for (const entry of options.volumes.entries()) {
        runArgs.push('--volume', `${entry[0]}:${entry[1]}`)
      }
    }
    if (options?.labels) {
      runArgs.push(...labelsToArgs(options.labels))
    }
    runArgs.push(image)
    if (options?.args) {
      runArgs.push(...options.args)
    }
    await this.cmd(runArgs, {})
  }

  async list(filter?: { labels?: Labels }): Promise<ContainerDetails[]> {
    const filterArgs = ['ps', '--no-trunc', '--all', '--format=json']
    if (filter?.labels) {
      for (const key in filter.labels) {
        const value = filter.labels[key]
        filterArgs.push('--filter', `label=${key}=${value}`)
      }
    }

    const containers = []
    const { stdout } = await this.cmd(filterArgs, {})
    for (const line of stdout.split(/\r?\n/)) {
      if (!line) {
        continue
      }
      const info = JSON.parse(line) as { ID: string; Names: string; Image: string }
      containers.push({
        id: info['ID'],
        name: info['Names'],
        image: info['Image'],
      })
    }
    return containers
  }

  async remove(
    containers: string[],
    options?: { force?: boolean; volumes?: boolean },
  ): Promise<void> {
    if (containers.length === 0) {
      return
    }
    const rmArgs = ['rm']
    if (options?.force) {
      rmArgs.push('--force')
    }
    if (options?.volumes) {
      rmArgs.push('--volumes')
    }
    rmArgs.push(...containers)
    await this.cmd(rmArgs, {})
  }

  async createNetwork(
    name: string,
    options?: { driver?: string; attachable?: boolean; internal?: boolean; labels?: Labels },
  ): Promise<void> {
    const createArgs = ['network', 'create']
    createArgs.push('--driver', options?.driver ?? 'bridge')
    if (options?.attachable) {
      createArgs.push('--attachable')
    }
    if (options?.internal) {
      createArgs.push('--internal')
    }
    if (options?.labels) {
      createArgs.push(...labelsToArgs(options.labels))
    }
    createArgs.push(name)
    await this.cmd(createArgs, {})
  }

  async removeNetworks(networks: string[], options?: { force?: boolean }): Promise<void> {
    if (networks.length === 0) {
      return
    }
    const removeArgs = ['network', 'remove']
    if (options?.force) {
      removeArgs.push('--force')
    }
    removeArgs.push(...networks)
    await this.cmd(removeArgs, {})
  }
}

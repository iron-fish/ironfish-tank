/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Docker } from './backend'

export const DEFAULT_IMAGE = 'ironfish:latest'

export class Cluster {
  public readonly name: string

  private readonly backend: Docker

  constructor(options: { name: string; backend?: Docker }) {
    this.name = options.name
    this.backend = options.backend ?? new Docker()
  }

  private containerName(name: string): string {
    return `${this.name}_${name}`
  }

  async spawn(options: { name: string; image?: string }): Promise<void> {
    const name = this.containerName(options.name)
    return this.backend.runDetached(options.image ?? DEFAULT_IMAGE, { name })
  }
}

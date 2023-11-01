/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as shellSplit from 'shell-split'

export const DEFAULT_NODE_IMAGE = 'ghcr.io/iron-fish/ironfish:latest'

export type Config = {
  defaultImage: string
  extraStartArgs: readonly string[]
}

export const getConfig = (): Config => {
  return {
    defaultImage: process.env['FISHTANK_NODE_IMAGE'] ?? DEFAULT_NODE_IMAGE,
    extraStartArgs: shellSplit.split(process.env['FISHTANK_NODE_ARGS'] ?? ''),
  }
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Config, getConfig } from 'fishtank'

export type TestConfig = Config & {
  cleanup: boolean
}

export const getTestConfig = (): TestConfig => {
  return {
    ...getConfig(),
    cleanup: !!JSON.parse(process.env['FISHTANK_SCENARIOS_CLEANUP'] ?? 'true'),
  }
}

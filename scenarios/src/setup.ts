/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Cluster } from 'fishtank'
import { getTestConfig } from './config'

/* eslint-disable no-console */
export default async function (): Promise<void> {
  console.log()
  console.log('Configuration:')
  console.log(JSON.stringify(getTestConfig(), null, 2))
  console.log()
  console.log('Node version:')
  console.log(await new Cluster({ name: 'fishtank-scenarios-setup' }).getNodeVersion())
}

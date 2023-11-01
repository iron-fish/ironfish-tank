/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export const DEFAULT_WAIT_TIMEOUT = 30 * 1000 // 30 seconds
export const DEFAULT_POLL_INTERVAL = 200 // 0.2 seconds

export const sleep = (time: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, time))
}

export type Readiness = { ready: boolean; reason: string }

export class TimeoutError extends Error {}

export const loopWithTimeout = async (
  options: { timeout?: number; interval?: number },
  callback: () => Promise<Readiness>,
): Promise<void> => {
  const timeout = options.timeout ?? DEFAULT_WAIT_TIMEOUT
  const interval = options.interval ?? DEFAULT_POLL_INTERVAL

  let stop = false
  const timer = setTimeout(() => {
    stop = true
  }, timeout)
  let status: Readiness = { ready: false, reason: '' }

  try {
    while (!stop) {
      status = await callback()
      if (status.ready) {
        return
      }
      await sleep(interval)
    }
  } finally {
    clearTimeout(timer)
  }

  throw new TimeoutError(`Timeout of ${timeout}ms exceeded\nStatus: ${status.reason}`)
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
const base = require('../jest.config.base')
const pkg = require('./package.json')

module.exports = {
  ...base,
  displayName: pkg.name,
  testMatch: ['**/*.simulation.ts', '**/*.test.ts'],
  globalSetup: './build/src/setup.js',
}

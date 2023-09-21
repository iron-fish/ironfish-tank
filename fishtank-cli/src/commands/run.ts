/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRootLogger } from '@ironfish/sdk'
import { CliUx, Command, Config } from '@oclif/core'
import { SIMULATIONS } from '../../../scenarios'

export abstract class Run extends Command {
  static description = 'Run a simulation from scenarios'

  static args = [
    {
      name: 'simulation',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: true,
      description: `The name of the simulation to run, one of: ${Object.keys(SIMULATIONS).join(
        ', ',
      )}`,
    },
  ]

  constructor(argv: string[], config: Config) {
    super(argv, config)
  }

  async run(): Promise<void> {
    const { args } = await this.parse(Run)

    const simName = args.simulation as string
    const simulation = SIMULATIONS[simName]

    const logger = createRootLogger()

    if (simulation === undefined) {
      logger.log(`could not find simulation ${simName}`)
      this.exit(1)
      return
    }

    CliUx.ux.action.start(`running simulation ${simName}`)

    try {
      await simulation.simulate()
    } catch (e) {
      logger.error(`simulation encountered ${String(e)}, shutting down...`)
    }

    CliUx.ux.action.stop(`stop simulation ${simName}`)
    this.exit(0)
  }
}

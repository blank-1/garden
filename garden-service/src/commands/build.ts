/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import {
  BooleanParameter,
  Command,
  CommandResult,
  CommandParams,
  handleProcessResults,
  StringsParameter,
  PrepareParams,
  ProcessCommandResult,
  processCommandResultSchema,
} from "./base"
import dedent from "dedent"
import { processModules } from "../process"
import { printHeader } from "../logger/util"
import { startServer, GardenServer } from "../server/server"
import { flatten } from "lodash"
import { BuildTask } from "../tasks/build"

const buildArgs = {
  modules: new StringsParameter({
    help: "Specify module(s) to build. Use comma as a separator to specify multiple modules.",
  }),
}

const buildOpts = {
  force: new BooleanParameter({ help: "Force rebuild of module(s)." }),
  watch: new BooleanParameter({
    help: "Watch for changes in module(s) and auto-build.",
    alias: "w",
    cliOnly: true,
  }),
}

type Args = typeof buildArgs
type Opts = typeof buildOpts

export class BuildCommand extends Command<Args, Opts> {
  name = "build"
  help = "Build your modules."

  protected = true
  workflows = true

  description = dedent`
    Builds all or specified modules, taking into account build dependency order.
    Optionally stays running and automatically builds modules if their source (or their dependencies' sources) change.

    Examples:

        garden build            # build all modules in the project
        garden build my-module  # only build my-module
        garden build --force    # force rebuild of modules
        garden build --watch    # watch for changes to code
  `

  arguments = buildArgs
  options = buildOpts

  outputsSchema = () => processCommandResultSchema()

  private server: GardenServer
  private isPersistent = (opts) => !!opts.watch

  async prepare({ headerLog, footerLog, opts }: PrepareParams<Args, Opts>) {
    const persistent = this.isPersistent(opts)

    if (persistent) {
      printHeader(headerLog, "Build", "hammer")
      this.server = await startServer(footerLog)
    }

    return { persistent }
  }

  async action({
    garden,
    log,
    headerLog,
    footerLog,
    args,
    opts,
  }: CommandParams<Args, Opts>): Promise<CommandResult<ProcessCommandResult>> {
    if (!this.isPersistent(opts)) {
      printHeader(headerLog, "Build", "hammer")
    }

    if (this.server) {
      this.server.setGarden(garden)
    }

    await garden.clearBuilds()

    const graph = await garden.getConfigGraph(log)
    const modules = graph.getModules({ names: args.modules })
    const moduleNames = modules.map((m) => m.name)

    const initialTasks = flatten(
      await Bluebird.map(modules, (module) => BuildTask.factory({ garden, graph, log, module, force: opts.force }))
    )

    const results = await processModules({
      garden,
      graph,
      log,
      footerLog,
      modules,
      watch: opts.watch,
      initialTasks,
      changeHandler: async (newGraph, module) => {
        const deps = await newGraph.getDependants({ nodeType: "build", name: module.name, recursive: true })
        const tasks = [module]
          .concat(deps.build)
          .filter((m) => moduleNames.includes(m.name))
          .map((m) => BuildTask.factory({ garden, graph, log, module: m, force: true }))
        return flatten(await Promise.all(tasks))
      },
    })

    return handleProcessResults(footerLog, "build", results)
  }
}

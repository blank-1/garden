/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { readFileSync, writeFileSync } from "fs"
import handlebars from "handlebars"
import { resolve } from "path"
import { GLOBAL_OPTIONS } from "../cli/cli"
import { coreCommands } from "../commands/commands"
import { describeParameters } from "../commands/base"
import { TEMPLATES_DIR, renderConfigReference } from "./config"

export function writeCommandReferenceDocs(docsRoot: string) {
  const referenceDir = resolve(docsRoot, "reference")
  const outputPath = resolve(referenceDir, "commands.md")

  const commands = coreCommands
    .flatMap((cmd) => {
      if (cmd.subCommands && cmd.subCommands.length) {
        return cmd.subCommands
          .map((subCommandCls) => {
            const subCmd = new subCommandCls(cmd)
            return subCmd.hidden ? null : subCmd.describe()
          })
          .filter(Boolean)
      } else {
        return cmd.hidden ? [] : [cmd.describe()]
      }
    })
    .map((desc) => ({
      ...desc,
      outputsYaml: desc.outputsSchema
        ? renderConfigReference(desc.outputsSchema(), {
            normalizeOpts: { renderPatternKeys: true },
            yamlOpts: { renderRequired: false, renderFullDescription: true, renderValue: "none" },
          }).yaml
        : null,
    }))

  const globalOptions = describeParameters(GLOBAL_OPTIONS)

  const templatePath = resolve(TEMPLATES_DIR, "commands.hbs")
  handlebars.registerPartial("argType", "{{#if choices}}{{#each choices}}`{{.}}` {{/each}}{{else}}{{type}}{{/if}}")
  const template = handlebars.compile(readFileSync(templatePath).toString())
  const markdown = template({ commands, globalOptions })

  writeFileSync(outputPath, markdown)
}

/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import _spawn from "cross-spawn"
import { encodeYamlMulti } from "../../util/util"
import { ExecParams, PluginTool } from "../../util/ext-tools"
import { LogEntry } from "../../logger/log-entry"
import { KubernetesProvider } from "./config"
import { KubernetesResource } from "./types"
import { gardenAnnotationKey } from "../../util/string"
import { hashManifest } from "./util"
import { PluginToolSpec } from "../../types/plugin/tools"

export interface ApplyParams {
  log: LogEntry
  provider: KubernetesProvider
  manifests: KubernetesResource[]
  namespace?: string
  dryRun?: boolean
  pruneSelector?: string
  validate?: boolean
}

export const KUBECTL_DEFAULT_TIMEOUT = 300

export async function apply({
  log,
  provider,
  manifests,
  dryRun = false,
  namespace,
  pruneSelector,
  validate = true,
}: ApplyParams) {
  // Hash the raw input and add as an annotation on each manifest (this is helpful beyond kubectl's own annotation,
  // because kubectl applies some normalization/transformation that is sometimes difficult to reason about).
  // Hashing the input prevents "Too long annotation..." errors.
  for (const manifest of manifests) {
    if (!manifest.metadata.annotations) {
      manifest.metadata.annotations = {}
    }
    if (manifest.metadata.annotations[gardenAnnotationKey("manifest-hash")]) {
      delete manifest.metadata.annotations[gardenAnnotationKey("manifest-hash")]
    }
    manifest.metadata.annotations[gardenAnnotationKey("manifest-hash")] = await hashManifest(manifest)
  }

  const input = Buffer.from(encodeYamlMulti(manifests))

  let args = ["apply"]
  dryRun && args.push("--dry-run")
  pruneSelector && args.push("--prune", "--selector", pruneSelector)
  args.push("--output=json", "-f", "-")
  !validate && args.push("--validate=false")

  const result = await kubectl(provider).stdout({ log, namespace, args, input })

  try {
    return JSON.parse(result)
  } catch (_) {
    return result
  }
}

export async function deleteResources({
  log,
  provider,
  namespace,
  resources,
  includeUninitialized = false,
}: {
  log: LogEntry
  provider: KubernetesProvider
  namespace: string
  resources: KubernetesResource[]
  includeUninitialized?: boolean
}) {
  const args = [
    "delete",
    "--wait=true",
    "--ignore-not-found=true",
    ...resources.map((r) => `${r.kind}/${r.metadata.name}`),
  ]

  includeUninitialized && args.push("--include-uninitialized")

  return kubectl(provider).stdout({ namespace, args, log })
}

export async function deleteObjectsBySelector({
  log,
  provider,
  namespace,
  selector,
  objectTypes,
  includeUninitialized = false,
}: {
  log: LogEntry
  provider: KubernetesProvider
  namespace: string
  selector: string
  objectTypes: string[]
  includeUninitialized?: boolean
}) {
  let args = ["delete", objectTypes.join(","), "-l", selector, "--wait=true"]

  includeUninitialized && args.push("--include-uninitialized")

  return kubectl(provider).stdout({ namespace, args, log })
}

interface KubectlParams extends ExecParams {
  log: LogEntry
  namespace?: string
  configPath?: string
  args: string[]
}

interface KubectlSpawnParams extends KubectlParams {
  tty?: boolean
  wait?: boolean
}

export function kubectl(provider: KubernetesProvider) {
  return new Kubectl(provider.tools.kubectl.spec, provider)
}

class Kubectl extends PluginTool {
  constructor(spec: PluginToolSpec, private provider: KubernetesProvider) {
    super(spec)
  }

  async stdout(params: KubectlParams) {
    this.prepareArgs(params)
    return super.stdout(params)
  }

  async exec(params: KubectlParams) {
    this.prepareArgs(params)
    return super.exec(params)
  }

  async spawn(params: KubectlParams) {
    this.prepareArgs(params)
    return super.spawn(params)
  }

  async spawnAndWait(params: KubectlSpawnParams) {
    this.prepareArgs(params)
    return super.spawnAndWait(params)
  }

  async json(params: KubectlParams): Promise<any> {
    if (!params.args.includes("--output=json")) {
      params.args.push("--output=json")
    }

    const result = await this.stdout(params)

    return JSON.parse(result)
  }

  private prepareArgs(params: KubectlParams) {
    const { namespace, configPath, args } = params

    const opts: string[] = [`--context=${this.provider.config.context}`]

    if (this.provider.config.kubeconfig) {
      opts.push(`--kubeconfig=${this.provider.config.kubeconfig}`)
    }

    if (namespace) {
      opts.push(`--namespace=${namespace}`)
    }

    if (configPath) {
      opts.push(`--kubeconfig=${configPath}`)
    }

    params.args = opts.concat(args)
  }
}

export const kubectlSpec: PluginToolSpec = {
  name: "kubectl",
  description: "The official Kubernetes CLI.",
  type: "binary",
  builds: [
    {
      platform: "darwin",
      architecture: "amd64",
      url: "https://storage.googleapis.com/kubernetes-release/release/v1.16.0/bin/darwin/amd64/kubectl",
      sha256: "a81b23abe67e70f8395ff7a3659bea6610fba98cda1126ef19e0a995f0075d54",
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: "https://storage.googleapis.com/kubernetes-release/release/v1.16.0/bin/linux/amd64/kubectl",
      sha256: "4fc8a7024ef17b907820890f11ba7e59a6a578fa91ea593ce8e58b3260f7fb88",
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: "https://storage.googleapis.com/kubernetes-release/release/v1.16.0/bin/windows/amd64/kubectl.exe",
      sha256: "a7e4e527735f5bc49ad80b92f4a9d3bb6aebd129f9a708baac80465ebc33a9bc",
    },
  ],
}

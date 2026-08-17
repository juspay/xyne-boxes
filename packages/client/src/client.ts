import { Effect, FileSystem } from "effect"
import type { PlatformError } from "effect/PlatformError"
import { ensureAuth, type Auth, type AuthHooks } from "./auth.ts"
import {
  type ClientOptions,
  type ResolvedConfig,
  resolveConfig,
} from "./config.ts"
import { AuthError, CommandFailed, MissingTool, UsageError } from "./errors.ts"
import { invalidBoxName } from "./names.ts"
import type { ProcessReq } from "./process.ts"
import {
  controlSsh,
  controlSshOk,
  type SshConfig,
  writeInstanceSshConfig,
} from "./ssh.ts"

export type { ClientOptions, ResolvedConfig } from "./config.ts"
export type { Auth } from "./auth.ts"
export type { SshConfig } from "./ssh.ts"

export interface LaunchResult {
  readonly name: string
}

export type ClientReq = ProcessReq | FileSystem.FileSystem

export type ClientError =
  | UsageError
  | CommandFailed
  | AuthError
  | MissingTool
  | PlatformError

export type { AuthHooks }

const requireName = (name: string): Effect.Effect<string, UsageError> => {
  const bad = invalidBoxName(name)
  if (bad !== undefined) return new UsageError({ message: bad })
  return Effect.succeed(name)
}

export interface LaunchHooks extends AuthHooks {
  readonly onCreating?: () => void
  readonly onWaiting?: () => void
}

export class Client {
  readonly config: ResolvedConfig

  private constructor(config: ResolvedConfig) {
    this.config = config
  }

  static make(options: ClientOptions = {}): Effect.Effect<Client> {
    return Effect.sync(() => new Client(resolveConfig(options)))
  }

  ensureAuth(hooks: AuthHooks = {}): Effect.Effect<Auth, ClientError, ClientReq> {
    return ensureAuth(this.config, hooks)
  }

  create(
    name: string,
    hooks: LaunchHooks = {},
  ): Effect.Effect<LaunchResult, ClientError, ClientReq> {
    const self = this
    return Effect.gen(function* () {
      yield* requireName(name)
      return yield* self.launch(name, ["create", "base-container", name], hooks)
    })
  }

  fork(
    source: string,
    name: string,
    hooks: LaunchHooks = {},
  ): Effect.Effect<LaunchResult, ClientError, ClientReq> {
    const self = this
    return Effect.gen(function* () {
      yield* requireName(source)
      yield* requireName(name)
      return yield* self.launch(name, ["fork", source, name], hooks)
    })
  }

  destroy(
    names: ReadonlyArray<string>,
    hooks: AuthHooks = {},
  ): Effect.Effect<string, ClientError, ClientReq> {
    const self = this
    return Effect.gen(function* () {
      if (names.length === 0) {
        return yield* new UsageError({ message: "destroy requires at least one name" })
      }
      for (const name of names) yield* requireName(name)
      const auth = yield* self.ensureAuth(hooks)
      const listed = yield* controlSsh(self.config, auth, ["destroy", ...names])
      const fs = yield* FileSystem.FileSystem
      for (const name of names) {
        yield* fs.remove(`${self.config.stateDir}/${name}`, { recursive: true, force: true })
      }
      return listed
    })
  }

  list(hooks: AuthHooks = {}): Effect.Effect<string, ClientError, ClientReq> {
    const self = this
    return Effect.gen(function* () {
      const auth = yield* self.ensureAuth(hooks)
      return yield* controlSsh(self.config, auth, ["list"])
    })
  }

  sshConfig(
    name: string,
    hooks: AuthHooks = {},
  ): Effect.Effect<SshConfig, ClientError, ClientReq> {
    const self = this
    return Effect.gen(function* () {
      yield* requireName(name)
      const auth = yield* self.ensureAuth(hooks)
      return yield* writeInstanceSshConfig(self.config, auth, name)
    })
  }

  private launch(
    name: string,
    remote: ReadonlyArray<string>,
    hooks: LaunchHooks,
  ): Effect.Effect<LaunchResult, ClientError, ClientReq> {
    const self = this
    return Effect.gen(function* () {
      const auth = yield* self.ensureAuth(hooks)
      hooks.onCreating?.()
      yield* controlSshOk(self.config, auth, remote)
      hooks.onWaiting?.()
      yield* controlSshOk(self.config, auth, ["wait", name])
      yield* writeInstanceSshConfig(self.config, auth, name)
      return { name }
    })
  }
}

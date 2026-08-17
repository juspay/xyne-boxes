import { Data } from "effect"

export class UsageError extends Data.TaggedError("UsageError")<{
  readonly message: string
}> {}

export class MissingTool extends Data.TaggedError("MissingTool")<{
  readonly tool: string
  readonly hint: string
}> {}

export class CommandFailed extends Data.TaggedError("CommandFailed")<{
  readonly command: string
  readonly args: ReadonlyArray<string>
  readonly exitCode: number
}> {}

export class AuthError extends Data.TaggedError("AuthError")<{
  readonly message: string
  readonly hint?: string
}> {}

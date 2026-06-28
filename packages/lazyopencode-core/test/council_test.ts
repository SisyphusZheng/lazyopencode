import { assert } from "jsr:@std/assert@1"
import { defaultCouncilConfig, formatResults, runCouncil } from "../src/council/index.ts"

Deno.test("council", async () => {
  // ---------------------------------------------------------------------------
  // 1. Default config
  // ---------------------------------------------------------------------------
  console.log("\n=== 1. Default config ===")
  const def = defaultCouncilConfig()
  assert(def.default_preset === "default", "default_preset name")
  assert(def.timeout === 180_000, "default timeout 180s")
  assert(def.execution_mode === "parallel", "default parallel")
  assert(def.retries === 2, "default retries")
  assert(def.enabled === true, "default enabled")
  assert(def.eligibility === "guarded", "default guarded eligibility")
  assert(def.maxCouncillors === 3, "default max councillors")
  assert(typeof def.presets === "object", "presets empty object")

  // ---------------------------------------------------------------------------
  // 2. Custom config
  // ---------------------------------------------------------------------------
  console.log("\n=== 2. Custom config ===")
  const custom = defaultCouncilConfig({
    default_preset: "deep",
    timeout: 60_000,
    execution_mode: "serial",
    retries: 0,
    eligibility: "always",
    maxCouncillors: 2,
    presets: {
      deep: {
        "reasoner": { model: "openai/o3", prompt: "You reason deeply." },
        "critic": { model: "anthropic/claude-opus-4" },
      },
      quick: {
        "checker": { model: "openai/gpt-4o-mini" },
      },
    },
  })
  assert(custom.default_preset === "deep", "custom default_preset")
  assert(custom.timeout === 60_000, "custom timeout")
  assert(custom.execution_mode === "serial", "custom serial")
  assert(custom.retries === 0, "custom retries")
  assert(custom.eligibility === "always", "custom eligibility")
  assert(custom.maxCouncillors === 2, "custom max councillors")
  assert(custom.presets.deep.reasoner.model === "openai/o3", "custom preset model")
  assert(custom.presets.deep.critic.prompt === undefined, "optional prompt omitted")

  // ---------------------------------------------------------------------------
  // 3. resolvePreset — missing explicit preset fails closed
  // ---------------------------------------------------------------------------
  console.log("\n=== 3. Preset resolution ===")
  const none = defaultCouncilConfig()
  const result = await runCouncil("test", null, none, "deep", "parent-1")
  assert(result.success === false, "missing explicit preset fails")
  assert(result.error?.includes("not found"), "clear missing preset error")

  // ---------------------------------------------------------------------------
  // 4. Format results — all success
  // ---------------------------------------------------------------------------
  console.log("\n=== 4. Format results ===")
  const formatted = formatResults("What is 2+2?", [
    { name: "alice", status: "success", result: "4" },
    { name: "bob", status: "success", result: "4" },
  ])
  assert(formatted.includes("Council Results"), "heading")
  assert(formatted.includes("Councillors: 2"), "councillor count")
  assert(formatted.includes("Estimated model calls: 2"), "estimated model calls")
  assert(formatted.includes("What is 2+2?"), "question")
  assert(formatted.includes("## alice"), "alice section")
  assert(formatted.includes("## bob"), "bob section")
  assert(formatted.includes("Synthesis Required"), "synthesis prompt")
  assert(formatted.includes("Status: success"), "success status")

  // ---------------------------------------------------------------------------
  // 5. Format results — mixed status
  // ---------------------------------------------------------------------------
  console.log("\n=== 5. Format mixed results ===")
  const mixed = formatResults("Review code", [
    { name: "alice", status: "success", result: "LGTM" },
    { name: "bob", status: "error", error: "Timeout" },
    { name: "carol", status: "timeout", error: "Took too long" },
  ])
  assert(mixed.includes("Status: success"), "alice success")
  assert(mixed.includes("Status: error"), "bob error")
  assert(mixed.includes("Timeout"), "bob error msg")
  assert(mixed.includes("Status: timeout"), "carol timeout")

  // ---------------------------------------------------------------------------
  // 6. Empty results handling
  // ---------------------------------------------------------------------------
  console.log("\n=== 6. Empty results ===")
  const empty = formatResults("?", [])
  assert(empty.includes("Synthesis Required"), "empty still produces synthesis header")
  const sections = empty.match(/^## [A-Z]/gm)
  assert(
    sections === null || sections.every((s) => !s.includes("alice") && !s.includes("bob")),
    "no councillor sections for empty",
  )

  // ---------------------------------------------------------------------------
  // 7. Budget guard
  // ---------------------------------------------------------------------------
  console.log("\n=== 7. Budget guard ===")
  const disabled = await runCouncil("test", null, defaultCouncilConfig({ enabled: false }))
  assert(disabled.success === false, "disabled council fails closed")
  assert(disabled.error?.includes("disabled"), "disabled error message")

  const tooMany = await runCouncil(
    "test",
    null,
    defaultCouncilConfig({
      maxCouncillors: 1,
      presets: {
        crowded: {
          a: { model: "" },
          b: { model: "" },
        },
      },
    }),
    "crowded",
  )
  assert(tooMany.success === false, "too many councillors blocked")
  assert(tooMany.error?.includes("maxCouncillors"), "budget guard error message")

  const serialThrows = await runCouncil(
    "test",
    null,
    defaultCouncilConfig({
      execution_mode: "serial",
      presets: { one: { a: { model: "" } } },
    }),
    "one",
  )
  assert(serialThrows.success === false, "serial client errors are captured")
  assert(serialThrows.councillorResults[0]?.status === "error", "serial error result formatted")
})

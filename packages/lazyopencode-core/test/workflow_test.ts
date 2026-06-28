import { assertEquals } from "jsr:@std/assert@1"
import { classifyWorkflow } from "../src/hooks/workflow-classifier.ts"

Deno.test("workflow-classifier", () => {
  assertEquals(classifyWorkflow({ text: "what is lazy primary" }).level, "trivial")
  assertEquals(classifyWorkflow({ text: "fix typo in README" }).action, "allow")

  const medium = classifyWorkflow({ text: "implement a new settings feature across the app" })
  assertEquals(medium.level, "medium")
  assertEquals(medium.action, "nudge")

  const risky = classifyWorkflow({ text: "change auth permissions for production users" })
  assertEquals(risky.level, "high_risk")
  assertEquals(risky.action, "block")

  const ambiguous = classifyWorkflow({ text: "全面优化这个项目" })
  assertEquals(ambiguous.level, "ambiguous")
  assertEquals(ambiguous.action, "block")

  const bypassEn = classifyWorkflow({ text: "change auth permissions just do it" })
  assertEquals(bypassEn.bypassedByUser, true)
  assertEquals(bypassEn.action, "allow")

  const bypassZh = classifyWorkflow({ text: "全面优化这个项目 直接做" })
  assertEquals(bypassZh.bypassedByUser, true)
  assertEquals(bypassZh.action, "allow")

  assertEquals(
    classifyWorkflow({ text: "implement a new settings feature", mode: "strict" }).action,
    "block",
  )
  assertEquals(classifyWorkflow({ text: "change auth permissions", mode: "coach" }).action, "nudge")
  assertEquals(classifyWorkflow({ text: "change auth permissions", mode: "off" }).action, "allow")

  // W-1: "delete a log line" should NOT be high_risk
  assertEquals(classifyWorkflow({ text: "delete a log line" }).level, "small")
  // W-1: "delete the users table" should STILL be high_risk
  assertEquals(classifyWorkflow({ text: "delete the users table" }).level, "high_risk")
  // W-1: "drop database" should STILL be high_risk
  assertEquals(classifyWorkflow({ text: "drop the database" }).level, "high_risk")

  // W-2: questions not matching other patterns are still trivial
  assertEquals(classifyWorkflow({ text: "is this correct?" }).level, "trivial")
  assertEquals(classifyWorkflow({ text: "is there a simpler way to write this?" }).level, "trivial")
})

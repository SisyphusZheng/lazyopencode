export type WorkflowLevel =
  | "trivial"
  | "small"
  | "medium"
  | "high_risk"
  | "ambiguous"

export type WorkflowStage =
  | "grill"
  | "specify"
  | "plan"
  | "build"
  | "review"
  | "simplify"
  | "debug"

export type LazyMode = "off" | "coach" | "governor" | "strict"

export interface WorkflowDecision {
  level: WorkflowLevel
  action: "allow" | "nudge" | "block"
  requiredStages: WorkflowStage[]
  reason: string
  bypassedByUser: boolean
  suggestedCommand?: string
}

export interface ClassifierInput {
  text: string
  mode?: LazyMode
}

const BYPASS_PATTERNS = [
  /\bjust do it\b/i,
  /\bskip plan\b/i,
  /\bno questions\b/i,
  /\bdo it directly\b/i,
  /直接做/,
  /别问/,
  /不用计划/,
  /跳过计划/,
]

const HIGH_RISK_PATTERNS = [
  /\bauth(entication|orization)?\b/i,
  /\bsecurity\b/i,
  /\bpermission(s)?\b/i,
  /\bpayment(s)?\b/i,
  /\bmigration\b/i,
  /\bdelete\b.*\b(table|column|schema|migration|database|production|user|account|payment|index|role|permission|policy)\b/i,
  /\bdrop\b.*\b(table|column|database|schema|index|view|role|user)\b/i,
  /\bsecret(s)?\b/i,
  /\btoken(s)?\b/i,
  /\bproduction\b/i,
  /\bdeploy(ment)?\b/i,
  /\bconcurren(cy|t)\b/i,
  /\bbroad refactor\b/i,
  /权限/,
  /认证/,
  /安全/,
  /支付/,
  /迁移/,
  /删除/,
  /生产/,
  /部署/,
  /密钥/,
]

const AMBIGUOUS_PATTERNS = [
  /\bmake (it )?better\b/i,
  /\bclean up everything\b/i,
  /\boptimi[sz]e (this|the project|everything)\b/i,
  /\bfix this\b/i,
  /全面优化/,
  /全面改造/,
  /优化一下/,
  /改好一点/,
  /整理一下/,
]

const MEDIUM_PATTERNS = [
  /\bmulti[- ]file\b/i,
  /\brefactor\b/i,
  /\bimplement\b/i,
  /\bfeature\b/i,
  /\bchange behavior\b/i,
  /\badd\b/i,
  /\bbuild\b/i,
  /实现/,
  /新增/,
  /重构/,
  /多个文件/,
]

const TRIVIAL_PATTERNS = [
  /\bwhat is\b/i,
  /\bexplain\b/i,
  /\bwhy\b/i,
  /\btypo\b/i,
  /\brename\b/i,
  /\bone[- ]line\b/i,
  /是什么/,
  /解释/,
  /为什么/,
  /拼写/,
]

export function classifyWorkflow(input: ClassifierInput): WorkflowDecision {
  const text = input.text.trim()
  const mode = input.mode ?? "governor"
  const bypassedByUser = BYPASS_PATTERNS.some((p) => p.test(text))
  const level = detectLevel(text)
  const requiredStages = stagesForLevel(level)
  const action = chooseAction(level, mode, bypassedByUser)
  const reason = reasonForLevel(level)

  return {
    level,
    action,
    requiredStages,
    reason,
    bypassedByUser,
    suggestedCommand: suggestedCommand(level),
  }
}

export function formatWorkflowDecision(decision: WorkflowDecision): string {
  if (decision.action === "allow") {
    return `[Lazy scope: ${decision.level}. ${decision.reason} Next: ${
      decision.suggestedCommand ?? "proceed with ponytail discipline"
    }.]`
  }
  if (decision.action === "nudge") {
    return `[Lazy nudge: ${decision.level}. ${decision.reason} Suggested next step: ${decision.suggestedCommand}.]`
  }
  return `[Lazy gate: ${decision.level}. ${decision.reason} Need scope, success criteria, and must-not-break list. Say "just do it" to bypass.]`
}

function detectLevel(text: string): WorkflowLevel {
  if (!text) return "ambiguous"
  if (HIGH_RISK_PATTERNS.some((p) => p.test(text))) return "high_risk"
  if (AMBIGUOUS_PATTERNS.some((p) => p.test(text))) return "ambiguous"
  if (MEDIUM_PATTERNS.some((p) => p.test(text))) return "medium"
  if (TRIVIAL_PATTERNS.some((p) => p.test(text))) return "trivial"
  if (
    text.length < 200 &&
    /\b(why|what|how|when|where|does|is|are|can|could|should|would)\b.*\?/i.test(text)
  ) return "trivial"
  if (text.length < 80) return "small"
  return "medium"
}

function chooseAction(
  level: WorkflowLevel,
  mode: LazyMode,
  bypassedByUser: boolean,
): WorkflowDecision["action"] {
  if (mode === "off" || bypassedByUser) return "allow"
  if (mode === "coach") return level === "trivial" || level === "small" ? "allow" : "nudge"
  if (mode === "strict") {
    return level === "medium" || level === "high_risk" || level === "ambiguous" ? "block" : "allow"
  }
  if (level === "high_risk" || level === "ambiguous") return "block"
  if (level === "medium") return "nudge"
  return "allow"
}

function stagesForLevel(level: WorkflowLevel): WorkflowStage[] {
  switch (level) {
    case "trivial":
      return []
    case "small":
      return ["build", "review"]
    case "medium":
      return ["plan", "build", "review", "simplify"]
    case "high_risk":
      return ["grill", "specify", "plan", "build", "review", "simplify"]
    case "ambiguous":
      return ["grill", "specify", "plan"]
  }
}

function reasonForLevel(level: WorkflowLevel): string {
  switch (level) {
    case "trivial":
      return "Tiny or explanatory task; no workflow gate needed."
    case "small":
      return "Bounded task; build and verify directly."
    case "medium":
      return "Behavior change needs a short plan and review closure."
    case "high_risk":
      return "Risky area needs alignment before implementation."
    case "ambiguous":
      return "Broad or vague scope needs sharpening before implementation."
  }
}

function suggestedCommand(level: WorkflowLevel): string {
  switch (level) {
    case "trivial":
      return "answer directly"
    case "small":
      return "lazy/build"
    case "medium":
      return "lazy/plan"
    case "high_risk":
      return "lazy/grill"
    case "ambiguous":
      return "lazy/grill"
  }
}

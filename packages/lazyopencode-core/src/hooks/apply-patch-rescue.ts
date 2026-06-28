/**
 * Hunk offset fixup — rescues apply_patch when the LLM hallucinates line numbers.
 * ponytail: prefix/suffix context matching via substring containment, no full diff parser.
 */
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"

export function createApplyPatchRescueHook() {
  return async (
    input: { tool: string; sessionID: string; callID: string },
    output: { args: Record<string, unknown> },
  ) => {
    if (input.tool !== "apply_patch") return

    const args = output.args
    const filePath = args?.file_path as string | undefined
    const patchContent = args?.content as string | undefined
    if (!filePath || !patchContent) return

    if (!existsSync(filePath)) return

    let fileContents: string
    try {
      fileContents = await readFile(filePath, "utf-8")
    } catch {
      return
    }

    const fileLines = fileContents.split("\n")
    const fixedPatch = fixHunkOffsets(patchContent, fileLines)
    if (fixedPatch !== patchContent) {
      output.args = { ...args, content: fixedPatch }
    }
  }
}

// ---------------------------------------------------------------------------
// Hunk offset fixup
// ---------------------------------------------------------------------------

function fixHunkOffsets(patchContent: string, fileLines: string[]): string {
  const lines = patchContent.split("\n")
  const hunkHeaders = lines.filter((line) => line.startsWith("@@")).length
  if (hunkHeaders !== 1) return patchContent
  const result: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const hunkMatch = line.match(
      /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@\s*(.*)/,
    )
    if (!hunkMatch) {
      result.push(line)
      i++
      continue
    }

    const oldStart = parseInt(hunkMatch[1], 10)
    const oldCount = hunkMatch[2]
    const newStart = parseInt(hunkMatch[3], 10)
    const newCount = hunkMatch[4]
    const section = hunkMatch[5]
    if (oldStart !== newStart) return patchContent

    // Collect hunk body — lines between header and next @@ or EOF
    const bodyLines: string[] = []
    i++
    while (i < lines.length && !lines[i].startsWith("@@")) {
      bodyLines.push(lines[i])
      i++
    }

    if (bodyLines.length === 0) {
      result.push(line)
      continue
    }

    const adjustedStart = findBestMatch(fileLines, bodyLines, oldStart)
    if (adjustedStart === -1) {
      // No match — leave hunk alone
      result.push(line)
      result.push(...bodyLines)
      continue
    }

    const header = `@@ -${adjustedStart},${oldCount} +${adjustedStart},${newCount} @@` +
      (section ? ` ${section}` : "")
    result.push(header)
    result.push(...bodyLines)
  }

  return result.join("\n")
}

// ---------------------------------------------------------------------------
// Context matching
// ---------------------------------------------------------------------------

function findBestMatch(
  fileLines: string[],
  hunkBody: string[],
  estLine: number,
): number {
  const prefix = getFirstContextLine(hunkBody)
  const suffix = getLastContextLine(hunkBody)

  // Try prefix first
  if (prefix) {
    const match = findLineNear(fileLines, prefix, estLine)
    if (match !== -1) return match
  }

  // Try suffix if different from prefix
  if (suffix && suffix !== prefix) {
    const match = findLineNear(fileLines, suffix, estLine)
    if (match !== -1) return match
  }

  return -1
}

/**
 * First non-empty line in hunk body that is context (not + or - prefixed).
 */
function getFirstContextLine(body: string[]): string | null {
  for (const line of body) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith("+") || trimmed.startsWith("-")) continue
    return trimmed
  }
  return null
}

/**
 * Last non-empty line in hunk body that is context (not + or - prefixed).
 */
function getLastContextLine(body: string[]): string | null {
  for (let i = body.length - 1; i >= 0; i--) {
    const trimmed = body[i].trim()
    if (!trimmed) continue
    if (trimmed.startsWith("+") || trimmed.startsWith("-")) continue
    return trimmed
  }
  return null
}

/**
 * Search +/- 50 lines of estLine (1-indexed) for a line containing `search`.
 * Returns 1-indexed line number or -1.
 */
function findLineNear(
  fileLines: string[],
  search: string,
  estLine: number,
): number {
  const estLine0 = estLine - 1
  const searchStart = Math.max(0, estLine0 - 50)
  const searchEnd = Math.min(fileLines.length, estLine0 + 50)

  let bestIndex = -1
  let bestDist = Infinity
  for (let i = searchStart; i < searchEnd; i++) {
    if (fileLines[i].trim() === search.trim() || fileLines[i].includes(search)) {
      const dist = Math.abs(i - estLine0)
      if (dist < bestDist) {
        bestDist = dist
        bestIndex = i
      }
    }
  }
  return bestIndex === -1 ? -1 : bestIndex + 1
}

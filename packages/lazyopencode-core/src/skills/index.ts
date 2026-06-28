import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

/**
 * Returns the absolute path to the lazy skills directory.
 * Registered in config.skills.paths so OpenCode discovers them.
 */
export function getSkillsDir(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  return join(__dirname, "lazy/")
}

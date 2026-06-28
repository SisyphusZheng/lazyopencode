/**
 * Session lifecycle hooks — cleanup, reconciliation, and state tracking.
 *
 * ponytail: minimal lifecycle. Only track what affects job board integrity.
 */

import { jobBoard } from "./background-job-board.js"
import type { LazyRuntime } from "./runtime.js"
import { rm } from "node:fs/promises"
import { join } from "node:path"

/**
 * Combined session event hook — dispatches on event.type.
 * SDK only supports "event" as a single hook, not per-event-type hooks.
 */
export function createSessionEventsHook(
  rememberFn: (sid: string) => string[],
  runtime?: LazyRuntime,
) {
  return async (input: {
    event: { type: string; properties?: Record<string, unknown> }
  }) => {
    const evt = input.event

    switch (evt.type) {
      // --- session.idle — reconcile all terminal jobs ---
      case "session.idle": {
        const sid = evt.properties?.sessionID as string | undefined
        if (!sid) return
        const taskIDs = rememberFn(sid)
        for (const tid of taskIDs) {
          ;(runtime?.jobBoard ?? jobBoard).markReconciled(tid)
        }
        runtime?.recordEvent("reconcile", `Reconciled ${taskIDs.length} terminal jobs for ${sid}.`)
        await runtime?.save()
        return
      }

      // --- session.compacted — record compaction event ---
      case "session.compacted": {
        const sid = evt.properties?.sessionID as string | undefined
        if (sid) {
          runtime?.recordEvent("compaction", `Session ${sid} compacted.`)
          await runtime?.save()
        }
        return
      }

      // --- session.created — nothing to initialize yet ---
      case "session.created":
        return

      // --- session.deleted / session.error — cleanup ---
      case "session.deleted":
      case "session.error": {
        const sid = (evt.properties?.sessionID as string | undefined) ??
          ((evt.properties?.info as Record<string, unknown> | undefined)
            ?.id as string | undefined)
        if (!sid) return
        ;(runtime?.jobBoard ?? jobBoard).dropSession(sid)
        runtime?.sessionAgentMap.delete(sid)
        runtime?.sessionDepth.delete(sid)
        // Use same base as processImageAttachments (runtime.scope.projectRoot or cwd)
        const baseDir = runtime?.scope.projectRoot ?? process.cwd()
        const imagesDir = join(baseDir, ".opencode", "lazy", "images", sid)
        rm(imagesDir, { recursive: true, force: true }).catch((err) => {
          console.error("[session-events] failed to cleanup images:", err)
        })
        await runtime?.save()
        return
      }
    }
  }
}

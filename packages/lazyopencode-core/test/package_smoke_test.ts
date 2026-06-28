import { assert, assertEquals } from "jsr:@std/assert@1"

Deno.test("package smoke", async () => {
  const mod = await import("../dist/index.js")

  assert(typeof mod.default === "function", "default plugin export exists")
  assert(typeof mod.LazyOpenCodePlugin === "function", "LazyOpenCodePlugin export exists")
  assert(typeof mod.LazyOpenCodePluginV1 === "function", "LazyOpenCodePluginV1 export exists")
  assertEquals(mod.default, mod.LazyOpenCodePluginV1, "default export stays legacy adapter")
  assertEquals(
    mod.LazyOpenCodePlugin,
    mod.LazyOpenCodePluginV1,
    "named plugin stays legacy adapter",
  )
  assertEquals(mod.LazyOpenCodeV2Plugin?.id, "lazyopencode-core", "v2 named export is present")
})

# Preview resource loading

## Overlap independent preparation, not script execution

The public resolver used to finish linked stylesheet inlining before starting script
packaging. Script entries then fetched one at a time. Public linked CSS and script
entries now start together, and independent external script entries are packaged
concurrently for both targets. This removes additive fetch waits when the shared
loader has free slots; nested imports still have their own dependency critical path.

All preparation happens in an inert parsed document. Script nodes stay in authored
order with their original attributes. Each module entry retains its own visited
map and depth traversal; completed module maps merge in authored order, not fetch
completion order. Inline module rewriting still follows that merge. Import-map
placement and replacement rules are unchanged.

## Embedded styles

Private embedded styles used to await each preceding style's imports and assets.
They now inline independently without moving style nodes, preserving cascade
order. Public embedded styles only rewrite URLs: they do not preload imports, so
parallelizing their loop would not remove network waits. Private top-level stages
(stylesheets, embedded styles, attributes, scripts) are otherwise unchanged.

## Keep the existing loader

No new cache, scheduler, or persistent state was added. All fetches still use the
same concurrency slots, request deduplication, resource/total byte limits, output
limit, abort signal, and private GitHub-session transport. Under a total-byte limit,
which resource survives can depend on completion order; the byte cap still holds.

## Check with deferred responses

Regression tests hold every independent response until all corresponding requests
have started, then release them out of order. They verify script/style output order,
authored module-map merge order, shared-dependency deduplication, private transport,
slot release at concurrency two, and the total-byte cap across concurrent results.
These are concurrency proofs, not wall-clock performance claims. Existing resource,
output-limit, abort, and large-document checks remain in place.

Verified with `corepack pnpm test` (extension build and 80 tests) and
`corepack pnpm exec tsc --noEmit`. The public deferred-start test times out
against the original serial resolver and passes with the concurrent resolver.

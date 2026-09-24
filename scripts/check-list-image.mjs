import assert from 'node:assert'
import { register } from 'node:module'

register('./ts-extension-hook.mjs', import.meta.url)

const { canvasHeight } = await import('../src/listImage.ts')

assert.ok(canvasHeight(0, true) > 0, 'an empty list still gets a canvas tall enough for the heading and empty message')
assert.ok(canvasHeight(10, true) > canvasHeight(1, true), 'height grows with more rows')
assert.ok(canvasHeight(10, true) > canvasHeight(10, false), 'rows with covers take more vertical space than text-only rows')

console.log('list image checks passed')

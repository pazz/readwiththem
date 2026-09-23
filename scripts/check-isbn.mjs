import assert from 'node:assert'
import { isValidISBN13 } from '../src/isbn.ts'

assert.strictEqual(isValidISBN13('9781845025038'), true, 'The Gruffalo ISBN should be valid')
assert.strictEqual(isValidISBN13('9781845025037'), false, 'wrong check digit should fail')
assert.strictEqual(isValidISBN13('123'), false, 'wrong length should fail')
assert.strictEqual(isValidISBN13('978-1-84502-503-8'), true, 'hyphens should be stripped before checking')

console.log('isbn checks passed')

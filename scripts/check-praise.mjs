import assert from 'node:assert'
import { PRAISE_MESSAGES, pickPraise } from '../src/praise.ts'

assert.strictEqual(PRAISE_MESSAGES.length, 20, 'exactly twenty cheeky messages — bump this if you add or remove one')
for (const msg of PRAISE_MESSAGES) {
  assert.ok(msg.includes('{title}'), `every message must include the {title} placeholder: "${msg}"`)
}
assert.strictEqual(new Set(PRAISE_MESSAGES).size, PRAISE_MESSAGES.length, 'no duplicate messages')

const first = pickPraise('The Gruffalo')
assert.ok(first.message.includes('The Gruffalo'), 'pickPraise substitutes the given title into the message')
assert.ok(!first.message.includes('{title}'), 'the placeholder token never leaks into the shown message')
assert.ok(PRAISE_MESSAGES.includes(first.template), 'the returned template is one of the real messages')

// Over many draws, every message should turn up at least once — catches an
// off-by-one in the random index that would silently always skip an entry.
const seen = new Set()
for (let i = 0; i < 500; i++) seen.add(pickPraise('X').template)
assert.strictEqual(seen.size, PRAISE_MESSAGES.length, 'every message can actually be picked')

// The actual point of avoidTemplate: chain 200 picks, each excluding the
// last one's template, and check none of them repeat their immediate
// predecessor — whatever the title, so a re-read of the same book counts too.
let previous = pickPraise('Book A').template
for (let i = 0; i < 200; i++) {
  const next = pickPraise(i % 2 === 0 ? 'Book A' : 'Book B', previous)
  assert.notStrictEqual(next.template, previous, `same template picked twice in a row at step ${i}`)
  previous = next.template
}

console.log('praise message checks passed')

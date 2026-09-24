// Cheeky, low-key congratulations shown after logging a reading — aimed at the
// parent, not the child, since they're the one who showed up. Edit this list
// directly to add, remove or reword one; nothing else needs to change to pick
// it up. The "{title}" placeholder is filled in with the book's title.
export const PRAISE_MESSAGES: string[] = [
  'Well done! Another reading of "{title}" safely logged.',
  '"{title}" logged. Gold star for you, not just them.',
  'Nice one, "{title}" is in the books.',
  'Reading hero strikes again: "{title}" done.',
  'Logged: "{title}". Future bookworm, thanks to you.',
  '"{title}" read and logged. Go treat yourself, you\'ve earned it.',
  'Another one down. "{title}" logged, parenting win banked.',
  'Top marks: "{title}" logged. Carry on being brilliant.',
  '"{title}" logged. Quietly, you\'re smashing this.',
  'Bedtime story champion strikes again. "{title}" logged.',
  '"{title}" ticked off. Someone\'s smashing this parenting lark.',
  'Look at you, reading "{title}" like an absolute legend.',
  '"{title}" logged. Future you will thank present you.',
  'Story time win: "{title}" is done and dusted.',
  '"{title}" logged. Extra biscuit privileges unlocked.',
  'Consider "{title}" officially conquered. Nice work.',
  '"{title}" read together. That\'s a proper win, that is.',
  'Logged and loved: "{title}". Keep it up, champion.',
  '"{title}" done. You\'re absolutely nailing this.',
  'Another chapter of brilliant parenting: "{title}" logged.',
]

// The template itself is what must not repeat, not just the filled-in message
// — logging two different books back to back with the same joke would still
// feel like hearing it twice. Pass back the previous call's `template` as
// `avoidTemplate` to rule it out of this pick.
export interface Praise {
  template: string
  message: string
}

export function pickPraise(title: string, avoidTemplate?: string): Praise {
  const pool = avoidTemplate ? PRAISE_MESSAGES.filter((m) => m !== avoidTemplate) : PRAISE_MESSAGES
  // Only empty if avoidTemplate excluded everything, i.e. there's just one
  // message in the whole list — fall back to the full list rather than throw.
  const source = pool.length > 0 ? pool : PRAISE_MESSAGES
  const template = source[Math.floor(Math.random() * source.length)]
  return { template, message: template.replace('{title}', title) }
}

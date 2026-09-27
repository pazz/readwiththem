export function isValidISBN13(isbn: string): boolean {
  const digits = isbn.replace(/[^0-9]/g, '')
  if (digits.length !== 13) return false
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3)
  const check = (10 - (sum % 10)) % 10
  return check === Number(digits[12])
}

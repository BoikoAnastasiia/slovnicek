// Slovak noun declension for counters: 1 → singular, 2-4 → "few" plural,
// 0/5+ → "many" (genitive) plural. e.g. plural(3, ['slovo', 'slová', 'slov']) === 'slová'
export function plural(n: number, forms: [one: string, few: string, many: string]): string {
  const [one, few, many] = forms
  if (n === 1) return one
  if (n >= 2 && n <= 4) return few
  return many
}

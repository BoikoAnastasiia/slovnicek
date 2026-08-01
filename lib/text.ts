import type { WordRow } from './types'

export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function answersMatch(expected: string, input: string): boolean {
  const e = fold(expected)
  return e !== '' && e === fold(input)
}

export function glossVariants(s: string): string[] {
  return s.split(/[,;/]/).map(fold).filter(Boolean)
}

export function glossesOverlap(a: string, b: string): boolean {
  const vb = new Set(glossVariants(b))
  return glossVariants(a).some((v) => vb.has(v))
}

export function matchesQuery(w: WordRow, q: string): boolean {
  const needle = fold(q)
  if (!needle) return true
  const haystack = [w.slovak, w.translation_ru, w.definition_sk, w.notes, ...w.tags]
  return haystack.some((f) => fold(f).includes(needle))
}

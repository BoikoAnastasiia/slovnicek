import type { WordRow } from './types'

export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function answersMatch(expected: string, input: string): boolean {
  const e = fold(expected)
  return e !== '' && e === fold(input)
}

export interface DiffSegment {
  char: string
  status: 'ok' | 'wrong' | 'missing'
}

// Levenshtein alignment over folded characters, so diacritic-only differences count as matches.
export function diffAnswer(typed: string, expected: string): DiffSegment[] {
  const t = [...typed]
  const e = [...expected]
  const same = (a: string, b: string) => fold(a) === fold(b)
  const d: number[][] = Array.from({ length: t.length + 1 }, () => new Array(e.length + 1).fill(0))
  for (let i = 0; i <= t.length; i++) d[i][0] = i
  for (let j = 0; j <= e.length; j++) d[0][j] = j
  for (let i = 1; i <= t.length; i++) {
    for (let j = 1; j <= e.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j - 1] + (same(t[i - 1], e[j - 1]) ? 0 : 1),
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
      )
    }
  }
  const out: DiffSegment[] = []
  let i = t.length
  let j = e.length
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (same(t[i - 1], e[j - 1]) ? 0 : 1)) {
      out.push({ char: t[i - 1], status: same(t[i - 1], e[j - 1]) ? 'ok' : 'wrong' })
      i--; j--
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      out.push({ char: t[i - 1], status: 'wrong' })
      i--
    } else {
      out.push({ char: '·', status: 'missing' })
      j--
    }
  }
  return out.reverse()
}

function editDistance(a: string, b: string): number {
  return diffAnswer(a, b).filter((s) => s.status !== 'ok').length
}

export function closestAnswer(typed: string, answers: string[]): string {
  let best = answers[0]
  let bestDist = Infinity
  for (const a of answers) {
    const dist = editDistance(fold(typed), fold(a))
    if (dist < bestDist) { bestDist = dist; best = a }
  }
  return best
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

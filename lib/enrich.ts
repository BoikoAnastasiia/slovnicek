import type { Enrichment } from './types'

interface WiktiDef {
  partOfSpeech?: string
  language?: string
  definitions?: { definition?: string; parsedExamples?: { example?: string }[] }[]
}

const strip = (html: string) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()

async function fetchDefs(host: string, word: string, fetchFn: typeof fetch): Promise<Record<string, WiktiDef[]> | null> {
  try {
    const res = await fetchFn(
      `https://${host}/api/rest_v1/page/definition/${encodeURIComponent(word)}`,
      { headers: { accept: 'application/json' } },
    )
    if (!res.ok) return null
    return (await res.json()) as Record<string, WiktiDef[]>
  } catch {
    return null
  }
}

export async function enrich(word: string, fetchFn: typeof fetch = fetch): Promise<Enrichment> {
  const [en, sk] = await Promise.all([
    fetchDefs('en.wiktionary.org', word, fetchFn),
    fetchDefs('sk.wiktionary.org', word, fetchFn),
  ])
  const out: Enrichment = {}

  const enSlovak = Object.values(en ?? {}).flat().filter((e) => e.language === 'Slovak')
  const first = enSlovak[0]
  if (first?.partOfSpeech) out.part_of_speech = first.partOfSpeech.toLowerCase()
  const gloss = strip(first?.definitions?.[0]?.definition ?? '')
  if (gloss) out.notes = `EN: ${gloss}`
  const examples = enSlovak
    .flatMap((e) => e.definitions ?? [])
    .flatMap((d) => d.parsedExamples ?? [])
    .map((x) => strip(x.example ?? ''))
    .filter(Boolean)
    .slice(0, 2)
  if (examples.length) out.examples = examples

  const skDefs = Object.values(sk ?? {}).flat()
  const skFirst = strip(skDefs[0]?.definitions?.[0]?.definition ?? '')
  if (skFirst) out.definition_sk = skFirst

  return out
}

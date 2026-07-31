import { describe, expect, it } from 'vitest'
import { enrich } from '@/lib/enrich'

const EN_FIXTURE = {
  sk: [{
    partOfSpeech: 'Noun',
    language: 'Slovak',
    definitions: [{
      definition: '<span>trust</span>, confidence',
      parsedExamples: [{ example: '<i>Mám k nemu plnú dôveru.</i>' }],
    }],
  }],
}
const SK_FIXTURE = {
  sk: [{
    partOfSpeech: 'podstatné meno',
    language: 'slovenčina',
    definitions: [{ definition: 'pevné presvedčenie o <b>spoľahlivosti</b> niekoho' }],
  }],
}

function fakeFetch(byHost: Record<string, unknown>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input)
    const host = Object.keys(byHost).find((h) => url.includes(h))
    if (!host) return new Response('not found', { status: 404 })
    return new Response(JSON.stringify(byHost[host]), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
}

describe('enrich', () => {
  it('extracts POS, EN gloss note and examples from en.wiktionary, SK definition from sk.wiktionary', async () => {
    const out = await enrich('dôvera', fakeFetch({ 'en.wiktionary.org': EN_FIXTURE, 'sk.wiktionary.org': SK_FIXTURE }))
    expect(out.part_of_speech).toBe('noun')
    expect(out.notes).toBe('EN: trust, confidence')
    expect(out.examples).toEqual(['Mám k nemu plnú dôveru.'])
    expect(out.definition_sk).toBe('pevné presvedčenie o spoľahlivosti niekoho')
  })
  it('returns partial data when one source 404s', async () => {
    const out = await enrich('dôvera', fakeFetch({ 'en.wiktionary.org': EN_FIXTURE }))
    expect(out.part_of_speech).toBe('noun')
    expect(out.definition_sk).toBeUndefined()
  })
  it('returns {} when everything fails', async () => {
    const failing = (async () => { throw new Error('offline') }) as unknown as typeof fetch
    expect(await enrich('dôvera', failing)).toEqual({})
  })
  it('ignores non-Slovak sections on en.wiktionary', async () => {
    const out = await enrich('most', fakeFetch({
      'en.wiktionary.org': { en: [{ partOfSpeech: 'Adverb', language: 'English', definitions: [{ definition: 'most' }] }] },
    }))
    expect(out.part_of_speech).toBeUndefined()
  })
})

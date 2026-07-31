import { describe, expect, it } from 'vitest'
import { plural } from '@/lib/plural'

describe('plural', () => {
  it('picks the singular form for 1', () => {
    expect(plural(1, ['slovo', 'slová', 'slov'])).toBe('slovo')
  })

  it('picks the "few" form for 2-4', () => {
    expect(plural(2, ['slovo', 'slová', 'slov'])).toBe('slová')
    expect(plural(3, ['slovo', 'slová', 'slov'])).toBe('slová')
    expect(plural(4, ['slovo', 'slová', 'slov'])).toBe('slová')
  })

  it('picks the "many" (genitive) form for 0 and 5+', () => {
    expect(plural(0, ['slovo', 'slová', 'slov'])).toBe('slov')
    expect(plural(5, ['slovo', 'slová', 'slov'])).toBe('slov')
    expect(plural(7, ['slovo', 'slová', 'slov'])).toBe('slov')
    expect(plural(21, ['slovo', 'slová', 'slov'])).toBe('slov')
  })

  it('works for bod/body/bodov and deň/dni/dní', () => {
    expect(plural(1, ['bod', 'body', 'bodov'])).toBe('bod')
    expect(plural(3, ['bod', 'body', 'bodov'])).toBe('body')
    expect(plural(49, ['bod', 'body', 'bodov'])).toBe('bodov')
    expect(plural(1, ['deň', 'dni', 'dní'])).toBe('deň')
    expect(plural(2, ['deň', 'dni', 'dní'])).toBe('dni')
    expect(plural(7, ['deň', 'dni', 'dní'])).toBe('dní')
  })
})

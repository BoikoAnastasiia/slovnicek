'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import sk from '@/messages/sk.json'
import ru from '@/messages/ru.json'
import en from '@/messages/en.json'

const MESSAGES = { sk, ru, en } as const
export type Locale = keyof typeof MESSAGES
export const LOCALES: Locale[] = ['sk', 'ru', 'en']

const LocaleContext = createContext<{ locale: Locale; setLocale: (l: Locale) => void }>({
  locale: 'sk',
  setLocale: () => {},
})

export const useAppLocale = () => useContext(LocaleContext)

export default function LocaleProvider({ children }: { children: React.ReactNode }) {
  // Server HTML is always rendered in 'sk'; the stored locale is applied after
  // mount so hydration sees identical markup.
  const [locale, setLocaleState] = useState<Locale>('sk')

  useEffect(() => {
    const saved = localStorage.getItem('locale')
    if (saved && (LOCALES as string[]).includes(saved)) setLocaleState(saved as Locale)
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  function setLocale(l: Locale) {
    setLocaleState(l)
    localStorage.setItem('locale', l)
  }

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="Europe/Bratislava">
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  )
}

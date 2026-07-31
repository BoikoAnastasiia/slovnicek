export function getSkVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null
  return speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('sk')) ?? null
}

export function ttsAvailable(): boolean {
  return getSkVoice() !== null
}

export function speakSk(text: string): void {
  const voice = getSkVoice()
  if (!voice) return
  const u = new SpeechSynthesisUtterance(text)
  u.voice = voice
  u.lang = voice.lang
  u.rate = 0.9
  speechSynthesis.cancel()
  speechSynthesis.speak(u)
}

export function onVoicesReady(cb: () => void): void {
  if (typeof speechSynthesis === 'undefined') return
  if (speechSynthesis.getVoices().length > 0) cb()
  else speechSynthesis.addEventListener('voiceschanged', () => cb(), { once: true })
}

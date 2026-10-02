// Phase-end alerts: a short tone made with Web Audio (no audio file) and a
// system notification.

let ctx: AudioContext | null = null

/** Must run inside a user gesture (the Start click) so playback is allowed later. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {}
}

export function beep() {
  if (!ctx) return
  const t = ctx.currentTime
  for (const offset of [0, 0.25, 0.5]) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, t + offset)
    gain.gain.exponentialRampToValueAtTime(0.08, t + offset + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.15)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t + offset)
    osc.stop(t + offset + 0.16)
  }
}

export async function requestNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'default') return
  try {
    await Notification.requestPermission()
  } catch {}
}

export async function notify(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    if (reg) await reg.showNotification(title, { body, tag: 'edu-timer', icon: '/icons/icon-192.png' })
    else new Notification(title, { body, tag: 'edu-timer', icon: '/icons/icon-192.png' })
  } catch {}
}

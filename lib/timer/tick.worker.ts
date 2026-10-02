// Ticks from a dedicated worker: hidden tabs throttle main-thread timers to
// once a minute, but messages from a worker still arrive on time.

let id: ReturnType<typeof setInterval> | null = null

self.onmessage = (e: MessageEvent<'start' | 'stop'>) => {
  if (e.data === 'start' && id === null) id = setInterval(() => self.postMessage(Date.now()), 250)
  if (e.data === 'stop' && id !== null) {
    clearInterval(id)
    id = null
  }
}

// Environment signals: time oscillators, pointer and microphone.
import { noise2 } from "./frame"
import type { Lfo, SignalId } from "./scene/types"

export type Signals = Record<SignalId, number>

export const signalInfo: Record<SignalId, { name: string; group: string; bipolar: boolean }> = {
  lfo1: { name: "Ритм 1", group: "Время", bipolar: true },
  lfo2: { name: "Ритм 2", group: "Время", bipolar: true },
  lfo3: { name: "Ритм 3", group: "Время", bipolar: true },
  lfo4: { name: "Ритм 4", group: "Время", bipolar: true },
  pointerX: { name: "Курсор X", group: "Курсор", bipolar: true },
  pointerY: { name: "Курсор Y", group: "Курсор", bipolar: true },
  pointerNear: { name: "Близость курсора", group: "Курсор", bipolar: false },
  pointerSpeed: { name: "Скорость курсора", group: "Курсор", bipolar: false },
  pointerDown: { name: "Нажатие", group: "Курсор", bipolar: false },
  micLevel: { name: "Громкость", group: "Микрофон", bipolar: false },
  micLow: { name: "Низкие частоты", group: "Микрофон", bipolar: false },
  micHigh: { name: "Высокие частоты", group: "Микрофон", bipolar: false },
}

export const lfoShapes: Record<Lfo["shape"], string> = {
  sine: "Синус",
  triangle: "Треугольник",
  noise: "Шум",
  pulse: "Пульс",
}

/** Oscillator value in −1…1. */
export function lfoValue(l: Lfo, time: number, seed = 0) {
  const ph = time * l.rate + l.phase
  switch (l.shape) {
    case "sine":
      return Math.sin(ph * Math.PI * 2)
    case "triangle": {
      const f = ph - Math.floor(ph)
      return 1 - 4 * Math.abs(f - 0.5)
    }
    case "pulse": {
      // Smooth pulse: a quick rise and a slow fall, like a heartbeat.
      const f = ph - Math.floor(ph)
      return f < 0.12 ? -1 + (2 * f) / 0.12 : 1 - 2 * Math.min(1, (f - 0.12) / 0.5)
    }
    case "noise":
      return (noise2(ph * 2, seed * 13.7) - 0.5) * 2
  }
}

export const emptySignals = (): Signals => ({
  lfo1: 0,
  lfo2: 0,
  lfo3: 0,
  lfo4: 0,
  pointerX: 0,
  pointerY: 0,
  pointerNear: 0,
  pointerSpeed: 0,
  pointerDown: 0,
  micLevel: 0,
  micLow: 0,
  micHigh: 0,
})

export type MicState = "off" | "requesting" | "on" | "denied" | "error" | "unsupported"

/** Microphone analyser. Audio never leaves the browser and is not recorded. */
export class MicInput {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private analyser: AnalyserNode | null = null
  private freq: Uint8Array<ArrayBuffer> = new Uint8Array(0)
  private wave: Uint8Array<ArrayBuffer> = new Uint8Array(0)
  gain = 1
  level = 0
  low = 0
  high = 0

  static supported() {
    return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia
  }

  async start(): Promise<MicState> {
    if (!MicInput.supported()) return "unsupported"
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
    } catch (e) {
      const name = (e as DOMException)?.name
      return name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error"
    }
    try {
      this.ctx = new AudioContext()
      if (this.ctx.state === "suspended") await this.ctx.resume().catch(() => {})
      const src = this.ctx.createMediaStreamSource(this.stream)
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 1024
      this.analyser.smoothingTimeConstant = 0.6
      src.connect(this.analyser)
      this.freq = new Uint8Array(this.analyser.frequencyBinCount)
      this.wave = new Uint8Array(this.analyser.fftSize)
      return "on"
    } catch {
      this.stop()
      return "error"
    }
  }

  /** Updates level / low / high with attack-release smoothing. */
  read(dt: number) {
    if (!this.analyser || !this.ctx) {
      this.level = this.low = this.high = 0
      return
    }
    this.analyser.getByteTimeDomainData(this.wave)
    let sum = 0
    for (const v of this.wave) sum += ((v - 128) / 128) ** 2
    const rms = Math.sqrt(sum / this.wave.length)
    this.analyser.getByteFrequencyData(this.freq)
    const hz = this.ctx.sampleRate / 2 / this.freq.length
    let lo = 0,
      loN = 0,
      hi = 0,
      hiN = 0
    this.freq.forEach((v, i) => {
      const f = i * hz
      if (f > 30 && f < 250) {
        lo += v
        loN++
      } else if (f > 2000 && f < 9000) {
        hi += v
        hiN++
      }
    })
    const target = {
      level: Math.min(1, rms * 4 * this.gain),
      low: Math.min(1, (lo / Math.max(loN, 1) / 255) * 1.4 * this.gain),
      high: Math.min(1, (hi / Math.max(hiN, 1) / 255) * 2.2 * this.gain),
    }
    const ease = (cur: number, to: number) =>
      cur + (to - cur) * (1 - Math.exp(-dt * (to > cur ? 30 : 6)))
    this.level = ease(this.level, target.level)
    this.low = ease(this.low, target.low)
    this.high = ease(this.high, target.high)
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.ctx?.close().catch(() => {})
    this.stream = null
    this.ctx = null
    this.analyser = null
    this.level = this.low = this.high = 0
  }
}

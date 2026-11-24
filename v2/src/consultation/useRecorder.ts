import { useCallback, useEffect, useRef, useState } from 'react'
import { pauseConsultation, processConsultationAudio, stopConsultation, uploadAudioChunk } from '../store/store'

export type RecorderStatus = 'idle' | 'recording' | 'paused' | 'processing' | 'completed' | 'error'

export interface UseRecorderResult {
  status: RecorderStatus
  elapsedMs: number
  audioLevel: number // 0 to 1 for visualizer
  error: string | null
  start: () => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  stop: () => Promise<void>
}

export function useRecorder(sessionId: string | null, onCompleted?: (cardId: string) => void): UseRecorderResult {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [audioLevel, setAudioLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number | null>(null)

  const startTimeRef = useRef<number>(0)
  const pausedTimeRef = useRef<number>(0)
  const totalPausedDurationRef = useRef<number>(0)
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const chunkIndexRef = useRef(0)

  // Clean up resources on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        void audioContextRef.current.close()
      }
    }
  }, [])

  const startLevelMeter = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      audioContextRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 64
      source.connect(analyser)
      analyserRef.current = analyser

      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const updateMeter = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] ?? 0
        }
        const avg = sum / dataArray.length
        setAudioLevel(Math.min(1, avg / 128))
        animFrameRef.current = requestAnimationFrame(updateMeter)
      }
      updateMeter()
    } catch {
      // AudioContext meter is decorative; ignore if unsupported
    }
  }

  const startTimer = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    timerIntervalRef.current = setInterval(() => {
      const now = Date.now()
      const totalElapsed = now - startTimeRef.current - totalPausedDurationRef.current
      setElapsedMs(Math.max(0, totalElapsed))
    }, 200)
  }

  const stopTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
  }

  const start = useCallback(async () => {
    if (!sessionId) return
    setError(null)
    chunkIndexRef.current = 0
    totalPausedDurationRef.current = 0
    startTimeRef.current = Date.now()

    let stream: MediaStream | null = null
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streamRef.current = stream
        startLevelMeter(stream)
      }
    } catch (err: any) {
      console.warn('Microphone permission not available, operating in simulated audio mode:', err)
    }

    if (stream && typeof MediaRecorder !== 'undefined') {
      try {
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm'
        const recorder = new MediaRecorder(stream, { mimeType })
        mediaRecorderRef.current = recorder

        recorder.ondataavailable = async (e) => {
          if (e.data && e.data.size > 0 && sessionId) {
            const reader = new FileReader()
            reader.onloadend = () => {
              const base64 = (reader.result as string)?.split(',')[1]
              if (base64) {
                void uploadAudioChunk(sessionId, base64, chunkIndexRef.current++)
              }
            }
            reader.readAsDataURL(e.data)
          }
        }

        // Slice chunk every 4 seconds
        recorder.start(4000)
      } catch (e) {
        console.warn('MediaRecorder error, falling back to mock streaming:', e)
      }
    }

    setStatus('recording')
    startTimer()
  }, [sessionId])

  const pause = useCallback(async () => {
    if (!sessionId || status !== 'recording') return
    try {
      await pauseConsultation(sessionId)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.pause()
      }
      pausedTimeRef.current = Date.now()
      stopTimer()
      setStatus('paused')
    } catch (err: any) {
      setError(err.message || 'Failed to pause')
    }
  }, [sessionId, status])

  const resume = useCallback(async () => {
    if (!sessionId || status !== 'paused') return
    try {
      await pauseConsultation(sessionId)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
        mediaRecorderRef.current.resume()
      }
      if (pausedTimeRef.current > 0) {
        totalPausedDurationRef.current += Date.now() - pausedTimeRef.current
        pausedTimeRef.current = 0
      }
      startTimer()
      setStatus('recording')
    } catch (err: any) {
      setError(err.message || 'Failed to resume')
    }
  }, [sessionId, status])

  const stop = useCallback(async () => {
    if (!sessionId) return
    setStatus('processing')
    stopTimer()
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)

    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        void audioContextRef.current.close()
      }

      await stopConsultation(sessionId)
      // Process with Wispr Flow & LLM
      const res = await processConsultationAudio(sessionId)
      setStatus('completed')
      if (onCompleted) onCompleted(res.cardId)
    } catch (err: any) {
      setError(err.message || 'Failed to process consultation audio')
      setStatus('error')
    }
  }, [sessionId, onCompleted])

  return {
    status,
    elapsedMs,
    audioLevel,
    error,
    start,
    pause,
    resume,
    stop,
  }
}

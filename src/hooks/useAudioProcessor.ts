import { useRef, useEffect, useState, useCallback } from 'react'

interface SpeakerData {
  id: string
  name: string
  amplitude: number
  isActive: boolean
  features?: any
}

interface DiarizationResult {
  segments: Array<{
    id: string
    speaker: string
    startTime: number
    endTime: number
    duration: number
  }>
  speakers: Array<{
    id: string
    name: string
    segmentCount: number
    totalDuration: number
    color: string
  }>
  duration: number
  totalSpeakers: number
}

interface AudioProcessorHook {
  isListening: boolean
  speakers: SpeakerData[]
  startListening: () => Promise<void>
  stopListening: () => void
  reset: () => void
  error: string | null
  selectAudioFile: () => Promise<void>
  diarizationResult: DiarizationResult | null
  isProcessing: boolean
  audioFile: File | null
}

export function useAudioProcessor(): AudioProcessorHook {
  const [isListening, setIsListening] = useState(false)
  const [speakers, setSpeakers] = useState<SpeakerData[]>([])
  const [error, setError] = useState<string | null>(null)
  const [diarizationResult, setDiarizationResult] = useState<DiarizationResult | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  
  const workerRef = useRef<Worker | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioBufferRef = useRef<AudioBuffer | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const messageIdRef = useRef(0)
  const pendingMessagesRef = useRef<Map<number, any>>(new Map())

  const initWorker = useCallback(() => {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      return null
    }

    try {
      const workerUrl = new URL('/audio-worker.js', window.location.origin)
      const worker = new Worker(workerUrl)
      
      worker.onmessage = (e) => {
        const { type, id, data, error: workerError } = e.data
        
        if (type === 'result') {
          const resolve = pendingMessagesRef.current.get(id)
          if (resolve) {
            resolve(data)
            pendingMessagesRef.current.delete(id)
          }
        } else if (type === 'error') {
          const reject = pendingMessagesRef.current.get(id)
          if (reject) {
            reject(new Error(workerError))
            pendingMessagesRef.current.delete(id)
          }
        }
      }
      
      worker.onerror = () => {
        setError('音频处理器出错')
      }
      
      return worker
    } catch (err) {
      return null
    }
  }, [])

  const sendMessage = useCallback((type: string, data: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker未初始化'))
        return
      }
      
      const id = messageIdRef.current++
      pendingMessagesRef.current.set(id, { resolve, reject })
      
      workerRef.current.postMessage({ type, data, id })
      
      setTimeout(() => {
        if (pendingMessagesRef.current.has(id)) {
          pendingMessagesRef.current.delete(id)
          reject(new Error('音频处理中，请稍候'))
        }
      }, 10000)
    })
  }, [])

  const selectAudioFile = useCallback(async (): Promise<void> => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return Promise.reject(new Error('此功能仅在浏览器中可用'))
    }
    
    return new Promise((resolve, reject) => {
      const fileInput = document.createElement('input')
      fileInput.type = 'file'
      fileInput.accept = 'audio/*'
      fileInput.style.display = 'none'
      
      fileInput.onchange = async (event) => {
        const file = (event.target as HTMLInputElement).files?.[0]
        if (!file) {
          reject(new Error('未选择文件'))
          return
        }
        
        try {
          await loadAudioFile(file)
          resolve()
        } catch (err) {
          reject(err)
        } finally {
          document.body.removeChild(fileInput)
        }
      }
      
      fileInput.oncancel = () => {
        document.body.removeChild(fileInput)
        reject(new Error('用户取消选择'))
      }
      
      document.body.appendChild(fileInput)
      fileInput.click()
    })
  }, [])

  const loadAudioFile = useCallback(async (file: File) => {
    try {
      setIsProcessing(true)
      setError(null)
      setAudioFile(file)

      const formData = new FormData()
      formData.append('audio', file)

      const response = await fetch('/api/diarization', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        let errorMessage = '说话人识别失败'
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch {
          errorMessage = `服务器错误 (${response.status}): ${response.statusText}`
        }
        throw new Error(errorMessage)
      }

      let result
      try {
        result = await response.json()
      } catch {
        throw new Error('服务器返回了无效的响应格式')
      }

      if (!result.success) {
        throw new Error(result.error || '说话人识别失败')
      }

      setDiarizationResult(result.data)

      const speakerData: SpeakerData[] = result.data.speakers.map((speaker: any) => ({
        id: speaker.id,
        name: speaker.name,
        amplitude: 0.5,
        isActive: false,
      }))

      setSpeakers(speakerData)
      setError(null)
      setIsProcessing(false)

    } catch (err) {
      setError(err instanceof Error ? err.message : '音频文件加载失败')
      setIsProcessing(false)
      throw err
    }
  }, [])

  const playAudioFile = useCallback(() => {
    if (!audioContextRef.current || !audioBufferRef.current || !analyserRef.current) {
      return
    }
    
    if (sourceRef.current) {
      sourceRef.current.stop()
      sourceRef.current.disconnect()
    }
    
    sourceRef.current = audioContextRef.current.createBufferSource()
    sourceRef.current.buffer = audioBufferRef.current
    sourceRef.current.connect(analyserRef.current)
    analyserRef.current.connect(audioContextRef.current.destination)
    
    sourceRef.current.start(0)
    
    sourceRef.current.onended = () => {
      stopListening()
    }
  }, [])

  const processAudio = useCallback(async () => {
    if (typeof window === 'undefined') {
      return
    }
    if (!analyserRef.current || !workerRef.current || !isListening) {
      return
    }
    try {
      const bufferLength = analyserRef.current.frequencyBinCount
      const dataArray = new Float32Array(bufferLength)
      analyserRef.current.getFloatTimeDomainData(dataArray)
      
      const result = await sendMessage('process', Array.from(dataArray))
      
      if (result) {
        setSpeakers(prev => prev.map(speaker => ({
          ...speaker,
          amplitude: speaker.id === result.speakerId ? result.amplitude : speaker.amplitude * 0.95,
          isActive: speaker.id === result.speakerId ? result.amplitude > 0.3 : false,
          features: speaker.id === result.speakerId ? result.features : speaker.features
        })))
      }
      
    } catch (err) {
      console.error('Audio processing error:', err)
    }
    
    if (isListening && typeof window !== 'undefined') {
      animationFrameRef.current = requestAnimationFrame(processAudio)
    }
  }, [isListening, sendMessage])

  const startListening = useCallback(async () => {
    if (isListening) return
    
    try {
      setIsListening(true)
      await selectAudioFile()
      setIsListening(false)
      setError(null)
      
    } catch (err) {
      setIsListening(false)
      if (err instanceof Error && err.message !== '用户取消选择') {
        setError(err instanceof Error ? err.message : '开始监听失败')
      }
    }
  }, [isListening, selectAudioFile, playAudioFile])

  const stopListening = useCallback(() => {
    setIsListening(false)
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    
    if (sourceRef.current) {
      try {
        sourceRef.current.stop()
        sourceRef.current.disconnect()
      } catch (e) {
        console.error('Error stopping audio source:', e)
      }
      sourceRef.current = null
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
    }
    
    audioBufferRef.current = null
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    if (isListening && analyserRef.current) {
      animationFrameRef.current = requestAnimationFrame(processAudio)
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isListening, processAudio])

  useEffect(() => {
    return () => {
      stopListening()
    }
  }, [stopListening])

  const reset = useCallback(() => {
    stopListening()
    setSpeakers([])
    setDiarizationResult(null)
    setError(null)
    setIsProcessing(false)
    setAudioFile(null)
  }, [stopListening])

  return {
    isListening,
    speakers,
    startListening,
    stopListening,
    reset,
    error,
    selectAudioFile,
    diarizationResult,
    isProcessing,
    audioFile,
  }
}
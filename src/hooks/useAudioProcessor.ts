import { useRef, useEffect, useState, useCallback } from 'react'

interface SpeakerData {
  id: string
  name: string
  amplitude: number
  isActive: boolean
  features?: any
}

interface DiarizationResult {
  sentences: Array<{
    id: string
    speaker: string
    text: string
    startTime: number
    endTime: number
    confidence: number
  }>
  speakers: Array<{
    id: string
    name: string
    utteranceCount: number
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
  performance: {
    fps: number
    processingTime: number
  }
  selectAudioFile: () => Promise<void>
  diarizationResult: DiarizationResult | null
  isProcessing: boolean
  audioFile: File | null
}

export function useAudioProcessor(): AudioProcessorHook {
  const [isListening, setIsListening] = useState(false)
  const [speakers, setSpeakers] = useState<SpeakerData[]>([])
  const [error, setError] = useState<string | null>(null)
  const [performance, setPerformance] = useState({ fps: 0, processingTime: 0 })
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
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // 初始化WebWorker
  const initWorker = useCallback(() => {
    if (typeof Worker === 'undefined') {
      setError('当前环境不支持WebWorker')
      return null
    }

    try {
      const worker = new Worker('/audio-worker.js')
      
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
        } else if (type === 'performance') {
          setPerformance(data)
        }
      }
      
      worker.onerror = (error) => {
        console.error('Worker error:', error)
        setError('音频处理器出错')
      }
      
      return worker
    } catch (err) {
      setError('无法初始化音频处理器')
      return null
    }
  }, [])

  // 发送消息到Worker
  const sendMessage = useCallback((type: string, data: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker未初始化'))
        return
      }
      
      const id = messageIdRef.current++
      pendingMessagesRef.current.set(id, { resolve, reject })
      
      workerRef.current.postMessage({ type, data, id })
      
      // 超时处理
      setTimeout(() => {
        if (pendingMessagesRef.current.has(id)) {
          pendingMessagesRef.current.delete(id)
          reject(new Error('音频处理中，请稍候'))
        }
      }, 10000)
    })
  }, [])

  // 选择音频文件
  const selectAudioFile = useCallback(async (): Promise<void> => {
    return new Promise((resolve, reject) => {
      // 创建文件输入元素
      const fileInput = document.createElement('input')
      fileInput.type = 'file'
      fileInput.accept = 'audio/*' // 支持所有音频格式
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

  // 加载音频文件
  const loadAudioFile = useCallback(async (file: File) => {
    try {
      setIsProcessing(true)
      setError(null)
      setAudioFile(file) // Store the audio file

      // Upload file to API for diarization
      const formData = new FormData()
      formData.append('audio', file)

      const response = await fetch('/api/diarization', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || '说话人识别失败')
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || '说话人识别失败')
      }

      // Store diarization result
      setDiarizationResult(result.data)

      // Create speaker data from API response
      const speakerData: SpeakerData[] = result.data.speakers.map((speaker: any) => ({
        id: speaker.id,
        name: speaker.name,
        amplitude: 0.5, // Default amplitude
        isActive: false,
      }))

      setSpeakers(speakerData)
      setError(null)
      setIsProcessing(false)

    } catch (err) {
      console.error('音频文件加载失败:', err)
      setError(err instanceof Error ? err.message : '音频文件加载失败')
      setIsProcessing(false)
      throw err
    }
  }, [])

  // 播放音频文件
  const playAudioFile = useCallback(() => {
    if (!audioContextRef.current || !audioBufferRef.current || !analyserRef.current) {
      return
    }
    
    // 停止之前的播放
    if (sourceRef.current) {
      sourceRef.current.stop()
      sourceRef.current.disconnect()
    }
    
    // 创建新的音频源
    sourceRef.current = audioContextRef.current.createBufferSource()
    sourceRef.current.buffer = audioBufferRef.current
    sourceRef.current.connect(analyserRef.current)
    analyserRef.current.connect(audioContextRef.current.destination)
    
    // 开始播放
    sourceRef.current.start(0)
    
    // 播放结束处理
    sourceRef.current.onended = () => {
      stopListening()
    }
  }, [])

  // 处理音频数据
  const processAudio = useCallback(async () => {
    if (!analyserRef.current || !workerRef.current || !isListening) {
      return
    }
    
    try {
      const bufferLength = analyserRef.current.frequencyBinCount
      const dataArray = new Float32Array(bufferLength)
      analyserRef.current.getFloatTimeDomainData(dataArray)
      
      // 发送数据到Worker处理
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
      console.error('音频处理失败:', err)
    }
    
    // 继续下一帧
    if (isListening) {
      animationFrameRef.current = requestAnimationFrame(processAudio)
    }
  }, [isListening, sendMessage])

  // 开始监听
  const startListening = useCallback(async () => {
    if (isListening) return
    
    try {
      setIsListening(true) // Show ink ripple animation
      await selectAudioFile()
      setIsListening(false) // Processing complete, hide ink animation
      setError(null)
      
      // TODO: 暂时跳过音频播放，等待后端处理管道完成后再启用
      // 延迟播放，让用户看到墨晕动画
      // setTimeout(() => {
      //   playAudioFile()
      // }, 1000)
      
    } catch (err) {
      setIsListening(false)
      if (err instanceof Error && err.message !== '用户取消选择') {
        setError(err instanceof Error ? err.message : '开始监听失败')
      }
    }
  }, [isListening, selectAudioFile, playAudioFile])

  // 停止监听
  const stopListening = useCallback(() => {
    setIsListening(false)
    
    // 停止动画
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    
    // 停止音频播放
    if (sourceRef.current) {
      try {
        sourceRef.current.stop()
        sourceRef.current.disconnect()
      } catch (e) {
        // 忽略已停止的错误
      }
      sourceRef.current = null
    }
    
    // 关闭音频上下文
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    
    // 终止Worker
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
    }
    
    // Note: Don't clear speakers or diarization results - keep them for display
    // Only clear when user explicitly resets
    audioBufferRef.current = null
  }, [])

  // 监听状态变化
  useEffect(() => {
    if (isListening && analyserRef.current) {
      animationFrameRef.current = requestAnimationFrame(processAudio)
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isListening, processAudio])

  // 清理资源
  useEffect(() => {
    return () => {
      stopListening()
    }
  }, [stopListening])

  // 重置所有数据
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
    performance,
    selectAudioFile,
    diarizationResult,
    isProcessing,
    audioFile,
  }
}
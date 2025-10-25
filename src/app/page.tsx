'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAudioProcessor } from '@/hooks/useAudioProcessor'

interface Notification {
  id: string
  message: string
  type: 'error' | 'info'
}

interface Segment {
  id: string
  speaker: string
  startTime: number
  endTime: number
  duration: number
  color: string
}

export default function LingZhu() {
  const [showBamboo, setShowBamboo] = useState(false)
  const [highContrast, setHighContrast] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(180)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioFileRef = useRef<File | null>(null)
  
  const { isListening, speakers, startListening, stopListening, reset, error, diarizationResult, isProcessing, audioFile } = useAudioProcessor()
  const segments = diarizationResult?.segments.map(s => ({
    ...s,
    color: diarizationResult.speakers.find(sp => sp.name === s.speaker)?.color || '#276b4d'
  })) || []

  const actualDuration = diarizationResult?.duration || duration

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission)
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          setNotificationPermission(permission)
        })
      }
    }
  }, [])

  const showBrowserNotification = useCallback((title: string, body: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(title, {
        body,
        icon: '/favicon-32x32.png',
        badge: '/favicon-32x32.png',
        tag: 'lingzhu-notification',
        requireInteraction: false,
      })
      
      notification.onclick = () => {
        window.focus()
        notification.close()
      }
      
      setTimeout(() => {
        notification.close()
      }, 5000)
    }
  }, [])

  useEffect(() => {
    if (diarizationResult && speakers.length > 0) {
      showBrowserNotification('聆竹 - 识别完成', `已识别${diarizationResult.totalSpeakers}位说话人，共${diarizationResult.segments.length}个片段`)
    }
  }, [diarizationResult, speakers, showBrowserNotification])

  useEffect(() => {
    if (audioFile && !audioRef.current) {
      const audio = new Audio()
      const blobUrl = URL.createObjectURL(audioFile)
      audio.src = blobUrl
      audioRef.current = audio

      audio.addEventListener('loadedmetadata', () => {
        setDuration(audio.duration)
      })

      audio.addEventListener('timeupdate', () => {
        setCurrentTime(audio.currentTime)
      })

      audio.addEventListener('ended', () => {
        setIsPlaying(false)
        setCurrentTime(0)
      })

      audio.addEventListener('error', (e) => {
        console.error('Audio loading error:', e)
        addNotification('音频文件加载失败', 'error')
      })

      return () => {
        audio.pause()
        audio.src = ''
        URL.revokeObjectURL(blobUrl)
      }
    }
  }, [audioFile])

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }, [])

  const addNotification = useCallback((message: string, type: 'error' | 'info' = 'error') => {
    const id = Date.now().toString()
    setNotifications(prev => [...prev, { id, message, type }])
    
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }, 5000)
  }, [])

  useEffect(() => {
    if (error) {
      addNotification(error, 'error')
    }
  }, [error])

  const togglePlayPause = useCallback(() => {
    if (!audioRef.current) return

    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying])

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value)
    setCurrentTime(newTime)
    
    if (audioRef.current) {
      audioRef.current.currentTime = newTime
    }
  }, [])

  const handleStartListening = useCallback(async () => {
    try {
      await startListening()
      setTimeout(() => {
        setShowBamboo(true)
      }, 800)
    } catch (err) {
      console.error('Failed to start listening:', err)
    }
  }, [startListening])

  const handleReset = useCallback(() => {
    if (audioRef.current) {
      const currentAudio = audioRef.current
      currentAudio.pause()
      currentAudio.currentTime = 0
      const currentSrc = currentAudio.src
      currentAudio.src = ''
      if (currentSrc && currentSrc.startsWith('blob:')) {
        URL.revokeObjectURL(currentSrc)
      }
      audioRef.current = null
    }
    
    reset()
    setShowBamboo(false)
    setIsPlaying(false)
    setCurrentTime(0)
  }, [reset])

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault()
        if (showBamboo && audioRef.current) {
          togglePlayPause()
        } else if (!isListening && !isProcessing) {
          handleStartListening()
        }
      }
      
      if (e.key === 'Enter') {
        e.preventDefault()
        if (!showBamboo && !isListening && !isProcessing) {
          handleStartListening()
        }
      }
      
      if (e.key === 'Escape') {
        handleReset()
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [isListening, showBamboo, isProcessing, isPlaying])

  return (
    <div className={`min-h-screen bg-background font-sans-body transition-all duration-300 ${highContrast ? 'high-contrast' : ''}`}>
      {/* 主容器 */}
      <main className="relative w-full h-screen flex flex-col items-center justify-center overflow-hidden">
        
        <header className="absolute top-8 left-0 right-0 text-center">
          <h1 className="font-serif-title text-4xl md:text-6xl text-foreground breathing">
            聆竹
          </h1>
          <p className="mt-2 text-sm md:text-base text-muted-foreground">
            听声辨人 · 气若幽兰
          </p>
          
          <div className="absolute top-15 left-0 right-0 flex flex-col items-center gap-2 pointer-events-none">
            <AnimatePresence>
              {notifications.map((notification) => (
                <motion.div
                  key={notification.id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 0.7, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className={`px-4 py-2 rounded-lg text-sm max-w-md text-center backdrop-blur-sm notification-glass ${
                    notification.type === 'error' ? 'notification-glass.error' : 'notification-glass.info'
                  }`}
                >
                  {notification.message}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </header>

        <div className="absolute top-8 right-8 flex flex-col gap-4">
          <button
            onClick={() => setHighContrast(!highContrast)}
            className="px-4 py-2 text-sm bg-secondary text-secondary-foreground rounded-lg hover:bg-accent transition-colors"
            aria-label="切换高对比模式"
          >
            {highContrast ? '标准模式' : '高对比模式'}
          </button>
        </div>

        <div className="relative flex items-center justify-center">
          
          {!showBamboo && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ 
                scale: isListening || isProcessing ? [1, 1.1, 1] : 1,
                opacity: 1 
              }}
              transition={{ 
                duration: isListening || isProcessing ? 2 : 0.5,
                repeat: isListening || isProcessing ? Infinity : 0,
                ease: "easeInOut"
              }}
              className="relative cursor-pointer"
              onClick={handleStartListening}
              role="button"
              tabIndex={0}
              aria-label="选择音频文件"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleStartListening()
                }
              }}
            >
              {(isListening || isProcessing) && (
                <motion.div
                  animate={{ 
                    scale: [0.8, 2],
                    opacity: [0.9, 0]
                  }}
                  transition={{ 
                    duration: 2, 
                    ease: "easeOut",
                    repeat: Infinity,
                    repeatType: "loop"
                  }}
                  className="absolute inset-0 bg-foreground rounded-full blur-xl"
                />
              )}
              
              <div className="relative z-10 w-32 h-32 md:w-48 md:h-48 flex items-center justify-center bg-card rounded-full border-4 border-foreground shadow-2xl gpu-layer">
                <span className="font-serif-title text-5xl md:text-7xl text-foreground">
                  听
                </span>
              </div>
            </motion.div>
          )}

          {showBamboo && speakers.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1 }}
              className="w-full max-w-6xl px-4"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.3 }}
                className="mb-8 bg-gradient-to-b from-[#1a0f08] to-[#12402c] p-6 rounded-2xl shadow-2xl border border-[#276b4d]/30"
              >
                <div className="flex items-center gap-4">
                  <button
                    onClick={togglePlayPause}
                    className="w-12 h-12 rounded-full bg-[#276b4d] hover:bg-[#2d7a56] transition-colors flex items-center justify-center shadow-lg"
                    aria-label={isPlaying ? '暂停' : '播放'}
                  >
                    {isPlaying ? (
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    )}
                  </button>

                  <span className="font-mono-cn text-sm text-[#b8d6b6] min-w-[3rem]">
                    {formatTime(currentTime)}
                  </span>

                  <div className="flex-1 relative h-8 flex items-center">
                    <input
                      type="range"
                      min="0"
                      max={actualDuration}
                      step="0.1"
                      value={currentTime}
                      onChange={handleSliderChange}
                      className="w-full bamboo-slider"
                      style={{
                        background: `linear-gradient(to right, #276b4d 0%, #276b4d ${(currentTime / actualDuration) * 100}%, #12402c ${(currentTime / actualDuration) * 100}%, #12402c 100%)`
                      }}
                    />
                  </div>

                  <span className="font-mono-cn text-sm text-[#b8d6b6] min-w-[3rem]">
                    {formatTime(actualDuration)}
                  </span>
                </div>
              </motion.div>

              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {segments.map((segment, index) => {
                  const isActive = currentTime >= segment.startTime && currentTime <= segment.endTime
                  
                  return (
                    <motion.div
                      key={segment.id}
                      initial={{ opacity: 0, x: -30, rotateY: 90 }}
                      animate={{ opacity: 1, x: 0, rotateY: 0 }}
                      transition={{ 
                        duration: 0.6,
                        delay: index * 0.08,
                        ease: "easeOut"
                      }}
                      className={`relative bg-gradient-to-r from-[#f5f1e8] to-[#ede8dc] border-l-4 rounded-r-lg shadow-md transition-all duration-300 ${
                        isActive 
                          ? 'border-l-[#276b4d] shadow-lg shadow-[#276b4d]/20 scale-[1.02]' 
                          : 'border-l-[#d4c5a9] hover:shadow-lg'
                      }`}
                      style={{
                        borderLeftColor: isActive ? segment.color : '#d4c5a9'
                      }}
                    >
                      <div className="p-4 flex items-start gap-4">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#8b7355]/5 to-transparent pointer-events-none rounded-r-lg" />
                        
                        <div className="relative z-10 flex-shrink-0">
                          <div 
                            className="px-3 py-1 rounded-full text-sm font-serif-title text-white shadow-sm"
                            style={{ backgroundColor: segment.color }}
                          >
                            {segment.speaker}
                          </div>
                        </div>

                        <div className="flex-1 relative z-10">
                          <p className="font-sans-body text-base text-[#2d2416] leading-relaxed">
                            时长: {segment.duration.toFixed(2)}s
                          </p>
                        </div>

                        <div className="relative z-10 flex-shrink-0 text-right space-y-1">
                          <button
                            onClick={() => {
                              setCurrentTime(segment.startTime)
                              if (audioRef.current) {
                                audioRef.current.currentTime = segment.startTime
                                if (!isPlaying) {
                                  audioRef.current.play()
                                  setIsPlaying(true)
                                }
                              }
                            }}
                            className="font-mono-cn text-xs text-[#b8d6b6] hover:text-[#276b4d] transition-colors cursor-pointer bg-[#f5f1e8]/80 px-2 py-1 rounded block w-full"
                            aria-label={`跳转到 ${formatTime(segment.startTime)}`}
                          >
                            {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </div>

        {showBamboo && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 1 }}
            className="absolute bottom-8 left-0 right-0 flex justify-center gap-4"
          >
            <button
              onClick={handleReset}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-sans-body"
              style={{ cursor: 'pointer' }}
            >
              重置
            </button>
            <button
              className="px-6 py-3 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 transition-colors font-sans-body"
              style={{ cursor: 'pointer' }}
              onClick={async () => {
                if (!audioFile || !diarizationResult) {
                  addNotification('没有可用的音频或分段数据', 'error')
                  return
                }

                const separationController = new AbortController()

                try {
                  addNotification('正在分离说话人音频，请稍候...', 'info')
                  
                  const formData = new FormData()
                  formData.append('audio', audioFile)
                  
                  const segmentsData = diarizationResult.segments.map(s => ({
                    speaker: s.speaker,
                    startTime: s.startTime,
                    endTime: s.endTime
                  }))
                  formData.append('segments', JSON.stringify(segmentsData))
                  
                  const numSpeakers = diarizationResult.totalSpeakers
                  formData.append('numSpeakers', numSpeakers.toString())

                  const response = await fetch('/api/separate', {
                    method: 'POST',
                    body: formData,
                    signal: separationController.signal,
                  })

                  if (separationController.signal.aborted) {
                    throw new Error('请求已取消')
                  }

                  if (!response.ok) {
                    let errorMessage = '音频分离失败'
                    try {
                      const errorData = await response.json()
                      errorMessage = errorData.error || errorMessage
                    } catch {
                      errorMessage = `服务器错误 (${response.status}): ${response.statusText}`
                    }
                    throw new Error(errorMessage)
                  }

                  const blob = await response.blob()
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `separated-speakers-${Date.now()}.zip`
                  a.click()
                  URL.revokeObjectURL(url)
                  
                  addNotification('音频分离完成！', 'info')
                  showBrowserNotification('聆竹 - 导出完成', '说话人音频已分离完成，文件已开始下载')
                } catch (err) {
                  if (err instanceof Error && err.name === 'AbortError') {
                    addNotification('导出已取消', 'info')
                  } else {
                    addNotification(
                      err instanceof Error ? err.message : '音频分离失败',
                      'error'
                    )
                  }
                }
              }}
            >
              导出分段
            </button>
          </motion.div>
        )}

        {!showBamboo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="absolute bottom-8 left-0 right-0 text-center"
          >
            <motion.p 
              className="text-muted-foreground font-sans-body"
              animate={isProcessing || isListening ? {
                opacity: [0.5, 1, 0.5],
              } : {}}
              transition={isProcessing || isListening ? {
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              } : {}}
            >
              {isProcessing ? '正在识别说话人，请稍候...' : isListening ? '墨滴入水，稍候...' : '点击「听」字选择音频文件'}
            </motion.p>
          </motion.div>
        )}
      </main>
    </div>
  )
}
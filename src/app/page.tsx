'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAudioProcessor } from '@/hooks/useAudioProcessor'

interface Notification {
  id: string
  message: string
  type: 'error' | 'info'
}

interface Sentence {
  id: string
  speaker: string
  text: string
  startTime: number
  endTime: number
  color: string
}

export default function LingZhu() {
  const [showBamboo, setShowBamboo] = useState(false)
  const [highContrast, setHighContrast] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(180) // Mock 3-minute audio
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioFileRef = useRef<File | null>(null)
  
  const { isListening, speakers, startListening, stopListening, reset, error, performance, diarizationResult, isProcessing, audioFile } = useAudioProcessor()

  // Mock sentence data - fallback when API not configured
  const mockSentences: Sentence[] = [
    { id: '1', speaker: '王羲之', text: '永和九年，岁在癸丑，暮春之初，会于会稽山阴之兰亭', startTime: 0, endTime: 12, color: '#276b4d' },
    { id: '2', speaker: '谢安', text: '群贤毕至，少长咸集', startTime: 13, endTime: 24, color: '#518764' },
    { id: '3', speaker: '王羲之', text: '此地有崇山峻岭，茂林修竹', startTime: 25, endTime: 38, color: '#276b4d' },
    { id: '4', speaker: '孙绰', text: '又有清流激湍，映带左右，引以为流觞曲水', startTime: 39, endTime: 56, color: '#76a483' },
    { id: '5', speaker: '谢安', text: '列坐其次，虽无丝竹管弦之盛', startTime: 57, endTime: 71, color: '#518764' },
    { id: '6', speaker: '王羲之', text: '是日也，天朗气清，惠风和畅', startTime: 72, endTime: 88, color: '#276b4d' },
    { id: '7', speaker: '郗昙', text: '仰观宇宙之大，俯察品类之盛', startTime: 89, endTime: 105, color: '#416e54' },
    { id: '8', speaker: '王蕴之', text: '所以游目骋怀，足以极视听之娱', startTime: 106, endTime: 124, color: '#b8d6b6' },
    { id: '9', speaker: '王羲之', text: '信可乐也', startTime: 125, endTime: 135, color: '#276b4d' },
    { id: '10', speaker: '孙绰', text: '夫人之相与，俯仰一世', startTime: 136, endTime: 152, color: '#76a483' },
    { id: '11', speaker: '谢安', text: '或取诸怀抱，晤言一室之内', startTime: 153, endTime: 170, color: '#518764' },
    { id: '12', speaker: '王羲之', text: '或因寄所托，放浪形骸之外', startTime: 171, endTime: 180, color: '#276b4d' },
  ]

  // Use real diarization results if available, otherwise use mock data
  const sentences = diarizationResult?.sentences.map(s => ({
    ...s,
    color: diarizationResult.speakers.find(sp => sp.name === s.speaker)?.color || '#276b4d'
  })) || mockSentences

  const actualDuration = diarizationResult?.duration || duration

  // Initialize audio element when audio file is available
  useEffect(() => {
    if (audioFile && !audioRef.current) {
      const audio = new Audio()
      audio.src = URL.createObjectURL(audioFile)
      audioRef.current = audio

      // Update duration when metadata loads
      audio.addEventListener('loadedmetadata', () => {
        setDuration(audio.duration)
      })

      // Update current time as audio plays
      audio.addEventListener('timeupdate', () => {
        setCurrentTime(audio.currentTime)
      })

      // Handle audio end
      audio.addEventListener('ended', () => {
        setIsPlaying(false)
        setCurrentTime(0)
      })

      return () => {
        URL.revokeObjectURL(audio.src)
        audio.pause()
        audio.remove()
      }
    }
  }, [audioFile])

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // 添加通知
  const addNotification = (message: string, type: 'error' | 'info' = 'error') => {
    const id = Date.now().toString()
    setNotifications(prev => [...prev, { id, message, type }])
    
    // 5秒后自动移除
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }, 5000)
  }

  // 监听错误变化
  useEffect(() => {
    if (error) {
      addNotification(error, 'error')
    }
  }, [error])

  // Audio player controls
  const togglePlayPause = () => {
    if (!audioRef.current) return

    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value)
    setCurrentTime(newTime)
    
    if (audioRef.current) {
      audioRef.current.currentTime = newTime
    }
  }

  // 开始辨声
  const handleStartListening = async () => {
    try {
      await startListening()
      setTimeout(() => {
        setShowBamboo(true)
      }, 800)
    } catch (err) {
      console.error('开始辨声失败:', err)
      // 错误已经通过useEffect处理
    }
  }

  // 重置
  const handleReset = () => {
    // Stop audio if playing
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      URL.revokeObjectURL(audioRef.current.src)
      audioRef.current = null
    }
    
    reset()
    setShowBamboo(false)
    setIsPlaying(false)
    setCurrentTime(0)
  }

  // 键盘事件
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Space bar: Toggle play/pause if results are showing, otherwise open file picker
      if (e.key === ' ') {
        e.preventDefault()
        if (showBamboo && audioRef.current) {
          togglePlayPause()
        } else if (!isListening && !isProcessing) {
          handleStartListening()
        }
      }
      
      // Enter: Open file picker if no results showing
      if (e.key === 'Enter') {
        e.preventDefault()
        if (!showBamboo && !isListening && !isProcessing) {
          handleStartListening()
        }
      }
      
      // Escape: Reset
      if (e.key === 'Escape') {
        handleReset()
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [isListening, showBamboo, isProcessing, isPlaying])

  // Note: Auto-hide logic removed - we now have a persistent result view with audio player
  // Users can manually reset using the reset button

  return (
    <div className={`min-h-screen bg-background font-sans-body transition-all duration-300 ${highContrast ? 'high-contrast' : ''}`}>
      {/* 主容器 */}
      <main className="relative w-full h-screen flex flex-col items-center justify-center overflow-hidden">
        
        {/* 标题 */}
        <header className="absolute top-8 left-0 right-0 text-center">
          <h1 className="font-serif-title text-4xl md:text-6xl text-foreground breathing">
            聆竹
          </h1>
          <p className="mt-2 text-sm md:text-base text-muted-foreground">
            听声辨人 · 气若幽兰
          </p>
          
          {/* 通知区域 */}
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

        {/* 控制面板 */}
        <div className="absolute top-8 right-8 flex flex-col gap-4">
          <button
            onClick={() => setHighContrast(!highContrast)}
            className="px-4 py-2 text-sm bg-secondary text-secondary-foreground rounded-lg hover:bg-accent transition-colors"
            aria-label="切换高对比模式"
          >
            {highContrast ? '标准模式' : '高对比模式'}
          </button>
          
          {/* 简化的性能监控 - 只显示处理时间 */}
          {/* {process.env.NODE_ENV === 'development' && (
            <div className="text-xs text-muted-foreground bg-card/50 backdrop-blur-sm p-2 rounded border border-border/30">
              <div>处理时间: {(performance.processingTime / 1000).toFixed(2)}s</div>
            </div>
          )} */}
        </div>

        {/* 中央交互区域 */}
        <div className="relative flex items-center justify-center">
          
          {/* 听字篆印 */}
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
              {/* 墨晕效果 */}
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
              
              {/* 听字 */}
              <div className="relative z-10 w-32 h-32 md:w-48 md:h-48 flex items-center justify-center bg-card rounded-full border-4 border-foreground shadow-2xl gpu-layer">
                <span className="font-serif-title text-5xl md:text-7xl text-foreground">
                  听
                </span>
              </div>
            </motion.div>
          )}

          {/* 竹简结果视图 */}
          {showBamboo && speakers.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1 }}
              className="w-full max-w-6xl px-4"
            >
              {/* 漆面音频播放器 */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.3 }}
                className="mb-8 bg-gradient-to-b from-[#1a0f08] to-[#12402c] p-6 rounded-2xl shadow-2xl border border-[#276b4d]/30"
              >
                <div className="flex items-center gap-4">
                  {/* 播放/暂停按钮 */}
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

                  {/* 时间显示 */}
                  <span className="font-mono-cn text-sm text-[#b8d6b6] min-w-[3rem]">
                    {formatTime(currentTime)}
                  </span>

                  {/* 竹节滑动条 */}
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

                  {/* 总时长 */}
                  <span className="font-mono-cn text-sm text-[#b8d6b6] min-w-[3rem]">
                    {formatTime(actualDuration)}
                  </span>
                </div>
              </motion.div>

              {/* 竹简句子流 */}
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {sentences.map((sentence, index) => {
                  const isActive = currentTime >= sentence.startTime && currentTime <= sentence.endTime
                  
                  return (
                    <motion.div
                      key={sentence.id}
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
                        borderLeftColor: isActive ? sentence.color : '#d4c5a9'
                      }}
                    >
                      <div className="p-4 flex items-start gap-4">
                        {/* 竹简纹理装饰 */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#8b7355]/5 to-transparent pointer-events-none rounded-r-lg" />
                        
                        {/* 说话人标签 */}
                        <div className="relative z-10 flex-shrink-0">
                          <div 
                            className="px-3 py-1 rounded-full text-sm font-serif-title text-white shadow-sm"
                            style={{ backgroundColor: sentence.color }}
                          >
                            {sentence.speaker}
                          </div>
                        </div>

                        {/* 句子文本 */}
                        <div className="flex-1 relative z-10">
                          <p className="font-sans-body text-base text-[#2d2416] leading-relaxed">
                            {sentence.text}
                          </p>
                        </div>

                        {/* 时间戳 */}
                        <div className="relative z-10 flex-shrink-0 text-right">
                          <button
                            onClick={() => {
                              setCurrentTime(sentence.startTime)
                              if (audioRef.current) {
                                audioRef.current.currentTime = sentence.startTime
                                if (!isPlaying) {
                                  audioRef.current.play()
                                  setIsPlaying(true)
                                }
                              }
                            }}
                            className="font-mono-cn text-xs text-[#b8d6b6] hover:text-[#276b4d] transition-colors cursor-pointer bg-[#f5f1e8]/80 px-2 py-1 rounded"
                            aria-label={`跳转到 ${formatTime(sentence.startTime)}`}
                          >
                            {formatTime(sentence.startTime)}
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

        {/* 控制按钮 */}
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
            >
              重置
            </button>
            <button
              className="px-6 py-3 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 transition-colors font-sans-body"
              onClick={() => {
                const data = sentences.map(s => ({
                  speaker: s.speaker,
                  text: s.text,
                  startTime: s.startTime,
                  endTime: s.endTime,
                  timestamp: Date.now()
                }))
                console.log('导出转录数据:', data)
                // 这里可以实现真正的导出功能
              }}
            >
              导出转录
            </button>
          </motion.div>
        )}

        {/* 状态提示 */}
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
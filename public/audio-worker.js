// 音频处理WebWorker - 用于60fps实时声纹分析
class AudioProcessor {
  constructor() {
    this.sampleRate = 44100
    this.fftSize = 2048
    this.bufferSize = 1024
    this.speakers = new Map() // 存储声纹特征
    this.isProcessing = false
  }

  // 初始化音频处理
  init(config) {
    this.sampleRate = config.sampleRate || 44100
    this.fftSize = config.fftSize || 2048
    this.bufferSize = config.bufferSize || 1024
    return { status: 'initialized', config }
  }

  // 处理音频数据
  processAudioData(audioData) {
    if (!audioData || audioData.length === 0) {
      return null
    }

    // 计算音频特征
    const features = this.extractFeatures(audioData)
    
    // 声纹识别
    const speakerId = this.identifySpeaker(features)
    
    // 计算振幅
    const amplitude = this.calculateAmplitude(audioData)
    
    return {
      speakerId,
      amplitude,
      features,
      timestamp: Date.now()
    }
  }

  // 提取音频特征
  extractFeatures(audioData) {
    const features = {
      mfcc: this.calculateMFCC(audioData),
      spectralCentroid: this.calculateSpectralCentroid(audioData),
      zeroCrossingRate: this.calculateZeroCrossingRate(audioData),
      energy: this.calculateEnergy(audioData)
    }
    
    return features
  }

  // 计算MFCC特征 (梅尔频率倒谱系数)
  calculateMFCC(audioData) {
    // 简化的MFCC计算
    const frameSize = 512
    const hopSize = 256
    const numCoefficients = 13
    
    const mfcc = []
    for (let i = 0; i < numCoefficients; i++) {
      mfcc.push(Math.random() * 10 - 5) // 模拟MFCC值
    }
    
    return mfcc
  }

  // 计算频谱质心
  calculateSpectralCentroid(audioData) {
    let numerator = 0
    let denominator = 0
    
    for (let i = 0; i < audioData.length; i++) {
      const magnitude = Math.abs(audioData[i])
      numerator += i * magnitude
      denominator += magnitude
    }
    
    return denominator > 0 ? numerator / denominator : 0
  }

  // 计算过零率
  calculateZeroCrossingRate(audioData) {
    let crossings = 0
    
    for (let i = 1; i < audioData.length; i++) {
      if ((audioData[i] >= 0) !== (audioData[i - 1] >= 0)) {
        crossings++
      }
    }
    
    return crossings / audioData.length
  }

  // 计算能量
  calculateEnergy(audioData) {
    let energy = 0
    
    for (let i = 0; i < audioData.length; i++) {
      energy += audioData[i] * audioData[i]
    }
    
    return Math.sqrt(energy / audioData.length)
  }

  // 计算振幅
  calculateAmplitude(audioData) {
    let sum = 0
    
    for (let i = 0; i < audioData.length; i++) {
      sum += Math.abs(audioData[i])
    }
    
    return Math.min(sum / audioData.length, 1.0)
  }

  // 声纹识别
  identifySpeaker(features) {
    // 简化的声纹识别算法
    // 实际应用中应该使用机器学习模型
    
    const speakerProfiles = [
      { id: '1', name: '王羲之', centroid: 0.3, energy: 0.6 },
      { id: '2', name: '谢安', centroid: 0.5, energy: 0.4 },
      { id: '3', name: '孙绰', centroid: 0.7, energy: 0.5 },
      { id: '4', name: '郗昙', centroid: 0.4, energy: 0.7 },
      { id: '5', name: '王蕴之', centroid: 0.6, energy: 0.3 }
    ]
    
    // 基于特征匹配说话人
    let bestMatch = speakerProfiles[0]
    let bestScore = Infinity
    
    for (const profile of speakerProfiles) {
      const score = Math.abs(features.spectralCentroid - profile.centroid) + 
                   Math.abs(features.energy - profile.energy)
      
      if (score < bestScore) {
        bestScore = score
        bestMatch = profile
      }
    }
    
    return bestMatch.id
  }

  // 注册新说话人
  registerSpeaker(speakerId, features) {
    this.speakers.set(speakerId, {
      features,
      samples: 1,
      lastUpdated: Date.now()
    })
    
    return { status: 'registered', speakerId }
  }

  // 更新说话人特征
  updateSpeaker(speakerId, features) {
    if (!this.speakers.has(speakerId)) {
      return this.registerSpeaker(speakerId, features)
    }
    
    const speaker = this.speakers.get(speakerId)
    speaker.samples++
    speaker.lastUpdated = Date.now()
    
    // 简单的特征平均
    for (const key in features) {
      if (Array.isArray(features[key])) {
        if (!speaker.features[key]) {
          speaker.features[key] = [...features[key]]
        } else {
          for (let i = 0; i < features[key].length; i++) {
            speaker.features[key][i] = (speaker.features[key][i] * (speaker.samples - 1) + features[key][i]) / speaker.samples
          }
        }
      } else {
        speaker.features[key] = (speaker.features[key] * (speaker.samples - 1) + features[key]) / speaker.samples
      }
    }
    
    return { status: 'updated', speakerId }
  }
}

// 创建处理器实例
const processor = new AudioProcessor()

// 监听主线程消息
self.onmessage = function(e) {
  const { type, data, id } = e.data
  
  try {
    let result
    
    switch (type) {
      case 'init':
        result = processor.init(data)
        break
        
      case 'process':
        result = processor.processAudioData(data)
        break
        
      case 'register':
        result = processor.registerSpeaker(data.speakerId, data.features)
        break
        
      case 'update':
        result = processor.updateSpeaker(data.speakerId, data.features)
        break
        
      default:
        throw new Error(`Unknown message type: ${type}`)
    }
    
    // 发送结果回主线程
    self.postMessage({
      type: 'result',
      id,
      data: result,
      timestamp: Date.now()
    })
    
  } catch (error) {
    // 发送错误信息
    self.postMessage({
      type: 'error',
      id,
      error: error.message,
      timestamp: Date.now()
    })
  }
}

// 性能监控
let frameCount = 0
let lastTime = performance.now()

setInterval(() => {
  const currentTime = performance.now()
  const fps = frameCount / ((currentTime - lastTime) / 1000)
  
  self.postMessage({
    type: 'performance',
    data: {
      fps: Math.round(fps),
      frameCount,
      processingTime: currentTime - lastTime
    }
  })
  
  frameCount = 0
  lastTime = currentTime
}, 1000)

// 每次处理消息时增加帧计数
self.onmessage = function(e) {
  frameCount++
  
  // 原有的消息处理逻辑
  const { type, data, id } = e.data
  
  try {
    let result
    
    switch (type) {
      case 'init':
        result = processor.init(data)
        break
        
      case 'process':
        result = processor.processAudioData(data)
        break
        
      case 'register':
        result = processor.registerSpeaker(data.speakerId, data.features)
        break
        
      case 'update':
        result = processor.updateSpeaker(data.speakerId, data.features)
        break
        
      default:
        throw new Error(`Unknown message type: ${type}`)
    }
    
    self.postMessage({
      type: 'result',
      id,
      data: result,
      timestamp: Date.now()
    })
    
  } catch (error) {
    self.postMessage({
      type: 'error',
      id,
      error: error.message,
      timestamp: Date.now()
    })
  }
}
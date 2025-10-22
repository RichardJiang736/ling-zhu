class AudioProcessor {
  constructor() {
    this.sampleRate = 44100
    this.fftSize = 2048
    this.bufferSize = 1024
    this.speakers = new Map()
    this.isProcessing = false
  }

  init(config) {
    this.sampleRate = config.sampleRate || 44100
    this.fftSize = config.fftSize || 2048
    this.bufferSize = config.bufferSize || 1024
    return { status: 'initialized', config }
  }

  processAudioData(audioData) {
    if (!audioData || audioData.length === 0) {
      return null
    }

    const features = this.extractFeatures(audioData)
    const speakerId = this.identifySpeaker(features)
    const amplitude = this.calculateAmplitude(audioData)
    
    return {
      speakerId,
      amplitude,
      features,
      timestamp: Date.now()
    }
  }

  extractFeatures(audioData) {
    const features = {
      mfcc: this.calculateMFCC(audioData),
      spectralCentroid: this.calculateSpectralCentroid(audioData),
      zeroCrossingRate: this.calculateZeroCrossingRate(audioData),
      energy: this.calculateEnergy(audioData)
    }
    
    return features
  }

  calculateMFCC(audioData) {
    const numCoefficients = 13
    const mfcc = []
    for (let i = 0; i < numCoefficients; i++) {
      mfcc.push(Math.random() * 10 - 5)
    }
    return mfcc
  }

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

  calculateZeroCrossingRate(audioData) {
    let crossings = 0
    
    for (let i = 1; i < audioData.length; i++) {
      if ((audioData[i] >= 0) !== (audioData[i - 1] >= 0)) {
        crossings++
      }
    }
    
    return crossings / audioData.length
  }

  calculateEnergy(audioData) {
    let energy = 0
    
    for (let i = 0; i < audioData.length; i++) {
      energy += audioData[i] * audioData[i]
    }
    
    return Math.sqrt(energy / audioData.length)
  }

  calculateAmplitude(audioData) {
    let sum = 0
    
    for (let i = 0; i < audioData.length; i++) {
      sum += Math.abs(audioData[i])
    }
    
    return Math.min(sum / audioData.length, 1.0)
  }

  identifySpeaker(features) {
    const speakerProfiles = [
      { id: '1', name: 'Speaker 1', centroid: 0.3, energy: 0.6 },
      { id: '2', name: 'Speaker 2', centroid: 0.5, energy: 0.4 },
      { id: '3', name: 'Speaker 3', centroid: 0.7, energy: 0.5 },
      { id: '4', name: 'Speaker 4', centroid: 0.4, energy: 0.7 },
      { id: '5', name: 'Speaker 5', centroid: 0.6, energy: 0.3 }
    ]
    
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

  registerSpeaker(speakerId, features) {
    this.speakers.set(speakerId, {
      features,
      samples: 1,
      lastUpdated: Date.now()
    })
    
    return { status: 'registered', speakerId }
  }

  updateSpeaker(speakerId, features) {
    if (!this.speakers.has(speakerId)) {
      return this.registerSpeaker(speakerId, features)
    }
    
    const speaker = this.speakers.get(speakerId)
    speaker.samples++
    speaker.lastUpdated = Date.now()
    
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

const processor = new AudioProcessor()

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
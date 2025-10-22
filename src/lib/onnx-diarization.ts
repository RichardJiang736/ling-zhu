import * as ort from 'onnxruntime-node';
import path from 'path';
import fs from 'fs';
import wav from 'node-wav';

interface SegmentResult {
  startTime: number;
  endTime: number;
  speaker: number;
}

export class ONNXDiarization {
  private session: ort.InferenceSession | null = null;
  private modelPath: string;
  private sampleRate = 16000;
  private framesPerSecond = 56;

  constructor() {
    this.modelPath = path.join(process.cwd(), 'segmentation-3.0.onnx');
  }

  async initialize() {
    if (!fs.existsSync(this.modelPath)) {
      throw new Error(`ONNX model not found at ${this.modelPath}`);
    }

    try {
      this.session = await ort.InferenceSession.create(this.modelPath);
    } catch (error) {
      throw error;
    }
  }

  async processAudio(audioBuffer: Buffer): Promise<SegmentResult[]> {
    if (!this.session) {
      await this.initialize();
    }

    try {
      const waveform = await this.preprocessAudio(audioBuffer);
      const numSamples = waveform.length;
      const inputTensor = new ort.Tensor('float32', waveform, [1, 1, numSamples]);
      
      const feeds = { [this.session!.inputNames[0]]: inputTensor };
      const results = await this.session!.run(feeds);
      
      const audioDuration = numSamples / this.sampleRate;
      const segments = this.postProcessSegments(results, audioDuration);
      
      return segments;
    } catch (error) {
      throw error;
    }
  }

  private async preprocessAudio(audioBuffer: Buffer): Promise<Float32Array> {
    try {
      const decoded = wav.decode(audioBuffer);
      let samples = decoded.channelData[0];
      if (decoded.channelData.length > 1) {
        const leftChannel = decoded.channelData[0];
        const rightChannel = decoded.channelData[1];
        samples = new Float32Array(leftChannel.length);
        for (let i = 0; i < leftChannel.length; i++) {
          samples[i] = (leftChannel[i] + rightChannel[i]) / 2;
        }
      }
      if (decoded.sampleRate !== this.sampleRate) {
        samples = this.resample(samples, decoded.sampleRate, this.sampleRate);
      }
      if (samples.length === 0) {
        throw new Error('No audio data extracted from buffer');
      }
      return samples;
    } catch (error) {
      throw new Error(
        `Audio preprocessing failed: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
        `Please ensure the audio file is in WAV format.`
      );
    }
  }

  private resample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (fromRate === toRate) {
      return samples;
    }
    
    const ratio = fromRate / toRate;
    const newLength = Math.round(samples.length / ratio);
    const resampled = new Float32Array(newLength);
    
    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, samples.length - 1);
      const fraction = srcIndex - srcIndexFloor;
      
      resampled[i] = samples[srcIndexFloor] * (1 - fraction) + samples[srcIndexCeil] * fraction;
    }
    
    return resampled;
  }

  private postProcessSegments(
    results: ort.InferenceSession.OnnxValueMapType,
    audioDuration: number
  ): SegmentResult[] {
    const outputName = this.session!.outputNames[0];
    const output = results[outputName];
    const outputData = output.data as Float32Array;
    const outputShape = output.dims;
    
    const numFrames = outputShape[1];
    const numClasses = outputShape[2];
    const frameStep = audioDuration / numFrames;
    
    const segments: SegmentResult[] = [];
    
    const softmax = (logits: number[]) => {
      const maxLogit = Math.max(...logits);
      const expScores = logits.map(x => Math.exp(x - maxLogit));
      const sumExp = expScores.reduce((a, b) => a + b, 0);
      return expScores.map(x => x / sumExp);
    };
    
    const threshold = 0.3;
    let currentSpeaker = -1;
    let segmentStart = 0;
    
    for (let frame = 0; frame < numFrames; frame++) {
      const frameLogits: number[] = [];
      for (let cls = 0; cls < numClasses; cls++) {
        const idx = frame * numClasses + cls;
        frameLogits.push(outputData[idx]);
      }
      
      const probs = softmax(frameLogits);
      
      let maxProb = threshold;
      let activeSpeaker = -1;
      
      for (let cls = 1; cls < numClasses; cls++) {
        if (probs[cls] > maxProb) {
          maxProb = probs[cls];
          activeSpeaker = cls - 1;
        }
      }
      
      if (activeSpeaker !== currentSpeaker) {
        if (currentSpeaker >= 0) {
          const duration = frame * frameStep - segmentStart;
          if (duration >= 0.5) {
            segments.push({
              startTime: segmentStart,
              endTime: frame * frameStep,
              speaker: currentSpeaker,
            });
          }
        }
        
        if (activeSpeaker >= 0) {
          segmentStart = frame * frameStep;
          currentSpeaker = activeSpeaker;
        } else {
          currentSpeaker = -1;
        }
      }
    }
    
    if (currentSpeaker >= 0) {
      const duration = audioDuration - segmentStart;
      if (duration >= 0.5) {
        segments.push({
          startTime: segmentStart,
          endTime: audioDuration,
          speaker: currentSpeaker,
        });
      }
    }
    
    return segments;
  }

  async cleanup() {
    if (this.session) {
      this.session = null;
    }
  }
}

export const onnxDiarization = new ONNXDiarization();

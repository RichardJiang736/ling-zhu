import sherpa_onnx from 'sherpa-onnx';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

interface SherpaSegment {
  start: number;
  end: number;
  speaker: number;
}

interface DiarizationSegment {
  speaker: number;
  startTime: number;
  endTime: number;
}

export class SherpaDiarization {
  private config: any;
  private initialized: boolean = false;
  private static instance: SherpaDiarization | null = null;
  private processing: boolean = false;
  private tempFiles: Set<string> = new Set();

  constructor() {
    this.config = {
      segmentation: {
        pyannote: {
          model: './sherpa-onnx/sherpa-onnx-pyannote-segmentation-3-0/model.onnx',
          debug: 0,
        },
      },
      embedding: {
        model: './sherpa-onnx/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx',
        debug: 0,
      },
      clustering: {
        numClusters: -1,
        threshold: 0.5,
      },
      minDurationOn: 0.2,
      minDurationOff: 0.5,
    };
  }

  static getInstance(): SherpaDiarization {
    if (!SherpaDiarization.instance) {
      SherpaDiarization.instance = new SherpaDiarization();
    }
    return SherpaDiarization.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const segmentationModel = this.config.segmentation.pyannote.model;
    const embeddingModel = this.config.embedding.model;
    try {
      await fs.access(segmentationModel);
      await fs.access(embeddingModel);
      this.initialized = true;
    } catch (error) {
      throw new Error(
        `Required model files not found. Please ensure sherpa-onnx models are downloaded. Error: ${error}`
      );
    }
  }

  private async ensureAudio16kHz(audioBuffer: Buffer, abortSignal?: AbortSignal): Promise<string> {
    if (abortSignal?.aborted) {
      throw new Error('Operation aborted');
    }

    const tempDir = tmpdir();
    const inputPath = path.join(tempDir, `input-${Date.now()}-${Math.random().toString(36).substring(7)}.wav`);
    const outputPath = path.join(tempDir, `output-${Date.now()}-${Math.random().toString(36).substring(7)}_16k.wav`);

    this.tempFiles.add(inputPath);
    this.tempFiles.add(outputPath);

    await fs.writeFile(inputPath, audioBuffer);

    if (abortSignal?.aborted) {
      await this.cleanupTempFiles();
      throw new Error('Operation aborted');
    }

    try {
      await execAsync(
        `ffmpeg -i "${inputPath}" -ar 16000 -ac 1 "${outputPath}" -y`,
        { 
          maxBuffer: 50 * 1024 * 1024,
          signal: abortSignal as any
        }
      );
    } catch (error) {
      await this.cleanupTempFiles();
      if (abortSignal?.aborted) {
        throw new Error('Operation aborted');
      }
      throw new Error(`Failed to convert audio to 16kHz: ${error}`);
    }

    await fs.unlink(inputPath).catch(() => {});
    this.tempFiles.delete(inputPath);
    return outputPath;
  }

  private async cleanupTempFiles(): Promise<void> {
    const cleanup = Array.from(this.tempFiles);
    this.tempFiles.clear();
    
    await Promise.all(
      cleanup.map(file => fs.unlink(file).catch(() => {}))
    );
  }

  async processAudio(audioBuffer: Buffer, abortSignal?: AbortSignal): Promise<DiarizationSegment[]> {
    if (this.processing) {
      throw new Error('Another diarization is already in progress');
    }

    this.processing = true;

    try {
      await this.initialize();

      if (abortSignal?.aborted) {
        throw new Error('Operation aborted');
      }

      const audioPath = await this.ensureAudio16kHz(audioBuffer, abortSignal);

      if (abortSignal?.aborted) {
        await this.cleanupTempFiles();
        throw new Error('Operation aborted');
      }

      const sd = sherpa_onnx.createOfflineSpeakerDiarization(this.config);
      const wave = sherpa_onnx.readWave(audioPath);
      
      if (sd.sampleRate !== wave.sampleRate) {
        await fs.unlink(audioPath).catch(() => {});
        this.tempFiles.delete(audioPath);
        throw new Error(
          `Sample rate mismatch: expected ${sd.sampleRate}, got ${wave.sampleRate}`
        );
      }

      if (abortSignal?.aborted) {
        await fs.unlink(audioPath).catch(() => {});
        this.tempFiles.delete(audioPath);
        throw new Error('Operation aborted');
      }

      const segments: SherpaSegment[] = sd.process(wave.samples);
      await fs.unlink(audioPath).catch(() => {});
      this.tempFiles.delete(audioPath);

      return segments.map((seg) => ({
        speaker: seg.speaker,
        startTime: seg.start,
        endTime: seg.end,
      }));
    } catch (error) {
      await this.cleanupTempFiles();
      throw error;
    } finally {
      this.processing = false;
    }
  }

  async getSpeakerCount(segments: DiarizationSegment[]): Promise<number> {
    const uniqueSpeakers = new Set(segments.map((seg) => seg.speaker));
    return uniqueSpeakers.size;
  }
}
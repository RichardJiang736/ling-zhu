import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';
import WaveFile from 'wavefile';

const execAsync = promisify(exec);

interface SeparationSegment {
  speaker: string;
  startTime: number;
  endTime: number;
  audioPath: string;
}

interface PythonServiceResponse {
  success: boolean;
  output_paths?: string[];
  num_sources?: number;
  error?: string;
}

export class SepFormerSeparation {
  private pythonServicePath: string;
  private initialized: boolean = false;
  private static instance: SepFormerSeparation | null = null;
  private processing: boolean = false;
  private tempFiles: Set<string> = new Set();

  constructor() {
    this.pythonServicePath = './scripts/sepformer-python-service.py';
  }

  static getInstance(): SepFormerSeparation {
    if (!SepFormerSeparation.instance) {
      SepFormerSeparation.instance = new SepFormerSeparation();
    }
    return SepFormerSeparation.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      await fs.access(this.pythonServicePath);
      const { stdout } = await execAsync(
        `python3 -c "import speechbrain; import torch; print('OK')"`,
        { timeout: 10000 }
      );
      
      if (!stdout.includes('OK')) {
        throw new Error('Python dependencies not available');
      }
      
      this.initialized = true;
      console.log('SepFormer Python service initialized');
    } catch (error) {
      throw new Error(
        `Failed to initialize SepFormer service. Please install: pip install speechbrain torch torchaudio. Error: ${error}`
      );
    }
  }

  private async cleanupTempFiles(): Promise<void> {
    const cleanup = Array.from(this.tempFiles);
    this.tempFiles.clear();
    
    await Promise.all(
      cleanup.map(file => 
        fs.unlink(file).catch(() => {})
      )
    );
  }

  private async extractSegmentAudio(
    originalAudioPath: string,
    startTime: number,
    endTime: number,
    outputPath: string,
    abortSignal?: AbortSignal
  ): Promise<void> {
    if (abortSignal?.aborted) {
      throw new Error('Operation aborted');
    }

    this.tempFiles.add(outputPath);

    try {
      await execAsync(
        `ffmpeg -i "${originalAudioPath}" -ss ${startTime} -to ${endTime} -ar 16000 -ac 1 "${outputPath}" -y`,
        { 
          maxBuffer: 50 * 1024 * 1024,
          signal: abortSignal as any
        }
      );
    } catch (error) {
      if (abortSignal?.aborted) {
        throw new Error('Operation aborted');
      }
      throw new Error(`Failed to extract audio segment: ${error}`);
    }
  }

  async separateSpeaker(
    audioBuffer: Buffer,
    segments: Array<{ speaker: string; startTime: number; endTime: number }>,
    numSpeakers: number,
    abortSignal?: AbortSignal
  ): Promise<SeparationSegment[]> {
    if (this.processing) {
      throw new Error('Another separation is already in progress');
    }

    this.processing = true;

    try {
      await this.initialize();

      if (abortSignal?.aborted) {
        throw new Error('Operation aborted');
      }

      const tempDir = tmpdir();
      const inputAudioPath = path.join(tempDir, `input-${Date.now()}-${Math.random().toString(36).substring(7)}.wav`);
      this.tempFiles.add(inputAudioPath);
      
      await fs.writeFile(inputAudioPath, audioBuffer);
      const results: SeparationSegment[] = [];

      const speakerSegments = new Map<string, typeof segments>();
      segments.forEach(seg => {
        if (!speakerSegments.has(seg.speaker)) {
          speakerSegments.set(seg.speaker, []);
        }
        speakerSegments.get(seg.speaker)!.push(seg);
      });

      console.log(`Processing ${numSpeakers} speakers with ${segments.length} total segments`);

      for (let i = 0; i < segments.length; i++) {
        if (abortSignal?.aborted) {
          await this.cleanupTempFiles();
          throw new Error('Operation aborted');
        }

        const segment = segments[i];
        const segmentInputPath = path.join(
          tempDir,
          `segment-${Date.now()}-${i}-${Math.random().toString(36).substring(7)}.wav`
        );
        const separatedOutputDir = path.join(
          tempDir,
          `separated-${Date.now()}-${i}-${Math.random().toString(36).substring(7)}`
        );

        await this.extractSegmentAudio(
          inputAudioPath,
          segment.startTime,
          segment.endTime,
          segmentInputPath,
          abortSignal
        );

        if (abortSignal?.aborted) {
          await this.cleanupTempFiles();
          throw new Error('Operation aborted');
        }

        const pythonCmd = `python3 "${this.pythonServicePath}" "${segmentInputPath}" "${separatedOutputDir}" ${Math.min(numSpeakers, 2)}`;
        const { stdout, stderr } = await execAsync(pythonCmd, {
          maxBuffer: 50 * 1024 * 1024,
          timeout: 120000,
          signal: abortSignal as any
        });

        if (stderr && !stderr.includes('UserWarning')) {
          console.warn('Python service warnings:', stderr);
        }

        const response: PythonServiceResponse = JSON.parse(stdout.trim().split('\n').pop() || '{}');
        if (!response.success) {
          throw new Error(`Python service failed: ${response.error}`);
        }

        const speakerIndex = Array.from(speakerSegments.keys()).indexOf(segment.speaker);
        const sourceIndex = Math.min(speakerIndex, (response.output_paths?.length || 1) - 1);
        const sourcePath = response.output_paths?.[sourceIndex];
        if (!sourcePath) {
          throw new Error(`No output for speaker ${segment.speaker}`);
        }

        const finalOutputPath = path.join(
          tempDir,
          `final-separated-${Date.now()}-${i}-${Math.random().toString(36).substring(7)}.wav`
        );
        this.tempFiles.add(finalOutputPath);
        await fs.copyFile(sourcePath, finalOutputPath);
        
        await fs.unlink(segmentInputPath).catch(() => {});
        this.tempFiles.delete(segmentInputPath);
        
        if (response.output_paths) {
          for (const outPath of response.output_paths) {
            await fs.unlink(outPath).catch(() => {});
          }
        }
        await fs.rmdir(separatedOutputDir).catch(() => {});

        results.push({
          speaker: segment.speaker,
          startTime: segment.startTime,
          endTime: segment.endTime,
          audioPath: finalOutputPath,
        });
      }
      
      await fs.unlink(inputAudioPath).catch(() => {});
      this.tempFiles.delete(inputAudioPath);
      return results;
    } catch (error) {
      await this.cleanupTempFiles();
      throw new Error(`Failed to separate audio: ${error}`);
    } finally {
      this.processing = false;
    }
  }

  async createZipArchive(segments: SeparationSegment[]): Promise<Buffer> {
    const { default: archiver } = await import('archiver');
    const { Readable } = await import('stream');
    
    return new Promise((resolve, reject) => {
      const archive = archiver('zip', {
        zlib: { level: 9 }
      });

      const chunks: Buffer[] = [];
      
      archive.on('data', (chunk) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);

      segments.forEach((segment, index) => {
        const filename = `${segment.speaker}_${segment.startTime.toFixed(2)}-${segment.endTime.toFixed(2)}.wav`;
        archive.file(segment.audioPath, { name: filename });
      });

      archive.finalize();
    });
  }

  async cleanup(segments: SeparationSegment[]): Promise<void> {
    for (const segment of segments) {
      await fs.unlink(segment.audioPath).catch(() => {});
      this.tempFiles.delete(segment.audioPath);
    }
  }
}
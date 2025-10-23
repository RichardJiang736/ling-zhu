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

  constructor() {
    this.pythonServicePath = './scripts/sepformer-python-service.py';
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
  private async extractSegmentAudio(
    originalAudioPath: string,
    startTime: number,
    endTime: number,
    outputPath: string
  ): Promise<void> {
    try {
      await execAsync(
        `ffmpeg -i "${originalAudioPath}" -ss ${startTime} -to ${endTime} -ar 16000 -ac 1 "${outputPath}" -y`,
        { maxBuffer: 50 * 1024 * 1024 }
      );
    } catch (error) {
      throw new Error(`Failed to extract audio segment: ${error}`);
    }
  }
  async separateSpeaker(
    audioBuffer: Buffer,
    segments: Array<{ speaker: string; startTime: number; endTime: number }>,
    numSpeakers: number
  ): Promise<SeparationSegment[]> {
    await this.initialize();

    const tempDir = tmpdir();
    const inputAudioPath = path.join(tempDir, `input-${Date.now()}.wav`);
    
    await fs.writeFile(inputAudioPath, audioBuffer);
    const results: SeparationSegment[] = [];

    try {
      const speakerSegments = new Map<string, typeof segments>();
      segments.forEach(seg => {
        if (!speakerSegments.has(seg.speaker)) {
          speakerSegments.set(seg.speaker, []);
        }
        speakerSegments.get(seg.speaker)!.push(seg);
      });

      console.log(`Processing ${numSpeakers} speakers with ${segments.length} total segments`);

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const segmentInputPath = path.join(
          tempDir,
          `segment-${Date.now()}-${i}.wav`
        );
        const separatedOutputDir = path.join(
          tempDir,
          `separated-${Date.now()}-${i}`
        );

        await this.extractSegmentAudio(
          inputAudioPath,
          segment.startTime,
          segment.endTime,
          segmentInputPath
        );

        const pythonCmd = `python3 "${this.pythonServicePath}" "${segmentInputPath}" "${separatedOutputDir}" ${Math.min(numSpeakers, 2)}`;
        const { stdout, stderr } = await execAsync(pythonCmd, {
          maxBuffer: 50 * 1024 * 1024,
          timeout: 120000
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
          `final-separated-${Date.now()}-${i}.wav`
        );
        await fs.copyFile(sourcePath, finalOutputPath);
        await fs.unlink(segmentInputPath).catch(() => {});
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
      return results;
    } catch (error) {
      await fs.unlink(inputAudioPath).catch(() => {});
      throw new Error(`Failed to separate audio: ${error}`);
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
    }
  }
}
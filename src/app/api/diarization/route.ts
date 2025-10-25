import { NextRequest, NextResponse } from 'next/server';
import { SherpaDiarization } from '@/lib/sherpa-diarization';
import { QueueManager } from '@/lib/queue-manager';
import { CacheManager } from '@/lib/cache-manager';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const queueManager = QueueManager.getInstance(2, 10, 300000);
const cacheManager = new CacheManager(50, 3600000);

export async function POST(request: NextRequest) {
  const controller = new AbortController();
  const taskId = `diarization-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  const cleanup = () => {
    controller.abort();
  };

  request.signal.addEventListener('abort', cleanup);

  try {
    const contentLength = request.headers.get('content-length');
    const maxSize = 100 * 1024 * 1024;
    
    if (contentLength && parseInt(contentLength) > maxSize) {
      return NextResponse.json(
        { error: '音频文件过大，请上传小于100MB的文件' },
        { status: 413 }
      );
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return NextResponse.json(
        { error: '未找到音频文件' },
        { status: 400 }
      );
    }

    const bytes = await audioFile.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (controller.signal.aborted) {
      return NextResponse.json(
        { error: 'Request cancelled' },
        { status: 499 }
      );
    }

    const cachedResult = cacheManager.get(buffer);
    if (cachedResult) {
      return NextResponse.json({
        success: true,
        data: cachedResult,
        cached: true,
      });
    }

    const result = await queueManager.enqueue(
      taskId,
      async () => {
        if (controller.signal.aborted) {
          throw new Error('Request cancelled');
        }

        const sherpaDiarization = SherpaDiarization.getInstance();
        await sherpaDiarization.initialize();
        const speakerSegments = await sherpaDiarization.processAudio(buffer, controller.signal);

        if (controller.signal.aborted) {
          throw new Error('Request cancelled');
        }

        const speakerIds = [...new Set(speakerSegments.map(s => s.speaker))] as number[];
        const speakers = speakerIds.map((speakerId: number, index: number) => {
          const segments = speakerSegments.filter(s => s.speaker === speakerId);
          const totalDuration = segments.reduce(
            (sum, s) => sum + (s.endTime - s.startTime),
            0
          );

          return {
            id: speakerId.toString(),
            name: `说话人${index + 1}`,
            segmentCount: segments.length,
            totalDuration,
            color: ['#276b4d', '#518764', '#76a483', '#416e54', '#b8d6b6'][index % 5],
          };
        });

        const duration = speakerSegments.length > 0 
          ? Math.max(...speakerSegments.map(s => s.endTime))
          : 0;
        const segments = speakerSegments.map((segment) => {
          const speakerIndex = speakerIds.indexOf(segment.speaker);
          return {
            id: `${segment.speaker}-${segment.startTime}-${segment.endTime}`,
            speaker: `说话人${speakerIndex + 1}`,
            startTime: segment.startTime,
            endTime: segment.endTime,
            duration: segment.endTime - segment.startTime,
          };
        });

        return {
          segments,
          speakers,
          duration,
          totalSpeakers: speakers.length,
          method: 'PyAnnote ONNX',
        };
      },
      controller.signal
    );

    cacheManager.set(buffer, result);

    return NextResponse.json({
      success: true,
      data: result,
    });

  } catch (error) {
    if (error instanceof Error && error.message.includes('abort')) {
      return new NextResponse(null, { status: 499 });
    }

    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : '说话人识别失败',
      },
      { status: 500 }
    );
  } finally {
    request.signal.removeEventListener('abort', cleanup);
  }
}

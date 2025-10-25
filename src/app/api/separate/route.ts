import { NextRequest, NextResponse } from 'next/server';
import { SepFormerSeparation } from '@/lib/sepformer-separation';
import { QueueManager } from '@/lib/queue-manager';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const queueManager = QueueManager.getInstance(2, 10, 300000);

export async function POST(request: NextRequest) {
  const controller = new AbortController();
  const taskId = `separation-${Date.now()}-${Math.random().toString(36).substring(7)}`;

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
    const segmentsJson = formData.get('segments') as string;
    const numSpeakersStr = formData.get('numSpeakers') as string;

    if (!audioFile) {
      return NextResponse.json(
        { error: '未找到音频文件' },
        { status: 400 }
      );
    }

    if (!segmentsJson) {
      return NextResponse.json(
        { error: '未找到分段信息' },
        { status: 400 }
      );
    }

    const segments = JSON.parse(segmentsJson);
    const numSpeakers = numSpeakersStr ? parseInt(numSpeakersStr) : new Set(segments.map((s: any) => s.speaker)).size;
    
    console.log(`Separating audio with ${numSpeakers} speakers and ${segments.length} segments`);
    
    const bytes = await audioFile.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (controller.signal.aborted) {
      return NextResponse.json(
        { error: 'Request cancelled' },
        { status: 499 }
      );
    }

    const result = await queueManager.enqueue(
      taskId,
      async () => {
        if (controller.signal.aborted) {
          throw new Error('Request cancelled');
        }

        const sepformer = SepFormerSeparation.getInstance();
        await sepformer.initialize();
        const separatedSegments = await sepformer.separateSpeaker(buffer, segments, numSpeakers, controller.signal);

        if (controller.signal.aborted) {
          await sepformer.cleanup(separatedSegments);
          throw new Error('Request cancelled');
        }

        const zipBuffer = await sepformer.createZipArchive(separatedSegments);
        await sepformer.cleanup(separatedSegments);

        return zipBuffer;
      },
      controller.signal
    );

    const headers = new Headers();
    headers.set('Content-Type', 'application/zip');
    headers.set('Content-Disposition', `attachment; filename="separated-speakers-${Date.now()}.zip"`);
    
    return new NextResponse(new Blob([new Uint8Array(result)]), {
      headers,
    });

  } catch (error) {
    if (error instanceof Error && error.message.includes('abort')) {
      return new NextResponse(null, { status: 499 });
    }

    console.error('Separation error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : '音频分离失败',
      },
      { status: 500 }
    );
  } finally {
    request.signal.removeEventListener('abort', cleanup);
  }
}

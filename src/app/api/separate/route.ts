import { NextRequest, NextResponse } from 'next/server';
import { SepFormerSeparation } from '@/lib/sepformer-separation';

const sepformer = new SepFormerSeparation();

export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 100 * 1024 * 1024) {
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

    await sepformer.initialize();
    const separatedSegments = await sepformer.separateSpeaker(buffer, segments, numSpeakers);

    const zipBuffer = await sepformer.createZipArchive(separatedSegments);
    await sepformer.cleanup(separatedSegments);

    const headers = new Headers();
    headers.set('Content-Type', 'application/zip');
    headers.set('Content-Disposition', `attachment; filename="separated-speakers-${Date.now()}.zip"`);
    
    return new NextResponse(new Blob([new Uint8Array(zipBuffer)]), {
      headers,
    });

  } catch (error) {
    console.error('Separation error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : '音频分离失败',
      },
      { status: 500 }
    );
  }
}

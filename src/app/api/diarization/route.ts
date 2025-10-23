import { NextRequest, NextResponse } from 'next/server';
import { SherpaDiarization } from '@/lib/sherpa-diarization';

const sherpaDiarization = new SherpaDiarization();

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: '音频文件过大，请上传小于50MB的文件' },
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

    await sherpaDiarization.initialize();
    const speakerSegments = await sherpaDiarization.processAudio(buffer);

    const speakerIds = [...new Set(speakerSegments.map(s => s.speaker))];
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

    return NextResponse.json({
      success: true,
      data: {
        segments,
        speakers,
        duration,
        totalSpeakers: speakers.length,
        method: 'PyAnnote ONNX',
      },
    });

  } catch (error) {
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : '说话人识别失败',
      },
      { status: 500 }
    );
  }
}

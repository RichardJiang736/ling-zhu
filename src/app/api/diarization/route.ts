import { NextRequest, NextResponse } from 'next/server';
import { AssemblyAI } from 'assemblyai';

// Initialize AssemblyAI client
const client = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY || '',
});

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return NextResponse.json(
        { error: '未找到音频文件' },
        { status: 400 }
      );
    }

    if (!process.env.ASSEMBLYAI_API_KEY) {
      return NextResponse.json(
        { error: 'AssemblyAI API密钥未配置' },
        { status: 500 }
      );
    }

    // Convert File to Buffer
    const bytes = await audioFile.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload audio file to AssemblyAI
    console.log('上传音频文件...');
    const uploadUrl = await client.files.upload(buffer);

    // Start transcription with speaker diarization
    console.log('开始说话人识别...');
    const transcript = await client.transcripts.transcribe({
      audio: uploadUrl,
      speaker_labels: true, // Enable speaker diarization
      language_code: 'zh', // Chinese language
    });

    if (transcript.status === 'error') {
      throw new Error(transcript.error || '转录失败');
    }

    // Process the results
    const utterances = transcript.utterances || [];
    
    // Map speakers to custom names (说话人1, 说话人2, etc.)
    const speakerMap = new Map<string, string>();
    let speakerCount = 0;

    const sentences = utterances.map((utterance) => {
      const speakerId = utterance.speaker;
      
      // Create speaker name if not exists
      if (!speakerMap.has(speakerId)) {
        speakerCount++;
        speakerMap.set(speakerId, `说话人${speakerCount}`);
      }

      return {
        id: `${utterance.start}-${utterance.end}`,
        speaker: speakerMap.get(speakerId),
        text: utterance.text,
        startTime: utterance.start / 1000, // Convert ms to seconds
        endTime: utterance.end / 1000,
        confidence: utterance.confidence,
      };
    });

    // Get unique speakers with their info
    const speakers = Array.from(speakerMap.entries()).map(([originalId, name], index) => {
      const speakerUtterances = sentences.filter(s => s.speaker === name);
      const totalDuration = speakerUtterances.reduce(
        (sum, s) => sum + (s.endTime - s.startTime),
        0
      );

      return {
        id: (index + 1).toString(),
        name,
        utteranceCount: speakerUtterances.length,
        totalDuration,
        color: ['#276b4d', '#518764', '#76a483', '#416e54', '#b8d6b6'][index % 5],
      };
    });

    // Calculate audio duration
    const duration = transcript.audio_duration || 0;

    return NextResponse.json({
      success: true,
      data: {
        sentences,
        speakers,
        duration,
        totalSpeakers: speakerMap.size,
      },
    });

  } catch (error) {
    console.error('说话人识别错误:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : '说话人识别失败',
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

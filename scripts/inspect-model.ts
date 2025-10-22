/**
 * Script to inspect the ONNX model's input/output specifications
 * Run with: npx tsx scripts/inspect-model.ts
 */

import * as ort from 'onnxruntime-node';
import path from 'path';

async function inspectModel() {
  const modelPath = path.join(process.cwd(), 'segmentation-3.0.onnx');
  
  console.log('Loading model from:', modelPath);
  console.log('');
  
  try {
    const session = await ort.InferenceSession.create(modelPath);
    
    console.log('✅ Model loaded successfully!\n');
    
    // Input information
    console.log('📥 INPUT SPECIFICATIONS:');
    console.log('━'.repeat(50));
    session.inputNames.forEach((name, idx) => {
      console.log(`Input ${idx + 1}: "${name}"`);
      // Try to get metadata if available
      const metadata = (session as any).inputMetadata?.[name];
      if (metadata) {
        console.log(`  Type: ${metadata.type}`);
        console.log(`  Shape: [${metadata.shape?.join(', ')}]`);
      }
    });
    
    console.log('');
    
    // Output information
    console.log('📤 OUTPUT SPECIFICATIONS:');
    console.log('━'.repeat(50));
    session.outputNames.forEach((name, idx) => {
      console.log(`Output ${idx + 1}: "${name}"`);
      const metadata = (session as any).outputMetadata?.[name];
      if (metadata) {
        console.log(`  Type: ${metadata.type}`);
        console.log(`  Shape: [${metadata.shape?.join(', ')}]`);
      }
    });
    
    console.log('');
    
    // Test with dummy input
    console.log('🧪 TESTING WITH DUMMY INPUT:');
    console.log('━'.repeat(50));
    
    // PyAnnote models often expect [batch, channel, samples]
    const sampleRate = 16000;
    const duration = 1; // seconds
    const numSamples = sampleRate * duration;
    const dummyAudio = new Float32Array(numSamples);
    
    // Fill with random noise
    for (let i = 0; i < numSamples; i++) {
      dummyAudio[i] = (Math.random() * 2 - 1) * 0.1;
    }
    
    const inputName = session.inputNames[0];
    
    // Try 3D input: [batch, channel, samples]
    const inputTensor = new ort.Tensor('float32', dummyAudio, [1, 1, numSamples]);
    
    console.log(`Input shape: [1, 1, ${numSamples}] (batch, channel, samples)`);
    console.log(`Input duration: ${duration} second(s)`);
    console.log('');
    
    const feeds = { [inputName]: inputTensor };
    const results = await session.run(feeds);
    
    console.log('📊 OUTPUT RESULTS:');
    console.log('━'.repeat(50));
    Object.entries(results).forEach(([name, tensor]) => {
      console.log(`Output "${name}":`);
      console.log(`  Shape: [${tensor.dims.join(', ')}]`);
      console.log(`  Type: ${tensor.type}`);
      console.log(`  Data length: ${tensor.data.length}`);
      
      // Calculate statistics
      const dataArray = Array.from(tensor.data as Float32Array);
      
      if (dataArray.length <= 20) {
        console.log(`  Data: [${dataArray.map(v => v.toFixed(4)).join(', ')}]`);
      } else {
        const preview = dataArray.slice(0, 10);
        console.log(`  Data preview (first 10): [${preview.map(v => v.toFixed(4)).join(', ')}...]`);
      }
      const min = Math.min(...dataArray);
      const max = Math.max(...dataArray);
      const mean = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      
      console.log(`  Stats - Min: ${min.toFixed(4)}, Max: ${max.toFixed(4)}, Mean: ${mean.toFixed(4)}`);
    });
    
  } catch (error) {
    console.error('❌ Error loading or testing model:', error);
  }
}

inspectModel();

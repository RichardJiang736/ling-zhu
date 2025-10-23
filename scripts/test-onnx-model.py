#!/usr/bin/env python3
"""
Test the exported ONNX SepFormer model
"""

import numpy as np
import onnxruntime as ort

def test_onnx_model():
    model_path = 'models/sepformer/sepformer.onnx'
    
    print(f"Loading ONNX model from {model_path}")
    session = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])
    
    # Print model info
    print("\n" + "="*60)
    print("Model Inputs:")
    print("="*60)
    for inp in session.get_inputs():
        print(f"  Name: {inp.name}")
        print(f"  Shape: {inp.shape}")
        print(f"  Type: {inp.type}")
    
    print("\n" + "="*60)
    print("Model Outputs:")
    print("="*60)
    for out in session.get_outputs():
        print(f"  Name: {out.name}")
        print(f"  Shape: {out.shape}")
        print(f"  Type: {out.type}")
    
    # Test inference
    print("\n" + "="*60)
    print("Testing Inference:")
    print("="*60)
    
    # Create dummy input (5 seconds at 16kHz)
    sample_length = 16000 * 5
    dummy_audio = np.random.randn(1, sample_length).astype(np.float32)
    
    print(f"Input shape: {dummy_audio.shape}")
    print(f"Input dtype: {dummy_audio.dtype}")
    
    # Run inference
    input_name = session.get_inputs()[0].name
    output_name = session.get_outputs()[0].name
    
    try:
        result = session.run([output_name], {input_name: dummy_audio})
        output = result[0]
        
        print(f"\n✓ Inference successful!")
        print(f"  Output shape: {output.shape}")
        print(f"  Output dtype: {output.dtype}")
        print(f"  Output range: [{output.min():.4f}, {output.max():.4f}]")
        
        if len(output.shape) == 3:
            batch, sources, time = output.shape
            print(f"\n  → Model separates into {sources} sources")
            print(f"  → This is {'COMPATIBLE' if sources >= 2 else 'NOT COMPATIBLE'} with your use case")
            
            if sources == 2:
                print("\n⚠️  WARNING: Model is fixed at 2 sources")
                print("   Your code expects variable num_sources input")
                print("   You'll need to modify the TypeScript implementation")
        
    except Exception as e:
        print(f"\n✗ Inference failed: {e}")
        return False
    
    return True

if __name__ == '__main__':
    try:
        success = test_onnx_model()
        if success:
            print("\n" + "="*60)
            print("✓ ONNX model is ready to use!")
            print("="*60)
    except FileNotFoundError:
        print("✗ Model file not found. Please run export-sepformer-to-onnx.py first")
    except Exception as e:
        print(f"✗ Error: {e}")

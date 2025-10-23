#!/usr/bin/env python3
"""
Export SpeechBrain SepFormer model to ONNX format for use in Node.js
"""

import torch
import torch.onnx
import os
from speechbrain.inference.separation import SepformerSeparation

def export_sepformer_to_onnx():
    print("Loading SepFormer model...")
    model = SepformerSeparation.from_hparams(
        source='speechbrain/resepformer-wsj02mix',
        savedir='models/sepformer/temp'
    )
    
    print(f"Available modules: {list(model.mods.keys())}")
    
    # Get the underlying separation model
    # Try different possible keys
    sep_model = None
    for key in ['separator', 'sepformer', 'encoder', 'masknet']:
        if key in model.mods:
            sep_model = model.mods[key]
            print(f"Found model at key: {key}")
            break
    
    if sep_model is None:
        print("Could not find separator model. Available keys:", list(model.mods.keys()))
        print("\nTrying to use the model directly...")
        sep_model = model
    
    if hasattr(sep_model, 'eval'):
        sep_model.eval()
    
    # Create dummy inputs that match your implementation
    # Your code uses: [1, audio_length] for audio
    sample_length = 16000 * 5  # 5 seconds at 16kHz
    dummy_audio = torch.randn(1, sample_length)
    
    # Test inference first
    print("\nTesting model inference...")
    print(f"Model type: {type(model)}")
    print(f"Model methods: {[m for m in dir(model) if not m.startswith('_')]}")
    
    with torch.no_grad():
        try:
            # Try using the model's separate_file or other methods
            if hasattr(model, 'separate_batch'):
                print("\nUsing separate_batch method...")
                print(f"separate_batch signature: {model.separate_batch.__doc__}")
                # Just pass the audio tensor
                output = model.separate_batch(dummy_audio)
                print(f"Input shape: {dummy_audio.shape}")
                print(f"Output type: {type(output)}")
                if isinstance(output, torch.Tensor):
                    print(f"Output shape: {output.shape}")
                elif isinstance(output, (list, tuple)):
                    print(f"Output is list/tuple with {len(output)} elements")
                    for i, out in enumerate(output):
                        if isinstance(out, torch.Tensor):
                            print(f"  Element {i} shape: {out.shape}")
            else:
                # Direct model call
                print("Using direct model call...")
                output = sep_model(dummy_audio)
                print(f"Input shape: {dummy_audio.shape}")
                print(f"Output shape: {output.shape}")

            print(f"Expected output shape: [batch, num_sources, time]")
            
            # Check if output matches expected format
            output_tensor = output if isinstance(output, torch.Tensor) else output[0]
            
            if len(output_tensor.shape) == 3:
                batch, sources, time = output_tensor.shape
                print(f"\n✓ Model outputs {sources} sources")
                print(f"  Batch: {batch}, Sources: {sources}, Time: {time}")
            elif len(output_tensor.shape) == 2:
                # Might need to be reshaped
                print(f"\n⚠ Output shape is 2D: {output_tensor.shape}")
                print("  May need reshaping for multi-source output")
            else:
                print(f"\n✗ Unexpected output shape: {output_tensor.shape}")
                return
                
        except Exception as e:
            print(f"Error during inference test: {e}")
            import traceback
            traceback.print_exc()
            print("\n⚠ The model structure may not support direct ONNX export")
            print("Consider using PyTorch model directly via Python subprocess")
            return
    
    # Export to ONNX
    output_path = 'models/sepformer/sepformer.onnx'
    os.makedirs('models/sepformer', exist_ok=True)
    
    print(f"\nExporting to ONNX: {output_path}")
    
    try:
        torch.onnx.export(
            sep_model,
            dummy_audio,
            output_path,
            export_params=True,
            opset_version=14,
            do_constant_folding=True,
            input_names=['audio'],
            output_names=['separated_audio'],
            dynamic_axes={
                'audio': {0: 'batch', 1: 'time'},
                'separated_audio': {0: 'batch', 2: 'time'}
            }
        )
        print(f"✓ Model exported successfully to {output_path}")
        
        # Verify the exported model
        print("\nVerifying exported ONNX model...")
        import onnx
        onnx_model = onnx.load(output_path)
        onnx.checker.check_model(onnx_model)
        print("✓ ONNX model is valid")
        
        # Print model info
        print("\nModel Information:")
        print(f"  Inputs: {[inp.name for inp in onnx_model.graph.input]}")
        print(f"  Outputs: {[out.name for out in onnx_model.graph.output]}")
        
    except Exception as e:
        print(f"✗ Export failed: {e}")
        print("\nNote: The SpeechBrain model may not be directly exportable to ONNX")
        print("due to dynamic operations or custom layers.")
        return
    
    print("\n" + "="*60)
    print("Next steps:")
    print("="*60)
    print("1. Test the ONNX model with onnxruntime:")
    print("   python scripts/test-onnx-model.py")
    print("\n2. If the model is fixed at 2 sources, you may need to:")
    print("   - Use a different model that supports variable sources")
    print("   - Modify your TypeScript code to handle fixed 2-source output")
    print("   - Run the model multiple times for >2 speakers")
    print("\n3. Update your TypeScript code if needed")

if __name__ == '__main__':
    export_sepformer_to_onnx()

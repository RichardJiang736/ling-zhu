import sys
import json
import torch
import torchaudio
import numpy as np
from pathlib import Path
from speechbrain.inference.separation import SepformerSeparation

class SepFormerService:
    def __init__(self):
        self.model = None
        
    def initialize(self):
        """Load the SepFormer model"""
        if self.model is None:
            print("Loading SepFormer model...", file=sys.stderr)
            self.model = SepformerSeparation.from_hparams(
                source='speechbrain/resepformer-wsj02mix',
                savedir='models/sepformer/temp'
            )
            print("Model loaded successfully", file=sys.stderr)
    
    def separate_audio(self, input_path, output_dir, num_sources=2):
        """
        Separate audio file into sources
        
        Args:
            input_path: Path to input audio file
            output_dir: Directory to save separated sources
            num_sources: Number of sources (currently model is fixed at 2)
        
        Returns:
            List of output file paths
        """
        self.initialize()
        
        waveform, sr = torchaudio.load(input_path)
        if sr != 16000:
            resampler = torchaudio.transforms.Resample(sr, 16000)
            waveform = resampler(waveform)
            sr = 16000
        
        if waveform.shape[0] > 1:
            waveform = torch.mean(waveform, dim=0, keepdim=True)
        
        with torch.no_grad():
            separated = self.model.separate_batch(waveform)
            
        print(f"Separated audio shape: {separated.shape}", file=sys.stderr)
        
        if len(separated.shape) == 3:
            if separated.shape[1] == 2 or separated.shape[2] == 2:
                if separated.shape[2] == 2:
                    separated = separated.permute(0, 2, 1)  # -> [batch, sources, time]
            else:
                if separated.shape[1] > 2:
                    separated = separated[:, :2, :]
                else:
                    separated = separated[:, :, :2].permute(0, 2, 1)
        
        # Save separated sources
        output_paths = []
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        
        num_actual_sources = min(separated.shape[1], num_sources)
        for i in range(num_actual_sources):
            source_audio = separated[0, i, :]  # Get source i
            output_path = Path(output_dir) / f"source_{i}.wav"
            torchaudio.save(
                str(output_path),
                source_audio.unsqueeze(0),  # Add channel dimension
                sr
            )
            output_paths.append(str(output_path))
            print(f"Saved source {i} to {output_path}", file=sys.stderr)
        
        return output_paths

def main():
    if len(sys.argv) < 3:
        print(json.dumps({
            "error": "Usage: sepformer-python-service.py <input_audio> <output_dir> [num_sources]"
        }))
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_dir = sys.argv[2]
    num_sources = int(sys.argv[3]) if len(sys.argv) > 3 else 2
    try:
        service = SepFormerService()
        output_paths = service.separate_audio(input_path, output_dir, num_sources)
        print(json.dumps({
            "success": True,
            "output_paths": output_paths,
            "num_sources": len(output_paths)
        }))
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == '__main__':
    main()
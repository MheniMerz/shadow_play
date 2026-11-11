import json, sys, soundfile as sf
from kokoro_onnx import Kokoro
k = Kokoro('models/kokoro-v1.0.onnx', 'models/voices-v1.0.bin')
voice = sys.argv[1] if len(sys.argv) > 1 else 'bm_george'
speed = float(sys.argv[2]) if len(sys.argv) > 2 else 0.9
out = {}
for key, text in json.load(open('lines.json')):
    samples, sr = k.create(text, voice=voice, speed=speed, lang='en-gb')
    sf.write(f'vo_{key}.wav', samples, sr)
    out[key] = round(len(samples) / sr, 2)
json.dump(out, open('durations.json', 'w'), indent=1)
print(voice, speed, out, 'total', round(sum(out.values()), 1))

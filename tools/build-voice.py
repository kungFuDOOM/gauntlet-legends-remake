#!/usr/bin/env python3
"""Record the announcer's lines with the Kokoro neural voice (Apache-2.0) and give them an
arcade-announcer treatment (a touch deeper, compressed, with a short echo).

Writes assets/voice/<id>.mp3 plus assets/voice/index.json mapping each line's text to its
file; src/audio.js plays these and falls back to the browser's speech voice for anything
missing. Needs `pip install kokoro-onnx soundfile`, ffmpeg, and the model files from
https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0

  node tools/voice-lines.mjs > /tmp/lines.json
  python3 tools/build-voice.py /tmp/lines.json --model DIR [--voice am_michael]
"""
import argparse, hashlib, json, os, subprocess, sys, tempfile

import soundfile as sf
from kokoro_onnx import Kokoro

EFFECT = ','.join([
    'asetrate=24000*0.93', 'aresample=24000', 'atempo=1.075',     # a little deeper, same speed
    'bass=g=4:f=110',
    'acompressor=threshold=-20dB:ratio=4:attack=5:release=90',
    'aecho=0.8:0.45:40|85:0.22|0.1',                               # arena slap-back
    'loudnorm=I=-15:TP=-1.5',
])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('lines')
    ap.add_argument('--model', required=True, help='folder with kokoro-v1.0.onnx and voices-v1.0.bin')
    ap.add_argument('--voice', default='am_michael')
    ap.add_argument('--speed', type=float, default=0.92)
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'assets', 'voice'))
    a = ap.parse_args()

    lines = json.load(open(a.lines))
    os.makedirs(a.out, exist_ok=True)
    k = Kokoro(os.path.join(a.model, 'kokoro-v1.0.onnx'), os.path.join(a.model, 'voices-v1.0.bin'))
    lang = 'en-gb' if a.voice.startswith('b') else 'en-us'
    index = {}
    with tempfile.TemporaryDirectory() as tmp:
        for i, line in enumerate(lines):
            fid = hashlib.sha1(f"{a.voice}|{line['speak']}".encode()).hexdigest()[:10]
            name = f'{fid}.mp3'
            index[line['text']] = name
            dest = os.path.join(a.out, name)
            if os.path.exists(dest):
                continue
            samples, sr = k.create(line['speak'], voice=a.voice, speed=a.speed, lang=lang)
            wav = os.path.join(tmp, 'line.wav')
            sf.write(wav, samples, sr)
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', wav, '-af', EFFECT,
                            '-ac', '1', '-ar', '24000', '-b:a', '40k', dest], check=True)
            print(f'{i + 1}/{len(lines)} {line["text"][:60]}', file=sys.stderr)
    # drop recordings no line uses any more
    for f in os.listdir(a.out):
        if f.endswith('.mp3') and f not in index.values():
            os.remove(os.path.join(a.out, f))
    with open(os.path.join(a.out, 'index.json'), 'w') as f:
        json.dump({'voice': a.voice, 'lines': index}, f, indent=1, ensure_ascii=False)


if __name__ == '__main__':
    main()

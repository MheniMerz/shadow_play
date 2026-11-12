"""Place the voice lines, duck the music under them, add effects, normalise; also write subtitles."""
import subprocess, json
DUR = 60.4
starts = {'open': 1.4, 'lamp': 7.0, 'hands': 13.0, 'three': 19.25, 'size': 25.0, 'wolf': 32.0, 'duck': 38.2, 'moon': 44.2, 'title': 53.0, 'tag': 54.8}
keys = list(starts)
inputs = []
for k in keys: inputs += ['-i', f'../tts/vo_{k}.wav']
inputs += ['-i', 'music.wav', '-i', 'sfx.wav']
n = len(keys); f = []
for i, k in enumerate(keys):
    f.append(f'[{i}:a]aresample=48000,aformat=channel_layouts=mono,adelay={int(starts[k] * 1000)},apad=whole_dur={DUR}[v{i}]')
f.append(''.join(f'[v{i}]' for i in range(n)) + f'amix=inputs={n}:normalize=0:duration=longest,atrim=0:{DUR},highpass=f=70,equalizer=f=3000:t=q:w=1:g=2,aecho=0.85:0.6:45|75:0.12|0.07,pan=stereo|c0=c0|c1=c0,asplit=2[vo][vokey]')
f.append(f'[{n}:a]volume=0.95[mus]')
f.append('[mus][vokey]sidechaincompress=threshold=0.02:ratio=5:attack=30:release=500:makeup=1[musd]')
f.append(f'[{n + 1}:a]volume=0.45[fx]')
f.append(f'[vo][musd][fx]amix=inputs=3:normalize=0:duration=longest,atrim=0:{DUR},loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.89[out]')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error'] + inputs + ['-filter_complex', ';'.join(f), '-map', '[out]', '-ar', '48000', 'mix-warm.wav'], check=True)
lines = dict(json.load(open('../tts/lines.json'))); dur = json.load(open('../tts/durations.json'))
def ts(x):
    m, s = divmod(x, 60)
    return f'00:{int(m):02d}:{int(s):02d},{int(round((s - int(s)) * 1000)):03d}'
with open('shadow-play-trailer.srt', 'w') as fh:
    for i, k in enumerate(keys, 1):
        fh.write(f'{i}\n{ts(starts[k])} --> {ts(starts[k] + dur[k] + 0.3)}\n{lines[k]}\n\n')
print('ok')

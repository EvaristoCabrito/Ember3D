exec(open('work/transcribe-cutscenes.py', encoding='utf-8').read().split("model = WhisperModel")[0])
import subprocess
import imageio_ffmpeg
for path in Path('public/game').glob('*.mp4'):
    with av.open(str(path)) as c:
        print(path.name, c.duration / 1000000, [(s.type, s.codec_context.name, s.metadata) for s in c.streams], flush=True)
model = WhisperModel('small', device='cpu', compute_type='int8', cpu_threads=6)
output = Path('work/cutscene-audit')
output.mkdir(exist_ok=True)
for name in ['aldeia-intro', 'asherah-rite', 'temple-aftermath', 'vau-intro', 'portao-end', 'title-open']:
    path = Path('public/game') / (name + '.mp4')
    wav = output / (name + '.wav')
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-i', str(path), '-vn', '-ac', '1', '-ar', '16000', '-af', 'loudnorm', str(wav)], capture_output=True, check=True)
    print('AUDIT', name, flush=True)
    segments, info = model.transcribe(str(wav), beam_size=5, vad_filter=False, word_timestamps=True, condition_on_previous_text=False, no_speech_threshold=0.8)
    rows = []
    for s in segments:
        row = {'start': s.start, 'end': s.end, 'text': s.text.strip(), 'words': [{'start': w.start, 'end': w.end, 'word': w.word} for w in s.words], 'no_speech_prob': s.no_speech_prob, 'avg_logprob': s.avg_logprob}
        rows.append(row)
        print(json.dumps(row, ensure_ascii=True), flush=True)
    (output / (name + '.json')).write_text(json.dumps({'language': info.language, 'duration': info.duration, 'segments': rows}, indent=2), encoding='utf-8')

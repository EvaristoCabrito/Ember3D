exec(open('work/transcribe-cutscenes.py', encoding='utf-8').read().split("model = WhisperModel")[0])
import imageio_ffmpeg, subprocess
model = WhisperModel('small.en', device='cpu', compute_type='int8', cpu_threads=6)
output = Path('work/cutscene-audit')
output.mkdir(exist_ok=True)
for name in ['aldeia-intro', 'inn-arrival', 'smith-intro', 'wisp-entrance', 'vau-intro']:
    wav = output / (name + '.wav')
    if not wav.exists():
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-i', 'public/game/'+name+'.mp4', '-vn', '-ac', '1', '-ar', '16000', '-af', 'loudnorm', str(wav)], capture_output=True, check=True)
    print('ENGLISH AUDIT', name, flush=True)
    segments, info = model.transcribe(str(wav), language='en', beam_size=5, vad_filter=False, word_timestamps=True, condition_on_previous_text=False)
    rows=[]
    for s in segments:
        row={'start':s.start,'end':s.end,'text':s.text.strip(),'words':[{'start':w.start,'end':w.end,'word':w.word} for w in s.words], 'no_speech_prob':s.no_speech_prob,'avg_logprob':s.avg_logprob}
        rows.append(row)
        print(json.dumps(row),flush=True)
    (output / (name + '.english.json')).write_text(json.dumps(rows,indent=2),encoding='utf-8')

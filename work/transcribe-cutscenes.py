import sys, os, json
from pathlib import Path
sys.path.insert(0, str(Path('work/subtitle-tools').resolve()))
os.environ['HF_HOME'] = str(Path('work/subtitle-models').resolve())
os.environ['HF_HUB_DISABLE_XET'] = '1'
from faster_whisper import WhisperModel
import av
# PyAV 19 removed the optional metadata_errors argument used by faster-whisper.
av_open = av.open
def compatible_open(*args, **kwargs):
    kwargs.pop('metadata_errors', None)
    return av_open(*args, **kwargs)
av.open = compatible_open

model = WhisperModel('small.en', device='cpu', compute_type='int8', cpu_threads=6)
output = Path('work/cutscene-transcripts')
output.mkdir(exist_ok=True)
for path in Path('public/game').glob('*.mp4'):
    target = output / (path.stem + '.json')
    if target.exists():
        continue
    print('Transcribing', path.name, flush=True)
    segments, info = model.transcribe(str(path), language='en', beam_size=5, vad_filter=True, word_timestamps=True, condition_on_previous_text=False)
    rows = []
    for s in segments:
        row = {'start': s.start, 'end': s.end, 'text': s.text.strip(), 'words': [{'start': w.start, 'end': w.end, 'word': w.word} for w in s.words], 'no_speech_prob': s.no_speech_prob, 'avg_logprob': s.avg_logprob}
        rows.append(row)
        print(json.dumps(row), flush=True)
    target.write_text(json.dumps({'duration': info.duration, 'segments': rows}, indent=2), encoding='utf-8')

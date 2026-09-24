import { useEffect, useId, useRef, useState } from 'react';
import { useEditor, setUi, type InspectorTab } from './store';
import { useEdl, useProject, faceFound, deriveCamera } from './derive';
import {
  analyzeFaces,
  attachMusic,
  chooseCaptionStyle,
  removeMusic,
  setAsrPrefs,
  setAudio,
  setCaptions,
  setFrame,
  setTighten,
  transcribe,
  currentBackend,
  errorText,
} from './actions';
import { Segmented, Slider, Toggle, Progress } from '../ui/controls';
import { MusicIcon, TrashIcon } from '../ui/icons';
import { DEFAULT_FILLERS, OPTIONAL_FILLERS } from '../edit/fillers';
import { CAPTION_STYLES, CAPTION_STYLE_ORDER } from '../captions/styles';
import { StyleSwatch } from './StyleSwatch';
import { ASR_MODELS, LANGUAGES, type AsrModelId } from '../asr/models';
import { duration } from '../lib/format';
import { FrameMap } from './FrameMap';
import { ClipFinder } from './ClipFinder';

const TABS: { id: InspectorTab; label: string }[] = [
  { id: 'tighten', label: 'Tighten' },
  { id: 'captions', label: 'Captions' },
  { id: 'frame', label: 'Frame' },
  { id: 'audio', label: 'Audio' },
];

function Tabs() {
  const tab = useEditor((s) => s.ui.tab);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className="tabs" role="tablist" aria-label="Edit settings">
      {TABS.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          role="tab"
          type="button"
          id={`tab-${t.id}`}
          aria-selected={tab === t.id}
          aria-controls={`panel-${t.id}`}
          tabIndex={tab === t.id ? 0 : -1}
          className="tab"
          onClick={() => setUi({ tab: t.id })}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            e.preventDefault();
            const j = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
            setUi({ tab: TABS[j]!.id });
            refs.current[j]?.focus();
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function TightenTab() {
  const p = useProject()!;
  const edl = useEdl();
  const prefs = useEditor((s) => s.prefs);
  const asrJob = useEditor((s) => s.jobs.asr);
  const t = p.tighten;
  const cut = edl ? p.source.duration - edl.outDuration : 0;
  const backend = currentBackend();
  const toggleFiller = (f: string) =>
    setTighten({ fillers: t.fillers.includes(f) ? t.fillers.filter((x) => x !== f) : [...t.fillers, f] });
  const [changed, setChanged] = useState(false);

  return (
    <div className="tabpanel" role="tabpanel" id="panel-tighten" aria-labelledby="tab-tighten">
      {edl ? (
        <div className="summary">
          <div>
            <span className="summary-k">Kept</span>
            <span className="summary-v tnum is-kept">{duration(edl.outDuration)}</span>
          </div>
          <div>
            <span className="summary-k">Cut</span>
            <span className="summary-v tnum is-cut">{duration(cut)}</span>
          </div>
          <div>
            <span className="summary-k">Shorter by</span>
            <span className="summary-v tnum">{p.source.duration ? Math.round((cut / p.source.duration) * 100) : 0}%</span>
          </div>
        </div>
      ) : null}

      <ClipFinder />

      <div className="group">
        <Toggle label="Remove pauses" checked={t.removeSilences} onChange={(v) => setTighten({ removeSilences: v })} />
        <Slider
          label="Shortest pause to cut"
          value={t.minSilence}
          min={0.2}
          max={2}
          step={0.05}
          format={(v) => `${v.toFixed(2)} s`}
          disabled={!t.removeSilences}
          onChange={(v) => setTighten({ minSilence: v }, 'minSilence')}
        />
        <Slider
          label="Breathing room at each cut"
          value={t.padding}
          min={0}
          max={0.4}
          step={0.01}
          format={(v) => `${Math.round(v * 1000)} ms`}
          onChange={(v) => setTighten({ padding: v }, 'padding')}
        />
        <Slider
          label="What counts as silence"
          value={t.sensitivity}
          min={6}
          max={24}
          step={1}
          format={(v) => `${v} dB over room noise`}
          hint="Raise it if cuts land on quiet words; lower it if breaths and room noise survive."
          disabled={!t.removeSilences}
          onChange={(v) => setTighten({ sensitivity: v }, 'sensitivity')}
        />
      </div>

      <div className="group">
        <Toggle label="Remove filler words" checked={t.removeFillers} onChange={(v) => setTighten({ removeFillers: v })} />
        <div className="chips" role="group" aria-label="Filler words to remove">
          {[...DEFAULT_FILLERS, ...OPTIONAL_FILLERS].map((f) => (
            <button
              key={f}
              type="button"
              className="chip"
              aria-pressed={t.fillers.includes(f)}
              disabled={!t.removeFillers}
              onClick={() => toggleFiller(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <p className="ctl-hint">“like”, “you know”, “so” and “basically” only go where they’re fillers, like “it was, like, huge”.</p>
        <Toggle
          label="Cut sounds Whisper skipped"
          hint="Whisper often leaves out ums and false starts. This cuts voiced sounds between words that it didn’t transcribe."
          checked={t.cutUntranscribed}
          onChange={(v) => setTighten({ cutUntranscribed: v })}
        />
      </div>

      <div className="group">
        <h3 className="group-title">Transcription</h3>
        <Segmented<AsrModelId>
          label="Model"
          value={prefs.model}
          onChange={(v) => {
            setAsrPrefs({ model: v });
            setChanged(true);
          }}
          options={(Object.keys(ASR_MODELS) as AsrModelId[]).map((id) => ({
            value: id,
            label: (
              <span className="model-opt">
                <b>{ASR_MODELS[id].label}</b>
                <small className="tnum">{ASR_MODELS[id].downloadMB[backend]} MB</small>
              </span>
            ),
            title: ASR_MODELS[id].blurb,
          }))}
        />
        <p className="ctl-hint">
          {ASR_MODELS[prefs.model].blurb} Downloaded once, then cached by your browser.
          {backend === 'wasm' ? ' No WebGPU here, so it runs on your CPU and takes longer.' : ''}
        </p>
        <label className="field">
          <span className="ctl-label">Spoken language</span>
          <select
            value={prefs.language}
            onChange={(e) => {
              setAsrPrefs({ language: e.currentTarget.value });
              setChanged(true);
            }}
          >
            <option value="auto">Detect automatically</option>
            {LANGUAGES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <Toggle
          label="Translate captions to English"
          checked={prefs.translate}
          onChange={(v) => {
            setAsrPrefs({ translate: v });
            setChanged(true);
          }}
        />
        <button
          type="button"
          className="btn btn-secondary"
          disabled={asrJob.state === 'running'}
          onClick={() => {
            setChanged(false);
            void transcribe();
          }}
        >
          {p.transcript ? 'Transcribe again' : 'Transcribe'}
        </button>
        {changed && p.transcript ? (
          <p className="ctl-hint">Transcribing again replaces the transcript and clears word edits. Undo history starts over.</p>
        ) : null}
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  const presets = ['#FFFFFF', '#FFD426', '#2BD4E0', '#FF3D8B', '#7EE787', '#1C1D20'];
  return (
    <div className="color-field">
      <label htmlFor={id} className="ctl-label">
        {label}
      </label>
      <div className="swatches">
        {presets.map((c) => (
          <button
            key={c}
            type="button"
            className="swatch"
            style={{ background: c }}
            aria-label={`${label}: ${c}`}
            aria-pressed={value.toUpperCase() === c}
            onClick={() => onChange(c)}
          />
        ))}
        <input id={id} type="color" value={value} onChange={(e) => onChange(e.currentTarget.value.toUpperCase())} />
      </div>
    </div>
  );
}

function CaptionsTab() {
  const p = useProject()!;
  const emphasize = useEditor((s) => s.ui.emphasize);
  const c = p.captions;
  return (
    <div className="tabpanel" role="tabpanel" id="panel-captions" aria-labelledby="tab-captions">
      <Toggle label="Show captions" checked={c.enabled} onChange={(v) => setCaptions({ enabled: v })} />
      <div className="styles-grid" role="radiogroup" aria-label="Caption style">
        {CAPTION_STYLE_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={c.style === id}
            className="style-card"
            onClick={() => chooseCaptionStyle(id)}
            disabled={!c.enabled}
          >
            <StyleSwatch styleId={id} />
            <span className="style-name">{CAPTION_STYLES[id].name}</span>
          </button>
        ))}
      </div>
      <p className="ctl-hint">{CAPTION_STYLES[c.style].blurb}</p>
      <div className="group">
        <Slider label="Size" value={c.size} min={0.6} max={1.6} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setCaptions({ size: v }, 'capsize')} />
        <Slider
          label="Height on screen"
          value={c.position}
          min={0.1}
          max={0.9}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}% down`}
          hint="Captions stay inside the area app buttons and descriptions don’t cover."
          onChange={(v) => setCaptions({ position: v }, 'cappos')}
        />
        <Slider label="Words per line" value={c.wordsPerLine} min={1} max={8} step={1} onChange={(v) => setCaptions({ wordsPerLine: v }, 'capwpl')} />
        <Segmented<1 | 2> label="Lines" value={c.lines} onChange={(v) => setCaptions({ lines: v })} options={[{ value: 1, label: 'One' }, { value: 2, label: 'Two' }]} />
        <Toggle label="All caps" checked={c.uppercase} onChange={(v) => setCaptions({ uppercase: v })} />
      </div>
      <div className="group">
        <ColorField label="Text" value={c.textColor} onChange={(v) => setCaptions({ textColor: v }, 'captext')} />
        <ColorField label="Highlight" value={c.highlightColor} onChange={(v) => setCaptions({ highlightColor: v }, 'caphi')} />
      </div>
      <div className="group">
        <Toggle
          label="Emphasize words"
          hint={`Click words in the transcript to give them the highlight colour for good. ${c.emphasized.length ? `${c.emphasized.length} emphasized.` : ''}`}
          checked={emphasize}
          onChange={(v) => setUi({ emphasize: v })}
        />
        {c.emphasized.length ? (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setCaptions({ emphasized: [] })}>
            Clear emphasis
          </button>
        ) : null}
      </div>
    </div>
  );
}

function FrameTab() {
  const p = useProject()!;
  const faces = useEditor((s) => s.jobs.faces);
  const f = p.frame;
  const found = faceFound(p);
  const camera = deriveCamera(p);
  const sameShape = Math.abs(p.source.width / p.source.height - { '9:16': 9 / 16, '1:1': 1, '4:5': 0.8, '16:9': 16 / 9 }[f.aspect]) < 0.01;
  return (
    <div className="tabpanel" role="tabpanel" id="panel-frame" aria-labelledby="tab-frame">
      <Segmented
        label="Framing"
        value={f.mode}
        onChange={(v) => setFrame({ mode: v })}
        options={[
          { value: 'auto', label: 'Follow face' },
          { value: 'center', label: 'Center' },
          { value: 'manual', label: 'Manual' },
        ]}
      />
      {sameShape ? (
        <p className="ctl-hint">The video is already {f.aspect}, so there’s nothing to crop.</p>
      ) : f.mode === 'auto' ? (
        faces.state === 'running' ? (
          <div className="job">
            <div className="job-line">
              <b>Finding faces</b>
            </div>
            <Progress value={faces.progress} label="Finding faces" />
            <p className="job-detail">Centered until this finishes. The face model is about 12 MB, downloaded once.</p>
          </div>
        ) : faces.state === 'error' ? (
          <div className="notice is-error">
            Face tracking couldn’t start ({faces.error}). Using the center of the frame.{' '}
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => void analyzeFaces()}>
              Try again
            </button>
          </div>
        ) : found === false || (found && !camera) ? (
          <p className="notice">No face found in this video, so the crop stays centered. Switch to Manual to place it yourself.</p>
        ) : (
          <p className="ctl-hint">The crop follows the main face like a camera operator: it ignores small movements and glides on big ones.</p>
        )
      ) : null}
      {f.mode === 'manual' && !sameShape ? (
        <>
          <FrameMap />
          <Slider label="Left to right" value={f.manualX} min={0} max={1} step={0.005} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setFrame({ manualX: v }, 'mx')} />
          {p.source.width / p.source.height < { '9:16': 9 / 16, '1:1': 1, '4:5': 0.8, '16:9': 16 / 9 }[f.aspect] ? (
            <Slider label="Top to bottom" value={f.manualY} min={0} max={1} step={0.005} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setFrame({ manualY: v }, 'my')} />
          ) : null}
        </>
      ) : null}
      <div className="group">
        <Toggle
          label="Punch in at jump cuts"
          hint="Alternates a slight zoom at every cut so jumps read as deliberate. Standard short-form technique."
          checked={f.punchIn}
          onChange={(v) => setFrame({ punchIn: v })}
        />
        <Slider
          label="Punch-in amount"
          value={f.punchAmount}
          min={1.04}
          max={1.35}
          step={0.01}
          format={(v) => `${Math.round((v - 1) * 100)}%`}
          disabled={!f.punchIn}
          onChange={(v) => setFrame({ punchAmount: v }, 'punch')}
        />
      </div>
    </div>
  );
}

function AudioTab() {
  const p = useProject()!;
  const music = useEditor((s) => s.music);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const m = p.audio.music;
  useEffect(() => setError(null), [music]);
  return (
    <div className="tabpanel" role="tabpanel" id="panel-audio" aria-labelledby="tab-audio">
      <Toggle
        label="Normalize loudness"
        checked={p.audio.normalize}
        onChange={(v) => setAudio({ normalize: v })}
        hint="Sets the export to −14 LUFS, the level TikTok, Reels and YouTube play at, with a limiter so peaks never clip (−1 dBTP)."
      />
      <div className="group">
        <h3 className="group-title">Background music</h3>
        {m && music ? (
          <>
            <div className="music-row">
              <MusicIcon />
              <span className="music-name" title={m.name}>
                {m.name}
              </span>
              <button type="button" className="icon-btn" aria-label="Remove music" onClick={() => void removeMusic()}>
                <TrashIcon />
              </button>
            </div>
            <Slider label="Music level" value={m.volume} min={-36} max={0} step={1} format={(v) => `${v} dB`} onChange={(v) => setAudio({ music: { ...m, volume: v } }, 'mvol')} />
            <Toggle label="Duck under speech" hint="Dips the music 12 dB while you talk, using the word timings." checked={m.duck} onChange={(v) => setAudio({ music: { ...m, duck: v } })} />
            <Slider label="Fade in" value={m.fadeIn} min={0} max={5} step={0.1} format={(v) => `${v.toFixed(1)} s`} onChange={(v) => setAudio({ music: { ...m, fadeIn: v } }, 'mfi')} />
            <Slider label="Fade out" value={m.fadeOut} min={0} max={5} step={0.1} format={(v) => `${v.toFixed(1)} s`} onChange={(v) => setAudio({ music: { ...m, fadeOut: v } }, 'mfo')} />
          </>
        ) : m && !music ? (
          <p className="notice">
            This project used <b>{m.name}</b>. Add it again to hear it.{' '}
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => input.current?.click()}>
              Add {m.name}
            </button>
          </p>
        ) : (
          <>
            <p className="ctl-hint">Add a track you have the rights to. It loops to fit and stays on this device.</p>
            <button type="button" className="btn btn-secondary" onClick={() => input.current?.click()}>
              <MusicIcon /> Add music
            </button>
          </>
        )}
        {error ? <p className="notice is-error">{error}</p> : null}
        <input
          ref={input}
          type="file"
          accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
          className="visually-hidden"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (file) attachMusic(file).catch((err) => setError(errorText(err)));
          }}
        />
      </div>
    </div>
  );
}

export function Inspector() {
  const tab = useEditor((s) => s.ui.tab);
  const p = useProject();
  if (!p) return null;
  return (
    <aside className="inspector" aria-label="Settings">
      <Tabs />
      <div className="inspector-body">
        {tab === 'tighten' ? <TightenTab /> : tab === 'captions' ? <CaptionsTab /> : tab === 'frame' ? <FrameTab /> : <AudioTab />}
      </div>
    </aside>
  );
}

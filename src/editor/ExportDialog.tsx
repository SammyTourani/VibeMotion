import { useEffect, useRef, useState } from 'react';
import { Dialog, Progress, Segmented } from '../ui/controls';
import { useEditor, setUi, getState } from './store';
import { deriveCaptionWords, outputSize, useEdl, useProject } from './derive';
import { projectJson, openProjectFile } from './actions';
import { buildCues, toSrt, toTxt, toVtt } from '../export/subtitles';
import { downloadBlob, downloadText } from '../lib/download';
import { baseName, duration, megabytes, timecode } from '../lib/format';
import type { ExportProgress, ExportResult } from '../export/exportVideo';
import { DownloadIcon } from '../ui/icons';

type Phase = { kind: 'idle' } | { kind: 'running'; p: ExportProgress } | { kind: 'done'; r: ExportResult } | { kind: 'error'; message: string };

export function ExportDialog() {
  const open = useEditor((s) => s.ui.exportOpen);
  const p = useProject();
  const edl = useEdl();
  const media = useEditor((s) => s.media);
  const [res, setRes] = useState<'1080' | '720'>('1080');
  const [fpsMode, setFpsMode] = useState<'source' | '30'>('source');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const [projectMsg, setProjectMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setProjectMsg(null);
  }, [open]);

  if (!p || !edl || !media) return null;
  const stem = `${baseName(p.source.name)}-vibemotion`;
  const srcFps = Math.min(60, Math.round(p.source.fps * 100) / 100);
  const fps = fpsMode === '30' ? 30 : srcFps;
  const size = outputSize(p.frame.aspect, res === '720' ? 2 / 3 : 1);
  const running = phase.kind === 'running';

  const start = async () => {
    const abort = new AbortController();
    abortRef.current = abort;
    setPhase({ kind: 'running', p: { stage: 'audio', fraction: 0 } });
    try {
      const { exportMp4 } = await import('../export/exportVideo');
      const r = await exportMp4({
        project: p,
        edl,
        media,
        scale: res === '720' ? 2 / 3 : 1,
        fps,
        music: getState().music?.buffer ?? null,
        onProgress: (prog) => setPhase({ kind: 'running', p: prog }),
        signal: abort.signal,
      });
      setPhase({ kind: 'done', r });
      downloadBlob(r.blob, `${stem}.mp4`);
    } catch (err) {
      if (abort.signal.aborted) {
        setPhase({ kind: 'idle' });
        return;
      }
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      abortRef.current = null;
    }
  };

  const close = () => {
    if (running) return;
    setUi({ exportOpen: false });
    setPhase({ kind: 'idle' });
  };

  const words = deriveCaptionWords(p, edl);
  const stageLabel = (pr: ExportProgress) =>
    pr.stage === 'audio'
      ? 'Mixing and levelling the audio'
      : pr.stage === 'finalize'
        ? 'Finishing the file'
        : `Rendering frame ${pr.frame ?? 0} of ${pr.frames ?? 0}`;

  return (
    <Dialog open={open} onClose={close} title="Export" wide closeLabel="Close export">
      <div className="export">
        <section className="export-main" aria-label="Video">
          <div className="export-spec">
            <div>
              <span className="summary-k">Video</span>
              <span className="summary-v tnum">
                {size.w} × {size.h}
              </span>
            </div>
            <div>
              <span className="summary-k">Length</span>
              <span className="summary-v tnum">{timecode(edl.outDuration)}</span>
            </div>
            <div>
              <span className="summary-k">Frame rate</span>
              <span className="summary-v tnum">{fps} fps</span>
            </div>
          </div>

          {phase.kind === 'idle' || phase.kind === 'error' ? (
            <>
              <Segmented label="Resolution" value={res} onChange={setRes} options={[{ value: '1080', label: '1080p' }, { value: '720', label: '720p' }]} />
              <Segmented
                label="Frame rate"
                value={fpsMode}
                onChange={setFpsMode}
                options={[
                  { value: 'source', label: `Match source (${srcFps} fps)` },
                  { value: '30', label: '30 fps' },
                ]}
              />
              <p className="ctl-hint">
                H.264 video and AAC audio in an MP4, loudness set to −14 LUFS. Rendering happens on this device; keep this tab open until it finishes.
              </p>
              {phase.kind === 'error' ? (
                <p className="notice is-error" role="alert">
                  <b>The export stopped.</b> {phase.message}
                </p>
              ) : null}
              <button type="button" className="btn btn-primary btn-lg export-go" onClick={() => void start()}>
                Export MP4
              </button>
            </>
          ) : phase.kind === 'running' ? (
            <div className="export-progress" role="status" aria-live="polite">
              <div className="job-line">
                <b>{stageLabel(phase.p)}</b>
                <span className="tnum">{Math.floor(phase.p.fraction * 100)}%</span>
              </div>
              <Progress value={phase.p.fraction} label="Export progress" />
              <p className="job-detail tnum">
                {phase.p.eta != null ? `About ${duration(Math.max(1, phase.p.eta))} left` : 'Estimating time left…'}
              </p>
              <button type="button" className="btn btn-secondary" onClick={() => abortRef.current?.abort()}>
                Cancel export
              </button>
            </div>
          ) : (
            <div className="export-done" role="status">
              <p className="export-done-title">Exported {stem}.mp4</p>
              <p className="job-detail tnum">
                {megabytes(phase.r.blob.size)}, {phase.r.width} × {phase.r.height}, {phase.r.videoCodec === 'avc' ? 'H.264' : phase.r.videoCodec.toUpperCase()} +{' '}
                {phase.r.audioCodec === 'aac' ? 'AAC' : phase.r.audioCodec.toUpperCase()}
                {phase.r.loudness != null && Number.isFinite(phase.r.loudness) ? `, levelled from ${phase.r.loudness.toFixed(1)} to −14 LUFS` : ''}.
              </p>
              {phase.r.warnings.map((w) => (
                <p key={w} className="notice">
                  {w}
                </p>
              ))}
              <div className="export-actions">
                <button type="button" className="btn btn-primary" onClick={() => downloadBlob(phase.r.blob, `${stem}.mp4`)}>
                  <DownloadIcon /> Download MP4 again
                </button>
                <button type="button" className="btn btn-quiet" onClick={() => setPhase({ kind: 'idle' })}>
                  Export another
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="export-side" aria-labelledby="export-files">
          <h3 id="export-files" className="group-title">
            Captions and project
          </h3>
          <p className="ctl-hint">Subtitle files use the edited timing, so they line up with the MP4.</p>
          <div className="file-buttons">
            <button type="button" className="btn btn-secondary btn-sm" disabled={!words.length} onClick={() => downloadText(toSrt(buildCues(words)), `${stem}.srt`, 'application/x-subrip')}>
              SRT
            </button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={!words.length} onClick={() => downloadText(toVtt(buildCues(words)), `${stem}.vtt`, 'text/vtt')}>
              VTT
            </button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={!words.length} onClick={() => downloadText(toTxt(words), `${stem}.txt`)}>
              TXT
            </button>
          </div>
          <div className="file-buttons">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => downloadText(projectJson(), `${stem}.vibemotion.json`, 'application/json')}>
              Save project
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => projectInput.current?.click()}>
              Open project
            </button>
          </div>
          {projectMsg ? <p className="notice">{projectMsg}</p> : null}
          <input
            ref={projectInput}
            type="file"
            accept=".json,application/json"
            className="visually-hidden"
            tabIndex={-1}
            onChange={async (e) => {
              const f = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (!f) return;
              const err = await openProjectFile(f);
              setProjectMsg(err ?? 'Project opened.');
            }}
          />
        </section>
      </div>
    </Dialog>
  );
}

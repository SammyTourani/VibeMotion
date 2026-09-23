#!/usr/bin/env node
// Generates public/sample/sample.mp4 entirely on this machine:
//   narration: macOS `say` (Samantha), assembled with deliberate long pauses
//   picture:   scripts/sample/scene.js drawn frame by frame in headless Chrome
//   encode:    ffmpeg (x264 + AAC)
// No third-party footage or audio is used. Requires macOS, ffmpeg and Chrome.
//
//   pnpm sample

import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/sample/sample.mp4');
const W = 1920;
const H = 1080;
const FPS = 30;
const RATE = 48000;
const VOICE = 'Samantha';

// The narration, in pieces, with the silence (seconds) that follows each one.
// The long pauses and the fillers ("um", "uh", "basically") are deliberate:
// they are what the editor removes.
const SCRIPT = [
  { text: 'Hey, this is a quick test of Vibe Motion.', pause: 1.4 },
  { text: 'Um, basically, the whole edit happens right here in the browser.', pause: 1.1 },
  { text: 'Nothing gets uploaded.', pause: 1.6 },
  { text: 'It finds the long pauses, uh, and the filler words, and it cuts them out.', pause: 1.3 },
  { text: 'Then it follows my face,', pause: 0.8, move: true },
  { text: 'turns the shot vertical,', pause: 0.5 },
  { text: 'and adds these captions.', pause: 1.5 },
  { text: 'Pretty neat, right?', pause: 0 },
];
const LEAD_IN = 0.7;
const TAIL = 1.0;

const work = mkdtempSync(join(tmpdir(), 'vibemotion-sample-'));
const run = (cmd, args) =>
  execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });

function pcmDuration(file) {
  const out = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(out.toString().trim());
}

try {
  // 1. Speak each piece, then lay them out on a timeline with silences.
  const pieces = [];
  let cursor = LEAD_IN;
  SCRIPT.forEach((line, i) => {
    const aiff = join(work, `line${i}.aiff`);
    run('say', ['-v', VOICE, '-r', '172', '-o', aiff, line.text]);
    const wav = join(work, `line${i}.wav`);
    run('ffmpeg', ['-y', '-v', 'error', '-i', aiff, '-ac', '1', '-ar', String(RATE), wav]);
    const dur = pcmDuration(wav);
    pieces.push({ ...line, wav, start: cursor, dur });
    cursor += dur + line.pause;
  });
  const total = cursor + TAIL;

  // 2. Mix: pieces at their offsets + quiet room tone, so silence is not
  //    digital zero (real microphones never are).
  const inputs = [];
  const filters = [];
  pieces.forEach((p, i) => {
    inputs.push('-i', p.wav);
    const ms = Math.round(p.start * 1000);
    filters.push(`[${i}:a]adelay=${ms}|${ms}[d${i}]`);
  });
  const n = pieces.length;
  filters.push(
    `anoisesrc=color=brown:amplitude=0.0035:sample_rate=${RATE}:duration=${total.toFixed(3)}:seed=7[room]`,
  );
  filters.push(
    `${pieces.map((_, i) => `[d${i}]`).join('')}[room]amix=inputs=${n + 1}:normalize=0:duration=longest,` +
      `atrim=0:${total.toFixed(3)},volume=0.9[mix]`,
  );
  const narration = join(work, 'narration.wav');
  run('ffmpeg', [
    '-y', '-v', 'error', ...inputs, '-filter_complex', filters.join(';'), '-map', '[mix]',
    '-ac', '1', '-ar', String(RATE), '-c:a', 'pcm_s16le', narration,
  ]);

  // 3. Mouth envelope: RMS per video frame, compressed and smoothed.
  const raw = run('ffmpeg', ['-v', 'error', '-i', narration, '-f', 'f32le', '-ac', '1', '-ar', String(RATE), '-']);
  const pcm = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
  const frames = Math.ceil(total * FPS);
  const hop = RATE / FPS;
  const rms = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let acc = 0;
    const a = Math.floor(f * hop);
    const b = Math.min(pcm.length, Math.floor((f + 1) * hop));
    for (let i = a; i < b; i++) acc += pcm[i] * pcm[i];
    rms[f] = Math.sqrt(acc / Math.max(1, b - a));
  }
  const sorted = Array.from(rms).sort((x, y) => x - y);
  const ref = sorted[Math.floor(sorted.length * 0.95)] || 1;
  const mouth = new Float32Array(frames);
  let m = 0;
  for (let f = 0; f < frames; f++) {
    const target = Math.min(1, Math.sqrt(Math.max(0, rms[f] - 0.004) / ref));
    m += (target - m) * (target > m ? 0.6 : 0.35);
    mouth[f] = m;
  }

  // 4. Choreography: the presenter sits right of centre, leans left while
  //    saying "Then it follows my face", and settles back afterwards.
  const move = pieces.find((p) => p.move);
  const smooth = (x) => x * x * (3 - 2 * x);
  const lerp = (a, b, k) => a + (b - a) * k;
  function headX(t) {
    const home = 0.665;
    const away = 0.47;
    const leaveAt = move.start;
    const arriveAt = move.start + 1.3;
    const backAt = move.start + move.dur + move.pause + 1.6;
    const homeAt = backAt + 1.6;
    let x;
    if (t < leaveAt) x = home;
    else if (t < arriveAt) x = lerp(home, away, smooth((t - leaveAt) / (arriveAt - leaveAt)));
    else if (t < backAt) x = away;
    else if (t < homeAt) x = lerp(away, home + 0.03, smooth((t - backAt) / (homeAt - backAt)));
    else x = home + 0.03;
    return x + 0.008 * Math.sin(t * 0.9) + 0.004 * Math.sin(t * 2.3 + 1);
  }
  const blinks = [];
  for (let t = 1.6; t < total; t += 2.6 + ((t * 7.3) % 1.7)) blinks.push(t);
  function blink(t) {
    for (const b of blinks) {
      const d = t - b;
      if (d >= 0 && d < 0.16) return Math.sin((d / 0.16) * Math.PI);
    }
    return 0;
  }

  // 5. Render frames in Chrome and pipe them into ffmpeg.
  mkdirSync(dirname(OUT), { recursive: true });
  const ffmpeg = spawn(
    'ffmpeg',
    [
      '-y', '-v', 'error',
      '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(FPS), '-i', '-',
      '-i', narration,
      '-map', '0:v', '-map', '1:a',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-tune', 'animation',
      '-g', '30', '-keyint_min', '30', '-sc_threshold', '0', '-bf', '2',
      '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1', '-colorspace', 'bt709',
      '-color_primaries', 'bt709', '-color_trc', 'bt709',
      '-c:a', 'aac', '-b:a', '80k', '-ac', '1', '-ar', String(RATE),
      '-shortest', '-movflags', '+faststart',
      '-metadata', 'title=VibeMotion sample clip',
      '-metadata', 'comment=Generated locally by scripts/make-sample.mjs (macOS say + Canvas 2D).',
      OUT,
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );
  const done = new Promise((resolve, reject) => {
    ffmpeg.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
    await page.setContent('<canvas id="c"></canvas>');
    const scene = readFileSync(join(ROOT, 'scripts/sample/scene.js'), 'utf8').replace(/^export /gm, '');
    await page.addScriptTag({ content: `${scene}\nwindow.drawScene = drawScene;` });
    await page.evaluate(([w, h]) => {
      const c = document.getElementById('c');
      c.width = w;
      c.height = h;
      window.ctx = c.getContext('2d');
    }, [W, H]);

    for (let f = 0; f < frames; f++) {
      const t = f / FPS;
      const talking = mouth[f] > 0.05 ? 1 : 0;
      const state = {
        t,
        mouth: mouth[f],
        blink: blink(t),
        x: headX(t),
        y: 0.415 + 0.006 * Math.sin(t * 1.7) - 0.01 * mouth[f] * talking,
        tilt: 0.035 * Math.sin(t * 0.8) + 0.015 * Math.sin(t * 2.1),
        look: 0.3 * Math.sin(t * 0.5),
      };
      const b64 = await page.evaluate(([s, w, h]) => {
        window.drawScene(window.ctx, w, h, s);
        return document.getElementById('c').toDataURL('image/png').split(',')[1];
      }, [state, W, H]);
      if (!ffmpeg.stdin.write(Buffer.from(b64, 'base64'))) {
        await new Promise((r) => ffmpeg.stdin.once('drain', r));
      }
      if (f % 150 === 0) process.stdout.write(`  frame ${f}/${frames}\n`);
    }
  } finally {
    await browser.close();
    ffmpeg.stdin.end();
  }
  await done;

  const size = statSync(OUT).size;
  console.log(`\nWrote ${OUT}`);
  console.log(`  ${(size / 1024 / 1024).toFixed(2)} MB, ${total.toFixed(2)} s, ${W}x${H} @ ${FPS} fps`);
  for (const p of pieces) {
    console.log(`  ${p.start.toFixed(2).padStart(6)}s  ${p.text}`);
  }
  if (size > 3 * 1024 * 1024) {
    console.error('Sample is over the 3 MB budget.');
    process.exitCode = 1;
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

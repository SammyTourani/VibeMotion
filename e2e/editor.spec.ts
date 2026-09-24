import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { test, expect, BASE, ARTIFACTS, forgetProjects, waitForDownload, saveArtifact } from './fixtures';

const SOURCE_DURATION = 27.0;

async function outDuration(page: import('@playwright/test').Page): Promise<number> {
  return Number(await page.locator('[data-out-duration]').getAttribute('data-out-duration'));
}

function ffprobe(file: string) {
  const json = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,channels,sample_rate', '-of', 'json', file]);
  return JSON.parse(json.toString()) as {
    format: { duration: string };
    streams: { codec_type: string; codec_name: string; width?: number; height?: number; channels?: number; sample_rate?: string }[];
  };
}

function srtCues(text: string) {
  const toSec = (s: string) => {
    const [h, m, rest] = s.split(':');
    const [sec, ms] = rest!.split(',');
    return Number(h) * 3600 + Number(m) * 60 + Number(sec) + Number(ms) / 1000;
  };
  return text
    .trim()
    .split(/\n\n+/)
    .map((block) => {
      const lines = block.split('\n');
      const [a, b] = lines[1]!.split(' --> ');
      return { start: toSec(a!), end: toSec(b!), text: lines.slice(2).join(' ') };
    });
}

test.describe.serial('editor, with the sample clip', () => {
  test('transcribes, tightens, edits, exports', async ({ page, consoleErrors }) => {
    await forgetProjects(page);

    // 1. From the landing page, "Try the sample clip" runs the real pipeline.
    await page.goto(BASE);
    await page.getByRole('button', { name: 'Try the sample clip' }).first().click();
    await expect(page).toHaveURL(/#\/edit/);
    await expect(page.locator('.transcript-body .w').first()).toBeVisible({ timeout: 10 * 60_000 });

    // 2. Transcript shown; fillers and pauses cut automatically; output shorter.
    const words = page.locator('.transcript-body .w');
    expect(await words.count()).toBeGreaterThan(40);
    await expect(page.locator('.w.is-filler').first()).toBeVisible();
    expect(await page.locator('.pause.is-cut').count()).toBeGreaterThan(3);
    const tightened = await outDuration(page);
    expect(tightened).toBeGreaterThan(10);
    expect(tightened).toBeLessThan(SOURCE_DURATION - 4);
    // Wait for face tracking so the export is reframed.
    await page.getByRole('tab', { name: 'Frame' }).click();
    await expect(page.locator('.inspector .job')).toHaveCount(0, { timeout: 5 * 60_000 });
    await page.screenshot({ path: join(ARTIFACTS, 'screens/editor-1440.png') });

    // 3. Delete a word range, undo, redo.
    await page.locator('.w', { hasText: /^whole$/ }).click();
    await page.locator('.w', { hasText: /^happens$/ }).click({ modifiers: ['Shift'] });
    await expect(page.locator('.w.is-sel')).toHaveCount(3);
    await page.keyboard.press('Delete');
    await expect(page.locator('.w.is-deleted')).toHaveCount(3);
    const afterCut = await outDuration(page);
    expect(afterCut).toBeLessThan(tightened - 0.5);

    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('.w.is-deleted')).toHaveCount(0);
    expect(await outDuration(page)).toBeCloseTo(tightened, 3);

    await page.keyboard.press('Shift+ControlOrMeta+z');
    await expect(page.locator('.w.is-deleted')).toHaveCount(3);
    const finalDuration = await outDuration(page);
    expect(finalDuration).toBeCloseTo(afterCut, 3);

    // 4. Export the 9:16 MP4 and check it with ffprobe.
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('button', { name: 'Export MP4' }).click();
    const mp4 = await waitForDownload(page, 0);
    expect(mp4.name).toBe('sample-clip-vibemotion.mp4');
    const file = saveArtifact(`exports/${mp4.name}`, mp4.bytes);
    await expect(page.getByText(/^Exported /)).toBeVisible();
    const probe = ffprobe(file);
    const video = probe.streams.find((s) => s.codec_type === 'video')!;
    const audio = probe.streams.find((s) => s.codec_type === 'audio');
    expect(video.codec_name).toBe('h264');
    expect(video.width).toBe(1080);
    expect(video.height).toBe(1920);
    expect(audio?.codec_name).toBe('aac');
    expect(audio?.channels).toBe(2);
    expect(Math.abs(Number(probe.format.duration) - finalDuration)).toBeLessThanOrEqual(0.1);
    // Three frames to look at.
    for (const [i, t] of [1, finalDuration / 2, finalDuration - 1.5].entries()) {
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', t.toFixed(2), '-i', file, '-frames:v', '1', join(ARTIFACTS, `exports/frame-${i + 1}.png`)]);
    }

    // 5. SRT timings are in output time.
    await page.getByRole('button', { name: 'SRT' }).click();
    const srt = await waitForDownload(page, 1);
    expect(srt.name).toBe('sample-clip-vibemotion.srt');
    saveArtifact(`exports/${srt.name}`, srt.bytes);
    const cues = srtCues(srt.bytes.toString('utf8'));
    expect(cues.length).toBeGreaterThan(3);
    expect(cues[0]!.start).toBeLessThan(0.6);
    for (const c of cues) {
      expect(c.end).toBeGreaterThan(c.start);
      expect(c.end).toBeLessThanOrEqual(finalDuration + 1);
    }
    // "Pretty neat, right?" is said at 24.9 s in the source; after the cuts it
    // lands in the last few seconds of the edit.
    const last = cues.find((c) => /Pretty neat/.test(c.text))!;
    expect(last.start).toBeLessThan(finalDuration);
    expect(last.start).toBeGreaterThan(finalDuration - 4);
    expect(last.start).toBeLessThan(20);

    await page.keyboard.press('Escape');
    expect(consoleErrors).toEqual([]);
  });

  test('opens a file from the landing page, cuts on the timeline, round-trips a project file, cancels and exports square 720p', async ({ page, consoleErrors }) => {
    await page.goto(BASE);
    // "Drop a clip" opens a file picker; hand it the sample file directly.
    const sample = join(process.cwd(), 'public/sample/sample.mp4');
    await page.locator('input[type=file]').setInputFiles(sample);
    await expect(page).toHaveURL(/#\/edit/);
    const restore = page.getByRole('button', { name: 'Restore your edits' });
    const words = page.locator('.transcript-body .w').first();
    await expect(restore.or(words)).toBeVisible({ timeout: 10 * 60_000 });
    if (await restore.isVisible()) await page.getByRole('button', { name: 'Start over' }).click();
    await expect(words).toBeVisible({ timeout: 10 * 60_000 });
    await expect(page.locator('.doc-name')).toHaveText('sample.mp4');
    const before = await outDuration(page);

    // Drag across the waveform, then cut that stretch.
    const canvas = page.locator('.timeline-canvas');
    const box = (await canvas.boundingBox())!;
    const y = box.y + 60;
    await page.mouse.move(box.x + box.width * 0.3, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.42, y, { steps: 8 });
    await page.mouse.up();
    await page.locator('.range-actions').getByRole('button', { name: 'Cut' }).click();
    const after = await outDuration(page);
    expect(after).toBeLessThan(before - 1);

    // Save the project, undo the cut, then open the project file again.
    const exportButton = page.getByRole('button', { name: 'Export', exact: true });
    await exportButton.click();
    await page.getByRole('button', { name: 'Save project' }).click();
    const saved = await waitForDownload(page, 0);
    expect(saved.name).toBe('sample-vibemotion.vibemotion.json');
    expect(JSON.parse(saved.bytes.toString()).rangeOps).toHaveLength(1);
    const projectFile = saveArtifact('exports/sample-vibemotion.vibemotion.json', saved.bytes);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Undo' }).click();
    expect(Math.abs((await outDuration(page)) - before)).toBeLessThan(0.01);
    await exportButton.click();
    await page.locator('input[type=file][accept*=json]').setInputFiles(projectFile);
    await expect(page.getByText('Project opened.')).toBeVisible();
    expect(Math.abs((await outDuration(page)) - after)).toBeLessThan(0.01);
    await page.keyboard.press('Escape');

    // The safe-zone overlay, for a look.
    await page.getByRole('button', { name: 'Show where app UI covers the video' }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(ARTIFACTS, 'screens/editor-safezone.png') });
    await page.getByRole('button', { name: 'Show where app UI covers the video' }).click();

    // Square, 720p. Start an export and cancel it first.
    await page.getByRole('radio', { name: /^1:1/ }).click();
    await exportButton.click();
    await page.getByRole('radio', { name: '720p' }).click();
    await page.getByRole('button', { name: 'Export MP4' }).click();
    // Cancel partway through the video, not just the audio.
    await expect(page.getByText(/Rendering frame [1-9]\d* of/)).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Cancel export' }).click();
    await expect(page.getByRole('button', { name: 'Export MP4' })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __vmDownloads: unknown[] }).__vmDownloads.length)).toBe(1);
    await page.getByRole('button', { name: 'Export MP4' }).click();
    const mp4 = await waitForDownload(page, 1);
    expect(mp4.name).toBe('sample-vibemotion.mp4');
    const file = saveArtifact(`exports/square-720.mp4`, mp4.bytes);
    const probe = ffprobe(file);
    const video = probe.streams.find((s) => s.codec_type === 'video')!;
    expect(video.codec_name).toBe('h264');
    expect(video.width).toBe(720);
    expect(video.height).toBe(720);
    expect(Math.abs(Number(probe.format.duration) - (await outDuration(page)))).toBeLessThanOrEqual(0.1);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '2', '-i', file, '-frames:v', '1', join(ARTIFACTS, 'exports/square-frame.png')]);
    expect(consoleErrors).toEqual([]);
  });

  test('restores edits for the same file, and lays out on smaller screens', async ({ page, consoleErrors }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${BASE}#/edit`);
    await page.getByRole('button', { name: 'Try the sample clip' }).click();
    await expect(page.getByRole('button', { name: 'Restore your edits' })).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Restore your edits' }).click();
    await expect(page.locator('.w.is-deleted')).toHaveCount(3);
    await page.locator('.w', { hasText: /^follows$/ }).click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(ARTIFACTS, 'screens/editor-1280.png') });

    await page.getByRole('tab', { name: 'Captions' }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(ARTIFACTS, 'screens/editor-1280-captions.png') });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(ARTIFACTS, 'screens/editor-390.png') });
    await page.screenshot({ path: join(ARTIFACTS, 'screens/editor-390-full.png'), fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(consoleErrors).toEqual([]);
  });
});

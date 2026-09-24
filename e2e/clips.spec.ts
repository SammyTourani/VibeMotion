import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, BASE, ARTIFACTS, forgetProjects } from './fixtures';

// "Find the best clips" downloads a 453 MB language model and needs a video
// of 90 s or more, so it only runs when asked: VM_E2E_CLIPS=1 pnpm e2e
// The talk is generated here with macOS `say` over a still from the sample.

const TALK = `I shipped my first app last year, and almost nobody used it. Here is what I learned, so you can skip the part where it hurts.

First, some background. I spent four months building an internship tracker for students at my university. I added calendars, reminders, a dashboard, even a dark mode. I was proud of it. On launch day, eleven people signed up, and seven of them were my friends.

Lesson one. Nobody cares about your features until they care about your problem. I never asked anyone what was actually painful about finding internships. When I finally did, the answer was not tracking applications. It was finding the postings in the first place. They were scattered across a hundred company websites, and they disappeared within days.

Lesson two. Ship something embarrassing, early. My second version took one weekend. It was a single page that scraped new postings every morning and sent one email. It was ugly. It had typos. And within a month, two thousand students were using it, because it solved the real problem on day one.

Lesson three. Talk about it in public. The biggest jump in users did not come from a feature. It came from a short video I posted, explaining why I built it. People share stories, not dashboards.

So if you are building something right now, go talk to five people who have the problem, build the smallest thing that helps them this week, and tell the story of why you made it. That is the whole playbook. It is simple, but it is not easy, and that is exactly why it works.`;

function longTalk(): string {
  const dir = join(ARTIFACTS, 'clips');
  const mp4 = join(dir, 'long-talk.mp4');
  if (existsSync(mp4)) return mp4;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'talk.txt'), TALK);
  execFileSync('say', ['-v', 'Samantha', '-r', '172', '-o', join(dir, 'talk.aiff'), '-f', join(dir, 'talk.txt')]);
  const still = join(process.cwd(), 'public/sample/frame-wide.jpg');
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-loop', '1', '-framerate', '30', '-i', still, '-i', join(dir, 'talk.aiff'),
    '-vf', 'scale=1280:720', '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '96k', '-shortest', mp4,
  ]);
  return mp4;
}

const seconds = (tc: string) => tc.split(':').reduce((acc, part) => acc * 60 + Number(part), 0);

test('suggests clips from a 90 s talk and cuts to one', async ({ page, consoleErrors }) => {
  test.skip(!process.env.VM_E2E_CLIPS, 'Set VM_E2E_CLIPS=1 to run the clip suggestion test.');
  test.skip(process.platform !== 'darwin', 'Generating the talk needs macOS `say`.');
  test.setTimeout(40 * 60_000);
  const file = longTalk();
  await forgetProjects(page);
  await page.goto(`${BASE}#/edit`);
  await page.locator('.dropzone input[type=file]').setInputFiles(file);
  await expect(page.locator('.transcript-body .w').first()).toBeVisible({ timeout: 15 * 60_000 });
  const full = Number(await page.locator('[data-out-duration]').getAttribute('data-out-duration'));
  expect(full).toBeGreaterThan(60);

  await page.getByRole('button', { name: 'Find the best clips' }).click();
  const clips = page.locator('.clips .clip');
  const failed = page.locator('.clipfinder .is-error, .clipfinder p.notice:not(:has(button))');
  await expect(clips.first().or(failed.first())).toBeVisible({ timeout: 30 * 60_000 });
  await expect(failed).toHaveCount(0);
  const count = await clips.count();
  expect(count).toBeGreaterThanOrEqual(2);
  expect(count).toBeLessThanOrEqual(3);
  for (const text of await page.locator('.clips .clip-time').allTextContents()) {
    const [a, b] = text.match(/\d+:\d\d/g)!;
    const len = seconds(b!) - seconds(a!);
    expect(len).toBeGreaterThanOrEqual(19);
    expect(len).toBeLessThanOrEqual(61);
  }
  for (const hook of await page.locator('.clips .clip-hook').allTextContents()) expect(hook.trim().length).toBeGreaterThan(3);
  await expect(page.locator('.clip-meta')).toContainText('#');
  await page.locator('.clipfinder').screenshot({ path: join(ARTIFACTS, 'screens/editor-clips.png') });

  await page.getByRole('button', { name: 'Use this clip' }).first().click();
  await expect(page.locator('.clip.is-on')).toHaveCount(1);
  const clipped = Number(await page.locator('[data-out-duration]').getAttribute('data-out-duration'));
  expect(clipped).toBeGreaterThan(10);
  expect(clipped).toBeLessThanOrEqual(60.5);
  await page.screenshot({ path: join(ARTIFACTS, 'screens/editor-clip-applied.png') });
  // Back to the whole video.
  await page.locator('.clip.is-on').getByRole('button', { name: 'Use the whole video' }).click();
  expect(Math.abs(Number(await page.locator('[data-out-duration]').getAttribute('data-out-duration')) - full)).toBeLessThan(0.01);
  expect(consoleErrors).toEqual([]);
});

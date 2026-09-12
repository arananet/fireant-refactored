import { test, expect, type Page } from '@playwright/test';

async function state(page: Page) {
  return page.evaluate(() => {
    const { game, audio } = (window as any).__fireAnt;
    return { mode: game.mode, x: game.player.x, y: game.player.y, time: game.time, audio: audio.context?.state ?? null, muted: audio.muted, playing: audio.playing, score: game.score };
  });
}

async function pixels(page: Page) {
  return page.evaluate(() => {
    const source = document.querySelector('canvas')!;
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 100;
    const context = canvas.getContext('2d')!;
    context.drawImage(source, 0, 0, 160, 100);
    const data = context.getImageData(0, 0, 160, 100).data;
    let opaque = 0;
    let bright = 0;
    const colors = new Set<number>();
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] > 100) opaque++;
      if (data[index] + data[index + 1] + data[index + 2] > 220 && data[index + 3] > 100) bright++;
      colors.add((data[index] >> 4) * 256 + (data[index + 1] >> 4) * 16 + (data[index + 2] >> 4));
    }
    return { opaque, bright, colors: colors.size };
  });
}

async function audioPeak(page: Page) {
  return page.evaluate(async () => {
    const audio = (window as any).__fireAnt.audio;
    const analyser = audio.context.createAnalyser();
    analyser.fftSize = 2048;
    audio.master.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let peak = 0;
    for (let sample = 0; sample < 12; sample++) {
      await new Promise(resolve => setTimeout(resolve, 20));
      analyser.getFloatTimeDomainData(samples);
      for (const value of samples) peak = Math.max(peak, Math.abs(value));
    }
    audio.master.disconnect(analyser);
    analyser.disconnect();
    return peak;
  });
}

test('renders the original world and exercises movement, pulse, pause, audio and restart', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(async () => (await pixels(page)).colors).toBeGreaterThan(30);
  expect((await state(page)).audio).toBeNull();
  await page.screenshot({ path: `test-results/${testInfo.project.name}-ready.png` });
  await page.getByRole('button', { name: 'Enter the colony' }).click();
  await expect.poll(async () => (await state(page)).mode).toBe('playing');
  await expect.poll(async () => (await state(page)).audio).toBe('running');
  await expect.poll(() => audioPeak(page)).toBeGreaterThan(0.001);
  await expect(page.locator('#best')).toBeVisible();
  if (testInfo.project.name === 'mobile') {
    const direction = await page.getByRole('button', { name: 'Move right' }).boundingBox();
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: direction!.x + direction!.width / 2, y: direction!.y + direction!.height / 2 }] });
    await expect.poll(async () => (await state(page)).x).toBeGreaterThan(2.4);
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    const stopped = (await state(page)).x;
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));
    expect((await state(page)).x).toBeCloseTo(stopped, 1);
    await page.getByRole('button', { name: 'Pulse or place pebble', exact: true }).tap();
    await expect.poll(() => page.evaluate(() => (window as any).__fireAnt.game.cooldown)).toBeGreaterThan(0);
  } else {
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => (await state(page)).x).toBeGreaterThan(2.4);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.press('Space');
    await expect.poll(() => page.evaluate(() => (window as any).__fireAnt.game.cooldown)).toBeGreaterThan(0);
  }
  const rendered = await pixels(page);
  expect(rendered.opaque).toBeGreaterThan(1500);
  expect(rendered.bright).toBeGreaterThan(1000);
  const enemyBefore = await page.evaluate(() => (window as any).__fireAnt.game.enemies[0].x);
  await expect.poll(() => page.evaluate(() => (window as any).__fireAnt.game.enemies[0].x)).not.toBe(enemyBefore);
  await page.getByRole('button', { name: 'Mute music and effects' }).click();
  expect((await state(page)).muted).toBe(true);
  await expect.poll(() => audioPeak(page)).toBeLessThan(0.0001);
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume rescue' })).toBeVisible();
  const paused = await state(page);
  expect(paused.playing).toBe(false);
  await page.getByRole('button', { name: 'Unmute music and effects' }).click();
  await expect.poll(() => audioPeak(page)).toBeLessThan(0.0001);
  await page.locator('#fresh-run').click();
  await page.getByRole('button', { name: 'Keep playing' }).click();
  await expect(page.getByRole('button', { name: 'Resume rescue' })).toBeVisible();
  await page.keyboard.press('ArrowDown');
  expect((await state(page)).time).toBe(paused.time);
  await page.getByRole('button', { name: 'Resume rescue' }).click();
  expect((await state(page)).muted).toBe(false);
  await expect.poll(() => audioPeak(page)).toBeGreaterThan(0.001);
  await page.screenshot({ path: `test-results/${testInfo.project.name}-playing.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const overlapping = await page.evaluate(() => {
    const selectors = ['.brand', '.scoreboard', '.topbar nav', '.chapter', '.vitality', '.mission', '.inventory'];
    const boxes = selectors.map(selector => document.querySelector(selector)!.getBoundingClientRect());
    return boxes.some((first, index) => boxes.slice(index + 1).some(second => first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top));
  });
  expect(overlapping).toBe(false);
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  await page.locator('#fresh-run').click();
  await expect(page.getByRole('button', { name: 'Keep playing' })).toBeVisible();
  await page.locator('#primary').click();
  await expect.poll(async () => (await state(page)).x).toBe(2);
  expect(errors).toEqual([]);
});

test('shows chamber transition, defeat and victory, persists best score and permits a new colony', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter the colony' }).click();
  await page.evaluate(() => {
    const game = (window as any).__fireAnt.game;
    game.hasKey = true;
    game.filled = 3;
    game.player = { ...game.level.exit };
  });
  await expect(page.getByRole('button', { name: 'Next chamber' })).toBeVisible();
  await page.getByRole('button', { name: 'Next chamber' }).click();
  await expect(page.locator('#chapter-name')).toHaveText('Glassroot Grotto');
  await page.evaluate(() => { (window as any).__fireAnt.game.vitality = 0; });
  await expect(page.getByRole('heading', { name: 'Out of time.' })).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect.poll(async () => (await state(page)).score).toBe(0);
  await page.evaluate(() => {
    const game = (window as any).__fireAnt.game;
    for (let index = 0; index < 7; index++) { game.mode = 'cleared'; game.nextLevel(); }
    game.hasKey = true;
    game.filled = 3;
    game.player = { ...game.level.exit };
  });
  await expect(page.getByRole('heading', { name: 'Home, at last.' })).toBeVisible();
  await expect(page.locator('#fresh-run')).toBeVisible();
  await page.getByRole('button', { name: 'Next colony' }).click();
  await expect(page.locator('#colony')).toHaveText('02');
  await expect(page.locator('#chapter-number')).toHaveText('01');
  const best = await page.locator('#best').textContent();
  await page.reload();
  await expect(page.locator('#best')).toHaveText(best!);
});

test('unavailable browser storage does not prevent a rescue', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage denied', 'SecurityError'); } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter the colony' }).click();
  await page.evaluate(() => {
    const game = (window as any).__fireAnt.game;
    game.player = { ...game.pickups[0] };
  });
  await expect.poll(async () => (await state(page)).score).toBe(50);
  expect((await state(page)).mode).toBe('playing');
});

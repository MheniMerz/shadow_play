// node render.js preview t1,t2,...   → frames/preview_<t>.jpg
// node render.js full out.mp4         → silent video at 24 fps via ffmpeg
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
(async () => {
  const [mode, arg] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto('http://127.0.0.1:8765/trailer.html');
  await p.evaluate(() => window.ready);
  fs.mkdirSync('frames', { recursive: true });
  if (mode === 'preview') {
    for (const t of arg.split(',').map(Number)) {
      const url = await p.evaluate((t) => window.frame(t), t);
      fs.writeFileSync(`frames/preview_${t}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
    }
  } else {
    const fps = 24, dur = await p.evaluate(() => window.DURATION);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'medium', arg]);
    ff.stderr.on('data', (d) => process.stderr.write(d));
    const n = Math.round(dur * fps);
    for (let i = 0; i < n; i++) {
      const url = await p.evaluate((t) => window.frame(t, 0.95), i / fps);
      const buf = Buffer.from(url.split(',')[1], 'base64');
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      if (i % 240 === 0) console.log(`frame ${i}/${n}`);
    }
    ff.stdin.end();
    await new Promise((r) => ff.on('close', r));
  }
  await b.close();
})();

const KEYS = ['vector', 'soft', 'round', 'game'];
const SHORT = { vector: 'Pixel Vector', soft: 'Pixel Soft', round: 'Rounded', game: 'Rounded Game' };
/* Emerald's five Latin fonts and pokeemerald-expansion's four. Normal has all four treatments; the others
   have Pixel Vector and Rounded Game (file name fragment in `file`). */
const VARIANTS = {
  normal: { label: 'Normal', file: '' }, narrow: { label: 'Narrow', file: 'Narrow' }, small: { label: 'Small', file: 'Small' },
  short: { label: 'Short', file: 'Short' }, small_narrow: { label: 'Small Narrow', file: 'SmallNarrow' },
  narrower: { label: 'Narrower', file: 'Narrower' }, small_narrower: { label: 'Small Narrower', file: 'SmallNarrower' },
  short_narrow: { label: 'Short Narrow', file: 'ShortNarrow' }, short_narrower: { label: 'Short Narrower', file: 'ShortNarrower' },
  header: { label: 'Header', file: 'Header' }, badge: { label: 'Badge', file: 'Badge' },
  status: { label: 'Status', file: 'Status' },
};
const FAM0 = { vector: 'Cmp Vector', soft: 'Cmp Soft', round: 'Cmp Round', game: 'Cmp Game' };
const FAM = { ...FAM0 };   // CSS family of each layer for the current font (Normal's are declared in style.css)
const has = (k) => k in (METRICS[state.font] || {});
const NAME = (k) => METRICS[state.font]?.[k]?.family || SHORT[k];
const M = (k) => METRICS[state.font]?.[k] || {};
const SHIFT = { vector: 0, soft: 0, round: 0.5, game: 0 };   // outline offset in source pixels (Rounded has 0.5 px lsb)
const MODES = ['overlay', 'blink', 'stacked'];
const HINTS = {
  overlay: 'Type anywhere in the sheet to try your own text.',
  blink: 'The sheet cycles through the enabled fonts. Shapes that jump are the ones that differ.',
  stacked: 'Each line in every enabled font. Switch to Overlay or Blink to edit the text.',
};
const $ = (id) => document.getElementById(id);
const src = $('src'), paper = $('paper'), stacked = $('stacked'), grid = $('grid');
const state = { mode: 'overlay', size: 32, snap: false, aa: true, shadow: false, dark: false, ls: 0, sample: '', sort: 'diff', cmp: 'game', match: true, set: 'basic', show: { vector: true, soft: false, round: false, game: true }, sel: null, custom: '', font: 'normal' };
try { Object.assign(state, JSON.parse(localStorage.getItem('efc:v3') || '{}')); } catch {}
if (!MODES.includes(state.mode)) state.mode = 'overlay';
if (!(state.font in VARIANTS)) state.font = 'normal';
function save() { try { const { sel, ...rest } = state; localStorage.setItem('efc:v3', JSON.stringify(rest)); } catch {} }
let SAMPLES = [], METRICS = {};
const cp = (ch) => ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
const pct = (v) => Math.round(v * 100) + '%';

/* Type settings */
function applyType() {
  if (state.snap) state.size = Math.max(16, Math.round(state.size / 16) * 16);
  const st = document.body.style;
  st.setProperty('--size', state.size + 'px');
  st.setProperty('--ls', state.ls + 'px');
  st.setProperty('--sh', (state.size / 16) + 'px');
  st.setProperty('--px', (state.size / 16) + 'px');
  $('match').setAttribute('aria-pressed', String(state.match));
  paper.classList.toggle('match', state.match && has('round'));
  $('match').disabled = !has('round');
  $('size').value = state.size; $('size-out').textContent = state.size + 'px';
  $('ls').value = state.ls; $('ls-out').textContent = state.ls + 'px';
  $('snap').setAttribute('aria-pressed', String(state.snap));
  $('aa').setAttribute('aria-pressed', String(state.aa));
  $('shadow').setAttribute('aria-pressed', String(state.shadow));
  $('theme').setAttribute('aria-pressed', String(state.dark));
  document.body.classList.toggle('noaa', !state.aa);
  document.body.classList.toggle('shadow', state.shadow);
  document.documentElement.dataset.theme = state.dark ? 'dark' : 'light';
}

/* Specimen */
function renderStage() {
  const t = src.value;
  const shown = t === '' || t.endsWith('\n') ? t + ' ' : t;
  for (const k of KEYS) $('layer-' + k).textContent = shown;
  src.scrollTop = 0; src.scrollLeft = 0;
  if (state.mode === 'stacked') renderStacked();
}
function renderStacked() {
  const lines = src.value.split('\n').filter((l) => l.trim() !== '');
  stacked.replaceChildren(...lines.map((line) => {
    const pair = document.createElement('div'); pair.className = 'spair';
    for (const k of KEYS.filter(has)) {
      const row = document.createElement('div'); row.className = 'srow s-' + k + (state.show[k] ? '' : ' off');
      const who = document.createElement('span'); who.className = 'who'; who.textContent = SHORT[k];
      const code = document.createElement('span'); code.className = 'scode'; code.textContent = line;
      row.append(who, code); pair.append(row);
    }
    return pair;
  }));
}
let blinkFace = 'vector', blinkTimer = null, blinkPaused = false;
function enabled() { return KEYS.filter((k) => state.show[k] && has(k)); }
function applyMode() {
  for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
  paper.dataset.mode = state.mode;
  paper.hidden = state.mode === 'stacked';
  stacked.hidden = state.mode !== 'stacked';
  $('blink-ctl').hidden = state.mode !== 'blink';
  $('stage-hint').textContent = HINTS[state.mode];
  if (state.mode === 'stacked') renderStacked();
  runBlink(); applyShow();
}
function nextFace() { const e = enabled(); blinkFace = e[(e.indexOf(blinkFace) + 1) % e.length]; }
function runBlink() {
  clearInterval(blinkTimer); blinkTimer = null;
  $('blink-play').textContent = blinkPaused ? 'Play' : 'Pause';
  if (state.mode === 'blink' && !blinkPaused) blinkTimer = setInterval(() => { nextFace(); applyShow(false); }, 700);
}
function applyShow(redraw = true) {
  if (!enabled().includes(blinkFace)) nextFace();
  for (const k of KEYS) {
    $('show-' + k).hidden = !has(k);
    const on = has(k) && (state.mode === 'blink' ? k === blinkFace : state.show[k]);
    $('layer-' + k).classList.toggle('off', !on);
    $('show-' + k).setAttribute('aria-pressed', String(state.show[k]));
    for (const el of grid.querySelectorAll('.g-' + k)) el.classList.toggle('off', !state.show[k]);
    for (const el of stacked.querySelectorAll('.s-' + k)) el.classList.toggle('off', !state.show[k]);
  }
  const now = $('now'); now.textContent = NAME(blinkFace); now.style.setProperty('--c', `var(--${blinkFace}-ink)`);
  if (redraw) drawLoupe();
}

/* Glyph scores: compare font `state.cmp` against Pixel Vector */
function charSet() {
  const all = (M('vector').chars || []).map((c) => String.fromCodePoint(c));
  if (state.set === 'all') return all.filter((c) => c !== ' ');
  if (state.set === 'pua') return all.filter((c) => c.codePointAt(0) >= 0xE000);
  return all.filter((c) => /[A-Za-z0-9]/.test(c));
}
async function measure(chars) {
  const spec = '80px';
  await Promise.all(KEYS.filter(has).map((k) => document.fonts.load(`${spec} "${FAM[k]}"`, chars.join(''))));
  const W = 128, H = 128, BASE = 96, X = 16;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const ink = (k, ch) => { ctx.clearRect(0, 0, W, H); ctx.font = `${spec} "${FAM[k]}"`; ctx.fillStyle = '#000'; ctx.fillText(ch, X - SHIFT[k] * 5, BASE); return ctx.getImageData(0, 0, W, H).data; };
  const out = {};
  for (const ch of chars) {
    const a = ink('vector', ch), b = ink(state.cmp, ch);
    let diff = 0, union = 0;
    for (let i = 3; i < a.length; i += 4) { diff += Math.abs(a[i] - b[i]); union += Math.max(a[i], b[i]); }
    out[ch] = union ? diff / union : 0;
  }
  return out;
}
let scores = null, token = 0, CHARS = [];
async function remeasure() {
  const t = ++token; CHARS = charSet();
  $('g-status').textContent = 'Measuring…';
  $('cmp-label').textContent = `${SHORT[state.cmp]} and Pixel Vector`;
  const s = await measure(CHARS);
  if (t !== token) return;
  scores = s;
  if (!state.sel || !CHARS.includes(state.sel)) state.sel = order()[0];
  renderGrid(); drawLoupe();
  const vals = Object.values(s); const avg = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
  $('g-status').textContent = `${CHARS.length} glyphs, average ${pct(avg)} different`;
}
function order() {
  const list = [...CHARS];
  if (state.sort === 'diff' && scores) list.sort((a, b) => scores[b] - scores[a] || a.codePointAt(0) - b.codePointAt(0));
  return list;
}
function renderGrid() {
  if (!scores) return;
  const max = Math.max(...Object.values(scores)) || 1;
  grid.replaceChildren(...order().map((ch) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'cell'; b.dataset.ch = ch;
    b.setAttribute('aria-pressed', String(ch === state.sel));
    b.innerHTML = '<span class="g" aria-hidden="true"><span class="g-vector"></span><span class="g-soft"></span><span class="g-round"></span><span class="g-game"></span></span><span class="bar"><i></i></span><span class="sc"></span>';
    for (const k of KEYS) { const el = b.querySelector('.g-' + k); el.textContent = ch; el.classList.toggle('off', !has(k) || !state.show[k] || (k !== 'vector' && k !== state.cmp)); }
    b.querySelector('.bar i').style.width = (scores[ch] / max * 100).toFixed(1) + '%';
    b.querySelector('.sc').textContent = pct(scores[ch]);
    return b;
  }));
}
function drawLoupe() {
  const cv = $('loupe'); const w = cv.clientWidth; if (!w || !state.sel) return;
  const dpr = window.devicePixelRatio || 1; cv.width = Math.round(w * dpr); cv.height = Math.round(w * dpr);
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = getComputedStyle(document.documentElement); const col = (n) => css.getPropertyValue(n).trim();
  const S = w * 0.7, px = S / 16, base = Math.round(w * 0.72), x0 = Math.round(w * 0.2);
  ctx.fillStyle = col('--sheet'); ctx.fillRect(0, 0, w, w);
  ctx.lineWidth = 1;
  const line = (x1, y1, x2, y2, color, dash) => { ctx.strokeStyle = color; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
  // faint pixel grid
  for (let i = -4; i <= 12; i++) { const y = Math.round(base - i * px) + 0.5; line(0, y, w, y, col('--rule'), [1, 3]); }
  for (let i = -2; i <= 12; i++) { const x = Math.round(x0 + i * px) + 0.5; line(x, 0, x, w, col('--rule'), [1, 3]); }
  line(0, base + 0.5, w, base + 0.5, col('--rule-strong'), []);
  for (const h of [M('vector').xHeight / 100, M('vector').capHeight / 100]) { const y = Math.round(base - h * px) + 0.5; line(0, y, w, y, col('--ink-2'), [5, 4]); }
  ctx.setLineDash([]);
  const shown = KEYS.filter((k) => has(k) && state.show[k] && (k === 'vector' || k === state.cmp));
  for (const k of shown) {
    const adv = (M(k).adv?.[state.sel.codePointAt(0)] ?? 600) / 1600 * S - SHIFT[k] * px;
    const x = Math.round(x0 + adv) + 0.5; line(x, 0, x, w, col('--' + k), [2, 2]);
  }
  ctx.globalCompositeOperation = col('--blend') === 'screen' ? 'screen' : 'multiply';
  for (const k of shown) { ctx.font = `${S}px "${FAM[k]}"`; ctx.fillStyle = col('--' + k); ctx.fillText(state.sel, x0 - SHIFT[k] * px, base); }
  ctx.globalCompositeOperation = 'source-over';
  $('lp-cp').textContent = `${state.sel}  U+${cp(state.sel)}`;
  $('lp-score').textContent = scores ? `${pct(scores[state.sel] || 0)} different` : '';
}

/* Metrics table */
function renderMetrics() {
  const rows = [
    ['Family', (m) => m.family], ['Version', (m) => m.version], ['Units per em', 'upm'],
    ['x-height', 'xHeight'], ['Cap height', 'capHeight'], ['Ascender', 'ascender'], ['Descender', 'descender'], ['Line gap', 'lineGap'],
    ['Advance of space', 'advance_space'], ['Advance of H', 'advance_H'], ['Advance of i', 'advance_i'],
    ['Glyphs in font', 'glyphs'], ['Characters mapped', 'mapped'],
  ];
  const ks = KEYS.filter(has);
  $('metrics-head').replaceChildren(...['Measure', ...ks].map((k, i) => { const th = document.createElement('th'); th.scope = 'col';
    if (i) th.innerHTML = `<span class="sw ${k}"></span>${SHORT[k]}`; else th.textContent = k; return th; }));
  $('metrics').replaceChildren(...rows.map(([label, get]) => {
    const tr = document.createElement('tr');
    const th = document.createElement('th'); th.scope = 'row'; th.textContent = label; tr.append(th);
    for (const k of ks) { const td = document.createElement('td'); const m = M(k); td.textContent = String(typeof get === 'function' ? get(m) : m[get]); tr.append(td); }
    return tr;
  }));
}

/* Samples */
function sampleText(id) {
  if (id === 'custom') return state.custom;
  if (id === '__all') return SAMPLES.flatMap((g) => g.lines).join('\n') + '\n';
  const g = SAMPLES.find((g) => g.group === id); return g ? g.lines.join('\n') + '\n' : '';
}
function buildSampleSelect() {
  const sel = $('sample');
  sel.replaceChildren(...[['__all', 'All samples'], ...SAMPLES.map((g) => [g.group, g.group]), ['custom', 'Your text']].map(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; }));
  if (![...sel.options].some((o) => o.value === state.sample)) state.sample = SAMPLES[0]?.group || '__all';
  sel.value = state.sample;
}

/* Events */
for (const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click', () => { state.mode = b.dataset.mode; save(); applyMode(); });
$('legend').replaceChildren(...KEYS.map((k) => {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.id = 'show-' + k; b.style.setProperty('--c', `var(--${k})`);
  b.innerHTML = '<i></i><span></span>';
  b.addEventListener('click', () => { if (state.show[k] && enabled().length === 1) return; state.show[k] = !state.show[k]; save(); applyShow(); renderGrid(); });
  return b;
}));
$('size').addEventListener('input', (e) => { state.size = Number(e.target.value); applyType(); save(); });
$('size-16').addEventListener('click', () => { state.size = 16; applyType(); save(); });
$('snap').addEventListener('click', () => { state.snap = !state.snap; applyType(); save(); });
$('aa').addEventListener('click', () => { state.aa = !state.aa; applyType(); save(); });
$('shadow').addEventListener('click', () => { state.shadow = !state.shadow; applyType(); save(); });
$('match').addEventListener('click', () => { state.match = !state.match; applyType(); save(); });
$('theme').addEventListener('click', () => { state.dark = !state.dark; applyType(); save(); drawLoupe(); });
$('ls').addEventListener('input', (e) => { state.ls = Number(e.target.value); applyType(); save(); });
$('sample').addEventListener('change', (e) => { state.sample = e.target.value; src.value = sampleText(state.sample); renderStage(); save(); });
src.addEventListener('input', () => { state.custom = src.value; if (state.sample !== 'custom') { state.sample = 'custom'; $('sample').value = 'custom'; } renderStage(); save(); });
$('cmp').addEventListener('change', (e) => { state.cmp = e.target.value; save(); remeasure(); });
$('font').addEventListener('change', (e) => { state.font = e.target.value; save(); applyFont(); });
$('set').addEventListener('change', (e) => { state.set = e.target.value; save(); remeasure(); });
$('sort').addEventListener('change', (e) => { state.sort = e.target.value; renderGrid(); save(); });
grid.addEventListener('click', (e) => { const b = e.target.closest('.cell'); if (!b) return; state.sel = b.dataset.ch; for (const c of grid.children) c.setAttribute('aria-pressed', String(c === b)); drawLoupe(); });
$('blink-play').addEventListener('click', () => { blinkPaused = !blinkPaused; runBlink(); });
$('blink-next').addEventListener('click', () => { nextFace(); applyShow(false); });
new ResizeObserver(() => drawLoupe()).observe($('loupe'));

/* Font choice: the layers switch to that font's Pixel Vector and Rounded Game */
function applyFont() {
  const f = VARIANTS[state.font].file, root = document.documentElement.style;
  if (state.font === 'normal') Object.assign(FAM, FAM0);
  else {
    FAM.vector = `Cmp Vector ${f}`; FAM.game = `Cmp Game ${f}`;
    if (!document.getElementById('ff-' + f)) {
      const st = document.createElement('style'); st.id = 'ff-' + f;
      st.textContent = `@font-face { font-family: "${FAM.vector}"; src: url("fonts/EmeraldPixelVector${f}-Regular.ttf"); font-display: block; }
        @font-face { font-family: "${FAM.game}"; src: url("fonts/EmeraldRounded${f}Game-Regular.ttf"); font-display: block; }`;
      document.head.appendChild(st);
    }
  }
  for (const k of KEYS) root.setProperty('--f-' + k, `"${FAM[k]}", monospace`);
  root.setProperty('--f-caret', `var(--f-${has('round') ? 'round' : 'game'})`);   // the textarea's caret follows a shown font
  for (const k of KEYS) $('show-' + k).querySelector('span').textContent = NAME(k);
  for (const k of ['soft', 'round']) for (const el of document.querySelectorAll(`.top h1 .f-${k}, .top h1 .f-${k} + .vs`)) el.hidden = !has(k);
  for (const o of $('cmp').options) o.disabled = !has(o.value);
  if (!has(state.cmp)) state.cmp = 'game';
  if (!enabled().length) state.show.vector = state.show.game = true;
  $('cmp').value = state.cmp; $('font').value = state.font;
  applyType(); renderStage(); applyShow(); renderMetrics(); remeasure();
}

/* Start */
(async () => {
  [SAMPLES, METRICS] = await Promise.all([fetch('samples.json').then((r) => r.json()), fetch('metrics.json').then((r) => r.json())]);
  // per-codepoint advances are needed by the loupe
  buildSampleSelect();
  $('set').value = state.set; $('sort').value = state.sort;
  src.value = sampleText(state.sample);
  applyMode(); applyFont();
})();

/* Glyph editor for data/glyph_overrides/*.json. Mirrors the geometry of scripts/smooth.py:
   rounded_path (cut-back + cubic arcs, K = 0.5523), arc_beziers, extend_caps. */
const $ = (id) => document.getElementById(id);
const K = 0.5523, S = 48;                       // canvas px per source px (768 / 16)
const cv = $('cv'), ctx = cv.getContext('2d');
let mapping = null, mask = null, auto = null, spec = null, sel = { s: -1, p: -1 }, tool = 'select', snap = 0.5;
let draft = null, drag = null, name = '';

const snapv = (v) => snap ? Math.round(v / snap) * snap : Math.round(v * 1000) / 1000;
const toPx = (e) => { const r = cv.getBoundingClientRect(); return [snapv((e.clientX - r.left) / r.width * 16), snapv((e.clientY - r.top) / r.height * 16)]; };
const raw = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 16, (e.clientY - r.top) / r.height * 16]; };

/* ---------- geometry (port of smooth.py) ---------- */
function bulgeArc(a, b, bulge) {
  const theta = 4 * Math.atan(bulge), d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (d < 1e-9 || Math.abs(theta) < 1e-9) return null;
  const ax = a[0], ay = -a[1], bx = b[0], by = -b[1], mx = (ax + bx) / 2, my = (ay + by) / 2, ux = (bx - ax) / d, uy = (by - ay) / d;
  const h = d / (2 * Math.tan(theta / 2)), cx = mx - uy * h, cy = my + ux * h, r = d / (2 * Math.abs(Math.sin(theta / 2)));
  const a0 = Math.atan2(ay - cy, ax - cx) * 180 / Math.PI;
  return arcBeziers(cx, -cy, r, a0, a0 + theta * 180 / Math.PI);
}
function roundedPath(pts, closed, defR) {
  { const dd = []; for (const p of pts) { if (!dd.length || Math.abs(p[0] - dd[dd.length - 1][0]) > 1e-9 || Math.abs(p[1] - dd[dd.length - 1][1]) > 1e-9) dd.push(p); }
    if (closed && dd.length > 1 && Math.abs(dd[0][0] - dd[dd.length - 1][0]) < 1e-9 && Math.abs(dd[0][1] - dd[dd.length - 1][1]) < 1e-9) { const last = dd[dd.length - 1]; if (last.length > 3 && last[3] && !(dd[0].length > 3 && dd[0][3])) dd[0] = last; dd.pop(); }
    pts = dd; }
  const radii = pts.map((p) => p.length > 2 && p[2] != null ? p[2] : defR); const bulges = pts.map((p) => p.length > 3 && p[3] ? p[3] : 0);
  bulges.forEach((bz, i) => { if (bz) { radii[i] = 0; radii[(i + 1) % pts.length] = 0; } });
  const P = pts.map((p) => [p[0], p[1]]); const n = P.length;
  if (n < 2) return [];
  const segs = [];
  const cut = (i) => { const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n];
    const la = Math.hypot(b[0] - a[0], b[1] - a[1]), lb = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const rr = Math.min(radii[i], la / 2, lb / 2);
    return [[b[0] + (a[0] - b[0]) / la * rr, b[1] + (a[1] - b[1]) / la * rr], [b[0] + (c[0] - b[0]) / lb * rr, b[1] + (c[1] - b[1]) / lb * rr]]; };
  const line = (a, b) => [a, [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3], [a[0] + (b[0] - a[0]) * 2 / 3, a[1] + (b[1] - a[1]) * 2 / 3], b];
  const arc = (p, v, q) => [p, [p[0] + (v[0] - p[0]) * K, p[1] + (v[1] - p[1]) * K], [q[0] + (v[0] - q[0]) * K, q[1] + (v[1] - q[1]) * K], q];
  const joints = closed ? [...Array(n).keys()] : [...Array(n).keys()].slice(1, n - 1);
  const cuts = {}; for (const i of joints) cuts[i] = cut(i);
  let cur = closed ? cuts[0][1] : P[0];
  const rng = closed ? [...Array(n).keys()].map((i) => i + 1) : [...Array(n - 1).keys()].map((i) => i + 1);
  const segTo = (target, from) => { const bz = bulges[((from % n) + n) % n]; if (bz) { const a = bulgeArc(cur, target, bz); if (a) { segs.push(...a); return; } } segs.push(line(cur, target)); };
  for (const i of rng) { const idx = i % n;
    if (idx in cuts) { const [p, q] = cuts[idx]; if (Math.hypot(p[0] - cur[0], p[1] - cur[1]) > 1e-9) segTo(p, idx - 1); if (radii[idx] > 1e-9) segs.push(arc(p, P[idx], q)); cur = q; }
    else { segTo(P[idx], idx - 1); cur = P[idx]; } }
  return segs;
}
function arcBeziers(cx, cy, r, a0, a1, steps) {
  const sweep = a1 - a0, n = steps || Math.max(1, Math.ceil(Math.abs(sweep) / 90)); const out = [];
  for (let i = 0; i < n; i++) { const t0 = (a0 + sweep * i / n) * Math.PI / 180, t1 = (a0 + sweep * (i + 1) / n) * Math.PI / 180, k = 4 / 3 * Math.tan((t1 - t0) / 4);
    const p0 = [cx + r * Math.cos(t0), cy - r * Math.sin(t0)], p3 = [cx + r * Math.cos(t1), cy - r * Math.sin(t1)];
    out.push([p0, [p0[0] - k * r * Math.sin(t0), p0[1] - k * r * Math.cos(t0)], [p3[0] + k * r * Math.sin(t1), p3[1] + k * r * Math.cos(t1)], p3]); }
  return out;
}
function strokeBeziers(st) {
  const w = st.width ?? spec.width ?? 1, defR = st.sharp ? 0 : (st.joint_radius ?? spec.joint_radius ?? 1);
  if (st.arc) return { closed: false, w, segs: arcBeziers(st.arc.center[0], st.arc.center[1], st.arc.radius, st.arc.start, st.arc.end) };
  if (st.circle) return { closed: true, w, segs: arcBeziers(st.circle.center[0], st.circle.center[1], st.circle.radius, 0, 360, 4) };
  const pts = st.sharp ? st.points.map((p) => [p[0], p[1], 0, p[3] ?? 0]) : st.points;
  return { closed: !!st.closed, w, segs: roundedPath(pts, !!st.closed, defR) };
}
function extendCaps(b) {
  if (b.closed || !b.segs.length) return b;
  const h = b.w / 2, clamp = (p, v) => { let t = 1; for (let i = 0; i < 2; i++) { if (v[i] > 1e-9) t = Math.min(t, (16 - p[i]) / v[i]); else if (v[i] < -1e-9) t = Math.min(t, -p[i] / v[i]); } t = Math.max(t, 0); return [v[0] * t, v[1] * t]; };
  let [p0, c1, c2, p3] = b.segs[0]; let d = (c1[0] !== p0[0] || c1[1] !== p0[1]) ? [c1[0] - p0[0], c1[1] - p0[1]] : [p3[0] - p0[0], p3[1] - p0[1]]; let l = Math.hypot(...d) || 1; let v = clamp(p0, [-d[0] / l * h, -d[1] / l * h]);
  b.segs[0] = [[p0[0] + v[0], p0[1] + v[1]], [c1[0] + v[0], c1[1] + v[1]], c2, p3];
  [p0, c1, c2, p3] = b.segs[b.segs.length - 1]; d = (c2[0] !== p3[0] || c2[1] !== p3[1]) ? [p3[0] - c2[0], p3[1] - c2[1]] : [p3[0] - p0[0], p3[1] - p0[1]]; l = Math.hypot(...d) || 1; v = clamp(p3, [d[0] / l * h, d[1] / l * h]);
  b.segs[b.segs.length - 1] = [p0, c1, [c2[0] + v[0], c2[1] + v[1]], [p3[0] + v[0], p3[1] + v[1]]];
  return b;
}
function normDot(d) { return Array.isArray(d) ? { x: d[0], y: d[1], r: d[2] ?? 0.5, ...(d[3] ? { shape: d[3] } : {}), ...(d[4] != null ? { corner: d[4] } : {}) } : d; }
function dotPath(d) { const p = new Path2D(); const r = d.r ?? 0.5, shape = d.shape ?? spec.dot_shape ?? 'circle', cr = shape === 'square' ? 0 : Math.min(d.corner ?? spec.dot_corner ?? 0.25, r);
  if (shape === 'circle') p.arc(d.x * S, d.y * S, r * S, 0, 7); else p.roundRect((d.x - r) * S, (d.y - r) * S, 2 * r * S, 2 * r * S, cr * S); return p; }
function cutPolys() {
  const out = (spec.strokes || []).filter((st) => st.cut && st.cut.length >= 3).map((st) => st.cut);
  if (spec.clip_y) { const [y0, y1] = spec.clip_y; out.push([[-2, -2], [18, -2], [18, y0], [-2, y0]], [[-2, y1], [18, y1], [18, 18], [-2, 18]]); }
  if (spec.clip_x) { const [x0, x1] = spec.clip_x; out.push([[-2, -2], [x0, -2], [x0, 18], [-2, 18]], [[x1, -2], [18, -2], [18, 18], [x1, 18]]); }
  return out;
}
function polyPath(poly) { const p = new Path2D(); poly.forEach((q, i) => i ? p.lineTo(q[0] * S, q[1] * S) : p.moveTo(q[0] * S, q[1] * S)); p.closePath(); return p; }
function pathOf(b) { const p = new Path2D(); if (!b.segs.length) return p; p.moveTo(b.segs[0][0][0] * S, b.segs[0][0][1] * S); for (const [, c1, c2, p3] of b.segs) p.bezierCurveTo(c1[0] * S, c1[1] * S, c2[0] * S, c2[1] * S, p3[0] * S, p3[1] * S); if (b.closed) p.closePath(); return p; }

/* ---------- drawing ---------- */
function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = css('--sheet'); ctx.fillRect(0, 0, cv.width, cv.height);
  // pixel mask
  if (mask && $('showMask').getAttribute('aria-pressed') === 'true') {
    ctx.fillStyle = css('--vector'); ctx.globalAlpha = 0.35;
    const rows = spec?.rows || [0, 16];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (mask.fg[y][x]) { ctx.globalAlpha = (y >= rows[0] && y < rows[1]) ? 0.35 : 0.15; ctx.fillRect(x * S, y * S, S, S); }
    ctx.globalAlpha = 1;
  }
  // grid
  ctx.lineWidth = 1;
  for (let i = 0; i <= 16; i++) { ctx.strokeStyle = [3, 6, 12].includes(i) ? css('--ink-2') : css('--rule'); ctx.beginPath(); ctx.moveTo(0, i * S + .5); ctx.lineTo(cv.width, i * S + .5); ctx.stroke(); ctx.strokeStyle = css('--rule'); ctx.beginPath(); ctx.moveTo(i * S + .5, 0); ctx.lineTo(i * S + .5, cv.height); ctx.stroke(); }
  if (mapping) { const adv = mapping.width; ctx.strokeStyle = css('--round'); ctx.beginPath(); ctx.moveTo(adv * S + .5, 0); ctx.lineTo(adv * S + .5, cv.height); ctx.stroke(); }
  // auto-traced centreline (generated model) for reference
  if (auto && $('showAuto').getAttribute('aria-pressed') === 'true') {
    ctx.strokeStyle = css('--ink-2'); ctx.setLineDash([6, 4]); ctx.lineWidth = 2;
    for (const s of auto.strokes) ctx.stroke(pathOf({ segs: s.beziers, closed: s.closed }));
    for (const [x, y, r] of auto.dots) { ctx.beginPath(); ctx.arc(x * S, y * S, r * S, 0, 7); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  if (!spec) return;
  // stroked result
  const showFill = $('showFill').getAttribute('aria-pressed') === 'true';
  if (showFill) {
    const off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height; const o = off.getContext('2d');
    o.strokeStyle = css('--game'); o.fillStyle = css('--game'); o.lineCap = 'butt';
    spec.strokes.forEach((st) => { if (st.cut) return; const b = extendCaps(strokeBeziers(st)); o.lineWidth = b.w * S; o.lineJoin = st.join ?? spec.join ?? 'round'; o.miterLimit = 8; o.stroke(pathOf(b)); });
    for (const d of (spec.dots || [])) o.fill(dotPath(d));
    o.globalCompositeOperation = 'destination-out';
    for (const poly of cutPolys()) o.fill(polyPath(poly));
    ctx.globalCompositeOperation = css('--blend') === 'screen' ? 'screen' : 'multiply'; ctx.globalAlpha = 0.75; ctx.drawImage(off, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  // cut masks: red hatch
  for (const poly of cutPolys()) { const p = polyPath(poly); ctx.fillStyle = 'rgba(220,40,40,0.12)'; ctx.fill(p); ctx.strokeStyle = 'rgba(220,40,40,0.8)'; ctx.setLineDash([5, 3]); ctx.lineWidth = 1.5; ctx.stroke(p); ctx.setLineDash([]); }
  // centrelines + handles
  spec.strokes.forEach((st, i) => { if (!st.cut) { const b = strokeBeziers(st); ctx.lineWidth = i === sel.s ? 3 : 1.5; ctx.strokeStyle = i === sel.s ? css('--ink') : css('--round'); ctx.stroke(pathOf(b)); }
    for (const [j, p] of handles(st).entries()) { ctx.beginPath(); ctx.arc(p[0] * S, p[1] * S, i === sel.s && j === sel.p ? 7 : 5, 0, 7); ctx.fillStyle = i === sel.s && j === sel.p ? css('--ink') : css('--sheet'); ctx.fill(); ctx.strokeStyle = css('--ink'); ctx.lineWidth = 1.5; ctx.stroke(); } });
  (spec.dots || []).forEach((d, j) => { ctx.beginPath(); ctx.arc(d.x * S, d.y * S, sel.s === -2 && sel.p === j ? 7 : 5, 0, 7); ctx.fillStyle = sel.s === -2 && sel.p === j ? css('--ink') : css('--sheet'); ctx.fill(); ctx.strokeStyle = css('--ink'); ctx.stroke(); });
  if (draft) { ctx.strokeStyle = css('--ink'); ctx.setLineDash([4, 4]); ctx.beginPath(); draft.forEach((p, i) => i ? ctx.lineTo(p[0] * S, p[1] * S) : ctx.moveTo(p[0] * S, p[1] * S)); ctx.stroke(); ctx.setLineDash([]); }
}
function handles(st) {
  if (st.cut) return st.cut;
  if (st.arc) { const a = st.arc, e = (t) => [a.center[0] + a.radius * Math.cos(t * Math.PI / 180), a.center[1] - a.radius * Math.sin(t * Math.PI / 180)]; return [a.center, e(a.start), e(a.end)]; }
  if (st.circle) return [st.circle.center, [st.circle.center[0] + st.circle.radius, st.circle.center[1]]];
  return st.points;
}
function setHandle(st, j, x, y) {
  if (st.cut) { st.cut[j] = [x, y]; return; }
  if (st.arc) { const a = st.arc; if (j === 0) a.center = [x, y]; else { const ang = Math.atan2(a.center[1] - y, x - a.center[0]) * 180 / Math.PI; if (j === 1) { a.start = Math.round(ang * 10) / 10; a.radius = Math.round(Math.hypot(x - a.center[0], y - a.center[1]) * 100) / 100; } else a.end = Math.round(ang * 10) / 10; } return; }
  if (st.circle) { if (j === 0) st.circle.center = [x, y]; else st.circle.radius = Math.round(Math.hypot(x - st.circle.center[0], y - st.circle.center[1]) * 100) / 100; return; }
  const old = st.points[j]; st.points[j] = old.length > 3 ? [x, y, old[2] ?? null, old[3]] : (old.length > 2 ? [x, y, old[2]] : [x, y]);
}

/* ---------- UI ---------- */
function renderList() {
  const L = $('list'); L.replaceChildren(...spec.strokes.map((st, i) => { const b = document.createElement('button'); b.type = 'button';
    b.textContent = `${i + 1}. ` + (st.cut ? `cut mask ${st.cut.length} pts` : st.arc ? `arc r=${st.arc.radius} ${st.arc.start}°→${st.arc.end}°` : st.circle ? `circle r=${st.circle.radius}` : `polyline ${st.points.length} pts${st.points.some((p) => p[3]) ? ' +arcs' : ''}${st.closed ? ' closed' : ''}${st.sharp ? ' sharp' : ''}`) + (st.width ? ` w=${st.width}` : '');
    b.setAttribute('aria-pressed', String(i === sel.s)); b.onclick = () => { sel = { s: i, p: -1 }; renderList(); draw(); }; return b; }));
  const P = $('sprops'); P.innerHTML = '';
  if (sel.s === -2 && spec.dots?.[sel.p]) { const d = spec.dots[sel.p];
    const add = (label, html) => { const l = document.createElement('label'); l.innerHTML = `<span>${label}</span>${html}`; P.appendChild(l); return l.lastElementChild; };
    add('Dot centre x, y', `<input type="text" value="${d.x}, ${d.y}">`).onchange = (e) => { [d.x, d.y] = e.target.value.split(',').map(Number); draw(); };
    add('Half size (px)', `<input type="number" step="0.05" min="0.1" value="${d.r}">`).onchange = (e) => { d.r = +e.target.value; draw(); };
    add('Shape (blank = glyph)', `<select><option value="">default</option><option value="circle" ${d.shape === 'circle' ? 'selected' : ''}>circle</option><option value="square" ${d.shape === 'square' ? 'selected' : ''}>square</option><option value="rounded" ${d.shape === 'rounded' ? 'selected' : ''}>rounded square</option></select>`).onchange = (e) => { if (e.target.value) d.shape = e.target.value; else delete d.shape; draw(); };
    add('Corner radius (blank = glyph)', `<input type="number" step="0.05" min="0" value="${d.corner ?? ''}">`).onchange = (e) => { if (e.target.value === '') delete d.corner; else d.corner = +e.target.value; draw(); };
    add('Delete dot', '<button type="button" class="btn">×</button>').onclick = () => { spec.dots.splice(sel.p, 1); sel = { s: -1, p: -1 }; renderList(); draw(); };
    return; }
  if (sel.s < 0) return;
  const st = spec.strokes[sel.s];
  if (st.cut) { const l = document.createElement('div'); l.className = 'hint'; l.textContent = 'Cut mask: drag corners; Delete removes the selected corner (or the mask when no corner is selected).'; P.appendChild(l); return; }
  const add = (label, html) => { const l = document.createElement('label'); l.innerHTML = `<span>${label}</span>${html}`; P.appendChild(l); return l.lastElementChild; };
  add('Stroke width (blank = glyph)', `<input type="number" step="0.05" min="0.3" value="${st.width ?? ''}">`).onchange = (e) => { if (e.target.value === '') delete st.width; else st.width = +e.target.value; renderList(); draw(); };
  add('Join (blank = glyph)', `<select><option value="">default</option><option value="round" ${st.join === 'round' ? 'selected' : ''}>round</option><option value="miter" ${st.join === 'miter' ? 'selected' : ''}>miter</option><option value="bevel" ${st.join === 'bevel' ? 'selected' : ''}>bevel</option></select>`).onchange = (e) => { if (e.target.value === '') delete st.join; else st.join = e.target.value; draw(); };
  if (st.arc) { for (const k of ['radius', 'start', 'end']) add(`Arc ${k}`, `<input type="number" step="${k === 'radius' ? 0.05 : 1}" value="${st.arc[k]}">`).onchange = (e) => { st.arc[k] = +e.target.value; renderList(); draw(); };
    add('Centre x, y', `<input type="text" value="${st.arc.center.join(', ')}">`).onchange = (e) => { st.arc.center = e.target.value.split(',').map(Number); draw(); }; }
  else if (st.circle) { add('Radius', `<input type="number" step="0.05" value="${st.circle.radius}">`).onchange = (e) => { st.circle.radius = +e.target.value; renderList(); draw(); };
    add('Centre x, y', `<input type="text" value="${st.circle.center.join(', ')}">`).onchange = (e) => { st.circle.center = e.target.value.split(',').map(Number); draw(); }; }
  else {
    add('Closed', `<input type="checkbox" ${st.closed ? 'checked' : ''}>`).onchange = (e) => { st.closed = e.target.checked; renderList(); draw(); };
    add('All joints sharp', `<input type="checkbox" ${st.sharp ? 'checked' : ''}>`).onchange = (e) => { st.sharp = e.target.checked; renderList(); draw(); };
    add('Joint radius (blank = glyph)', `<input type="number" step="0.1" min="0" value="${st.joint_radius ?? ''}">`).onchange = (e) => { if (e.target.value === '') delete st.joint_radius; else st.joint_radius = +e.target.value; draw(); };
    if (sel.p >= 0) { const p = st.points[sel.p];
      add(`Point ${sel.p + 1} x, y`, `<input type="text" value="${p[0]}, ${p[1]}">`).onchange = (e) => { const [x, y] = e.target.value.split(',').map(Number); setHandle(st, sel.p, x, y); draw(); };
      add('This joint radius (blank = default, 0 = sharp)', `<input type="number" step="0.1" min="0" value="${p[2] ?? ''}">`).onchange = (e) => { if (e.target.value === '') st.points[sel.p] = [p[0], p[1]]; else st.points[sel.p] = [p[0], p[1], +e.target.value]; draw(); };
      const seg = st.points[sel.p + 1] || (st.closed ? st.points[0] : null);
      if (seg) { const dx = seg[0] - p[0], dy = -(seg[1] - p[1]), d = Math.hypot(dx, dy); add('Segment to next: length / angle', `<span>${d.toFixed(3)} px / ${(Math.atan2(dy, dx) * 180 / Math.PI).toFixed(1)}°</span>`);
        const bz = p[3] ?? 0; const theta = 4 * Math.atan(bz) * 180 / Math.PI; const R = bz ? d / (2 * Math.abs(Math.sin(2 * Math.atan(bz)))) : 0;
        add('Segment to next is an arc: bulge', `<input type="number" step="0.05" min="-3" max="3" value="${bz}" title="tan(angle/4); + bends counter-clockwise on the page">`).onchange = (e) => { const v = +e.target.value; st.points[sel.p] = [p[0], p[1], p[2] ?? null, v]; if (!v) st.points[sel.p] = p[2] != null ? [p[0], p[1], p[2]] : [p[0], p[1]]; renderList(); draw(); };
        add('…or set by included angle (°)', `<input type="number" step="1" min="-350" max="350" value="${theta.toFixed(1)}">`).onchange = (e) => { const v = Math.tan(+e.target.value * Math.PI / 180 / 4); st.points[sel.p] = [p[0], p[1], p[2] ?? null, Math.round(v * 10000) / 10000]; renderList(); draw(); };
        add('…or by radius (px, keeps bend direction)', `<input type="number" step="0.05" min="0" value="${R ? R.toFixed(3) : ''}">`).onchange = (e) => { const r = +e.target.value; if (!r || 2 * r < d) { log('Radius must be at least half the segment length (' + (d / 2).toFixed(3) + ').'); return; } const th = 2 * Math.asin(d / (2 * r)); const v = Math.tan(th / 4) * (bz < 0 ? -1 : 1); st.points[sel.p] = [p[0], p[1], p[2] ?? null, Math.round(v * 10000) / 10000]; renderList(); draw(); };
        if (bz) add('Arc radius / angle', `<span>${R.toFixed(3)} px / ${theta.toFixed(1)}°</span>`); }
      add('Insert point after', '<button type="button" class="btn">+</button>').onclick = () => { const q = st.points[sel.p + 1] || [p[0] + 1, p[1]]; st.points.splice(sel.p + 1, 0, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]); sel.p++; renderList(); draw(); };
    }
  }
}
function fillGlyphFields() { $('fname').value = name; $('chars').value = (Array.isArray(spec.char) ? spec.char : [spec.char]).join(','); $('r0').value = spec.rows?.[0] ?? 0; $('r1').value = spec.rows?.[1] ?? 16; $('gw').value = spec.width ?? 1; $('gr').value = spec.joint_radius ?? 1; $('gj').value = spec.join ?? 'round'; $('gds').value = spec.dot_shape ?? 'circle'; $('gdc').value = spec.dot_corner ?? 0.25; spec.dots = (spec.dots || []).map(normDot); $('cy0').value = spec.clip_y?.[0] ?? ''; $('cy1').value = spec.clip_y?.[1] ?? ''; $('cx0').value = spec.clip_x?.[0] ?? ''; $('cx1').value = spec.clip_x?.[1] ?? ''; }
function readGlyphFields() { name = $('fname').value.trim(); const raw = $('chars').value; let cs = raw.split(',').map((s) => s.trim()).filter(Boolean); if (!cs.length && raw.includes(',')) cs = [',']; spec.char = cs.length === 1 ? cs[0] : cs; spec.rows = [+$('r0').value, +$('r1').value]; spec.width = +$('gw').value; spec.joint_radius = +$('gr').value; spec.join = $('gj').value; spec.dot_shape = $('gds').value; spec.dot_corner = +$('gdc').value; if ($('cy0').value !== '' && $('cy1').value !== '') spec.clip_y = [+$('cy0').value, +$('cy1').value]; else delete spec.clip_y; if ($('cx0').value !== '' && $('cx1').value !== '') spec.clip_x = [+$('cx0').value, +$('cx1').value]; else delete spec.clip_x; }
for (const id of ['chars', 'r0', 'r1', 'gw', 'gr', 'gj', 'gds', 'gdc', 'cy0', 'cy1', 'cx0', 'cx1', 'fname']) $(id).onchange = () => { readGlyphFields(); draw(); };

function parseCharInput(v) {
  v = v.trim(); const m = v.match(/^(?:U\+|0x)?([0-9a-fA-F]{4,5})$/);
  if (m && v.length > 1) return String.fromCodePoint(parseInt(m[1], 16));   // "U+E053", "E053", "0xE053"
  return [...v][0];
}
async function load(ch) {
  const mp = await (await fetch('/fp/data/mapping.json')).json();
  const cps = await (await fetch('/fp/data/codepoints.json')).json();
  const cp = ch.codePointAt(0);
  const gid = Object.keys(mp).find((k) => mp[k].unicode.includes(cp)) || Object.keys(cps).find((k) => cps[k].codepoints.includes(cp));
  if (!gid) { log(`No glyph for "${ch}" (U+${cp.toString(16).toUpperCase().padStart(4, '0')}) in the source font.`); return; }
  const info = cps[gid] || {}; const label = `${ch}  U+${cp.toString(16).toUpperCase().padStart(4, '0')}${info.name ? '  ' + info.name : ''}`;
  $('ch').value = ch; log(`Glyph ${gid}: ${label}`);
  mapping = mp[gid];
  mask = await (await fetch(`/fp/data/masks/${String(gid).padStart(3, '0')}.json`)).json();
  auto = await (await fetch(`/fp/data/svg_smooth/${String(gid).padStart(3, '0')}.json`)).json();
  const ov = await (await fetch('/api/overrides')).json();
  const hit = Object.entries(ov).find(([n, s]) => (Array.isArray(s.char) ? s.char : [s.char]).includes(ch));
  if (hit) { [name, spec] = [hit[0], hit[1]]; log(`Loaded override ${name}.json`); }
  else { name = `u${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`; spec = { char: ch, rows: [0, 16], width: 1.0, joint_radius: 1.0, strokes: [], dots: [] }; log(`No override yet for "${ch}": starting empty (auto trace shown dashed). Use "Seed from auto trace" or draw.`); }
  $('rv').textContent = ch; $('rg').textContent = ch;
  sel = { s: -1, p: -1 }; fillGlyphFields(); renderList(); draw();
  const sel2 = $('existing'); sel2.replaceChildren(...[['', 'overrides…'], ...Object.entries(ov).map(([n, s]) => [n, `${n} (${Array.isArray(s.char) ? s.char.join(',') : s.char})`])].map(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; }));
}
function seed() {
  // approximate the auto model with polylines: take each stroke's bezier end points, keep joints
  spec.strokes = auto.strokes.map((s) => { const pts = [s.beziers[0][0], ...s.beziers.map((b) => b[3])]; const dedup = pts.filter((p, i) => !i || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.05);
    return { points: dedup.map((p) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100, 0]), closed: s.closed, ...(s.width ? { width: s.width } : {}) }; });
  spec.dots = auto.dots.map((d) => Array.isArray(d) ? { x: d[0], y: d[1], r: d[2] } : { x: d.x, y: d.y, r: d.r }); spec.rows = [0, 16];
  log('Seeded: the auto model was converted to sharp polylines through its curve end points. Set joint radii to re-round.');
  fillGlyphFields(); renderList(); draw();
}
function log(t) { $('log').textContent = t + '\n' + $('log').textContent.slice(0, 3000); }

/* ---------- mouse ---------- */
cv.addEventListener('pointerdown', (e) => {
  if (!spec) return; const [x, y] = toPx(e), [rx, ry] = raw(e);
  if (tool === 'select') { // hit test handles
    let best = null;
    spec.strokes.forEach((st, i) => handles(st).forEach((p, j) => { const d = Math.hypot(p[0] - rx, p[1] - ry); if (d < 0.35 && (!best || d < best.d)) best = { d, s: i, p: j }; }));
    (spec.dots || []).forEach((p, j) => { const d = Math.hypot(p.x - rx, p.y - ry); if (d < 0.35 && (!best || d < best.d)) best = { d, s: -2, p: j }; });
    if (best) { sel = { s: best.s, p: best.p }; drag = best; cv.setPointerCapture(e.pointerId); } else sel = { s: -1, p: -1 };
    renderList(); draw(); return; }
  if (tool === 'poly' || tool === 'cut') { draft = draft || []; draft.push([x, y]); draw(); return; }
  if (tool === 'dot') { (spec.dots ||= []).push({ x, y, r: 0.5 }); sel = { s: -2, p: spec.dots.length - 1 }; renderList(); draw(); return; }
  if (tool === 'arc' || tool === 'circle') { draft = draft || []; draft.push([x, y]);
    if (tool === 'circle' && draft.length === 2) { spec.strokes.push({ circle: { center: draft[0], radius: Math.round(Math.hypot(draft[1][0] - draft[0][0], draft[1][1] - draft[0][1]) * 100) / 100 } }); draft = null; sel = { s: spec.strokes.length - 1, p: -1 }; renderList(); }
    if (tool === 'arc' && draft.length === 3) { const c = draft[0], ang = (p) => Math.round(Math.atan2(c[1] - p[1], p[0] - c[0]) * 1800 / Math.PI) / 10; let a0 = ang(draft[1]), a1 = ang(draft[2]); if (a1 <= a0) a1 += 360;
      spec.strokes.push({ arc: { center: c, radius: Math.round(Math.hypot(draft[1][0] - c[0], draft[1][1] - c[1]) * 100) / 100, start: a0, end: a1 } }); draft = null; sel = { s: spec.strokes.length - 1, p: -1 }; renderList(); }
    draw(); }
});
cv.addEventListener('pointermove', (e) => { if (!drag) return; const [x, y] = toPx(e); if (drag.s === -2) { spec.dots[drag.p].x = x; spec.dots[drag.p].y = y; } else setHandle(spec.strokes[drag.s], drag.p, x, y); draw(); });
cv.addEventListener('pointerup', () => { if (drag) { drag = null; renderList(); } });
cv.addEventListener('dblclick', () => finishDraft());
function finishDraft() { if (tool === 'poly' && draft && draft.length >= 2) { spec.strokes.push({ points: draft }); sel = { s: spec.strokes.length - 1, p: -1 }; renderList(); }
  if (tool === 'cut' && draft && draft.length >= 3) { spec.strokes.push({ cut: draft }); sel = { s: spec.strokes.length - 1, p: -1 }; renderList(); } draft = null; draw(); }
document.addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') return;
  if (e.key === 'Enter') finishDraft(); if (e.key === 'Escape') { draft = null; draw(); }
  if (e.key === 'Delete' || e.key === 'Backspace') { if (sel.s === -2) { spec.dots.splice(sel.p, 1); } else if (sel.s >= 0 && sel.p >= 0 && spec.strokes[sel.s].cut?.length > 3) spec.strokes[sel.s].cut.splice(sel.p, 1); else if (sel.s >= 0 && sel.p >= 0 && spec.strokes[sel.s].points?.length > 2) spec.strokes[sel.s].points.splice(sel.p, 1); else if (sel.s >= 0 && sel.p < 0) spec.strokes.splice(sel.s, 1); sel = { s: -1, p: -1 }; renderList(); draw(); } });

for (const b of document.querySelectorAll('#tools button')) b.onclick = () => { tool = b.dataset.tool; draft = null; for (const o of document.querySelectorAll('#tools button')) o.setAttribute('aria-pressed', String(o === b)); draw(); };
for (const b of document.querySelectorAll('#snaps button')) b.onclick = () => { snap = +b.dataset.snap; for (const o of document.querySelectorAll('#snaps button')) o.setAttribute('aria-pressed', String(o === b)); };
for (const id of ['showMask', 'showAuto', 'showFill']) $(id).onclick = () => { $(id).setAttribute('aria-pressed', String($(id).getAttribute('aria-pressed') !== 'true')); draw(); };
$('load').onclick = () => load(parseCharInput($('ch').value) || 'N'); $('ch').onkeydown = (e) => { if (e.key === 'Enter') $('load').click(); };
(async () => {
  const cps = await (await fetch('/fp/data/codepoints.json')).json(); const mp = await (await fetch('/fp/data/mapping.json')).json();
  const sel = $('allglyphs'); const groups = { charmap: 'Text glyphs', pua: 'Symbols (PUA)', 'pua+unicode-equivalent': 'Symbols (PUA + Unicode)' };
  const og = {}; for (const [k, v] of Object.entries(groups)) { og[k] = document.createElement('optgroup'); og[k].label = v; sel.appendChild(og[k]); }
  for (const gid of Object.keys(cps).map(Number).sort((a, b) => a - b)) {
    const e = cps[gid]; if (!mp[gid] || !mp[gid].ink) continue;
    const c = String.fromCodePoint(e.codepoints[0]); const o = document.createElement('option'); o.value = c;
    o.textContent = `${gid}  ${e.source === 'charmap' ? c : (e.codepoints.length > 1 ? String.fromCodePoint(e.codepoints[1]) : '')}  U+${e.codepoints[0].toString(16).toUpperCase().padStart(4, '0')}${e.name ? '  ' + e.name.replace(/^ext\./, '') : ''}`;
    (og[e.source] || og.charmap).appendChild(o);
  }
  sel.onchange = (ev) => { if (ev.target.value) load(ev.target.value); };
})();
$('existing').onchange = async (e) => { const ov = await (await fetch('/api/overrides')).json(); const s = ov[e.target.value]; if (s) { const c = Array.isArray(s.char) ? s.char[0] : s.char; $('ch').value = c; load(c); } };
$('del').onclick = () => { if (sel.s >= 0) { spec.strokes.splice(sel.s, 1); sel = { s: -1, p: -1 }; renderList(); draw(); } };
$('dup').onclick = () => { if (sel.s >= 0) { spec.strokes.push(JSON.parse(JSON.stringify(spec.strokes[sel.s]))); sel = { s: spec.strokes.length - 1, p: -1 }; renderList(); draw(); } };
$('seed').onclick = seed;
async function save() { readGlyphFields(); const r = await (await fetch('/api/save', { method: 'POST', body: JSON.stringify({ name, spec }) })).json(); log(r.ok ? `Saved ${r.file}` : JSON.stringify(r)); return r.ok; }
$('save').onclick = save;
$('rebuild').onclick = async () => { if (!(await save())) return; log('Rebuilding Emerald Rounded Game… (10–20 s)'); const chars = (Array.isArray(spec.char) ? spec.char : [spec.char]).join('');
  const r = await (await fetch('/api/rebuild', { method: 'POST', body: JSON.stringify({ chars }) })).json(); log((r.ok ? 'Rebuilt. ' : 'Rebuild FAILED. ') + r.log);
  // reload the TTF for the live render
  const v = Date.now(); const st = document.createElement('style'); st.textContent = `@font-face { font-family: "Cmp Game"; src: url("fonts/EmeraldRoundedGame-Regular.ttf?v=${v}"); }`; document.head.appendChild(st); $('rg').style.fontFamily = `"Cmp Game"`; };
$('remove').onclick = async () => { if (!confirm(`Delete ${name}.json? The glyph goes back to the automatic trace.`)) return; await fetch('/api/delete', { method: 'POST', body: JSON.stringify({ name }) }); log(`Removed ${name}.json`); };
/* theme: shared with the compare app's saved setting, persisted separately too */
function applyTheme(dark) { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; $('theme').setAttribute('aria-pressed', String(dark)); try { localStorage.setItem('efc:editor-dark', dark ? '1' : '0'); } catch {} draw(); }
let darkInit = false; try { const e = localStorage.getItem('efc:editor-dark'); darkInit = e !== null ? e === '1' : !!JSON.parse(localStorage.getItem('efc:v3') || '{}').dark; } catch {}
if (!darkInit && !localStorage.getItem('efc:editor-dark')) darkInit = matchMedia('(prefers-color-scheme: dark)').matches;
applyTheme(darkInit);
$('theme').onclick = () => applyTheme(document.documentElement.dataset.theme !== 'dark');
$('ch').value = 'N'; load('N');

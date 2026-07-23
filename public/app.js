/* ═══════════════════════════════════════════════════════════════════════
   claude-resets.com
   No dependencies. Charts are hand-built SVG, rendered at real pixel
   width so hover positions are exact, and re-rendered on resize.
   ═══════════════════════════════════════════════════════════════════════ */

const DAY = 86_400_000;
const CLAUDE = 'claude';
const CODEX = 'codex';
const COLOR = { [CLAUDE]: 'var(--series-claude)', [CODEX]: 'var(--series-codex)' };

const $ = (sel) => document.querySelector(sel);

/* Everything below flows from data/resets.json, which carries free text — notes
   are scraped post bodies, and the README invites outside corrections. Any of it
   reaching innerHTML unescaped is stored XSS, so nothing interpolated into markup
   skips esc(), and no href skips safeUrl(). */
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Only http(s) survives — blocks javascript:, data:, and friends. */
const safeUrl = (value) => {
  const url = String(value ?? '');
  return /^https?:\/\//i.test(url) ? url : '#';
};
const svgEl = (tag, attrs = {}) => {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

const fmtDate = (d) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const fmtDateShort = (d) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtMonth = (d) =>
  d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });

const round1 = (n) => Math.round(n * 10) / 10;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function relative(from, to = new Date()) {
  const days = Math.floor((to - from) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 45) return `${days} days ago`;
  const months = Math.round(days / 30.44);
  return `${plural(months, 'month')} ago`;
}

/* ── Stats ────────────────────────────────────────────────────────────── */

function gapsBetween(dates) {
  const out = [];
  for (let i = 1; i < dates.length; i++) out.push((dates[i] - dates[i - 1]) / DAY);
  return out;
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function statsFor(dates, windowStart, now) {
  const inWindow = dates.filter((d) => d >= windowStart && d <= now);
  const gaps = gapsBetween(inWindow);
  const spanDays = Math.max((now - windowStart) / DAY, 1);
  const last = inWindow.length ? inWindow[inWindow.length - 1] : null;
  return {
    count: inWindow.length,
    dates: inWindow,
    last,
    daysSinceLast: last ? (now - last) / DAY : null,
    meanGap: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
    medianGap: median(gaps),
    longestGap: gaps.length ? Math.max(...gaps) : null,
    perMonth: (inWindow.length / spanDays) * 30.44,
  };
}

/* ── Tooltip ──────────────────────────────────────────────────────────── */

function makeTip(host) {
  const tip = document.createElement('div');
  tip.className = 'tip';
  host.appendChild(tip);
  return {
    show(html, x, y) {
      tip.innerHTML = html;
      tip.dataset.show = '1';
      const w = tip.offsetWidth;
      const maxX = host.clientWidth - w - 4;
      tip.style.left = `${Math.max(4, Math.min(x - w / 2, maxX))}px`;
      tip.style.top = `${Math.max(4, y - tip.offsetHeight - 12)}px`;
    },
    hide() { tip.dataset.show = '0'; },
  };
}

const dotRow = (key, label, value) =>
  `<div class="tip-row"><span class="swatch" style="--c:${COLOR[key]}"></span>` +
  `${esc(label)} <b>${esc(value)}</b></div>`;

/* ── Chart: cumulative resets (step line) ─────────────────────────────── */

function drawCumulative(host, series, windowStart, now) {
  host.textContent = '';
  const W = host.clientWidth || 480;
  const H = 250;
  const m = { t: 14, r: 46, b: 26, l: 34 };
  const iw = Math.max(W - m.l - m.r, 10);
  const ih = H - m.t - m.b;

  const maxY = Math.max(1, ...Object.values(series).map((s) => s.count));
  const x = (d) => m.l + ((d - windowStart) / (now - windowStart)) * iw;
  const y = (v) => m.t + ih - (v / maxY) * ih;

  const svg = svgEl('svg', { width: W, height: H, role: 'img' });
  svg.appendChild(svgEl('title', {})).textContent =
    `Cumulative announced resets from ${fmtDate(windowStart)} to ${fmtDate(now)}: ` +
    Object.entries(series).map(([k, s]) => `${k} ${s.count}`).join(', ');

  // y grid + ticks
  const tickStep = Math.max(1, Math.ceil(maxY / 4));
  for (let v = 0; v <= maxY; v += tickStep) {
    svg.appendChild(svgEl('line', {
      class: v === 0 ? 'axis-line' : 'grid-line',
      x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v),
    }));
    const t = svgEl('text', { class: 'tick-text', x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' });
    t.textContent = v;
    svg.appendChild(t);
  }

  // x ticks — first, middle, last
  for (const frac of [0, 0.5, 1]) {
    const d = new Date(+windowStart + (now - windowStart) * frac);
    const t = svgEl('text', {
      class: 'tick-text', x: x(d), y: H - 8,
      'text-anchor': frac === 0 ? 'start' : frac === 1 ? 'end' : 'middle',
    });
    t.textContent = fmtDateShort(d);
    svg.appendChild(t);
  }

  // step paths
  for (const [key, s] of Object.entries(series)) {
    let d = `M ${x(windowStart)} ${y(0)}`;
    s.dates.forEach((date, i) => { d += ` L ${x(date)} ${y(i)} L ${x(date)} ${y(i + 1)}`; });
    d += ` L ${x(now)} ${y(s.count)}`;
    svg.appendChild(svgEl('path', { class: 'series-line', d, stroke: COLOR[key] }));

    // direct label at the endpoint — identity is never color-alone
    const lbl = svgEl('text', {
      class: 'endpoint-label', x: m.l + iw + 7, y: y(s.count) + 4, fill: COLOR[key],
    });
    lbl.textContent = s.name;
    svg.appendChild(lbl);
  }

  // hover layer
  const cross = svgEl('line', { class: 'crosshair', y1: m.t, y2: m.t + ih, opacity: 0 });
  svg.appendChild(cross);
  const markers = Object.keys(series).map((key) => {
    const c = svgEl('circle', { r: 4.5, fill: COLOR[key], stroke: 'var(--surface)', 'stroke-width': 2, opacity: 0 });
    svg.appendChild(c);
    return [key, c];
  });
  const hit = svgEl('rect', { class: 'hit', x: m.l, y: m.t, width: iw, height: ih });
  svg.appendChild(hit);

  const tip = makeTip(host);
  const move = (evt) => {
    const box = svg.getBoundingClientRect();
    const px = Math.min(Math.max(evt.clientX - box.left, m.l), m.l + iw);
    const at = new Date(+windowStart + ((px - m.l) / iw) * (now - windowStart));
    cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('opacity', 1);
    let html = `<div class="tip-date">${fmtDate(at)}</div>`;
    for (const [key, marker] of markers) {
      const n = series[key].dates.filter((d) => d <= at).length;
      marker.setAttribute('cx', px); marker.setAttribute('cy', y(n)); marker.setAttribute('opacity', 1);
      html += dotRow(key, series[key].name, n);
    }
    tip.show(html, px, m.t + 4);
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerleave', () => {
    tip.hide(); cross.setAttribute('opacity', 0);
    markers.forEach(([, c]) => c.setAttribute('opacity', 0));
  });

  host.appendChild(svg);
}

/* ── Chart: resets per month (grouped bars) ───────────────────────────── */

function monthKeys(from, to) {
  const keys = [];
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  while (d <= to) {
    keys.push(new Date(d));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return keys;
}

function drawMonthly(host, series, windowStart, now) {
  host.textContent = '';
  const months = monthKeys(windowStart, now);
  const W = host.clientWidth || 480;
  const H = 250;
  const m = { t: 14, r: 8, b: 38, l: 34 };
  const iw = Math.max(W - m.l - m.r, 10);
  const ih = H - m.t - m.b;

  const counts = {};
  for (const [key, s] of Object.entries(series)) {
    counts[key] = months.map((mo) => s.dates.filter((d) =>
      d.getUTCFullYear() === mo.getUTCFullYear() && d.getUTCMonth() === mo.getUTCMonth()).length);
  }
  const maxY = Math.max(1, ...Object.values(counts).flat());
  const y = (v) => m.t + ih - (v / maxY) * ih;

  const band = iw / months.length;
  const keys = Object.keys(series);
  const GAP = 2;                                   // 2px surface gap between adjacent bars
  const barW = Math.max(4, (band * 0.62 - GAP) / keys.length);

  const svg = svgEl('svg', { width: W, height: H, role: 'img' });
  svg.appendChild(svgEl('title', {})).textContent = 'Announced resets per calendar month.';

  const tickStep = Math.max(1, Math.ceil(maxY / 4));
  for (let v = 0; v <= maxY; v += tickStep) {
    svg.appendChild(svgEl('line', {
      class: v === 0 ? 'axis-line' : 'grid-line',
      x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v),
    }));
    const t = svgEl('text', { class: 'tick-text', x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' });
    t.textContent = v;
    svg.appendChild(t);
  }

  const skip = band < 34 ? 2 : 1;
  const tip = makeTip(host);

  months.forEach((mo, i) => {
    const cx = m.l + band * (i + 0.5);
    if (i % skip === 0) {
      const t = svgEl('text', { class: 'tick-text', x: cx, y: H - 20, 'text-anchor': 'middle' });
      t.textContent = fmtMonth(mo);
      svg.appendChild(t);
    }
    const groupW = barW * keys.length + GAP * (keys.length - 1);
    keys.forEach((key, k) => {
      const v = counts[key][i];
      const bx = cx - groupW / 2 + k * (barW + GAP);
      if (v > 0) {
        svg.appendChild(svgEl('rect', {
          class: 'bar-mark', x: bx, y: y(v), width: barW, height: m.t + ih - y(v), fill: COLOR[key],
        }));
      }
    });

    // One hit target per MONTH, outside the series loop. Nesting it produced a
    // full-width layer per series, and the overlap made pointerenter/leave
    // fight each other and flicker the tooltip.
    const hitW = Math.max(barW * keys.length + GAP * (keys.length - 1), 24);
    const hit = svgEl('rect', {
      class: 'hit', x: cx - hitW / 2, y: m.t, width: hitW, height: ih,
    });
    svg.appendChild(hit);
    hit.addEventListener('pointerenter', () => {
      const html = `<div class="tip-date">${esc(fmtMonth(mo))} ${mo.getUTCFullYear()}</div>` +
        keys.map((kk) => dotRow(kk, series[kk].name, counts[kk][i])).join('');
      tip.show(html, cx, m.t);
    });
    hit.addEventListener('pointerleave', () => tip.hide());
  });

  // x-axis year label
  const yl = svgEl('text', { class: 'tick-text', x: m.l, y: H - 4 });
  yl.textContent = months.length
    ? `${months[0].getUTCFullYear()}${months.at(-1).getUTCFullYear() !== months[0].getUTCFullYear()
        ? `–${months.at(-1).getUTCFullYear()}` : ''}`
    : '';
  svg.appendChild(yl);

  host.appendChild(svg);
}

/* ── Chart: two-lane timeline ─────────────────────────────────────────── */

function drawLanes(host, providers, now) {
  host.textContent = '';
  const all = [...providers[CLAUDE].dates, ...providers[CODEX].dates];
  if (!all.length) return;
  const start = new Date(Math.min(...all) - 6 * DAY);
  const end = new Date(+now + 3 * DAY);

  const W = host.clientWidth || 480;
  const m = { t: 26, r: 14, b: 34, l: 66 };
  const laneGap = 62;
  const H = m.t + laneGap + m.b;
  const iw = Math.max(W - m.l - m.r, 10);
  const x = (d) => m.l + ((d - start) / (end - start)) * iw;

  const svg = svgEl('svg', { width: W, height: H, role: 'img' });
  svg.appendChild(svgEl('title', {})).textContent =
    'Each announced reset for Claude and Codex on a shared time axis.';
  const tip = makeTip(host);

  [CLAUDE, CODEX].forEach((key, i) => {
    const ly = m.t + i * laneGap;
    svg.appendChild(svgEl('line', { class: 'lane-rule', x1: m.l, x2: m.l + iw, y1: ly, y2: ly }));
    const lbl = svgEl('text', { class: 'lane-label', x: m.l - 12, y: ly + 4, 'text-anchor': 'end' });
    lbl.textContent = providers[key].name;
    svg.appendChild(lbl);

    providers[key].events.forEach((ev) => {
      const cx = x(ev.at);
      const dot = svgEl('circle', { class: 'lane-dot', cx, cy: ly, r: 5, fill: COLOR[key] });
      const link = svgEl('a', { href: safeUrl(ev.url), target: '_blank', rel: 'noopener' });
      link.appendChild(svgEl('circle', { class: 'hit', cx, cy: ly, r: 13 }));
      link.appendChild(dot);
      svg.appendChild(link);

      const enter = () => tip.show(
        `<div class="tip-date">${fmtDate(ev.at)}</div>` +
        dotRow(key, providers[key].name, relative(ev.at, now)), cx, ly);
      link.addEventListener('pointerenter', enter);
      link.addEventListener('focus', enter);
      link.addEventListener('pointerleave', () => tip.hide());
      link.addEventListener('blur', () => tip.hide());
    });
  });

  // month ticks along the bottom
  for (const mo of monthKeys(start, end)) {
    if (mo < start) continue;
    const t = svgEl('text', { class: 'tick-text', x: x(mo), y: H - 12, 'text-anchor': 'middle' });
    t.textContent = fmtMonth(mo);
    svg.appendChild(t);
    svg.appendChild(svgEl('line', {
      class: 'grid-line', x1: x(mo), x2: x(mo), y1: m.t - 12, y2: m.t + laneGap + 12,
    }));
  }

  host.appendChild(svg);
}

/* ── Rendering ────────────────────────────────────────────────────────── */

const state = { data: null, window: 'overlap', showPolicy: true, now: new Date() };

function providerSets() {
  const p = state.data.providers;
  const mk = (key) => {
    const evs = p[key].events
      .filter((e) => e.kind === 'reset')
      .map((e) => ({ ...e, at: new Date(e.date) }));
    return { ...p[key], key, events: evs, dates: evs.map((e) => e.at) };
  };
  return { [CLAUDE]: mk(CLAUDE), [CODEX]: mk(CODEX) };
}

function windowStart(sets) {
  const firsts = [sets[CLAUDE].dates[0], sets[CODEX].dates[0]];
  if (state.window === 'all') return new Date(Math.min(...firsts));
  if (state.window === '90') return new Date(+state.now - 90 * DAY);
  return new Date(Math.max(...firsts));
}

function renderCounter(lastReset) {
  const days = Math.floor((Date.now() - lastReset) / DAY);
  $('#counter').innerHTML =
    `<span class="days-figure">${days}</span>` +
    `<span class="days-unit">${days === 1 ? 'day' : 'days'}</span>`;
}

function renderTiles(sets) {
  const s = statsFor(sets[CLAUDE].dates, sets[CLAUDE].dates[0], state.now);
  const tiles = [
    ['Resets tracked', s.count, '', 'Announcements that flushed the counters.'],
    ['Average gap', round1(s.meanGap), 'days', 'Mean time between consecutive resets.'],
    ['Longest drought', round1(s.longestGap), 'days', 'The most patience ever required.'],
    ['Pace', round1(s.perMonth), '/ month', 'Announced resets per month.'],
  ];
  $('#claude-tiles').innerHTML = tiles.map(([label, v, unit, note]) =>
    `<dl class="tile"><dt>${esc(label)}</dt><dd>${esc(v)}${unit ? `<small>${esc(unit)}</small>` : ''}</dd>` +
    `<p>${note}</p></dl>`).join('');
}

const SCORE_ROWS = [
  { key: 'count', label: 'Resets announced', sub: 'Inside the window', better: 'high', unit: '' },
  { key: 'perMonth', label: 'Pace', sub: 'Resets per month', better: 'high', unit: '/mo', dp: 1 },
  { key: 'daysSinceLast', label: 'Days since last', sub: 'As of right now', better: 'low', unit: 'd', dp: 1 },
  { key: 'meanGap', label: 'Average gap', sub: 'Mean days between resets', better: 'low', unit: 'd', dp: 1 },
  { key: 'medianGap', label: 'Median gap', sub: 'Typical wait, outliers aside', better: 'low', unit: 'd', dp: 1 },
  { key: 'longestGap', label: 'Longest drought', sub: 'Worst wait in the window', better: 'low', unit: 'd', dp: 1 },
];

function renderScoreboard(stats, sets) {
  const cell = (row, key) => {
    const v = stats[key][row.key];
    if (v === null || v === undefined) return `<div class="sb-val">—</div>`;
    const other = stats[key === CLAUDE ? CODEX : CLAUDE][row.key];
    const lead = other !== null && other !== undefined &&
      (row.better === 'high' ? v > other : v < other);
    const shown = row.dp ? round1(v) : v;
    return `<div class="sb-val${lead ? ' is-lead' : ''}">${shown}` +
      `${row.unit ? `<span class="sb-unit">${row.unit}</span>` : ''}</div>`;
  };

  $('#scoreboard').innerHTML =
    `<div class="sb-row sb-head">
       <div>Metric</div>
       <div class="sb-val"><span class="swatch" style="--c:${COLOR[CLAUDE]}"></span>${esc(sets[CLAUDE].name)}</div>
       <div class="sb-val"><span class="swatch" style="--c:${COLOR[CODEX]}"></span>${esc(sets[CODEX].name)}</div>
     </div>` +
    SCORE_ROWS.map((row) =>
      `<div class="sb-row">
         <div class="sb-label">${row.label}<small>${row.sub}</small></div>
         ${cell(row, CLAUDE)}${cell(row, CODEX)}
       </div>`).join('');
}

function renderLegend(id, sets) {
  $(id).innerHTML = [CLAUDE, CODEX].map((k) =>
    `<span class="legend-item"><span class="swatch" style="--c:${COLOR[k]}"></span>${esc(sets[k].name)}</span>`
  ).join('');
}

function renderTable(stats, sets, start) {
  const rows = SCORE_ROWS.map((row) => {
    const fmt = (k) => {
      const v = stats[k][row.key];
      return v === null || v === undefined ? '—' : (row.dp ? round1(v) : v) + (row.unit ? ` ${row.unit}` : '');
    };
    return `<tr><th scope="row">${row.label}</th><td>${fmt(CLAUDE)}</td><td>${fmt(CODEX)}</td></tr>`;
  }).join('');
  $('#compare-table').innerHTML =
    `<table>
       <caption>Window: ${fmtDate(start)} → ${fmtDate(state.now)}. Lower is better for
         every gap metric; higher is better for count and pace.</caption>
       <thead><tr><th scope="col">Metric</th><th scope="col">${esc(sets[CLAUDE].name)}</th>
         <th scope="col">${esc(sets[CODEX].name)}</th></tr></thead>
       <tbody>${rows}</tbody>
     </table>`;
}

function renderArchive(sets) {
  const events = state.data.providers[CLAUDE].events
    .map((e) => ({ ...e, at: new Date(e.date) }))
    .filter((e) => state.showPolicy || e.kind === 'reset')
    .sort((a, b) => b.at - a.at);

  const resetDates = sets[CLAUDE].dates;
  $('#archive-list').innerHTML = events.map((e) => {
    let gap = '';
    if (e.kind === 'reset') {
      const i = resetDates.findIndex((d) => +d === +e.at);
      if (i > 0) gap = `<span class="entry-gap">${round1((e.at - resetDates[i - 1]) / DAY)} days after the previous reset</span>`;
      else gap = '<span class="entry-gap">First tracked reset</span>';
    }
    return `<li class="entry" data-kind="${esc(e.kind)}">
      <div class="entry-top">
        <span class="entry-date">${esc(fmtDate(e.at))}</span>
        <span class="entry-rel">${esc(relative(e.at, state.now))}</span>
        <span class="tag" data-kind="${esc(e.kind)}">${e.kind === 'reset' ? 'Reset' : 'Limit change'}</span>
        ${e.scope ? `<span class="tag">${esc(e.scope)}</span>` : ''}
      </div>
      <p class="entry-note">${esc(e.note)}</p>
      <div class="entry-foot">
        ${gap}
        <a href="${esc(safeUrl(e.url))}" rel="noopener" target="_blank">Original post ↗</a>
      </div>
    </li>`;
  }).join('');
}

let charts = () => {};

function render() {
  const sets = providerSets();
  const start = windowStart(sets);
  const stats = {
    [CLAUDE]: statsFor(sets[CLAUDE].dates, start, state.now),
    [CODEX]: statsFor(sets[CODEX].dates, start, state.now),
  };

  // With 0 or 1 tracked reset there is no "before that" gap, and fmtDate has
  // nothing to format — say what is true rather than rendering NaN.
  const lastClaude = sets[CLAUDE].dates.at(-1);
  const priorClaude = sets[CLAUDE].dates.at(-2);
  if (!lastClaude) {
    $('#counter').innerHTML = '<span class="counter-loading">No resets tracked yet.</span>';
    $('#hero-sub').textContent = 'Nothing on record for Claude yet.';
  } else {
    renderCounter(lastClaude);
    $('#hero-sub').innerHTML =
      `The last one landed on <strong>${esc(fmtDate(lastClaude))}</strong>.` +
      (priorClaude
        ? ` Before that, Anthropic had gone ${esc(round1((lastClaude - priorClaude) / DAY))} days.`
        : '');
  }
  $('#claude-account-link').href = safeUrl(state.data.providers[CLAUDE].accountUrl);

  const spanDays = Math.round((state.now - start) / DAY);
  $('#window-note').textContent = state.window === 'overlap'
    ? `Both providers tracked since ${fmtDate(start)} (${spanDays} days) — the fair comparison.`
    : state.window === '90'
      ? `The last 90 days.`
      : `Everything on record. Codex tracking starts ${fmtDate(sets[CODEX].dates[0])}, ` +
        `Claude only from ${fmtDate(sets[CLAUDE].dates[0])}, so totals are not like-for-like.`;

  renderTiles(sets);
  renderScoreboard(stats, sets);

  // Not every reset reached everyone. Excluding the partial ones would bias the
  // comparison the other way, since Codex publishes no scope at all — so they
  // are counted and the caveat is stated instead.
  const partial = sets[CLAUDE].events.filter(
    (e) => e.at >= start && e.at <= state.now && e.scope && e.scope !== 'all');
  $('#scope-note').textContent = partial.length
    ? `${partial.length} of Claude's ${stats[CLAUDE].count} resets here reached only ` +
      `part of the user base (${[...new Set(partial.map((e) => e.scope))].join(', ')}). ` +
      `They are counted as resets; Codex scope is not published, so no equivalent ` +
      `breakdown exists on that side.`
    : '';
  renderLegend('#legend-cumulative', sets);
  renderLegend('#legend-monthly', sets);
  renderTable(stats, sets, start);
  renderArchive(sets);

  $('#foot-coverage').textContent =
    `Coverage: ${sets[CLAUDE].dates.length} resets announced by @${state.data.providers[CLAUDE].account}, ` +
    `and ${sets[CODEX].dates.length} by @${state.data.providers[CODEX].account} for Codex. ` +
    `The @${state.data.providers[CLAUDE].account} account was created in February 2026 and its ` +
    `first reset announcement came on ${fmtDate(sets[CLAUDE].dates[0])}, so this is the complete ` +
    `record for that account. Anthropic reset limits before the account existed; those are out ` +
    `of scope here rather than missing.`;

  const series = {
    [CLAUDE]: { ...stats[CLAUDE], name: sets[CLAUDE].name },
    [CODEX]: { ...stats[CODEX], name: sets[CODEX].name },
  };
  charts = () => {
    drawCumulative($('#chart-cumulative'), series, start, state.now);
    drawMonthly($('#chart-monthly'), series, start, state.now);
    drawLanes($('#chart-lanes'), sets, state.now);
  };
  charts();
}

/* ── Boot ─────────────────────────────────────────────────────────────── */

const THEMES = ['dark', 'light'];

function initTheme() {
  const group = $('#theme-switch');
  let stored = localStorage.getItem('theme');
  if (stored === 'claude') stored = 'light';   // the cream theme is now "light"
  // Light is the default for a first visit — the OS preference is deliberately
  // not consulted. Only an explicit earlier choice overrides it.
  const start = THEMES.includes(stored) ? stored : 'light';

  const apply = (t) => {
    document.documentElement.dataset.theme = t;
    group.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.themeOpt === t;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  };
  apply(start);

  group.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-theme-opt]');
    if (!btn) return;
    const next = btn.dataset.themeOpt;
    localStorage.setItem('theme', next);
    apply(next);
    charts();               // re-render so marks pick up the theme's validated steps
  });
}

async function boot() {
  const res = await fetch('./data/resets.json');
  // Without this, a 404/5xx HTML body fails later inside res.json() with a
  // parse error that says nothing about what actually went wrong.
  if (!res.ok) throw new Error(`resets.json: HTTP ${res.status} ${res.statusText}`);
  state.data = await res.json();
  initTheme();
  render();

  $('#window-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-window]');
    if (!btn) return;
    state.window = btn.dataset.window;
    $('#window-toggle').querySelectorAll('button').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    render();
  });

  $('#show-policy').addEventListener('change', (e) => {
    state.showPolicy = e.target.checked;
    renderArchive(providerSets());
  });

  let t;
  addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => charts(), 150); });
}

boot().catch((err) => {
  console.error(err);
  $('#counter').innerHTML = '<span class="counter-loading">Could not load reset data.</span>';
});

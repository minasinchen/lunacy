// stats_charts.js - Visualisierungen für Statistiken (Histogramm + Linienchart)
// Loaded AFTER app.js. Exposes: window.renderStatsCharts(payload)

(function(){
  "use strict";

  function cssVar(name, fallback){
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function clamp(n, min, max){
    if (typeof window.clamp === "function") return window.clamp(n, min, max);
    return Math.max(min, Math.min(max, n));
  }

  function ensureChartsMount(){
    const mount = document.getElementById("statsCharts");
    if (mount) return mount;

    // fallback: inject into stats view
    const view = document.getElementById("view-stats");
    if (!view) return null;
    const d = document.createElement("div");
    d.id = "statsCharts";
    view.appendChild(d);
    return d;
  }

  function resizeCanvasToCSS(canvas, cssH){
    const wrap = canvas.parentElement;
    const cssW = Math.max(320, Math.floor((wrap?.clientWidth || canvas.width)));
    const height = Math.max(220, Math.floor(cssH || 300));
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    canvas.style.width = cssW + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(height * dpr);

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr,0,0,dpr,0,0);

    return { cssW, cssH: height, dpr };
  }

  function clear(ctx, w, h){
    ctx.clearRect(0,0,w,h);
  }

  function drawGrid(ctx, padL, padT, W, H, gridCol){
    ctx.save();
    ctx.strokeStyle = gridCol;
    ctx.lineWidth = 1;

    // horizontal
    for (let i=0;i<=4;i++){
      const y = padT + (H*i/4);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL+W, y);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawAxesLabels(ctx, labelsX, padL, padT, W, H, textCol, mutedCol){
    ctx.save();
    ctx.fillStyle = mutedCol;
    ctx.font = "12px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const n = labelsX.length;
    if (n <= 1){ ctx.restore(); return; }

    // show up to ~8 labels
    const step = Math.max(1, Math.ceil(n / 8));
    for (let i=0;i<n;i+=step){
      const x = padL + W*(i/(n-1));
      ctx.fillText(String(labelsX[i]), x, padT+H+8);
    }

    ctx.restore();
  }

  function roundRectPath(ctx, x, y, w, h, r){
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr, y);
    ctx.arcTo(x+w, y, x+w, y+h, rr);
    ctx.arcTo(x+w, y+h, x, y+h, rr);
    ctx.arcTo(x, y+h, x, y, rr);
    ctx.arcTo(x, y, x+w, y, rr);
    ctx.closePath();
  }

  function makeChartCard(title, sub){
    const card = document.createElement("div");
    card.className = "card inner chartCard";

    const head = document.createElement("div");
    head.className = "chartHeader";
    head.innerHTML = `
      <div style="flex:1;min-width:0;">
        <div class="chartTitle">${title}</div>
        <div class="chartSub">${sub || ""}</div>
      </div>
    `;

    const wrap = document.createElement("div");
    wrap.className = "chartCanvasWrap";
    const canvas = document.createElement("canvas");
    canvas.width = 980; canvas.height = 360;
    wrap.appendChild(canvas);

    const tip = document.createElement("div");
    tip.className = "chartTip";

    card.appendChild(head);
    card.appendChild(wrap);
    card.appendChild(tip);

    return { card, canvas, tip };
  }

  function showTip(tipEl, html){
    if (!tipEl) return;
    tipEl.innerHTML = html;
    tipEl.classList.add("show");
  }
  function hideTip(tipEl){
    if (!tipEl) return;
    tipEl.classList.remove("show");
  }

  function renderHistogram(canvas, tipEl, ztValues){
    const { cssW, cssH } = resizeCanvasToCSS(canvas, 310);
    const ctx = canvas.getContext("2d");
    clear(ctx, cssW, cssH);

    const gridCol = cssVar("--line", "rgba(255,255,255,0.14)");
    const mutedCol = cssVar("--muted", "rgba(255,255,255,0.7)");
    const textCol = cssVar("--text", "#fff");
    const gold = cssVar("--accent", "rgba(247,217,120,0.95)");
    const lav = cssVar("--accent2", "rgba(202,169,255,0.95)");

    const padL = 44, padR = 14, padT = 18, padB = 34;
    const W = cssW - padL - padR;
    const H = cssH - padT - padB;

    drawGrid(ctx, padL, padT, W, H, gridCol);

    if (!ztValues.length){
      ctx.save();
      ctx.fillStyle = mutedCol;
      ctx.font = "13px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Noch nicht genug Daten für ein Histogramm.", cssW/2, cssH/2);
      ctx.restore();
      return;
    }

    // Build bins from min..max, but keep reasonable width
    const minZT = Math.max(1, Math.min(...ztValues));
    const maxZT = Math.min(60, Math.max(...ztValues));
    const span = Math.max(6, (maxZT - minZT + 1));
    const bins = [];
    for (let z=minZT; z<=maxZT; z++) bins.push(z);

    const counts = new Map(bins.map(z=>[z,0]));
    for (const z of ztValues){
      if (counts.has(z)) counts.set(z, counts.get(z) + 1);
    }

    const maxCount = Math.max(1, ...bins.map(z=>counts.get(z)||0));

    // bars
    const n = bins.length;
    const gap = Math.max(3, Math.floor(W * 0.01));
    const barW = (W - gap*(n-1)) / n;

    const bars = []; // for tooltip hit-testing
    for (let i=0;i<n;i++){
      const z = bins[i];
      const c = counts.get(z) || 0;
      const h = (c / maxCount) * H;
      const x = padL + i*(barW + gap);
      const y = padT + (H - h);

      // bar gradient-ish (manual)
      ctx.save();
      // base glow
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = gold;
      roundRectPath(ctx, x-2, y-2, barW+4, h+4, 10);
      ctx.fill();

      // bar
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = gold;
      roundRectPath(ctx, x, y, barW, h, 10);
      ctx.fill();

      // top highlight
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = lav;
      roundRectPath(ctx, x, y, barW, Math.min(10, h), 10);
      ctx.fill();

      ctx.restore();

      bars.push({ x, y, w: barW, h, zt: z, count: c });
    }

    // axes labels
    drawAxesLabels(ctx, bins.map(z=>"ZT "+z), padL, padT, W, H, textCol, mutedCol);

    // y labels (0..maxCount)
    ctx.save();
    ctx.fillStyle = mutedCol;
    ctx.font = "12px ui-sans-serif, system-ui";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i=0;i<=4;i++){
      const y = padT + (H*i/4);
      const v = Math.round(maxCount * (1 - i/4));
      ctx.fillText(String(v), padL-8, y);
    }
    ctx.restore();

    // hover tooltip
    function onMove(ev){
      const rect = canvas.getBoundingClientRect();
      const mx = (ev.clientX - rect.left);
      const my = (ev.clientY - rect.top);

      // inside plotting area?
      if (mx < padL || mx > padL+W || my < padT || my > padT+H){
        hideTip(tipEl); return;
      }

      // find bar
      const b = bars.find(bb => mx >= bb.x && mx <= bb.x+bb.w && my >= bb.y && my <= bb.y+bb.h);
      if (!b){ hideTip(tipEl); return; }

      showTip(tipEl, `<span class="strong">ZT ${b.zt}</span> • ${b.count}×`);
    }
    function onLeave(){ hideTip(tipEl); }

    canvas.onmousemove = onMove;
    canvas.onmouseleave = onLeave;
    canvas.ontouchstart = (e)=>{ if (e.touches?.[0]) onMove(e.touches[0]); };
    canvas.ontouchmove = (e)=>{ if (e.touches?.[0]) onMove(e.touches[0]); };
    canvas.ontouchend = onLeave;
  }

  function renderLineChart(canvas, tipEl, series){
    const { cssW, cssH } = resizeCanvasToCSS(canvas, 310);
    const ctx = canvas.getContext("2d");
    clear(ctx, cssW, cssH);

    const gridCol = cssVar("--line", "rgba(255,255,255,0.14)");
    const mutedCol = cssVar("--muted", "rgba(255,255,255,0.7)");
    const textCol = cssVar("--text", "#fff");
    const gold = cssVar("--accent", "rgba(247,217,120,0.95)");
    const lav = cssVar("--accent2", "rgba(202,169,255,0.95)");

    const padL = 44, padR = 14, padT = 18, padB = 34;
    const W = cssW - padL - padR;
    const H = cssH - padT - padB;

    drawGrid(ctx, padL, padT, W, H, gridCol);

    if (!series.length){
      ctx.save();
      ctx.fillStyle = mutedCol;
      ctx.font = "13px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Noch nicht genug Daten für ein Linienchart.", cssW/2, cssH/2);
      ctx.restore();
      return;
    }

    const ys = series.map(s=>s.value).filter(v=>typeof v==="number" && isFinite(v));
    const yMin = Math.max(15, Math.min(...ys) - 1);
    const yMax = Math.min(60, Math.max(...ys) + 1);
    const span = Math.max(2, yMax - yMin);

    const n = series.length;
    const pts = [];
    for (let i=0;i<n;i++){
      const v = series[i].value;
      const x = padL + (n===1 ? W/2 : W * (i/(n-1)));
      const y = padT + H * (1 - ((v - yMin)/span));
      pts.push({ x, y, v, label: series[i].label });
    }

    // band ±2 days around mean
    const mean = ys.reduce((a,b)=>a+b,0)/ys.length;
    const b1 = clamp(mean - 2, yMin, yMax);
    const b2 = clamp(mean + 2, yMin, yMax);
    const yB1 = padT + H * (1 - ((b1 - yMin)/span));
    const yB2 = padT + H * (1 - ((b2 - yMin)/span));

    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = lav;
    ctx.fillRect(padL, Math.min(yB1, yB2), W, Math.abs(yB2 - yB1));
    ctx.restore();

    // line
    ctx.save();
    ctx.strokeStyle = lav;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i=0;i<pts.length;i++){
      if (i===0) ctx.moveTo(pts[i].x, pts[i].y);
      else ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();

    // points
    for (const p of pts){
      // glow
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = gold;
      ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI*2); ctx.fill();

      // dot
      ctx.globalAlpha = 1;
      ctx.fillStyle = gold;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4.2, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();

    // x labels
    drawAxesLabels(ctx, series.map(s=>s.shortLabel || s.label), padL, padT, W, H, textCol, mutedCol);

    // y labels
    ctx.save();
    ctx.fillStyle = mutedCol;
    ctx.font = "12px ui-sans-serif, system-ui";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i=0;i<=4;i++){
      const y = padT + (H*i/4);
      const v = Math.round(yMin + span*(1 - i/4));
      ctx.fillText(String(v), padL-8, y);
    }
    ctx.restore();

    // hover tooltip (nearest point)
    function onMove(ev){
      const rect = canvas.getBoundingClientRect();
      const mx = (ev.clientX - rect.left);
      const my = (ev.clientY - rect.top);

      if (mx < padL || mx > padL+W || my < padT || my > padT+H){
        hideTip(tipEl); return;
      }

      let best = null;
      let bestD = 1e9;
      for (const p of pts){
        const dx = mx - p.x;
        const dy = my - p.y;
        const d = dx*dx + dy*dy;
        if (d < bestD){ bestD = d; best = p; }
      }
      if (!best || bestD > 900){ hideTip(tipEl); return; } // ~30px

      showTip(tipEl, `<span class="strong">${best.v} Tage</span><br><span class="muted">${best.label}</span>`);
    }
    function onLeave(){ hideTip(tipEl); }

    canvas.onmousemove = onMove;
    canvas.onmouseleave = onLeave;
    canvas.ontouchstart = (e)=>{ if (e.touches?.[0]) onMove(e.touches[0]); };
    canvas.ontouchmove = (e)=>{ if (e.touches?.[0]) onMove(e.touches[0]); };
    canvas.ontouchend = onLeave;
  }

  function computeSeriesFromPeriods(payload){
    const periods = payload.periods || [];
    const avgCycle = Number(payload.avgCycle || 28);
    const diffDays = payload.diffDays;
    const addDays = payload.addDays;
    const computeOvulationForCycle = payload.computeOvulationForCycle;
    const model = payload.model;
    const notesByDate = payload.notesByDate;
    const formatDateDE = payload.formatDateDE;

    const cycles = periods.slice(0, 12).sort((a,b)=>a.start-b.start); // old -> new
    const ovZTs = [];
    const cycleLens = [];

    for (let i=0;i<cycles.length;i++){
      const cur = cycles[i];
      const next = (i+1 < cycles.length) ? cycles[i+1] : { start: addDays(cur.start, avgCycle) };

      const len = diffDays(cur.start, next.start);
      if (len>=15 && len<=60){
        cycleLens.push({
          value: len,
          label: `Start ${formatDateDE(cur.start)}`,
          shortLabel: `#${i+1}`,
        });
      }

      const ov = computeOvulationForCycle(cur.start, next.start, model, notesByDate);
      if (ov && typeof ov.zt === "number" && ov.zt >= 1 && ov.zt <= 60){
        ovZTs.push(ov.zt);
      }
    }

    return { ovZTs, cycleLens };
  }

  function renderStatsCharts(payload){
    const mount = ensureChartsMount();
    if (!mount) return;

    const { ovZTs, cycleLens } = computeSeriesFromPeriods(payload);

    // summary text
    const mean = (arr)=> arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : null;
    const stdev = (arr)=>{
      if (!arr.length) return null;
      const m = mean(arr);
      const v = arr.reduce((s,x)=>s+(x-m)*(x-m),0)/arr.length;
      return Math.sqrt(Math.max(0,v));
    };

    const ovMean = mean(ovZTs);
    const ovStd = stdev(ovZTs);
    const clArr = cycleLens.map(x=>x.value);
    const clMean = mean(clArr);
    const clStd = stdev(clArr);

    mount.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "statsChartsGrid";

    const hSub = ovZTs.length
      ? `Ø Eisprung: ZT ${ovMean.toFixed(1)} • Streuung: ±${(ovStd||0).toFixed(1)}`
      : "Trage LH/Mittelschmerz/Zervix ein, damit Lunacy den Eisprung je Zyklus besser schätzen kann.";

    const lSub = clArr.length
      ? `Ø Zyklus: ${clMean.toFixed(1)} Tage • Streuung: ±${(clStd||0).toFixed(1)} • Band: ±2 Tage`
      : "Noch nicht genug Zyklen für einen Verlauf.";

    const hist = makeChartCard("Eisprung-Zyklustag (Histogramm)", hSub);
    const line = makeChartCard("Zykluslängen (Verlauf)", lSub);

    grid.appendChild(hist.card);
    grid.appendChild(line.card);
    mount.appendChild(grid);

    // initial draw
    renderHistogram(hist.canvas, hist.tip, ovZTs);
    renderLineChart(line.canvas, line.tip, cycleLens);

    // redraw on resize (debounced)
    let t = null;
    window.addEventListener("resize", ()=>{
      if (t) clearTimeout(t);
      t = setTimeout(()=>{
        renderHistogram(hist.canvas, hist.tip, ovZTs);
        renderLineChart(line.canvas, line.tip, cycleLens);
      }, 120);
    }, { passive:true });
  }

  window.renderStatsCharts = renderStatsCharts;
})();

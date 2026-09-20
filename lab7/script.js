/* =========================================================================
   Lab 7 — Animated Temporal Commercial Network  (script.js)
   =========================================================================
   数据文件相对 index.html 的路径：
       ../data/lab7_assignment_companies.csv
       ../data/lab7_assignment_transactions_60days.csv
   ========================================================================= */

const COMPANY_FILE     = "../data/lab7_assignment_companies.csv";
const TRANSACTION_FILE = "../data/lab7_assignment_transactions_60days.csv";

/* ---------- canvas geometry ---------- */
/* 比例 1100 / 700 ≈ 1.57；容器越宽，图越大，节点越舒展 */
const WIDTH  = 1100;
const HEIGHT = 700;
const PAD    = 55;             /* 边距略大，避免节点贴边被裁 */

/* ---------- controls state ---------- */
let currentDay = 1;
let maxDay     = 60;
let timer      = null;
const FRAME_MS = 170;

/* ---------- svg layers ---------- */
const svg = d3.select("#network")
  .attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`)
  .attr("preserveAspectRatio", "xMidYMid meet");

const linkLayer  = svg.append("g").attr("class", "links");
const nodeLayer  = svg.append("g").attr("class", "nodes");
const labelLayer = svg.append("g").attr("class", "labels");

const tooltip = d3.select("#tooltip");

/* ---------- helpers ---------- */
const fmtInt = d3.format(",");
const fmtUSD = d => "$" + d3.format(",.0f")(d);

function linkKey(d) {
  const s = (d.source && d.source.id) ? d.source.id : d.source;
  const t = (d.target && d.target.id) ? d.target.id : d.target;
  return s < t ? `${s}|${t}` : `${t}|${s}`;
}

/* =========================================================================
   LOAD DATA
   ========================================================================= */
Promise.all([
  d3.csv(COMPANY_FILE),
  d3.csv(TRANSACTION_FILE, d => ({
    date:              d3.timeParse("%Y-%m-%d")(d.date),
    day:               +d.day,
    source:            d.source,
    target:            d.target,
    amount_usd:        +d.amount_usd,
    transaction_type:  d.transaction_type,
    transaction_count: +d.transaction_count
  }))
])
.then(([companyRows, transactions]) => {

  console.log("✅ Companies loaded:", companyRows.length);
  console.log("✅ Transactions loaded:", transactions.length);
  if (companyRows.length === 0)  throw new Error("companies CSV empty / parse failed");
  if (transactions.length === 0) throw new Error("transactions CSV empty / parse failed");

  /* ---------------------------------------------------------------------
     1. NODES
     --------------------------------------------------------------------- */
  const nodes = companyRows.map(d => ({
    id:      d.id,
    name:    d.company_name,
    sector:  d.sector,
    region:  d.region,
    _r:      8,
    _active: true
  }));

  const nodeById = new Map(nodes.map(d => [d.id, d]));

  /* ---------------------------------------------------------------------
     2. DERIVED DIMENSIONS
     --------------------------------------------------------------------- */
  const sectorList = [...new Set(nodes.map(d => d.sector))].sort();
  const regionList = [...new Set(nodes.map(d => d.region))].sort();
  const typeList   = [...new Set(transactions.map(d => d.transaction_type))].sort();

  maxDay = d3.max(transactions, d => d.day) || 60;
  const allDays = d3.range(1, maxDay + 1);

  const colorSector = d3.scaleOrdinal()
    .domain(sectorList)
    .range(d3.schemeTableau10);

  const colorRegion = d3.scaleOrdinal()
    .domain(regionList)
    .range(["#d9611f", "#2f6bd1", "#0f8a52", "#7c3aed", "#b8860b", "#0891b2"]);

  const colorType = d3.scaleOrdinal()
    .domain(typeList)
    .range(d3.schemeDark2);

  /* ---------------------------------------------------------------------
     3. PRE-COMPUTE PER-DAY LINK SETS + VOLUMES
     --------------------------------------------------------------------- */
  const rawByDay    = new Map();
  const dateByDay   = new Map();
  const linksByDay  = new Map();
  const volumeByDay = new Map();
  const activeByDay = new Map();

  transactions.forEach(t => {
    if (!dateByDay.has(t.day)) dateByDay.set(t.day, t.date);

    if (!rawByDay.has(t.day)) rawByDay.set(t.day, new Map());
    const dayMap = rawByDay.get(t.day);
    const key    = t.source < t.target ? `${t.source}|${t.target}`
                                       : `${t.target}|${t.source}`;

    if (!dayMap.has(key)) {
      dayMap.set(key, {
        source:    t.source < t.target ? t.source : t.target,
        target:    t.source < t.target ? t.target : t.source,
        amount:    0,
        count:     0,
        typeCount: new Map()
      });
    }
    const rec = dayMap.get(key);
    rec.amount += t.amount_usd;
    rec.count  += t.transaction_count;
    rec.typeCount.set(
      t.transaction_type,
      (rec.typeCount.get(t.transaction_type) || 0) + t.amount_usd
    );
  });

  allDays.forEach(day => {
    const dayMap = rawByDay.get(day);
    const links  = [];

    if (dayMap) {
      dayMap.forEach(rec => {
        let bestType = typeList[0], bestAmt = -1;
        rec.typeCount.forEach((amt, tp) => {
          if (amt > bestAmt) { bestAmt = amt; bestType = tp; }
        });

        const sNode = nodeById.get(rec.source);
        const tNode = nodeById.get(rec.target);

        links.push({
          source:      rec.source,
          target:      rec.target,
          amount:      rec.amount,
          count:       rec.count,
          type:        bestType,
          types:       [...rec.typeCount.keys()],
          crossRegion: sNode && tNode ? sNode.region !== tNode.region : false
        });
      });
    }

    linksByDay.set(day, links);

    const volMap = new Map(nodes.map(n => [n.id, 0]));
    const active = new Set();

    links.forEach(l => {
      volMap.set(l.source, (volMap.get(l.source) || 0) + l.amount);
      volMap.set(l.target, (volMap.get(l.target) || 0) + l.amount);
      active.add(l.source);
      active.add(l.target);
    });

    volumeByDay.set(day, volMap);
    activeByDay.set(day, active);
  });

  /* ---------------------------------------------------------------------
     4. ENCODING SCALES
     --------------------------------------------------------------------- */
  let maxVolume = 1;
  volumeByDay.forEach(m => m.forEach(v => { if (v > maxVolume) maxVolume = v; }));

  let maxLinkAmount = 1;
  linksByDay.forEach(arr => arr.forEach(l => {
    if (l.amount > maxLinkAmount) maxLinkAmount = l.amount;
  }));

  /* 节点半径范围加大：最小 7，最大 30 */
  const rScale = d3.scaleSqrt()
    .domain([0, maxVolume])
    .range([7, 30]);

  const linkWidth = d3.scaleSqrt()
    .domain([0, maxLinkAmount])
    .range([1.1, 10]);

  /* ---------------------------------------------------------------------
     5. FORCE SIMULATION —— 加强排斥，让节点分布更开
     --------------------------------------------------------------------- */
  const simulation = d3.forceSimulation(nodes)
    .force("link",
      d3.forceLink([])
        .id(d => d.id)
        .distance(165)            /* 135 → 165 连线更长 */
        .strength(0.24)           /* 0.28 → 0.24 稍弱，避免拉得太紧 */
    )
    .force("charge",
      d3.forceManyBody()
        .strength(-900)           /* -520 → -900 排斥更强 */
        .distanceMax(700)
    )
    .force("center", d3.forceCenter(WIDTH / 2, HEIGHT / 2))
    .force("collide",
      d3.forceCollide()
        .radius(d => (d._r || 10) + 16)   /* +10 → +16 半径间距更大 */
        .iterations(3)
    )
    .force("x", d3.forceX(WIDTH / 2).strength(0.03))
    .force("y", d3.forceY(HEIGHT / 2).strength(0.04))
    .alphaDecay(0.04)
    .velocityDecay(0.55);

  simulation.on("tick", () => {
    nodes.forEach(d => {
      d.x = Math.max(PAD, Math.min(WIDTH  - PAD, d.x));
      d.y = Math.max(PAD, Math.min(HEIGHT - PAD, d.y));
    });

    linkLayer.selectAll("line")
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    nodeLayer.selectAll("circle")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y);

    labelLayer.selectAll("text.node-label")
      .attr("x", d => d.x)
      .attr("y", d => d.y)
      .attr("dy", d => -(d._r + 9));   /* 标签与节点间距稍大 */
  });

  /* ---------------------------------------------------------------------
     6. TOOLTIPS
     --------------------------------------------------------------------- */
  function showTooltip(event, html) {
    tooltip
      .style("opacity", 1)
      .style("left", (event.clientX + 16) + "px")
      .style("top",  (event.clientY - 14) + "px")
      .html(html);
  }
  function moveTooltip(event) {
    tooltip
      .style("left", (event.clientX + 16) + "px")
      .style("top",  (event.clientY - 14) + "px");
  }
  function hideTooltip() {
    tooltip.style("opacity", 0);
  }

  /* ---------------------------------------------------------------------
     7. FRAME RENDERER
     --------------------------------------------------------------------- */
  function showDay(day) {
    day = Math.max(1, Math.min(maxDay, Math.round(day)));
    currentDay = day;

    const links     = linksByDay.get(day)  || [];
    const volMap    = volumeByDay.get(day) || new Map();
    const activeSet = activeByDay.get(day) || new Set();

    nodes.forEach(n => {
      n._r      = rScale(volMap.get(n.id) || 0);
      n._active = activeSet.has(n.id);
    });

    simulation.force("link").links(links);

    /* --- LINKS --- */
    linkLayer.selectAll("line")
      .data(links, linkKey)
      .join(
        enter => enter.append("line")
          .attr("stroke",           d => colorType(d.type))
          .attr("stroke-linecap",   "round")
          .attr("stroke-opacity",   0)
          .attr("stroke-width",     d => linkWidth(d.amount))
          .call(sel => sel.transition("link-in")
            .duration(450)
            .attr("stroke-opacity", 0.85)),

        update => update
          .call(sel => sel.transition("link-up")
            .duration(450)
            .attr("stroke",         d => colorType(d.type))
            .attr("stroke-width",   d => linkWidth(d.amount))
            .attr("stroke-opacity", 0.85)),

        exit => exit
          .call(sel => sel.transition("link-out")
            .duration(380)
            .attr("stroke-opacity", 0)
            .remove())
      )
      .on("mouseover", (event, d) => {
        const sId = typeof d.source === "object" ? d.source.id : d.source;
        const tId = typeof d.target === "object" ? d.target.id : d.target;
        showTooltip(event, `
          <strong>${nodeById.get(sId).name}</strong><br>
          <span class="muted">↕</span><br>
          <strong>${nodeById.get(tId).name}</strong><br>
          <span class="muted">Type:</span> ${d.type}<br>
          <span class="muted">Amount:</span> ${fmtUSD(d.amount)}<br>
          <span class="muted">Transactions:</span> ${fmtInt(d.count)}<br>
          <span class="muted">Cross-region:</span> ${d.crossRegion ? "yes" : "no"}
        `);
      })
      .on("mousemove", moveTooltip)
      .on("mouseout", hideTooltip);

    /* --- NODES --- */
    nodeLayer.selectAll("circle")
      .data(nodes, d => d.id)
      .join(
        enter => enter.append("circle")
          .attr("stroke-width", 3)
          .attr("cursor", "pointer")
          .attr("r", 0),
        update => update
      )
      .attr("fill",           d => colorSector(d.sector))
      .attr("stroke",         d => colorRegion(d.region))
      .attr("r",              d => d._r)
      .attr("fill-opacity",   d => d._active ? 1 : 0.28)
      .attr("stroke-opacity", d => d._active ? 1 : 0.40)
      .on("mouseover", (event, d) => {
        const vol = volumeByDay.get(currentDay).get(d.id) || 0;
        showTooltip(event, `
          <strong>${d.name}</strong><br>
          <span class="muted">${d.id}</span><br>
          <span class="muted">Sector:</span> ${d.sector}<br>
          <span class="muted">Region:</span> ${d.region}<br>
          <span class="muted">Day ${currentDay} volume:</span> ${fmtUSD(vol)}<br>
          <span class="muted">Status:</span> ${d._active ? "active" : "inactive"}
        `);
      })
      .on("mousemove", moveTooltip)
      .on("mouseout", hideTooltip);

    /* --- LABELS --- */
    labelLayer.selectAll("text.node-label")
      .data(nodes, d => d.id)
      .join("text")
      .attr("class", "node-label")
      .attr("text-anchor", "middle")
      .text(d => d.name)
      .attr("opacity", d => d._active ? 1 : 0.30);

    /* --- SUMMARY --- */
    const totalValue  = d3.sum(links, d => d.amount);
    const totalCount  = d3.sum(links, d => d.count);
    const crossRegion = links.filter(d => d.crossRegion).length;
    const crossPct    = links.length ? (100 * crossRegion / links.length) : 0;
    const dateObj     = dateByDay.get(day);
    const dateStr     = dateObj ? d3.timeFormat("%Y-%m-%d")(dateObj) : "—";

    d3.select("#summary").html(`
      <h3>Day ${day} · ${dateStr}</h3>
      <div class="stat"><span>Active companies</span><b>${activeSet.size} / ${nodes.length}</b></div>
      <div class="stat"><span>Active links</span><b>${links.length}</b></div>
      <div class="stat"><span>Total transaction value</span><b>${fmtUSD(totalValue)}</b></div>
      <div class="stat"><span>Transaction count</span><b>${fmtInt(totalCount)}</b></div>
      <div class="stat"><span>Cross-region links</span><b>${crossRegion} (${crossPct.toFixed(0)}%)</b></div>
    `);

    /* --- UI SYNC --- */
    d3.select("#day-label").text(`Day ${day}`);
    d3.select("#date-label").text(dateStr);
    d3.select("#time-slider").property("value", day);

    if (links.length > 0) {
      simulation.alpha(0.12).restart();
    }
  }

  /* ---------------------------------------------------------------------
     8. ANIMATION CONTROLS
     --------------------------------------------------------------------- */
  function play() {
    if (timer) return;
    if (currentDay >= maxDay) currentDay = 1;

    d3.select("#play").classed("active", true);

    showDay(currentDay);

    timer = d3.interval(() => {
      if (currentDay >= maxDay) {
        pause();
        return;
      }
      currentDay += 1;
      showDay(currentDay);
    }, FRAME_MS);
  }

  function pause() {
    if (timer) { timer.stop(); timer = null; }
    d3.select("#play").classed("active", false);
  }

  function reset() {
    pause();
    currentDay = 1;
    showDay(1);
  }

  d3.select("#play").on("click", play);
  d3.select("#pause").on("click", pause);
  d3.select("#reset").on("click", reset);

  d3.select("#time-slider")
    .attr("min", 1)
    .attr("max", maxDay)
    .attr("value", 1)
    .on("input", function () {
      pause();
      showDay(+this.value);
    });

  d3.select(window).on("keydown", (event) => {
    if (event.code === "Space") {
      event.preventDefault();
      timer ? pause() : play();
    } else if (event.code === "ArrowRight") {
      pause();
      showDay(currentDay + 1);
    } else if (event.code === "ArrowLeft") {
      pause();
      showDay(currentDay - 1);
    }
  });

  /* ---------------------------------------------------------------------
     9. LEGEND
     --------------------------------------------------------------------- */
  const legend = d3.select("#legend");

  legend.append("h3").text("Company sector — node fill");
  const secBox = legend.append("div");
  sectorList.forEach(s => {
    const row = secBox.append("div").attr("class", "legend-row");
    row.append("span").attr("class", "swatch dot").style("background", colorSector(s));
    row.append("span").text(s);
  });

  legend.append("h3").text("Region — node outline");
  const regBox = legend.append("div");
  regionList.forEach(r => {
    const row = regBox.append("div").attr("class", "legend-row");
    row.append("span").attr("class", "swatch ring").style("border-color", colorRegion(r));
    row.append("span").text(r);
  });

  legend.append("h3").text("Transaction type — link colour");
  const typBox = legend.append("div");
  typeList.forEach(t => {
    const row = typBox.append("div").attr("class", "legend-row");
    row.append("span").attr("class", "swatch line").style("background", colorType(t));
    row.append("span").text(t);
  });

  legend.append("h3").text("Size & width");
  const sizeRow  = legend.append("div").attr("class", "legend-row");
  const sizeSvg  = sizeRow.append("svg").attr("width", 140).attr("height", 40);
  sizeSvg.append("circle").attr("cx", 16).attr("cy", 20).attr("r", 8)
    .attr("fill", "#2f6bd1").attr("stroke", "#d9611f").attr("stroke-width", 2.5);
  sizeSvg.append("circle").attr("cx", 75).attr("cy", 20).attr("r", 15)
    .attr("fill", "#2f6bd1").attr("stroke", "#d9611f").attr("stroke-width", 2.5);
  sizeSvg.append("text").attr("x", 96).attr("y", 24)
    .attr("fill", "#5b6b84").attr("font-size", 11).text("volume");

  const sizeRow2 = legend.append("div").attr("class", "legend-row");
  const sizeSvg2 = sizeRow2.append("svg").attr("width", 140).attr("height", 22);
  sizeSvg2.append("line").attr("x1", 6).attr("y1", 11).attr("x2", 38).attr("y2", 11)
    .attr("stroke", "#666").attr("stroke-width", 1.4).attr("stroke-linecap", "round");
  sizeSvg2.append("line").attr("x1", 46).attr("y1", 11).attr("x2", 112).attr("y2", 11)
    .attr("stroke", "#666").attr("stroke-width", 7).attr("stroke-linecap", "round");
  sizeSvg2.append("text").attr("x", 116).attr("y", 15)
    .attr("fill", "#5b6b84").attr("font-size", 11).text("amount");

  legend.append("div")
    .attr("class", "legend-scale")
    .html("Inactive companies fade to ~30% opacity; inactive links fade out and are removed.");

  /* ---------------------------------------------------------------------
     10. GO
     --------------------------------------------------------------------- */
  showDay(1);
})
.catch(err => {
  console.error("❌ Data load failed:", err);
  d3.select(".chart-wrap").html(`
    <div style="padding:40px; color:#d9611f; font-size:14px; line-height:1.8;">
      <strong style="font-size:16px;">❌ Failed to load data</strong><br><br>
      <b>Error:</b> ${err.message}<br><br>
      <b>当前尝试的路径：</b><br>
      • <code>${COMPANY_FILE}</code><br>
      • <code>${TRANSACTION_FILE}</code><br><br>
      <b>排查步骤：</b><br>
      1. DevTools → Network → 过滤 <code>csv</code>，看请求是 200 还是 404。<br>
      2. 浏览器地址栏直接试：
         <code>http://localhost:8000/data/lab7_assignment_companies.csv</code>。<br>
      3. 如果 <code>../data/</code> 不行，试 <code>../../data/</code>。<br>
    </div>
  `);
});
// ======================================================
// Lab 5 Assignment — Urban Transit Network
// ======================================================

// Canvas size — enlarged to give the network room to breathe
const nlWidth  = 1000;
const nlHeight = 720;
const nlPadding = 30;
const labelGap  = 120;

const tooltip = d3.select("#tooltip");

// ------------------------------------------------------
// Load data
// ------------------------------------------------------
Promise.all([
  d3.csv("../data/lab5_assignment_stations.csv", d => ({
    id: d.id,
    station_name: d.station_name,
    district: d.district,
    daily_passengers: +d.daily_passengers,
    station_type: d.station_type
  })),
  d3.csv("../data/lab5_assignment_routes.csv", d => ({
    source: d.source,
    target: d.target,
    travel_time_min: +d.travel_time_min,
    route_type: d.route_type
  }))
]).then(([nodes, links]) => {

  console.log("Nodes:", nodes.length);
  console.log("Links:", links.length);

  // ----------------------------------------------------
  // SVG
  // ----------------------------------------------------
  const svg = d3.select("#chart")
    .append("svg")
    .attr("width", nlWidth)
    .attr("height", nlHeight)
    .style("border", "1px solid #eee");

  // ----------------------------------------------------
  // Scales
  // ----------------------------------------------------
  const districts = ["Central", "North", "South", "East", "West"];

  const districtColor = d3.scaleOrdinal()
    .domain(districts)
    .range(["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd"]);

  const passengerExtent = d3.extent(nodes, d => d.daily_passengers);

  const passengerSize = d3.scaleSqrt()
    .domain(passengerExtent)
    .range([50, 650]);

  const stationTypes = ["Local", "Transfer", "Terminal"];

  const stationTypeSymbol = d3.scaleOrdinal()
    .domain(stationTypes)
    .range([d3.symbolCircle, d3.symbolSquare, d3.symbolTriangle]);

  const routeTypes = ["Metro", "Express", "Shuttle"];

  const routeColor = d3.scaleOrdinal()
    .domain(routeTypes)
    .range(["#333333", "#e41a1c", "#377eb8"]);

  const travelExtentRaw = d3.extent(links, d => d.travel_time_min);
  const travelExtent = travelExtentRaw[0] === travelExtentRaw[1]
    ? [travelExtentRaw[0] - 1, travelExtentRaw[1] + 1]
    : travelExtentRaw;

  const linkWidth = d3.scaleLinear()
    .domain(travelExtent)
    .range([1.5, 7]);

  const travelOpacity = d3.scaleLinear()
    .domain(travelExtent)
    .range([0.3, 1]);

  const nodeRadius = d => Math.sqrt(passengerSize(d.daily_passengers) / Math.PI);

  // ----------------------------------------------------
  // Draw links
  // ----------------------------------------------------
  const linkSel = svg.append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke", d => routeColor(d.route_type))
    .attr("stroke-width", d => linkWidth(d.travel_time_min))
    .attr("stroke-opacity", 0.7);

  // ----------------------------------------------------
  // Draw nodes as symbols
  // ----------------------------------------------------
  const nodeSel = svg.append("g")
    .attr("class", "nodes")
    .selectAll("path")
    .data(nodes)
    .join("path")
    .attr("d", d =>
      d3.symbol()
        .type(stationTypeSymbol(d.station_type))
        .size(passengerSize(d.daily_passengers))()
    )
    .attr("fill", d => districtColor(d.district))
    .attr("stroke", "#222")
    .attr("stroke-width", 1.5)
    .call(
      d3.drag()
        .on("start", dragStarted)
        .on("drag", dragged)
        .on("end", dragEnded)
    );

  // ----------------------------------------------------
  // Labels
  // ----------------------------------------------------
  const labelSel = svg.append("g")
    .attr("class", "labels")
    .selectAll("text")
    .data(nodes)
    .join("text")
    .text(d => d.station_name)
    .attr("font-size", 10)
    .attr("font-weight", 500)
    .attr("pointer-events", "none")
    .attr("fill", "#222")
    .attr("paint-order", "stroke")
    .attr("stroke", "#fff")
    .attr("stroke-width", 2.5)
    .attr("stroke-linejoin", "round");

  // ----------------------------------------------------
  // Force simulation
  // ----------------------------------------------------
  const simulation = d3.forceSimulation(nodes)
    .force(
      "link",
      d3.forceLink(links)
        .id(d => d.id)
        .distance(d => 50 + d.travel_time_min * 2)
        .strength(0.5)
    )
    .force(
      "charge",
      d3.forceManyBody().strength(-220)
    )
    .force(
      "x",
      d3.forceX(nlWidth / 2).strength(0.06)
    )
    .force(
      "y",
      d3.forceY(nlHeight / 2).strength(0.08)
    )
    .force(
      "collision",
      d3.forceCollide().radius(d => nodeRadius(d) + 6)
    );

  // ----------------------------------------------------
  // Tick — with boundary clamping
  // ----------------------------------------------------
  simulation.on("tick", () => {

    nodes.forEach(d => {
      const r = nodeRadius(d);
      const leftLimit   = nlPadding + r;
      const rightLimit  = nlWidth  - nlPadding - r - 60;
      const topLimit    = nlPadding + r;
      const bottomLimit = nlHeight - nlPadding - r;

      d.x = Math.max(leftLimit, Math.min(rightLimit, d.x));
      d.y = Math.max(topLimit,  Math.min(bottomLimit, d.y));
    });

    linkSel
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    nodeSel
      .attr("transform", d => `translate(${d.x},${d.y})`);

    labelSel
      .attr("x", d => d.x + (d.x > nlWidth - labelGap ? -12 : 12))
      .attr("y", d => d.y + 3)
      .attr("text-anchor", d => d.x > nlWidth - labelGap ? "end" : "start");
  });

  // ----------------------------------------------------
  // Drag functions
  // ----------------------------------------------------
  function dragStarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    const r = nodeRadius(d);
    d.fx = Math.max(nlPadding + r, Math.min(nlWidth  - nlPadding - r - 60, event.x));
    d.fy = Math.max(nlPadding + r, Math.min(nlHeight - nlPadding - r, event.y));
  }

  function dragEnded(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  // ----------------------------------------------------
  // Highlight connected nodes
  // ----------------------------------------------------
  function getNodeId(endpoint) {
    return typeof endpoint === "object" && endpoint !== null
      ? endpoint.id
      : endpoint;
  }

  function isConnected(a, b) {
    return links.some(l => {
      const s = getNodeId(l.source);
      const t = getNodeId(l.target);
      return (s === a.id && t === b.id) || (s === b.id && t === a.id);
    });
  }

  nodeSel
    .on("mouseover", function (event, d) {
      nodeSel.attr("opacity", o =>
        o.id === d.id || isConnected(d, o) ? 1 : 0.15
      );

      linkSel.attr("stroke-opacity", l =>
        getNodeId(l.source) === d.id || getNodeId(l.target) === d.id ? 1 : 0.08
      );

      labelSel.attr("opacity", o =>
        o.id === d.id || isConnected(d, o) ? 1 : 0.15
      );
    })
    .on("mouseout", function () {
      nodeSel.attr("opacity", 1);
      linkSel.attr("stroke-opacity", 0.7);
      labelSel.attr("opacity", 1);
    });

  // ----------------------------------------------------
  // Tooltips
  // ----------------------------------------------------
  nodeSel
    .on("mouseover.tooltip", function (event, d) {
      tooltip
        .style("opacity", 1)
        .html(`
          <strong>${d.station_name} (${d.id})</strong><br>
          District: ${d.district}<br>
          Type: ${d.station_type}<br>
          Daily Passengers: ${d.daily_passengers.toLocaleString()}
        `);
    })
    .on("mousemove.tooltip", function (event) {
      tooltip
        .style("left", `${event.pageX + 12}px`)
        .style("top", `${event.pageY + 12}px`);
    })
    .on("mouseout.tooltip", function () {
      tooltip.style("opacity", 0);
    });

  // ----------------------------------------------------
  // Node-Link Legend
  // ----------------------------------------------------
  buildNodeLinkLegend(
    districts, districtColor,
    passengerExtent, passengerSize,
    stationTypes, stationTypeSymbol,
    routeTypes, routeColor,
    travelExtent, linkWidth
  );

  // ----------------------------------------------------
  // Adjacency Matrix
  // ----------------------------------------------------
  drawMatrix(
    nodes, links,
    districtColor, routeColor,
    travelOpacity, travelExtent
  );

  // ----------------------------------------------------
  // Findings
  // ----------------------------------------------------
  renderFindings(nodes, links);

});

// ======================================================
// Helper: Node-Link Legend
// ======================================================
function buildNodeLinkLegend(
  districts, districtColor,
  passengerExtent, passengerSize,
  stationTypes, stationTypeSymbol,
  routeTypes, routeColor,
  travelExtent, linkWidth
) {
  const legend = d3.select("#legend");
  legend.html("");

  const districtDiv = legend.append("div").attr("class", "legend-section");
  districtDiv.append("h4").text("District (node color)");
  districts.forEach(d => {
    districtDiv.append("div")
      .attr("class", "legend-item")
      .html(`<span class="swatch" style="background:${districtColor(d)}"></span>${d}`);
  });

  const sizeDiv = legend.append("div").attr("class", "legend-section");
  sizeDiv.append("h4").text("Daily passengers (node area)");
  const sizeSvg = sizeDiv.append("svg").attr("width", 220).attr("height", 70);

  [passengerExtent[0], passengerExtent[1]].forEach((val, i) => {
    const cx = 50 + i * 100;
    const r = Math.sqrt(passengerSize(val) / Math.PI);
    sizeSvg.append("circle")
      .attr("cx", cx).attr("cy", 35).attr("r", r)
      .attr("fill", "#999");
    sizeSvg.append("text")
      .attr("x", cx).attr("y", 65)
      .attr("text-anchor", "middle").attr("font-size", 10)
      .text(val.toLocaleString());
  });

  const typeDiv = legend.append("div").attr("class", "legend-section");
  typeDiv.append("h4").text("Station type (node shape)");
  stationTypes.forEach(t => {
    const row = typeDiv.append("div").attr("class", "legend-item");
    const svg = row.append("svg").attr("width", 26).attr("height", 20);
    svg.append("path")
      .attr("transform", "translate(13,10)")
      .attr("d", d3.symbol().type(stationTypeSymbol(t)).size(120)())
      .attr("fill", "#999");
    row.append("span").text(t);
  });

  const routeDiv = legend.append("div").attr("class", "legend-section");
  routeDiv.append("h4").text("Route type (link color)");
  routeTypes.forEach(t => {
    routeDiv.append("div")
      .attr("class", "legend-item")
      .html(`<span class="line-swatch" style="background:${routeColor(t)}"></span>${t}`);
  });

  const timeDiv = legend.append("div").attr("class", "legend-section");
  timeDiv.append("h4").text("Travel time (link width)");
  const timeSvg = timeDiv.append("svg").attr("width", 220).attr("height", 60);

  [travelExtent[0], travelExtent[1]].forEach((val, i) => {
    const y = 18 + i * 22;
    timeSvg.append("line")
      .attr("x1", 0).attr("x2", 80)
      .attr("y1", y).attr("y2", y)
      .attr("stroke", "#666")
      .attr("stroke-width", linkWidth(val));
    timeSvg.append("text")
      .attr("x", 90).attr("y", y + 4)
      .attr("font-size", 10)
      .text(`${val} min`);
  });
}

// ======================================================
// Helper: Adjacency Matrix
// ======================================================
function drawMatrix(nodes, links, districtColor, routeColor, travelOpacity, travelExtent) {
  // ← 关键修复：从 routeColor 比例尺里取出 ["Metro", "Express", "Shuttle"]
  const routeTypes = routeColor.domain();

  const districtOrder = ["Central", "North", "South", "East", "West"];
  const typeOrder = ["Terminal", "Transfer", "Local"];

  const orderedNodes = nodes.slice().sort((a, b) => {
    const dA = districtOrder.indexOf(a.district);
    const dB = districtOrder.indexOf(b.district);
    if (dA !== dB) return dA - dB;

    const tA = typeOrder.indexOf(a.station_type);
    const tB = typeOrder.indexOf(b.station_type);
    if (tA !== tB) return tA - tB;

    return b.daily_passengers - a.daily_passengers;
  });

  const matrixSize = 580;
  const margin = { top: 120, right: 40, bottom: 40, left: 160 };

  const svg = d3.select("#matrix")
    .append("svg")
    .attr("width", matrixSize + margin.left + margin.right)
    .attr("height", matrixSize + margin.top + margin.bottom);

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand()
    .domain(orderedNodes.map(d => d.id))
    .range([0, matrixSize])
    .padding(0.05);

  const y = d3.scaleBand()
    .domain(orderedNodes.map(d => d.id))
    .range([0, matrixSize])
    .padding(0.05);

  const matrixData = [];

  orderedNodes.forEach(rowNode => {
    orderedNodes.forEach(colNode => {
      const found = links.find(l => {
        const s = typeof l.source === "object" ? l.source.id : l.source;
        const t = typeof l.target === "object" ? l.target.id : l.target;
        return (
          (s === rowNode.id && t === colNode.id) ||
          (s === colNode.id && t === rowNode.id)
        );
      });

      matrixData.push({
        row: rowNode.id,
        col: colNode.id,
        weight: found ? found.travel_time_min : 0,
        type: found ? found.route_type : null
      });
    });
  });

  g.selectAll("rect")
    .data(matrixData)
    .join("rect")
    .attr("x", d => x(d.col))
    .attr("y", d => y(d.row))
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("fill", d => d.weight > 0 ? routeColor(d.type) : "#f3f3f3")
    .attr("fill-opacity", d => d.weight > 0 ? travelOpacity(d.weight) : 1)
    .attr("stroke", "#fff")
    .attr("stroke-width", 0.3)
    .on("mouseover", (event, d) => {
      if (d.weight > 0) {
        tooltip.style("opacity", 1)
          .html(`
            <strong>${d.row} ↔ ${d.col}</strong><br>
            Route: ${d.type}<br>
            Travel time: ${d.weight} min
          `);
      }
    })
    .on("mousemove", event => {
      tooltip.style("left", `${event.pageX + 12}px`).style("top", `${event.pageY + 12}px`);
    })
    .on("mouseout", () => tooltip.style("opacity", 0));

  // X labels
  g.append("g")
    .selectAll("text")
    .data(orderedNodes)
    .join("text")
    .attr("x", d => x(d.id) + x.bandwidth() / 2)
    .attr("y", -8)
    .attr("transform", d => `rotate(-90, ${x(d.id) + x.bandwidth() / 2}, -8)`)
    .attr("text-anchor", "start")
    .attr("font-size", 8)
    .attr("fill", d => districtColor(d.district))
    .text(d => d.id);

  // Y labels
  g.append("g")
    .selectAll("text")
    .data(orderedNodes)
    .join("text")
    .attr("x", -8)
    .attr("y", d => y(d.id) + y.bandwidth() / 2)
    .attr("text-anchor", "end")
    .attr("dominant-baseline", "middle")
    .attr("font-size", 8)
    .attr("fill", d => districtColor(d.district))
    .text(d => d.id);

  // --------------------------------------------------
  // Matrix legend
  // --------------------------------------------------
  const legend = d3.select("#matrix-legend");
  legend.html("");

  const routeDiv = legend.append("div").attr("class", "legend-section");
  routeDiv.append("h4").text("Cell color: route type");
  routeTypes.forEach(t => {
    routeDiv.append("div")
      .attr("class", "legend-item")
      .html(`<span class="swatch" style="background:${routeColor(t)}"></span>${t}`);
  });

  const timeDiv = legend.append("div").attr("class", "legend-section");
  timeDiv.append("h4").text("Cell opacity: travel time");
  const timeSvg = timeDiv.append("svg").attr("width", 240).attr("height", 70);

  const times = [
    travelExtent[0],
    (travelExtent[0] + travelExtent[1]) / 2,
    travelExtent[1]
  ];

  times.forEach((val, i) => {
    const cx = 30 + i * 75;
    timeSvg.append("rect")
      .attr("x", cx).attr("y", 10)
      .attr("width", 42).attr("height", 22)
      .attr("fill", "#4682b4")
      .attr("fill-opacity", travelOpacity(val));
    timeSvg.append("text")
      .attr("x", cx + 21).attr("y", 52)
      .attr("text-anchor", "middle")
      .attr("font-size", 10)
      .text(val);
  });
}

// ======================================================
// Helper: Findings
// ======================================================
function renderFindings(nodes, links) {
  const findings = d3.select("#findings");
  findings.html("");

  const nodeById = new Map(nodes.map(d => [d.id, d]));

  const degree = new Map(nodes.map(d => [d.id, 0]));
  const weightedDegree = new Map(nodes.map(d => [d.id, 0]));

  links.forEach(l => {
    const s = typeof l.source === "object" ? l.source.id : l.source;
    const t = typeof l.target === "object" ? l.target.id : l.target;

    degree.set(s, degree.get(s) + 1);
    degree.set(t, degree.get(t) + 1);

    weightedDegree.set(s, weightedDegree.get(s) + l.travel_time_min);
    weightedDegree.set(t, weightedDegree.get(t) + l.travel_time_min);
  });

  const topDegree = nodes.slice()
    .sort((a, b) => degree.get(b.id) - degree.get(a.id))
    .slice(0, 5);

  const topPassengers = nodes.slice()
    .sort((a, b) => b.daily_passengers - a.daily_passengers)
    .slice(0, 5);

  const longestLinks = links.slice()
    .sort((a, b) => b.travel_time_min - a.travel_time_min)
    .slice(0, 5);

  const districtPairCounts = d3.rollups(
    links,
    v => v.length,
    l => {
      const s = nodeById.get(typeof l.source === "object" ? l.source.id : l.source);
      const t = nodeById.get(typeof l.target === "object" ? l.target.id : l.target);
      return [s.district, t.district].sort().join(" — ");
    }
  ).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const routeTypeCounts = d3.rollups(
    links,
    v => v.length,
    l => l.route_type
  ).sort((a, b) => b[1] - a[1]);

  const transferTerminal = nodes.filter(d => d.station_type !== "Local");

  function avgDegreeByType(type) {
    const arr = nodes.filter(d => d.station_type === type);
    if (!arr.length) return 0;
    return d3.mean(arr, d => degree.get(d.id));
  }

  findings.append("p").html(`
    <strong>1. Which stations appear central in the network?</strong><br>
    In the node-link view, central stations have many converging links.
    The top-degree stations are
    ${topDegree.slice(0, 3).map(d => `${d.station_name} (degree ${degree.get(d.id)})`).join(", ")}.
    In the adjacency matrix, these stations have many filled cells in their rows and columns.
  `);

  findings.append("p").html(`
    <strong>2. Which districts are strongly connected to one another?</strong><br>
    The most frequent district pairs are
    ${districtPairCounts.slice(0, 3).map(([pair, count]) => `${pair} (${count} links)`).join("; ")}.
    In the matrix, these appear as denser blocks between the corresponding district groups.
  `);

  findings.append("p").html(`
    <strong>3. Where are transfer or terminal stations located in the topology?</strong><br>
    There are ${transferTerminal.length} Transfer/Terminal stations.
    Their average degree is
    ${d3.mean(transferTerminal, d => degree.get(d.id)).toFixed(2)},
    compared with Local stations at ${avgDegreeByType("Local").toFixed(2)}.
    In the node-link view, differently shaped symbols show whether they sit
    between clusters or at the periphery.
  `);

  findings.append("p").html(`
    <strong>4. Which stations have high passenger volume?</strong><br>
    The largest nodes in the node-link view are
    ${topPassengers.slice(0, 3).map(d => `${d.station_name} (${d.daily_passengers.toLocaleString()})`).join(", ")}.
    These are also visible as larger symbols and can be checked with tooltips.
  `);

  findings.append("p").html(`
    <strong>5. Where are the longest direct travel-time connections?</strong><br>
    The widest links in the node-link view and the most opaque matrix cells are
    ${longestLinks.slice(0, 3).map(l => {
      const s = nodeById.get(typeof l.source === "object" ? l.source.id : l.source).station_name;
      const t = nodeById.get(typeof l.target === "object" ? l.target.id : l.target).station_name;
      return `${s} — ${t} (${l.travel_time_min} min, ${l.route_type})`;
    }).join("; ")}.
  `);

  findings.append("p").html(`
    <strong>6. Are particular route types concentrated in particular parts of the network?</strong><br>
    Route type counts are
    ${routeTypeCounts.map(([type, count]) => `${type} (${count})`).join("; ")}.
    In the node-link view, route type is shown by link color; in the matrix,
    it is shown by cell color.
  `);

  const isolated = nodes.filter(d => degree.get(d.id) === 0);
  if (isolated.length > 0) {
    findings.append("p").html(`
      <strong>Note on isolated stations:</strong>
      ${isolated.map(d => `${d.station_name} (${d.id})`).join(", ")}
      appear in the station table but have no direct connections in the route table.
      In the node-link view they appear as unconnected symbols, and in the adjacency
      matrix their rows and columns are empty.
    `);
  }
}
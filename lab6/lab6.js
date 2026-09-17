// =========================================================
// Lab 6 — Assignment Part B
// Two treemaps over the same GDP hierarchy:
//   Treemap A  ->  d3.treemapSquarify
//   Treemap B  ->  d3.treemapBinary
// =========================================================

const WIDTH  = 900;
const HEIGHT = 560;

// GDP status  ->  color
const STATUS_COLORS = {
  "Increase":  "#54a24b",
  "Unchanged": "#f1c40f",
  "Decrease":  "#e45756"
};

const tooltip = d3.select("#tooltip");

// ---------------------------------------------------------
// drawTreemap(selector, data, tileFn)
//   selector : CSS selector for the container div
//   data     : hierarchical JSON (root object)
//   tileFn   : one of d3.treemapSquarify / d3.treemapBinary /
//              d3.treemapSliceDice / d3.treemapSlice / d3.treemapDice
// ---------------------------------------------------------
function drawTreemap(selector, data, tileFn) {

  // ----- 1. Build hierarchy and aggregate GDP upward -----
  const root = d3.hierarchy(data)
    .sum(d => d.gdp || 0)
    .sort((a, b) => b.value - a.value);

  // ----- 2. Configure the treemap layout -----
  const treemap = d3.treemap()
    .size([WIDTH, HEIGHT])
    .paddingInner(2)
    .paddingOuter(4)
    .paddingTop(18)          // leave room for continent labels
    .tile(tileFn);

  treemap(root);

  // ----- 3. Create SVG -----
  const svg = d3.select(selector)
    .append("svg")
    .attr("width",  WIDTH)
    .attr("height", HEIGHT)
    .attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);

  // ----- 4. Continent / area outlines (behind leaves) -----
  const parents = root.descendants().filter(d => d.depth > 0);

  svg.append("g")
    .attr("class", "outlines")
    .selectAll("rect")
    .data(parents)
    .join("rect")
    .attr("x",      d => d.x0)
    .attr("y",      d => d.y0)
    .attr("width",  d => Math.max(0, d.x1 - d.x0))
    .attr("height", d => Math.max(0, d.y1 - d.y0))
    .attr("fill",         "none")
    .attr("stroke",       d => d.depth === 1 ? "#222" : "#666")
    .attr("stroke-width", d => d.depth === 1 ? 2 : 1)
    .attr("stroke-opacity",
          d => d.depth === 1 ? 0.9 : 0.55)
    .style("pointer-events", "none");

  // ----- 5. Leaf (country) cells -----
  const leaves = root.leaves();

  const cells = svg.append("g")
    .attr("class", "cells")
    .selectAll("g.cell")
    .data(leaves)
    .join("g")
    .attr("class", "cell")
    .attr("transform", d => `translate(${d.x0},${d.y0})`);

  cells.append("rect")
    .attr("width",  d => Math.max(0, d.x1 - d.x0))
    .attr("height", d => Math.max(0, d.y1 - d.y0))
    .attr("fill",   d => STATUS_COLORS[d.data.status] || "#cccccc")
    .attr("stroke", "#333")
    .attr("stroke-width", 0.4);

  // Country labels (only when the cell is big enough)
  cells.append("text")
    .attr("x", 4)
    .attr("y", 13)
    .attr("font-size", 11)
    .attr("fill", "#111")
    .style("pointer-events", "none")
    .text(d => {
      const w = d.x1 - d.x0;
      const h = d.y1 - d.y0;
      return (w > 44 && h > 16) ? d.data.name : "";
    });

  // ----- 6. Continent labels on top of each continent block -----
  root.children.forEach(continent => {
    svg.append("text")
      .attr("x", continent.x0 + 6)
      .attr("y", continent.y0 + 13)
      .attr("font-size", 13)
      .attr("font-weight", "700")
      .attr("paint-order", "stroke")
      .attr("stroke", "white")
      .attr("stroke-width", 3)
      .attr("stroke-linejoin", "round")
      .attr("fill", "#111")
      .style("pointer-events", "none")
      .text(continent.data.name);
  });

  // ----- 7. Tooltips -----
  cells
    .on("mouseover", function (event, d) {
      const country   = d.data.name;
      const area      = d.parent ? d.parent.data.name : "";
      const continent = (d.parent && d.parent.parent)
        ? d.parent.parent.data.name
        : "";

      tooltip
        .style("opacity", 1)
        .html(`
          <strong>${country}</strong><br>
          Continent: ${continent}<br>
          Area: ${area}<br>
          GDP: $${d.value.toLocaleString()} billion USD<br>
          Status: ${d.data.status}
        `);
    })
    .on("mousemove", function (event) {
      tooltip
        .style("left", (event.pageX + 14) + "px")
        .style("top",  (event.pageY + 14) + "px");
    })
    .on("mouseout", function () {
      tooltip.style("opacity", 0);
    });
}

// ---------------------------------------------------------
// Load JSON and render the two treemaps
// ---------------------------------------------------------
d3.json("../data/lab6_assignment_gdp.json")
  .then(data => {
    // Part B.1 — squarify segmentation
    drawTreemap("#treemapA", data, d3.treemapSquarify);

    // Part B.2 — binary segmentation
    drawTreemap("#treemapB", data, d3.treemapBinary);
  })
  .catch(err => {
    console.error("Failed to load hierarchy JSON:", err);
  });
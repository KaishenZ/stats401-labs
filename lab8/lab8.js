const TOPIC_COLORS = {
    "Credits, Load, and Grading": "#b8860b",
    "University Policy and Transfer Credit": "#1b4f72",
    "Language and Communication": "#2471a3",
    "Politics and Global Affairs": "#d35400",
    "China, History, and Culture": "#a93226",
    "Environment, Health, and Policy": "#0e6655",
    "Natural Science and Computation": "#1e8449",
    "Media and Arts": "#6c3483"
};

const TOPIC_ORDER = Object.keys(TOPIC_COLORS);
const TOPIC_SHORT = {
    "Credits, Load, and Grading": "Credits",
    "University Policy and Transfer Credit": "Transfer",
    "Language and Communication": "Language",
    "Politics and Global Affairs": "Politics",
    "China, History, and Culture": "China",
    "Environment, Health, and Policy": "Environment",
    "Natural Science and Computation": "Science",
    "Media and Arts": "Media"
};

const state = {
    data: [],
    byId: new Map(),
    selected: null,
    matrixFocus: null
};

const tooltip = d3.select("#tooltip");

Promise.all([
    d3.csv("../data/lab8_embedding_map.csv", d => ({
        ...d,
        x: +d.x,
        y: +d.y,
        word_count: +d.word_count,
        cluster: +d.cluster,
        page: +d.page,
        subsection: d.subsection || ""
    })),
    d3.csv("../data/lab8_top_terms.csv", d => ({
        term: d.term,
        mean_tfidf: +d.mean_tfidf
    }))
]).then(([data, terms]) => {
    state.data = data;
    state.byId = new Map(data.map(d => [d.passage_id, d]));
    drawSectionChart(data);
    drawTermChart(terms.slice(0, 12));
    drawLegend();
    fillFilters(data);
    drawMap(data);
    drawMatrix(data);
    bindControls();
    updateAppearance();
});

function topicColor(name) {
    return TOPIC_COLORS[name] || "#667085";
}

function drawSectionChart(data) {
    const counts = d3.rollups(data, v => v.length, d => d.section)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .reverse();
    const width = 520;
    const height = 320;
    const margin = { top: 8, right: 24, bottom: 8, left: 250 };
    const svg = d3.select("#section-chart")
        .attr("viewBox", `0 0 ${width} ${height}`);
    const x = d3.scaleLinear()
        .domain([0, d3.max(counts, d => d[1])])
        .range([margin.left, width - margin.right]);
    const y = d3.scaleBand()
        .domain(counts.map(d => d[0]))
        .range([margin.top, height - margin.bottom])
        .padding(0.18);

    svg.selectAll("rect")
        .data(counts)
        .join("rect")
        .attr("x", margin.left)
        .attr("y", d => y(d[0]))
        .attr("width", d => x(d[1]) - margin.left)
        .attr("height", y.bandwidth())
        .attr("fill", "#1b4f72");

    svg.selectAll(".bar-label")
        .data(counts)
        .join("text")
        .attr("class", "axis-label")
        .attr("x", margin.left - 6)
        .attr("y", d => y(d[0]) + y.bandwidth() / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "end")
        .text(d => d[0].length > 38 ? d[0].slice(0, 36) + "…" : d[0]);

    svg.selectAll(".bar-value")
        .data(counts)
        .join("text")
        .attr("class", "axis-label")
        .attr("x", d => x(d[1]) + 4)
        .attr("y", d => y(d[0]) + y.bandwidth() / 2)
        .attr("dy", "0.35em")
        .text(d => d[1]);
}

function drawTermChart(terms) {
    const rows = terms.slice().reverse();
    const width = 520;
    const height = 320;
    const margin = { top: 8, right: 16, bottom: 8, left: 150 };
    const svg = d3.select("#term-chart")
        .attr("viewBox", `0 0 ${width} ${height}`);
    const x = d3.scaleLinear()
        .domain([0, d3.max(rows, d => d.mean_tfidf)])
        .range([margin.left, width - margin.right]);
    const y = d3.scaleBand()
        .domain(rows.map(d => d.term))
        .range([margin.top, height - margin.bottom])
        .padding(0.18);

    svg.selectAll("rect")
        .data(rows)
        .join("rect")
        .attr("x", margin.left)
        .attr("y", d => y(d.term))
        .attr("width", d => x(d.mean_tfidf) - margin.left)
        .attr("height", y.bandwidth())
        .attr("fill", "#0e6655");

    svg.selectAll("text")
        .data(rows)
        .join("text")
        .attr("class", "axis-label")
        .attr("x", margin.left - 6)
        .attr("y", d => y(d.term) + y.bandwidth() / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "end")
        .text(d => d.term);
}

function drawLegend() {
    const items = d3.select("#legend")
        .selectAll(".legend-item")
        .data(TOPIC_ORDER)
        .join("div")
        .attr("class", "legend-item");
    items.append("span")
        .attr("class", "swatch")
        .style("background", d => topicColor(d));
    items.append("span").text(d => d);
    d3.select("#legend").append("span")
        .attr("class", "legend-item")
        .html('<span class="swatch size-key"></span><span>Larger point = longer passage</span>');
}

function fillFilters(data) {
    const chapters = Array.from(new Set(data.map(d => d.chapter))).sort((a, b) => {
        const na = Number((a.match(/Part\s+(\d+)/) || [])[1] || 99);
        const nb = Number((b.match(/Part\s+(\d+)/) || [])[1] || 99);
        return na - nb || a.localeCompare(b);
    });
    const topics = TOPIC_ORDER.filter(name => data.some(d => d.cluster_name === name));
    d3.select("#chapter-filter")
        .selectAll("option.dyn")
        .data(chapters)
        .join("option")
        .attr("class", "dyn")
        .attr("value", d => d)
        .text(d => d);
    d3.select("#topic-filter")
        .selectAll("option.dyn")
        .data(topics)
        .join("option")
        .attr("class", "dyn")
        .attr("value", d => d)
        .text(d => d);
    refreshSectionOptions();
}

function refreshSectionOptions() {
    const chapter = d3.select("#chapter-filter").property("value");
    const sections = Array.from(new Set(
        state.data
            .filter(d => !chapter || d.chapter === chapter)
            .map(d => d.section)
    )).sort();
    const select = d3.select("#section-filter");
    const current = select.property("value");
    select.selectAll("option.dyn").remove();
    select.selectAll("option.dyn")
        .data(sections)
        .join("option")
        .attr("class", "dyn")
        .attr("value", d => d)
        .text(d => d);
    if (sections.includes(current)) {
        select.property("value", current);
    }
}

function drawMap(data) {
    const width = 860;
    const height = 640;
    const svg = d3.select("#map")
        .attr("viewBox", `0 0 ${width} ${height}`);
    const xScale = d3.scaleLinear()
        .domain(d3.extent(data, d => d.x))
        .range([48, width - 24]);
    const yScale = d3.scaleLinear()
        .domain(d3.extent(data, d => d.y))
        .range([height - 28, 24]);
    const rScale = d3.scaleSqrt()
        .domain(d3.extent(data, d => d.word_count))
        .range([3.2, 11]);

    const plot = svg.append("g").attr("class", "plot");
    const zoom = d3.zoom()
        .scaleExtent([1, 14])
        .on("zoom", event => plot.attr("transform", event.transform));
    svg.call(zoom);
    state.zoom = zoom;
    state.svg = svg;

    state.points = plot.selectAll(".passage")
        .data(data)
        .join("circle")
        .attr("class", "passage")
        .attr("cx", d => xScale(d.x))
        .attr("cy", d => yScale(d.y))
        .attr("r", d => rScale(d.word_count))
        .attr("fill", d => topicColor(d.cluster_name))
        .attr("stroke", "#1c2430")
        .attr("stroke-width", 0)
        .on("click", (event, d) => {
            event.stopPropagation();
            tooltip.style("opacity", 0);
            state.matrixFocus = null;
            state.selected = d;
            showDetail(d);
            updateAppearance();
        })
        .on("mousemove", (event, d) => {
            tooltip
                .style("opacity", 1)
                .style("left", (event.clientX + 14) + "px")
                .style("top", (event.clientY + 14) + "px")
                .html(`<strong>${d.cluster_name}</strong><br>${escapeHtml(d.section)}<br>p. ${d.page}`);
        })
        .on("mouseleave", () => tooltip.style("opacity", 0));

    svg.on("click", () => {
        state.selected = null;
        state.matrixFocus = null;
        showPlaceholder();
        updateAppearance();
    });
}

function drawMatrix(data) {
    const sectionTotals = d3.rollups(data, v => v.length, d => d.section)
        .sort((a, b) => b[1] - a[1] || d3.ascending(a[0], b[0]));
    const sections = sectionTotals.map(d => d[0]);
    const topics = TOPIC_ORDER.filter(name => data.some(d => d.cluster_name === name));
    const counts = d3.rollup(
        data,
        v => v.length,
        d => d.section,
        d => d.cluster_name
    );
    const cells = [];
    sections.forEach(section => {
        topics.forEach(topic => {
            const count = counts.get(section)?.get(topic) || 0;
            cells.push({
                section,
                topic,
                count,
                proportion: count / sectionTotals.find(d => d[0] === section)[1]
            });
        });
    });

    const cellSize = 28;
    const margin = { top: 92, right: 20, bottom: 12, left: 300 };
    const width = margin.left + topics.length * cellSize + margin.right;
    const height = margin.top + sections.length * cellSize + margin.bottom;
    const svg = d3.select("#matrix")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("width", width)
        .attr("height", height);

    const x = d3.scaleBand().domain(topics).range([margin.left, margin.left + topics.length * cellSize]);
    const y = d3.scaleBand().domain(sections).range([margin.top, margin.top + sections.length * cellSize]);
    const color = d3.scaleSequential(d3.interpolateYlGnBu)
        .domain([0, d3.max(cells, d => d.count) || 1]);

    svg.append("text")
        .attr("x", 8)
        .attr("y", 22)
        .attr("class", "axis-label")
        .style("font-size", "12px")
        .text("Columns use short topic names. The legend has the full labels.");

    svg.selectAll(".col-label")
        .data(topics)
        .join("text")
        .attr("class", "axis-label col-label")
        .attr("transform", d => `translate(${x(d) + cellSize / 2 + 4}, ${margin.top - 8}) rotate(-90)`)
        .attr("text-anchor", "start")
        .text(d => TOPIC_SHORT[d] || d);

    svg.selectAll(".row-label")
        .data(sections)
        .join("text")
        .attr("class", "axis-label")
        .attr("x", margin.left - 8)
        .attr("y", d => y(d) + cellSize / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "end")
        .text(d => d.length > 42 ? d.slice(0, 40) + "…" : d);

    state.cells = svg.selectAll(".matrix-cell")
        .data(cells)
        .join("rect")
        .attr("class", "matrix-cell")
        .attr("x", d => x(d.topic))
        .attr("y", d => y(d.section))
        .attr("width", cellSize - 2)
        .attr("height", cellSize - 2)
        .attr("fill", d => d.count === 0 ? "#f4f6f8" : color(d.count))
        .attr("stroke", "#fff")
        .attr("stroke-width", 1)
        .style("cursor", d => d.count ? "pointer" : "default")
        .on("click", (event, d) => {
            event.stopPropagation();
            if (!d.count) return;
            state.selected = null;
            state.matrixFocus = d;
            d3.select("#section-filter").property("value", d.section);
            d3.select("#topic-filter").property("value", d.topic);
            showCellDetail(d);
            updateAppearance();
        })
        .on("mousemove", (event, d) => {
            const pct = Math.round(d.proportion * 100);
            tooltip
                .style("opacity", 1)
                .style("left", (event.clientX + 14) + "px")
                .style("top", (event.clientY + 14) + "px")
                .html(
                    `<strong>${escapeHtml(d.section)}</strong><br>` +
                    `${escapeHtml(d.topic)}<br>` +
                    `${d.count} passage${d.count === 1 ? "" : "s"} (${pct}% of this section)`
                );
        })
        .on("mouseleave", () => tooltip.style("opacity", 0));
}

function bindControls() {
    d3.select("#search").on("input", () => {
        state.selected = null;
        state.matrixFocus = null;
        showPlaceholder();
        updateAppearance();
    });
    d3.select("#chapter-filter").on("change", () => {
        refreshSectionOptions();
        state.selected = null;
        state.matrixFocus = null;
        showPlaceholder();
        updateAppearance();
    });
    d3.select("#section-filter").on("change", () => {
        state.selected = null;
        state.matrixFocus = null;
        showPlaceholder();
        updateAppearance();
    });
    d3.select("#topic-filter").on("change", () => {
        state.selected = null;
        state.matrixFocus = null;
        showPlaceholder();
        updateAppearance();
    });
    d3.select("#reset").on("click", () => {
        d3.select("#search").property("value", "");
        d3.select("#chapter-filter").property("value", "");
        d3.select("#section-filter").property("value", "");
        d3.select("#topic-filter").property("value", "");
        refreshSectionOptions();
        state.selected = null;
        state.matrixFocus = null;
        showPlaceholder();
        state.svg.transition().duration(400).call(state.zoom.transform, d3.zoomIdentity);
        updateAppearance();
    });
}

function query() {
    return d3.select("#search").property("value").toLowerCase().trim();
}

function matchesFilter(d) {
    const q = query();
    const chapter = d3.select("#chapter-filter").property("value");
    const section = d3.select("#section-filter").property("value");
    const topic = d3.select("#topic-filter").property("value");
    if (q && !d.text.toLowerCase().includes(q)) return false;
    if (chapter && d.chapter !== chapter) return false;
    if (section && d.section !== section) return false;
    if (topic && d.cluster_name !== topic) return false;
    return true;
}

function neighborIds(d) {
    return new Set([d.passage_id, ...(d.neighbors ? d.neighbors.split("|") : [])]);
}

function updateAppearance() {
    const focusIds = state.selected ? neighborIds(state.selected) : null;
    state.points
        .attr("opacity", d => {
            if (focusIds) return focusIds.has(d.passage_id) ? 1 : 0.07;
            if (state.matrixFocus) {
                const hit = d.section === state.matrixFocus.section && d.cluster_name === state.matrixFocus.topic;
                return hit ? 1 : 0.07;
            }
            return matchesFilter(d) ? 1 : 0.07;
        })
        .attr("stroke-width", d => {
            if (!state.selected) return 0;
            if (d.passage_id === state.selected.passage_id) return 2.2;
            if (focusIds.has(d.passage_id)) return 1.2;
            return 0;
        });

    const visible = state.data.filter(d => {
        if (focusIds) return focusIds.has(d.passage_id);
        if (state.matrixFocus) {
            return d.section === state.matrixFocus.section && d.cluster_name === state.matrixFocus.topic;
        }
        return matchesFilter(d);
    }).length;
    d3.select("#visible-count").text(`${visible} of ${state.data.length} passages highlighted`);

    if (!state.cells) return;
    state.cells
        .attr("stroke", d => cellActive(d) ? "#111" : "#fff")
        .attr("stroke-width", d => cellActive(d) ? 2 : 1);
}

function cellActive(d) {
    if (state.matrixFocus) {
        return d.section === state.matrixFocus.section && d.topic === state.matrixFocus.topic;
    }
    if (state.selected) {
        return d.section === state.selected.section && d.topic === state.selected.cluster_name;
    }
    return false;
}

function showPlaceholder() {
    d3.select("#detail-panel")
        .html(`<p class="placeholder">Click a passage on the map, or a cell in the matrix below.</p>`);
}

function showDetail(d) {
    const neighbors = (d.neighbors ? d.neighbors.split("|") : [])
        .map(id => state.byId.get(id))
        .filter(Boolean);
    const neighborHtml = neighbors.map(n => `
        <button class="neighbor" data-id="${n.passage_id}" type="button">
            <strong>${escapeHtml(n.section)} · p. ${n.page}</strong>
            ${escapeHtml(n.text.slice(0, 180))}${n.text.length > 180 ? "…" : ""}
        </button>
    `).join("");

    d3.select("#detail-panel").html(`
        <h3>${escapeHtml(d.section)}</h3>
        <p class="meta">Chapter: ${escapeHtml(d.chapter)}</p>
        <p class="meta">Subsection: ${escapeHtml(d.subsection || "—")}</p>
        <p class="meta">Page: ${d.page}</p>
        <p class="meta">Topic: ${escapeHtml(d.cluster_name)}</p>
        <p class="meta">${d.word_count} words</p>
        <p class="passage-text">${escapeHtml(d.text)}</p>
        <h3>Nearest semantic passages</h3>
        ${neighborHtml}
    `);

    d3.select("#detail-panel").selectAll(".neighbor").on("click", function () {
        const next = state.byId.get(this.dataset.id);
        if (!next) return;
        state.matrixFocus = null;
        state.selected = next;
        showDetail(next);
        updateAppearance();
    });
}

function showCellDetail(d) {
    const passages = state.data.filter(
        row => row.section === d.section && row.cluster_name === d.topic
    );
    const preview = passages.slice(0, 4).map(row => `
        <button class="neighbor" data-id="${row.passage_id}" type="button">
            <strong>p. ${row.page}${row.subsection ? " · " + escapeHtml(row.subsection) : ""}</strong>
            ${escapeHtml(row.text.slice(0, 160))}${row.text.length > 160 ? "…" : ""}
        </button>
    `).join("");
    d3.select("#detail-panel").html(`
        <h3>${escapeHtml(d.section)}</h3>
        <p class="meta">Topic: ${escapeHtml(d.topic)}</p>
        <p class="meta">${d.count} passages, ${Math.round(d.proportion * 100)}% of this section</p>
        ${preview}
    `);
    d3.select("#detail-panel").selectAll(".neighbor").on("click", function () {
        const next = state.byId.get(this.dataset.id);
        if (!next) return;
        state.matrixFocus = null;
        state.selected = next;
        showDetail(next);
        updateAppearance();
    });
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

// 基础画布尺寸
const width = 600;
const height = 400;

// 交互状态控制
let lockedIso3 = null;

function removeLoaders() {
    d3.selectAll(".loading-indicator").remove();
}

function showError(msg) {
    removeLoaders();
    d3.selectAll(".viz-wrapper").html(`<div class="error-message"><strong>Error:</strong> ${msg}</div>`);
}

// 投影设置
const projection = d3.geoNaturalEarth1()
    .scale(110)
    .translate([width / 2, height / 2 + 10]);

const geoPathGenerator = d3.geoPath().projection(projection);

// 初始化 SVG
const choroplethSvg = d3.select("#choropleth")
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

const cartogramSvg = d3.select("#cartogram")
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

const choroplethGroup = choroplethSvg.append("g");
const cartogramBaseGroup = cartogramSvg.append("g");
const cartogramBubbleGroup = cartogramSvg.append("g");

const tooltip = d3.select("#tooltip");

// 缩放控制（Choropleth）
const zoom = d3.zoom()
    .scaleExtent([1, 8])
    .on("zoom", (event) => {
        choroplethGroup.attr("transform", event.transform);
    });
choroplethSvg.call(zoom);

// 数据源路径
const GEOJSON_URL = "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson";
const GDP_CSV_PATH = "../data/lab9_gdp_2025_top50.csv";

Promise.all([
    d3.json(GEOJSON_URL),
    d3.csv(GDP_CSV_PATH, d => {
        const rawGdp = (d.gdp_2025_billion_usd || "").toString().replace(/,/g, "").trim();
        return {
            iso3: (d.iso3 || "").trim().toUpperCase(),
            country: (d.country || "").trim(),
            gdp: parseFloat(rawGdp),
            rank: parseInt(d.rank, 10)
        };
    }).catch(err => {
        return d3.csv("data/lab9_gdp_2025_top50.csv", d => {
            const rawGdp = (d.gdp_2025_billion_usd || "").toString().replace(/,/g, "").trim();
            return {
                iso3: (d.iso3 || "").trim().toUpperCase(),
                country: (d.country || "").trim(),
                gdp: parseFloat(rawGdp),
                rank: parseInt(d.rank, 10)
            };
        });
    })
]).then(([geoData, gdpData]) => {
    removeLoaders();

    if (!geoData || !geoData.features || !gdpData || gdpData.length === 0) {
        showError("Data failed to load. Please verify your file paths.");
        return;
    }

    const countriesGeo = geoData.features;
    const gdpByIso3 = new Map(gdpData.map(d => [d.iso3, d]));

    countriesGeo.forEach(feature => {
        const candidateKeys = [
            feature.id,
            feature.properties && feature.properties.iso3,
            feature.properties && feature.properties.ISO_A3,
            feature.properties && feature.properties.iso_a3
        ].filter(Boolean).map(k => k.toString().trim().toUpperCase());

        let record = null;
        let matchedIso3 = candidateKeys[0] || "";

        for (const k of candidateKeys) {
            if (gdpByIso3.has(k)) {
                record = gdpByIso3.get(k);
                matchedIso3 = k;
                break;
            }
        }

        feature.properties = feature.properties || {};
        feature.properties.iso3 = matchedIso3;

        if (record && !isNaN(record.gdp)) {
            feature.properties.gdp = record.gdp;
            feature.properties.rank = record.rank;
            feature.properties.countryName = record.country;
        } else {
            feature.properties.gdp = null;
            feature.properties.countryName = feature.properties.name || "Other / No Data";
        }
    });

    const minGdp = d3.min(gdpData, d => d.gdp) || 280;
    const maxGdp = d3.max(gdpData, d => d.gdp) || 30767;

    // 对数比例尺，范围限制在 [0.25, 1.0]
    const logScale = d3.scaleLog()
        .domain([minGdp, maxGdp])
        .range([0.25, 1.0]);

    const getColor = (gdp) => {
        if (gdp == null || isNaN(gdp)) return "#e2e8f0"; // 无数据中性冷灰
        return d3.interpolateBlues(logScale(gdp));
    };

    // 面积编码比例尺
    const maxRadius = 36;
    const radiusScale = d3.scaleSqrt()
        .domain([0, maxGdp])
        .range([0, maxRadius]);

    // -------------------------------------------------------------
    // PART B: 绘制 CHOROPLETH 地图
    // -------------------------------------------------------------
    const choroplethPaths = choroplethGroup.selectAll(".country-path")
        .data(countriesGeo)
        .join("path")
        .attr("class", "country-path")
        .attr("d", geoPathGenerator)
        .attr("fill", d => getColor(d.properties.gdp))
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 0.6)
        .attr("data-iso3", d => d.properties.iso3);

    // 绘制 Choropleth 图例（已优化位置）
    renderChoroplethLegend(minGdp, maxGdp);

    // -------------------------------------------------------------
    // PART C: 绘制 CARTOGRAM (Dorling 变形地图)
    // -------------------------------------------------------------
    cartogramBaseGroup.selectAll(".cartogram-base")
        .data(countriesGeo)
        .join("path")
        .attr("class", "cartogram-base")
        .attr("d", geoPathGenerator)
        .attr("fill", "#f8fafc")
        .attr("stroke", "#e2e8f0")
        .attr("stroke-width", 0.6);

    const cartogramNodes = [];
    countriesGeo.forEach(feature => {
        if (feature.properties.gdp != null) {
            const centroid = geoPathGenerator.centroid(feature);
            if (!isNaN(centroid[0]) && !isNaN(centroid[1])) {
                cartogramNodes.push({
                    iso3: feature.properties.iso3,
                    name: feature.properties.countryName,
                    gdp: feature.properties.gdp,
                    rank: feature.properties.rank,
                    radius: radiusScale(feature.properties.gdp),
                    x: centroid[0],
                    y: centroid[1],
                    targetX: centroid[0],
                    targetY: centroid[1]
                });
            }
        }
    });

    const simulation = d3.forceSimulation(cartogramNodes)
        .force("x", d3.forceX(d => d.targetX).strength(0.42))
        .force("y", d3.forceY(d => d.targetY).strength(0.42))
        .force("collide", d3.forceCollide(d => d.radius + 1.2).iterations(4))
        .stop();

    for (let i = 0; i < 150; ++i) simulation.tick();

    const cartogramBubbles = cartogramBubbleGroup.selectAll(".cartogram-bubble")
        .data(cartogramNodes)
        .join("circle")
        .attr("class", "cartogram-bubble")
        .attr("cx", d => d.x)
        .attr("cy", d => d.y)
        .attr("r", d => d.radius)
        .attr("fill", d => getColor(d.gdp))
        .attr("stroke", "#334155")
        .attr("stroke-width", 1)
        .attr("fill-opacity", 0.9)
        .attr("data-iso3", d => d.iso3);

    cartogramBubbleGroup.selectAll(".cartogram-label")
        .data(cartogramNodes.filter(d => d.radius >= 11))
        .join("text")
        .attr("class", "cartogram-label")
        .attr("x", d => d.x)
        .attr("y", d => d.y + 3)
        .attr("text-anchor", "middle")
        .attr("font-size", d => Math.min(d.radius * 0.7, 10))
        .attr("fill", d => d.rank <= 2 ? "#ffffff" : "#0f172a")
        .attr("pointer-events", "none")
        .attr("font-weight", "600")
        .text(d => d.iso3);

    // 绘制 Cartogram 面积图例
    renderCartogramLegend(radiusScale);

    // -------------------------------------------------------------
    // PART D: 联动高亮与 Tooltip
    // -------------------------------------------------------------
    function updateVisualHighlight(iso3) {
        d3.selectAll(".country-highlight").classed("country-highlight", false);
        if (iso3) {
            d3.selectAll(`[data-iso3="${iso3}"]`)
                .classed("country-highlight", true)
                .raise();
        }
    }

    function showTooltip(event, title, gdp, rank) {
        const content = gdp != null
            ? `<strong>${title}</strong>Rank: #${rank}<br>GDP: $${d3.format(",.2f")(gdp)} B`
            : `<strong>${title}</strong><em>No Data (Outside Top 50)</em>`;

        tooltip.style("opacity", 1)
            .html(content)
            .style("left", `${event.clientX + 14}px`)
            .style("top", `${event.clientY - 14}px`);
    }

    function hideTooltip() {
        if (!lockedIso3) tooltip.style("opacity", 0);
    }

    choroplethPaths
        .on("mouseover", function (event, d) {
            if (!lockedIso3) {
                updateVisualHighlight(d.properties.iso3);
                showTooltip(event, d.properties.countryName, d.properties.gdp, d.properties.rank);
            }
        })
        .on("mousemove", function (event) {
            if (!lockedIso3) {
                tooltip.style("left", `${event.clientX + 14}px`).style("top", `${event.clientY - 14}px`);
            }
        })
        .on("mouseout", function () {
            if (!lockedIso3) {
                updateVisualHighlight(null);
                hideTooltip();
            }
        })
        .on("click", function (event, d) {
            event.stopPropagation();
            if (lockedIso3 === d.properties.iso3) {
                lockedIso3 = null;
                updateVisualHighlight(null);
                tooltip.style("opacity", 0);
            } else {
                lockedIso3 = d.properties.iso3;
                updateVisualHighlight(lockedIso3);
                showTooltip(event, d.properties.countryName, d.properties.gdp, d.properties.rank);
            }
        });

    cartogramBubbles
        .on("mouseover", function (event, d) {
            if (!lockedIso3) {
                updateVisualHighlight(d.iso3);
                showTooltip(event, d.name, d.gdp, d.rank);
            }
        })
        .on("mousemove", function (event) {
            if (!lockedIso3) {
                tooltip.style("left", `${event.clientX + 14}px`).style("top", `${event.clientY - 14}px`);
            }
        })
        .on("mouseout", function () {
            if (!lockedIso3) {
                updateVisualHighlight(null);
                hideTooltip();
            }
        })
        .on("click", function (event, d) {
            event.stopPropagation();
            if (lockedIso3 === d.iso3) {
                lockedIso3 = null;
                updateVisualHighlight(null);
                tooltip.style("opacity", 0);
            } else {
                lockedIso3 = d.iso3;
                updateVisualHighlight(lockedIso3);
                showTooltip(event, d.name, d.gdp, d.rank);
            }
        });

    d3.select("body").on("click", () => {
        if (lockedIso3) {
            lockedIso3 = null;
            updateVisualHighlight(null);
            tooltip.style("opacity", 0);
        }
    });

}).catch(err => {
    console.error(err);
    showError("Could not load data. Check console for details.");
});

// 图 2 图例：位置下移并增加背景板防重叠
function renderChoroplethLegend(minGdp, maxGdp) {
    const legendWidth = 150;
    const legendHeight = 8;

    const legendGroup = choroplethSvg.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(16, ${height - 48})`);

    // 半透明白底衬垫，防止与地图陆地重叠
    legendGroup.append("rect")
        .attr("x", -6)
        .attr("y", -14)
        .attr("width", legendWidth + 12)
        .attr("height", 38)
        .attr("fill", "rgba(255, 255, 255, 0.88)")
        .attr("rx", 4);

    const defs = choroplethSvg.append("defs");
    const gradientId = "legend-blue-gradient";
    const linearGradient = defs.append("linearGradient")
        .attr("id", gradientId);

    linearGradient.selectAll("stop")
        .data(d3.range(0, 1.05, 0.05))
        .join("stop")
        .attr("offset", d => `${d * 100}%`)
        .attr("stop-color", d => {
            const t = 0.25 + d * 0.75;
            return d3.interpolateBlues(t);
        });

    legendGroup.append("rect")
        .attr("width", legendWidth)
        .attr("height", legendHeight)
        .style("fill", `url(#${gradientId})`)
        .attr("stroke", "#94a3b8")
        .attr("stroke-width", 0.5);

    const legendScale = d3.scaleLog()
        .domain([minGdp, maxGdp])
        .range([0, legendWidth]);

    const legendAxis = d3.axisBottom(legendScale)
        .tickValues([300, 1000, 5000, 30000])
        .tickFormat(d => d >= 1000 ? `$${d / 1000}T` : `$${d}B`)
        .tickSize(3);

    legendGroup.append("g")
        .attr("class", "legend-axis")
        .attr("transform", `translate(0, ${legendHeight})`)
        .call(legendAxis);

    legendGroup.append("text")
        .attr("x", 0)
        .attr("y", -5)
        .attr("font-size", "9.5px")
        .attr("font-weight", "600")
        .attr("fill", "#475569")
        .text("2025 GDP (Log scale)");
}

// 图 3 图例：嵌套圆面积图例 (Nested Circles Legend)
function renderCartogramLegend(radiusScale) {
    const legendValues = [1000, 5000, 30000]; // 1T, 5T, 30T
    const legendX = 46;
    const legendBottomY = height - 16;

    const legendGroup = cartogramSvg.append("g")
        .attr("class", "cartogram-legend")
        .attr("transform", `translate(${legendX}, ${legendBottomY})`);

    // 半透明白底衬垫
    legendGroup.append("rect")
        .attr("x", -40)
        .attr("y", -80)
        .attr("width", 145)
        .attr("height", 86)
        .attr("fill", "rgba(255, 255, 255, 0.88)")
        .attr("rx", 4);

    legendGroup.append("text")
        .attr("x", -34)
        .attr("y", -66)
        .attr("font-size", "9.5px")
        .attr("font-weight", "600")
        .attr("fill", "#475569")
        .text("Area ∝ GDP");

    // 绘制嵌套底对齐同心圆
    legendValues.slice().reverse().forEach(val => {
        const r = radiusScale(val);
        legendGroup.append("circle")
            .attr("cx", 0)
            .attr("cy", -r)
            .attr("r", r)
            .attr("fill", "none")
            .attr("stroke", "#64748b")
            .attr("stroke-dasharray", "2,2")
            .attr("stroke-width", 0.8);

        // 指引横线与数值
        legendGroup.append("line")
            .attr("x1", 0)
            .attr("x2", 48)
            .attr("y1", -2 * r)
            .attr("y2", -2 * r)
            .attr("stroke", "#94a3b8")
            .attr("stroke-width", 0.6);

        legendGroup.append("text")
            .attr("x", 52)
            .attr("y", -2 * r + 3)
            .attr("font-size", "8.5px")
            .attr("fill", "#475569")
            .text(`$${val / 1000}T`);
    });
}
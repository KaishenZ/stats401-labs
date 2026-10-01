// 基础画布尺寸
const width = 600;
const height = 400;

// 交互状态控制：支持“点击锁定”与“悬停预览”
let lockedIso3 = null;

// 清理 loading 提示
function removeLoaders() {
    d3.selectAll(".loading-indicator").remove();
}

// 错误提示
function showError(msg) {
    removeLoaders();
    d3.selectAll(".viz-wrapper").html(`<div class="error-message"><strong>Error:</strong> ${msg}</div>`);
}

// 投影设置 (Natural Earth 投影)
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

// 缩放控制（仅在 Choropleth 上）
const zoom = d3.zoom()
    .scaleExtent([1, 8])
    .on("zoom", (event) => {
        choroplethGroup.attr("transform", event.transform);
    });
choroplethSvg.call(zoom);

// 数据源路径：主源为包含标准三位大写字母 ISO-3 (如 AFG, AGO, USA) 的可靠 GeoJSON
const GEOJSON_URL = "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson";
const GDP_CSV_PATH = "../data/lab9_gdp_2025_top50.csv";

// 稳健加载数据
Promise.all([
    d3.json(GEOJSON_URL),
    d3.csv(GDP_CSV_PATH, d => {
        // 清洗 GDP 字符串，去除逗号与多余空格
        const rawGdp = (d.gdp_2025_billion_usd || "").toString().replace(/,/g, "").trim();
        return {
            iso3: (d.iso3 || "").trim().toUpperCase(),
            country: (d.country || "").trim(),
            gdp: parseFloat(rawGdp),
            rank: parseInt(d.rank, 10)
        };
    }).catch(err => {
        console.warn("Retrying relative CSV path without parent folder:", err);
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
        showError("Data failed to load. Please verify your file paths and run under a local HTTP server.");
        return;
    }

    const countriesGeo = geoData.features;

    // 构建 GDP 映射表（Key 统一为大写 ISO-3）
    const gdpByIso3 = new Map(gdpData.map(d => [d.iso3, d]));

    // 关联统计数据到 GeoJSON 特征
    countriesGeo.forEach(feature => {
        // 候选 key 取 feature.id 或 properties 里的属性
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

    const maxGdp = d3.max(gdpData, d => d.gdp) || 30767;

    // 平方根色阶：缓解中美两强造成的极端偏态分布
    const colorScale = d3.scaleSequential(d3.interpolateBlues)
        .domain([0, Math.sqrt(maxGdp)]);

    const getColor = (gdp) => {
        if (gdp == null || isNaN(gdp)) return "#f1f5f9"; // 无数据采用浅灰中性色
        return colorScale(Math.sqrt(gdp));
    };

    // 面积编码比例尺：圆面积严格与 GDP 成正比
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
        .attr("stroke", "#cbd5e1")
        .attr("stroke-width", 0.6)
        .attr("data-iso3", d => d.properties.iso3);

    renderChoroplethLegend(colorScale, maxGdp);

    // -------------------------------------------------------------
    // PART C: 绘制 CARTOGRAM (Dorling 变形地图)
    // -------------------------------------------------------------
    // 1. 绘制世界淡色底图轮廓作为空间参照
    cartogramBaseGroup.selectAll(".cartogram-base")
        .data(countriesGeo)
        .join("path")
        .attr("class", "cartogram-base")
        .attr("d", geoPathGenerator)
        .attr("fill", "#f8fafc")
        .attr("stroke", "#e2e8f0")
        .attr("stroke-width", 0.6);

    // 2. 提取有 GDP 数据的国家质心
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

    // 3. 运行力碰撞模拟防止气泡交叉覆盖
    const simulation = d3.forceSimulation(cartogramNodes)
        .force("x", d3.forceX(d => d.targetX).strength(0.42))
        .force("y", d3.forceY(d => d.targetY).strength(0.42))
        .force("collide", d3.forceCollide(d => d.radius + 1.2).iterations(4))
        .stop();

    for (let i = 0; i < 150; ++i) simulation.tick();

    // 4. 绘制变形气泡
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
        .attr("fill-opacity", 0.88)
        .attr("data-iso3", d => d.iso3);

    // 5. 标注大经济体 ISO-3 代码
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

    // -------------------------------------------------------------
    // PART D: 联动高亮、锁定与 TOOLTIP
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
        if (!lockedIso3) {
            tooltip.style("opacity", 0);
        }
    }

    // 事件处理：Choropleth
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
                // 再次点击已选中的国家，取消锁定
                lockedIso3 = null;
                updateVisualHighlight(null);
                tooltip.style("opacity", 0);
            } else {
                // 点击锁定该国家
                lockedIso3 = d.properties.iso3;
                updateVisualHighlight(lockedIso3);
                showTooltip(event, d.properties.countryName, d.properties.gdp, d.properties.rank);
            }
        });

    // 事件处理：Cartogram
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

    // 点击画布空白区域清除锁定
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

// 图例渲染辅助函数
function renderChoroplethLegend(colorScale, maxGdp) {
    const legendWidth = 160;
    const legendHeight = 10;

    const legendGroup = choroplethSvg.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(16, ${height - 36})`);

    const defs = choroplethSvg.append("defs");
    const gradientId = "legend-gradient";
    const linearGradient = defs.append("linearGradient")
        .attr("id", gradientId);

    linearGradient.selectAll("stop")
        .data(d3.range(0, 1.05, 0.1))
        .join("stop")
        .attr("offset", d => `${d * 100}%`)
        .attr("stop-color", d => colorScale(d * Math.sqrt(maxGdp)));

    legendGroup.append("rect")
        .attr("width", legendWidth)
        .attr("height", legendHeight)
        .style("fill", `url(#${gradientId})`)
        .attr("stroke", "#cbd5e1")
        .attr("stroke-width", 0.5);

    const legendScale = d3.scaleSqrt()
        .domain([0, maxGdp])
        .range([0, legendWidth]);

    // 动态生成 ticks：避免硬编码，自适应数据上限
    const dynamicTicks = d3.ticks(0, maxGdp, 4);

    const legendAxis = d3.axisBottom(legendScale)
        .tickValues(dynamicTicks)
        // 注意：数据原始单位是 Billion USD（十亿美元），1000 Billion = 1 Trillion（万亿美元）
        // 因此 d / 1000 转换为 Trillions (T) 单位进行紧凑展示
        .tickFormat(d => `$${d / 1000}T`)
        .tickSize(4);

    legendGroup.append("g")
        .attr("class", "legend-axis")
        .attr("transform", `translate(0, ${legendHeight})`)
        .call(legendAxis);

    legendGroup.append("text")
        .attr("x", 0)
        .attr("y", -4)
        .attr("font-size", "10px")
        .attr("fill", "#64748b")
        .text("2025 GDP (USD)");
}
// 基础画布尺寸
const width = 600;
const height = 400;

// 交互状态控制
let lockedIso3 = null;
let activeRegionFilter = "ALL";
let globalGdpData = [];
let globalCountriesGeo = [];
let choroplethPathsSelection = null;
let cartogramBubblesSelection = null;
let cartogramLabelsSelection = null;

// ISO-3 到所属大洲/区域映射表（覆盖 Top 50 经济体）
const REGION_BY_ISO3 = {
    // Asia
    CHN: "Asia", JPN: "Asia", IND: "Asia", KOR: "Asia", IDN: "Asia",
    TWN: "Asia", THA: "Asia", SGP: "Asia", BGD: "Asia", VNM: "Asia",
    PHL: "Asia", MYS: "Asia", HKG: "Asia", PAK: "Asia", KAZ: "Asia",
    // Europe
    DEU: "Europe", GBR: "Europe", FRA: "Europe", ITA: "Europe", RUS: "Europe",
    ESP: "Europe", NLD: "Europe", CHE: "Europe", POL: "Europe", BEL: "Europe",
    SWE: "Europe", IRL: "Europe", AUT: "Europe", NOR: "Europe", DNK: "Europe",
    ROU: "Europe", CZE: "Europe", PRT: "Europe", FIN: "Europe", GRC: "Europe",
    HUN: "Europe",
    // Americas
    USA: "Americas", BRA: "Americas", CAN: "Americas", MEX: "Americas",
    ARG: "Americas", COL: "Americas", CHL: "Americas", PER: "Americas",
    // Middle East & Africa
    TUR: "Middle East & Africa", SAU: "Middle East & Africa", ISR: "Middle East & Africa",
    ARE: "Middle East & Africa", EGY: "Middle East & Africa", IRN: "Middle East & Africa",
    ZAF: "Middle East & Africa", NGA: "Middle East & Africa", DZA: "Middle East & Africa",
    IRQ: "Middle East & Africa", QAT: "Middle East & Africa",
    // Oceania
    AUS: "Oceania", NZL: "Oceania"
};

// 区域视角缩放参数 (scale, 中心经纬度 [lon, lat])
const REGION_VIEWPORTS = {
    "Asia": { lonLat: [105, 25], scale: 2.3 },
    "Europe": { lonLat: [15, 52], scale: 3.4 },
    "Americas": { lonLat: [-80, 10], scale: 1.65 },
    "Middle East & Africa": { lonLat: [28, 12], scale: 2.1 },
    "Oceania": { lonLat: [140, -25], scale: 3.0 }
};

// 常见语音识别国家别名映射
const COUNTRY_VOICE_ALIASES = {
    "united states": "USA", "usa": "USA", "u.s.": "USA", "us": "USA", "america": "USA",
    "uk": "GBR", "united kingdom": "GBR", "britain": "GBR", "great britain": "GBR", "england": "GBR",
    "south korea": "KOR", "korea": "KOR", "republic of korea": "KOR",
    "uae": "ARE", "united arab emirates": "ARE", "emirates": "ARE",
    "hong kong": "HKG", "taiwan": "TWN", "russia": "RUS", "vietnam": "VNM",
    "czechia": "CZE", "czech republic": "CZE", "turkiye": "TUR", "turkey": "TUR"
};

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

// 数据源路径（兼容 lab10 与 lab9 目录层级）
const GEOJSON_URL = "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson";
const GDP_CSV_PATHS = [
    "../data/lab9_gdp_2025_top50.csv",
    "data/lab9_gdp_2025_top50.csv",
    "../lab9/data/lab9_gdp_2025_top50.csv"
];

function parseGdpRow(d) {
    const rawGdp = (d.gdp_2025_billion_usd || "").toString().replace(/,/g, "").trim();
    const iso3 = (d.iso3 || "").trim().toUpperCase();
    return {
        iso3: iso3,
        country: (d.country || "").trim(),
        gdp: parseFloat(rawGdp),
        rank: parseInt(d.rank, 10),
        region: REGION_BY_ISO3[iso3] || "Other"
    };
}

async function loadGdpCsv() {
    for (const path of GDP_CSV_PATHS) {
        try {
            const data = await d3.csv(path, parseGdpRow);
            if (data && data.length > 0) return data;
        } catch (e) {
            // 继续尝试下一个备用路径
        }
    }
    throw new Error("Could not load lab9_gdp_2025_top50.csv");
}

Promise.all([
    d3.json(GEOJSON_URL),
    loadGdpCsv()
]).then(([geoData, gdpData]) => {
    removeLoaders();

    if (!geoData || !geoData.features || !gdpData || gdpData.length === 0) {
        showError("Data failed to load. Please verify your file paths.");
        return;
    }

    globalGdpData = gdpData.sort((a, b) => a.rank - b.rank);
    const countriesGeo = geoData.features;
    globalCountriesGeo = countriesGeo;
    const gdpByIso3 = new Map(globalGdpData.map(d => [d.iso3, d]));

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
            feature.properties.region = record.region;
        } else {
            feature.properties.gdp = null;
            feature.properties.countryName = feature.properties.name || "Other / No Data";
            feature.properties.region = REGION_BY_ISO3[matchedIso3] || "Other";
        }
    });

    // 填充传统回退下拉框选项 (Fallback UI)
    populateCountryDropdown(globalGdpData);

    const minGdp = d3.min(globalGdpData, d => d.gdp) || 280;
    const maxGdp = d3.max(globalGdpData, d => d.gdp) || 30767;

    const logScale = d3.scaleLog()
        .domain([minGdp, maxGdp])
        .range([0.25, 1.0]);

    const getColor = (gdp) => {
        if (gdp == null || isNaN(gdp)) return "#e2e8f0";
        return d3.interpolateBlues(logScale(gdp));
    };

    const maxRadius = 36;
    const radiusScale = d3.scaleSqrt()
        .domain([0, maxGdp])
        .range([0, maxRadius]);

    // -------------------------------------------------------------
    // 绘制 CHOROPLETH 地图
    // -------------------------------------------------------------
    choroplethPathsSelection = choroplethGroup.selectAll(".country-path")
        .data(countriesGeo)
        .join("path")
        .attr("class", "country-path")
        .attr("d", geoPathGenerator)
        .attr("fill", d => getColor(d.properties.gdp))
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 0.6)
        .attr("data-iso3", d => d.properties.iso3);

    renderChoroplethLegend(minGdp, maxGdp);

    // -------------------------------------------------------------
    // 绘制 CARTOGRAM (Dorling 变形地图)
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
                    region: feature.properties.region,
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

    cartogramBubblesSelection = cartogramBubbleGroup.selectAll(".cartogram-bubble")
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

    cartogramLabelsSelection = cartogramBubbleGroup.selectAll(".cartogram-label")
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

    renderCartogramLegend(radiusScale);

    // -------------------------------------------------------------
    // 传统鼠标联动高亮与 Tooltip
    // -------------------------------------------------------------
    function showTooltip(event, title, gdp, rank, region) {
        const content = gdp != null
            ? `<strong>${title}</strong>Rank: #${rank} (${region})<br>GDP: $${d3.format(",.2f")(gdp)} B`
            : `<strong>${title}</strong><em>No Data (Outside Top 50)</em>`;

        tooltip.style("opacity", 1)
            .html(content)
            .style("left", `${event.clientX + 14}px`)
            .style("top", `${event.clientY - 14}px`);
    }

    function hideTooltip() {
        if (!lockedIso3) tooltip.style("opacity", 0);
    }

    choroplethPathsSelection
        .on("mouseover", function (event, d) {
            if (!lockedIso3) {
                updateVisualHighlight(d.properties.iso3);
                showTooltip(event, d.properties.countryName, d.properties.gdp, d.properties.rank, d.properties.region);
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
                resetVisualization();
            } else if (d.properties.gdp != null) {
                highlightCountryByIso3(d.properties.iso3, "Mouse Click");
            }
        });

    cartogramBubblesSelection
        .on("mouseover", function (event, d) {
            if (!lockedIso3) {
                updateVisualHighlight(d.iso3);
                showTooltip(event, d.name, d.gdp, d.rank, d.region);
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
                resetVisualization();
            } else {
                highlightCountryByIso3(d.iso3, "Mouse Click");
            }
        });

    // 初始化语音控制与回退控件事件
    initVoiceAndFallbackControls();

}).catch(err => {
    console.error(err);
    showError("Could not load data. Check console for details.");
});

// =============================================================
// 核心可视化控制函数 (供 Voice、Gesture 或 Fallback 共同调用)
// =============================================================

function updateVisualHighlight(iso3) {
    d3.selectAll(".country-highlight").classed("country-highlight", false);
    if (iso3) {
        d3.selectAll(`[data-iso3="${iso3}"]`)
            .classed("country-highlight", true)
            .raise();
    }
}

function filterRegionOrTier(filterKey, sourceLabel = "Voice") {
    hideCommandError();
    lockedIso3 = null;
    activeRegionFilter = filterKey;
    tooltip.style("opacity", 0);
    d3.select("#country-select").property("value", "");
    d3.select("#region-select").property("value", filterKey);

    if (filterKey === "ALL") {
        resetVisualization(sourceLabel);
        return;
    }

    const isMatching = (dProps) => {
        if (!dProps || dProps.gdp == null) return false;
        if (filterKey === "TOP5") return dProps.rank <= 5;
        if (filterKey === "TOP10") return dProps.rank <= 10;
        if (filterKey === "TOP20") return dProps.rank <= 20;
        return dProps.region === filterKey;
    };

    choroplethPathsSelection.classed("dimmed", d => !isMatching(d.properties));
    cartogramBubblesSelection.classed("dimmed", d => !isMatching(d));
    cartogramLabelsSelection.classed("dimmed", d => !isMatching(d));
    updateVisualHighlight(null);

    // 针对特定大洲自动平滑缩放 Choropleth 视图
    if (REGION_VIEWPORTS[filterKey]) {
        const { lonLat, scale } = REGION_VIEWPORTS[filterKey];
        const [cx, cy] = projection(lonLat);
        const transform = d3.zoomIdentity
            .translate(width / 2, height / 2)
            .scale(scale)
            .translate(-cx, -cy);

        choroplethSvg.transition()
            .duration(750)
            .call(zoom.transform, transform);
    } else {
        choroplethSvg.transition()
            .duration(650)
            .call(zoom.transform, d3.zoomIdentity);
    }

    const matchingCount = globalGdpData.filter(d => isMatching(d)).length;
    const readableName = filterKey.startsWith("TOP")
        ? `Top ${filterKey.replace("TOP", "")} Economies`
        : `${filterKey} Region`;

    d3.select("#voice-action").text(`Filtered: ${readableName} (${matchingCount} economies)`);
    d3.select("#selected-country-banner")
        .classed("hidden", false)
        .html(`<strong>Active Filter (${sourceLabel}):</strong> Showing <strong>${readableName}</strong> (${matchingCount} economies in the Top 50). Say <em>"Reset"</em> to restore all.`);
}

function highlightCountryByIso3(iso3, sourceLabel = "Voice") {
    hideCommandError();
    const record = globalGdpData.find(d => d.iso3 === iso3);
    if (!record) return;

    lockedIso3 = iso3;
    d3.select("#country-select").property("value", iso3);
    d3.select("#region-select").property("value", "ALL");

    // 淡化其他国家，突出目标国家
    choroplethPathsSelection.classed("dimmed", d => d.properties.iso3 !== iso3);
    cartogramBubblesSelection.classed("dimmed", d => d.iso3 !== iso3);
    cartogramLabelsSelection.classed("dimmed", d => d.iso3 !== iso3);
    updateVisualHighlight(iso3);

    // Choropleth 自动平滑缩放至目标国家几何中心
    const geoFeature = globalCountriesGeo.find(f => f.properties.iso3 === iso3);
    if (geoFeature) {
        const centroid = geoPathGenerator.centroid(geoFeature);
        if (!isNaN(centroid[0]) && !isNaN(centroid[1])) {
            const scale = 3.2;
            const transform = d3.zoomIdentity
                .translate(width / 2, height / 2)
                .scale(scale)
                .translate(-centroid[0], -centroid[1]);

            choroplethSvg.transition()
                .duration(750)
                .call(zoom.transform, transform);
        }
    }

    d3.select("#voice-action").text(`Highlighted: ${record.country} (#${record.rank})`);
    d3.select("#selected-country-banner")
        .classed("hidden", false)
        .html(
            `<strong>Selected Economy (${sourceLabel}):</strong> ${record.country} (${record.iso3}) &mdash; ` +
            `<strong>Global Rank #${record.rank}</strong> | <strong>2025 Nominal GDP: $${d3.format(",.2f")(record.gdp)} Billion USD</strong> (${record.region})`
        );
}

function resetVisualization(sourceLabel = "User") {
    hideCommandError();
    lockedIso3 = null;
    activeRegionFilter = "ALL";
    tooltip.style("opacity", 0);

    d3.select("#region-select").property("value", "ALL");
    d3.select("#country-select").property("value", "");
    d3.select("#selected-country-banner").classed("hidden", true);

    if (choroplethPathsSelection) choroplethPathsSelection.classed("dimmed", false);
    if (cartogramBubblesSelection) cartogramBubblesSelection.classed("dimmed", false);
    if (cartogramLabelsSelection) cartogramLabelsSelection.classed("dimmed", false);
    updateVisualHighlight(null);

    choroplethSvg.transition()
        .duration(650)
        .call(zoom.transform, d3.zoomIdentity);

    d3.select("#voice-action").text(`Reset complete — Showing all Top 50 economies (${sourceLabel})`);
}

// =============================================================
// PART I (Tasks 1–5): Web Speech API 语音识别与指令解析
// =============================================================

function handleVoiceCommand(rawTranscript) {
    const command = rawTranscript.toLowerCase().replace(/[.,!?]/g, "").trim();

    // 1. 重置指令
    if (
        command.includes("reset") ||
        command.includes("clear") ||
        command.includes("show all") ||
        command.includes("all countries")
    ) {
        resetVisualization("Voice Command");
        return;
    }

    // 2. Top N 排名筛选指令
    if (command.includes("top 5") || command.includes("top five")) {
        filterRegionOrTier("TOP5", "Voice Command");
        return;
    }
    if (command.includes("top 10") || command.includes("top ten")) {
        filterRegionOrTier("TOP10", "Voice Command");
        return;
    }
    if (command.includes("top 20") || command.includes("top twenty")) {
        filterRegionOrTier("TOP20", "Voice Command");
        return;
    }

    // 3. 大洲/区域筛选指令
    if (command.includes("asia")) {
        filterRegionOrTier("Asia", "Voice Command");
        return;
    }
    if (command.includes("europe")) {
        filterRegionOrTier("Europe", "Voice Command");
        return;
    }
    if (command.includes("america") || command.includes("americas")) {
        filterRegionOrTier("Americas", "Voice Command");
        return;
    }
    if (command.includes("middle east") || command.includes("africa")) {
        filterRegionOrTier("Middle East & Africa", "Voice Command");
        return;
    }
    if (command.includes("oceania")) {
        filterRegionOrTier("Oceania", "Voice Command");
        return;
    }

    // 4. 国家高亮/选择指令 (支持 "Highlight [Country]", "Select [Country]", "Show [Country]" 或直接说出国家名)
    let matchedIso3 = null;

    // 4a. 先检查常见国家别名
    for (const [alias, iso3] of Object.entries(COUNTRY_VOICE_ALIASES)) {
        if (command.includes(alias)) {
            matchedIso3 = iso3;
            break;
        }
    }

    // 4b. 再匹配数据集中的标准国家名称
    if (!matchedIso3) {
        for (const item of globalGdpData) {
            const cName = item.country.toLowerCase();
            if (command.includes(cName)) {
                matchedIso3 = item.iso3;
                break;
            }
        }
    }

    if (matchedIso3) {
        highlightCountryByIso3(matchedIso3, "Voice Command");
        return;
    }

    // 5. 未识别指令反馈 (Task 5)
    showCommandError(rawTranscript);
}

function showCommandError(command) {
    d3.select("#voice-status")
        .attr("class", "feedback-value status-error")
        .text("Command not recognized");

    d3.select("#voice-action")
        .text("No action taken");

    d3.select("#command-error-banner")
        .classed("hidden", false)
        .html(
            `<strong>Command not recognized:</strong> "${command}".<br>` +
            `Try saying: <em>"Show Asia"</em>, <em>"Show Europe"</em>, <em>"Show Top 10"</em>, <em>"Highlight China"</em>, <em>"Highlight Singapore"</em>, or <em>"Reset"</em>.`
        );
}

function hideCommandError() {
    d3.select("#command-error-banner").classed("hidden", true);
}

function populateCountryDropdown(gdpData) {
    const select = d3.select("#country-select");
    select.selectAll("option.country-opt")
        .data(gdpData)
        .join("option")
        .attr("class", "country-opt")
        .attr("value", d => d.iso3)
        .text(d => `#${d.rank} ${d.country} ($${d3.format(",.0f")(d.gdp)}B)`);
}

function initVoiceAndFallbackControls() {
    // Task 1: 检查浏览器 Web Speech API 支持
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const voiceBtn = d3.select("#voice-button");
    const voiceBtnText = d3.select("#voice-btn-text");
    const voiceStatus = d3.select("#voice-status");

    if (!SpeechRecognition) {
        console.log("Speech recognition is not supported in this browser.");
        voiceBtn.property("disabled", true);
        voiceBtnText.text("Voice Not Supported");
        voiceStatus
            .attr("class", "feedback-value status-error")
            .text("Web Speech API not supported in this browser. Please use fallback controls or click example chips below.");
    } else {
        const recognition = new SpeechRecognition();
        recognition.lang = "en-US";
        recognition.continuous = false;
        recognition.interimResults = false;

        let isListening = false;

        // Task 2: 必须由用户主动点击按钮开启麦克风
        voiceBtn.on("click", function () {
            if (isListening) {
                recognition.stop();
                return;
            }
            try {
                hideCommandError();
                recognition.start();
                isListening = true;
                voiceBtn.classed("listening", true);
                voiceBtnText.text("Listening... (Click to Stop)");
                voiceStatus
                    .attr("class", "feedback-value status-listening")
                    .text("Listening... Speak a command now");
            } catch (err) {
                console.error(err);
            }
        });

        // Task 3: 读取语音识别结果并映射动作
        recognition.onresult = function (event) {
            const transcript = event.results[0][0].transcript.toLowerCase().trim();
            const confidence = (event.results[0][0].confidence * 100).toFixed(0);

            d3.select("#voice-transcript")
                .text(`"${transcript}" (${confidence}% confidence)`);

            voiceStatus
                .attr("class", "feedback-value status-success")
                .text(`Heard: "${transcript}"`);

            handleVoiceCommand(transcript);
        };

        recognition.onerror = function (event) {
            isListening = false;
            voiceBtn.classed("listening", false);
            voiceBtnText.text("Start Voice Control");

            voiceStatus
                .attr("class", "feedback-value status-error")
                .text(`Microphone error: ${event.error}. Use fallback controls if needed.`);
        };

        recognition.onend = function () {
        isListening = false;
        voiceBtn.classed("listening", false);
        voiceBtnText.text("Start Voice Control");

        const currentStatus = d3.select("#voice-status").text();
        if (currentStatus.includes("Listening")) {
            d3.select("#voice-status")
                .attr("class", "feedback-value status-idle")
                .text("Voice control inactive (Click button to speak)");
        }
    };
}

    // 点击指令示例 Chip 直接模拟执行语音指令（方便演示与测试）
    d3.selectAll(".cmd-chip").on("click", function () {
        const simulatedCmd = d3.select(this).attr("data-cmd");
        d3.select("#voice-transcript").text(`"${simulatedCmd}" (Simulated chip)`);
        d3.select("#voice-status")
            .attr("class", "feedback-value status-success")
            .text(`Heard: "${simulatedCmd}"`);
        handleVoiceCommand(simulatedCmd);
    });

    // 传统控件回退绑定 (Part C Fallback Controls)
    d3.select("#region-select").on("change", function () {
        const val = d3.select(this).property("value");
        d3.select("#voice-transcript").text("— (Fallback Dropdown)");
        d3.select("#voice-status")
            .attr("class", "feedback-value status-idle")
            .text("Updated via Fallback Region Dropdown");
        filterRegionOrTier(val, "Fallback Control");
    });

    d3.select("#country-select").on("change", function () {
        const iso3 = d3.select(this).property("value");
        if (!iso3) {
            resetVisualization("Fallback Control");
            return;
        }
        d3.select("#voice-transcript").text("— (Fallback Dropdown)");
        d3.select("#voice-status")
            .attr("class", "feedback-value status-idle")
            .text("Updated via Fallback Country Select");
        highlightCountryByIso3(iso3, "Fallback Control");
    });

    d3.select("#reset-button").on("click", function () {
        d3.select("#voice-transcript").text("— (Fallback Button)");
        d3.select("#voice-status")
            .attr("class", "feedback-value status-idle")
            .text("Reset via Fallback Button");
        resetVisualization("Fallback Button");
    });
}

// =============================================================
// 图例绘制函数 (完全保留自 Lab 9)
// =============================================================

function renderChoroplethLegend(minGdp, maxGdp) {
    const legendWidth = 150;
    const legendHeight = 8;

    const legendGroup = choroplethSvg.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(16, ${height - 48})`);

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

function renderCartogramLegend(radiusScale) {
    const legendValues = [1000, 5000, 30000];
    const legendX = 46;
    const legendBottomY = height - 16;

    const legendGroup = cartogramSvg.append("g")
        .attr("class", "cartogram-legend")
        .attr("transform", `translate(${legendX}, ${legendBottomY})`);

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
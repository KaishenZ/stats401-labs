// 画布与边距参数
const width = 880;
const height = 540;
const margin = {
    top: 50,
    right: 180,
    bottom: 60,
    left: 110
};

const tooltip = d3.select("#tooltip");

// 1. 读取上级目录中的 cities_multivariate.csv 数据
d3.csv("../data/cities_multivariate.csv", d => ({
    city: d.city,
    population: +d.population,
    temp_c: +d.temp_c,
    development_level: d.development_level,
    region: d.region
})).then(data => {

    // 依 region 与 population 排序，提升图表可读性
    data.sort((a, b) => d3.ascending(a.region, b.region) || d3.ascending(a.population, b.population));

    // 2. 创建 SVG 画布
    const svg = d3.select("#chart")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    // 3. 构建 Scales
    // X 轴: 连续变量 population (Ratio)
    const xScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.population) * 1.1])
        .nice()
        .range([margin.left, width - margin.right]);

    // Y 轴: 离散类别 city (Nominal 标识)
    const yScale = d3.scalePoint()
        .domain(data.map(d => d.city))
        .range([margin.top, height - margin.bottom])
        .padding(0.6);

    // 颜色: 连续区间变量 temp_c (Interval) - 冷暖渐变
    const colorScale = d3.scaleSequential()
        .domain(d3.extent(data, d => d.temp_c))
        .interpolator(d3.interpolateSpectral); // 高温偏暖橙红，低温偏蓝绿

    // 大小: 有序变量 development_level (Ordinal)
    const sizeScale = d3.scaleOrdinal()
        .domain(["Low", "Medium", "High"])
        .range([5, 8, 12]);

    // 4. 绘制坐标轴
    // X 轴
    svg.append("g")
        .attr("transform", `translate(0, ${height - margin.bottom})`)
        .call(d3.axisBottom(xScale).ticks(6))
        .call(g => g.selectAll(".tick line").clone()
            .attr("y2", -(height - margin.top - margin.bottom))
            .attr("stroke-opacity", 0.08)); // 背景轻量网格

    // Y 轴
    svg.append("g")
        .attr("transform", `translate(${margin.left}, 0)`)
        .call(d3.axisLeft(yScale));

    // 坐标轴文字说明
    svg.append("text")
        .attr("x", margin.left + (width - margin.left - margin.right) / 2)
        .attr("y", height - 18)
        .attr("text-anchor", "middle")
        .attr("font-size", "13px")
        .attr("fill", "#444")
        .text("Population (Millions)");

    // 5. 绘制棒棒糖柱条 (Lollipop Lines)
    svg.selectAll(".lollipop-line")
        .data(data)
        .join("line")
        .attr("class", "lollipop-line")
        .attr("x1", margin.left)
        .attr("x2", d => xScale(d.population))
        .attr("y1", d => yScale(d.city))
        .attr("y2", d => yScale(d.city))
        .attr("stroke", "#ccc")
        .attr("stroke-width", 2);

    // 6. 绘制多维信息圆点 (Circle Markers)
    svg.selectAll(".city-marker")
        .data(data)
        .join("circle")
        .attr("class", "city-marker")
        .attr("cx", d => xScale(d.population))
        .attr("cy", d => yScale(d.city))
        .attr("r", d => sizeScale(d.development_level))
        .attr("fill", d => colorScale(d.temp_c))
        .attr("stroke", "#333")
        .attr("stroke-width", 1.2)
        .attr("cursor", "pointer")
        // 7. Tooltip 交互
        .on("mouseover", function(event, d) {
            d3.select(this).attr("stroke-width", 2.5).attr("stroke", "#000");
            tooltip.style("opacity", 1)
                .html(`
                    <strong>${d.city}</strong> (${d.region})<br>
                    • <strong>Population:</strong> ${d.population}M<br>
                    • <strong>Avg Temp:</strong> ${d.temp_c}°C<br>
                    • <strong>Development:</strong> ${d.development_level}
                `);
        })
        .on("mousemove", function(event) {
            tooltip
                .style("left", `${event.pageX + 14}px`)
                .style("top", `${event.pageY - 28}px`);
        })
        .on("mouseout", function() {
            d3.select(this).attr("stroke-width", 1.2).attr("stroke", "#333");
            tooltip.style("opacity", 0);
        });

    // 8. 绘制图例 (Legends)
    const legendGroup = svg.append("g")
        .attr("transform", `translate(${width - margin.right + 25}, ${margin.top})`);

    // (A) Development Level 图例 (Size)
    legendGroup.append("text")
        .attr("x", 0)
        .attr("y", 0)
        .attr("font-size", "12px")
        .attr("font-weight", "bold")
        .text("Development Level");

    ["Low", "Medium", "High"].forEach((level, i) => {
        const item = legendGroup.append("g")
            .attr("transform", `translate(0, ${22 + i * 26})`);

        item.append("circle")
            .attr("cx", 12)
            .attr("cy", 0)
            .attr("r", sizeScale(level))
            .attr("fill", "#888");

        item.append("text")
            .attr("x", 32)
            .attr("y", 4)
            .attr("font-size", "12px")
            .text(level);
    });

    // (B) Temperature 色阶说明 (Color)
    const tempLegendY = 125;
    legendGroup.append("text")
        .attr("x", 0)
        .attr("y", tempLegendY)
        .attr("font-size", "12px")
        .attr("font-weight", "bold")
        .text("Avg Temp (°C)");

    const [minTemp, maxTemp] = d3.extent(data, d => d.temp_c);
    [minTemp, (minTemp + maxTemp) / 2, maxTemp].forEach((temp, i) => {
        const item = legendGroup.append("g")
            .attr("transform", `translate(0, ${tempLegendY + 20 + i * 24})`);

        item.append("circle")
            .attr("cx", 12)
            .attr("cy", 0)
            .attr("r", 7)
            .attr("fill", colorScale(temp));

        item.append("text")
            .attr("x", 32)
            .attr("y", 4)
            .attr("font-size", "12px")
            .text(`${temp.toFixed(1)}°C`);
    });

}).catch(err => {
    console.error("Failed to load cities_multivariate.csv:", err);
});
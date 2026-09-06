const margin = { top: 40, right: 120, bottom: 60, left: 60 };
const width = 900 - margin.left - margin.right;
const height = 500 - margin.top - margin.bottom;

const svg = d3.select("#vis")
  .append("svg")
  .attr("width", width + margin.left + margin.right)
  .attr("height", height + margin.top + margin.bottom)
  .append("g")
  .attr("transform", `translate(${margin.left},${margin.top})`);

const tooltip = d3.select("#tooltip");

// 读取清洗后的 CSV
d3.csv("../data/lab4_clean_tweets.csv", d => ({
  ...d,
  created_at: new Date(d.created_at),
  likes: +d.likes,
  retweets: +d.retweets,
  sentiment_score: +d.sentiment_score
})).then(data => {
  // X 轴：时间
  const x = d3.scaleTime()
    .domain(d3.extent(data, d => d.created_at))
    .range([0, width]);

  svg.append("g")
    .attr("transform", `translate(0, ${height})`)
    .call(d3.axisBottom(x).ticks(6))
    .append("text")
    .attr("x", width / 2)
    .attr("y", 40)
    .attr("fill", "#000")
    .attr("text-anchor", "middle")
    .text("Tweet Timestamp");

  // Y 轴：情感连续得分 (-1 到 1)
  const y = d3.scaleLinear()
    .domain([-1.05, 1.05])
    .range([height, 0]);

  svg.append("g")
    .call(d3.axisLeft(y).ticks(5))
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", -45)
    .attr("fill", "#000")
    .attr("text-anchor", "middle")
    .text("Sentiment Score (Positive − Negative)");

  // 中性参考线
  svg.append("line")
    .attr("x1", 0)
    .attr("x2", width)
    .attr("y1", y(0))
    .attr("y2", y(0))
    .attr("stroke", "#ccc")
    .attr("stroke-dasharray", "4");

  // 半径比例尺 (转发数)
  const r = d3.scaleSqrt()
    .domain([0, d3.max(data, d => d.retweets) || 10])
    .range([3, 16]);

  // 颜色比例尺
  const color = d3.scaleOrdinal()
    .domain(["Positive", "Neutral", "Negative"])
    .range(["#2ca02c", "#7f7f7f", "#d62728"]);

  // 绘制推文散点
  svg.selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", d => x(d.created_at))
    .attr("cy", d => y(d.sentiment_score))
    .attr("r", d => r(d.retweets))
    .attr("fill", d => color(d.sentiment))
    .attr("opacity", 0.65)
    .attr("stroke", "#fff")
    .attr("stroke-width", 0.5)
    .on("mouseover", (event, d) => {
      tooltip.transition().duration(200).style("opacity", 1);
      tooltip.html(`
        <strong>@${d.username}</strong> (${d.category})<br/>
        <strong>Date:</strong> ${d.created_at.toLocaleString()}<br/>
        <strong>Sentiment:</strong> ${d.sentiment} (${d.sentiment_score.toFixed(2)})<br/>
        <strong>Retweets:</strong> ${d.retweets} | <strong>Likes:</strong> ${d.likes}<br/>
        <hr style="margin: 6px 0; border: none; border-top: 1px solid #eee;" />
        <em>"${d.tweet_text_raw}"</em>
      `)
      .style("left", `${event.pageX + 15}px`)
      .style("top", `${event.pageY - 28}px`);
    })
    .on("mouseout", () => {
      tooltip.transition().duration(300).style("opacity", 0);
    });

  // 图例
  const legend = svg.selectAll(".legend")
    .data(["Positive", "Neutral", "Negative"])
    .enter().append("g")
    .attr("class", "legend")
    .attr("transform", (d, i) => `translate(${width + 20}, ${i * 25 + 10})`);

  legend.append("circle")
    .attr("r", 6)
    .attr("fill", color);

  legend.append("text")
    .attr("x", 12)
    .attr("y", 4)
    .text(d => d);
});
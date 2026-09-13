// ======================================================
// Lab 5 Assignment  Urban Transit Network
// ======================================================

const nlWidth = 1000
const nlHeight = 720
const nlPadding = 30
const labelGap = 120

const tooltip = d3.select("#tooltip")

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

  console.log("Nodes", nodes.length)
  console.log("Links", links.length)

  const svg = d3.select("#chart")
    .append("svg")
    .attr("width", nlWidth)
    .attr("height", nlHeight)
    .attr("role", "img")
    .attr("aria-label", "Interactive force-directed urban transit network")

  const districts = ["Central", "North", "South", "East", "West"]

  const districtColor = d3.scaleOrdinal()
    .domain(districts)
    .range(["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd"])

  const passengerExtent = d3.extent(nodes, d => d.daily_passengers)

  const passengerSize = d3.scaleSqrt()
    .domain(passengerExtent)
    .range([50, 650])

  const stationTypes = ["Local", "Transfer", "Terminal"]

  const stationTypeSymbol = d3.scaleOrdinal()
    .domain(stationTypes)
    .range([d3.symbolCircle, d3.symbolSquare, d3.symbolTriangle])

  const routeTypes = ["Metro", "Express", "Shuttle"]

  const routeColor = d3.scaleOrdinal()
    .domain(routeTypes)
    .range(["#333333", "#e41a1c", "#377eb8"])

  const travelExtentRaw = d3.extent(links, d => d.travel_time_min)

  const travelExtent = travelExtentRaw[0] === travelExtentRaw[1]
    ? [travelExtentRaw[0] - 1, travelExtentRaw[1] + 1]
    : travelExtentRaw

  const linkWidth = d3.scaleLinear()
    .domain(travelExtent)
    .range([1.5, 7])

  const travelOpacity = d3.scaleLinear()
    .domain(travelExtent)
    .range([0.3, 1])

  const nodeRadius = d => Math.sqrt(passengerSize(d.daily_passengers) / Math.PI)

  const linkSel = svg.append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke", d => routeColor(d.route_type))
    .attr("stroke-width", d => linkWidth(d.travel_time_min))
    .attr("stroke-opacity", 0.7)

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
    .style("cursor", "grab")
    .call(
      d3.drag()
        .on("start", dragStarted)
        .on("drag", dragged)
        .on("end", dragEnded)
    )

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
    .attr("stroke-linejoin", "round")

  const simulation = d3.forceSimulation(nodes)
    .force(
      "link",
      d3.forceLink(links)
        .id(d => d.id)
        .distance(d => 50 + d.travel_time_min * 2)
        .strength(0.5)
    )
    .force("charge", d3.forceManyBody().strength(-220))
    .force("x", d3.forceX(nlWidth / 2).strength(0.06))
    .force("y", d3.forceY(nlHeight / 2).strength(0.08))
    .force("collision", d3.forceCollide().radius(d => nodeRadius(d) + 6))

  simulation.on("tick", () => {
    nodes.forEach(d => {
      const r = nodeRadius(d)
      const leftLimit = nlPadding + r
      const rightLimit = nlWidth - nlPadding - r - 60
      const topLimit = nlPadding + r
      const bottomLimit = nlHeight - nlPadding - r

      d.x = Math.max(leftLimit, Math.min(rightLimit, d.x))
      d.y = Math.max(topLimit, Math.min(bottomLimit, d.y))
    })

    linkSel
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y)

    nodeSel.attr("transform", d => `translate(${d.x},${d.y})`)

    labelSel
      .attr("x", d => d.x + (d.x > nlWidth - labelGap ? -12 : 12))
      .attr("y", d => d.y + 3)
      .attr("text-anchor", d => d.x > nlWidth - labelGap ? "end" : "start")
  })

  function dragStarted(event, d) {
    if (!event.active) {
      simulation.alphaTarget(0.3).restart()
    }
    d.fx = d.x
    d.fy = d.y
  }

  function dragged(event, d) {
    const r = nodeRadius(d)
    d.fx = Math.max(
      nlPadding + r,
      Math.min(nlWidth - nlPadding - r - 60, event.x)
    )
    d.fy = Math.max(
      nlPadding + r,
      Math.min(nlHeight - nlPadding - r, event.y)
    )
  }

  function dragEnded(event, d) {
    if (!event.active) {
      simulation.alphaTarget(0)
    }
    d.fx = null
    d.fy = null
  }

  function getNodeId(endpoint) {
    return typeof endpoint === "object" && endpoint !== null
      ? endpoint.id
      : endpoint
  }

  function isConnected(a, b) {
    return links.some(l => {
      const s = getNodeId(l.source)
      const t = getNodeId(l.target)
      return (s === a.id && t === b.id) || (s === b.id && t === a.id)
    })
  }

  nodeSel
    .on("mouseover.highlight", function(event, d) {
      nodeSel.attr("opacity", o =>
        o.id === d.id || isConnected(d, o) ? 1 : 0.15
      )

      linkSel.attr("stroke-opacity", l =>
        getNodeId(l.source) === d.id || getNodeId(l.target) === d.id ? 1 : 0.08
      )

      labelSel.attr("opacity", o =>
        o.id === d.id || isConnected(d, o) ? 1 : 0.15
      )
    })
    .on("mouseout.highlight", function() {
      nodeSel.attr("opacity", 1)
      linkSel.attr("stroke-opacity", 0.7)
      labelSel.attr("opacity", 1)
    })
    .on("mouseover.tooltip", function(event, d) {
      tooltip
        .style("opacity", 1)
        .html(`
          <strong>${d.station_name} (${d.id})</strong><br>
          District  ${d.district}<br>
          Type  ${d.station_type}<br>
          Daily Passengers  ${d.daily_passengers.toLocaleString()}
        `)
    })
    .on("mousemove.tooltip", function(event) {
      tooltip
        .style("left", `${event.pageX + 12}px`)
        .style("top", `${event.pageY + 12}px`)
    })
    .on("mouseout.tooltip", function() {
      tooltip.style("opacity", 0)
    })

  buildNodeLinkLegend(
    districts,
    districtColor,
    passengerExtent,
    passengerSize,
    stationTypes,
    stationTypeSymbol,
    routeTypes,
    routeColor,
    travelExtent,
    linkWidth
  )

  drawMatrix(
    nodes,
    links,
    districtColor,
    routeColor,
    travelOpacity,
    travelExtent
  )

  renderFindings(nodes, links)
})

function buildNodeLinkLegend(
  districts,
  districtColor,
  passengerExtent,
  passengerSize,
  stationTypes,
  stationTypeSymbol,
  routeTypes,
  routeColor,
  travelExtent,
  linkWidth
) {
  const legend = d3.select("#legend")
  legend.html("")

  const districtDiv = legend.append("div").attr("class", "legend-section")
  districtDiv.append("h4").text("District  node color")

  districts.forEach(d => {
    districtDiv.append("div")
      .attr("class", "legend-item")
      .html(`<span class="swatch" style="background:${districtColor(d)}"></span>${d}`)
  })

  const sizeDiv = legend.append("div").attr("class", "legend-section")
  sizeDiv.append("h4").text("Daily passengers  node area")

  const sizeSvg = sizeDiv.append("svg")
    .attr("width", 220)
    .attr("height", 70)

  ;[passengerExtent[0], passengerExtent[1]].forEach((val, i) => {
    const cx = 50 + i * 100
    const r = Math.sqrt(passengerSize(val) / Math.PI)

    sizeSvg.append("circle")
      .attr("cx", cx)
      .attr("cy", 35)
      .attr("r", r)
      .attr("fill", "#999")

    sizeSvg.append("text")
      .attr("x", cx)
      .attr("y", 65)
      .attr("text-anchor", "middle")
      .attr("font-size", 10)
      .text(val.toLocaleString())
  })

  const typeDiv = legend.append("div").attr("class", "legend-section")
  typeDiv.append("h4").text("Station type  node shape")

  stationTypes.forEach(t => {
    const row = typeDiv.append("div").attr("class", "legend-item")
    const svg = row.append("svg")
      .attr("width", 26)
      .attr("height", 20)

    svg.append("path")
      .attr("transform", "translate(13,10)")
      .attr("d", d3.symbol().type(stationTypeSymbol(t)).size(120)())
      .attr("fill", "#999")

    row.append("span").text(t)
  })

  const routeDiv = legend.append("div").attr("class", "legend-section")
  routeDiv.append("h4").text("Route type  link color")

  routeTypes.forEach(t => {
    routeDiv.append("div")
      .attr("class", "legend-item")
      .html(`<span class="line-swatch" style="background:${routeColor(t)}"></span>${t}`)
  })

  const timeDiv = legend.append("div").attr("class", "legend-section")
  timeDiv.append("h4").text("Travel time  link width")

  const timeSvg = timeDiv.append("svg")
    .attr("width", 220)
    .attr("height", 60)

  ;[travelExtent[0], travelExtent[1]].forEach((val, i) => {
    const y = 18 + i * 22

    timeSvg.append("line")
      .attr("x1", 0)
      .attr("x2", 80)
      .attr("y1", y)
      .attr("y2", y)
      .attr("stroke", "#666")
      .attr("stroke-width", linkWidth(val))

    timeSvg.append("text")
      .attr("x", 90)
      .attr("y", y + 4)
      .attr("font-size", 10)
      .text(`${val} min`)
  })
}

function drawMatrix(
  nodes,
  links,
  districtColor,
  routeColor,
  travelOpacity,
  travelExtent
) {
  const routeTypes = routeColor.domain()
  const districtOrder = ["Central", "North", "South", "East", "West"]
  const typeOrder = ["Terminal", "Transfer", "Local"]

  const orderedNodes = nodes.slice().sort((a, b) => {
    const dA = districtOrder.indexOf(a.district)
    const dB = districtOrder.indexOf(b.district)

    if (dA !== dB) {
      return dA - dB
    }

    const tA = typeOrder.indexOf(a.station_type)
    const tB = typeOrder.indexOf(b.station_type)

    if (tA !== tB) {
      return tA - tB
    }

    return b.daily_passengers - a.daily_passengers
  })

  const matrixSize = 580
  const margin = {
    top: 120,
    right: 40,
    bottom: 40,
    left: 160
  }

  const svg = d3.select("#matrix")
    .append("svg")
    .attr("width", matrixSize + margin.left + margin.right)
    .attr("height", matrixSize + margin.top + margin.bottom)
    .attr("role", "img")
    .attr("aria-label", "Adjacency matrix of the urban transit network")

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`)

  const x = d3.scaleBand()
    .domain(orderedNodes.map(d => d.id))
    .range([0, matrixSize])
    .padding(0.05)

  const y = d3.scaleBand()
    .domain(orderedNodes.map(d => d.id))
    .range([0, matrixSize])
    .padding(0.05)

  const linkLookup = new Map()

  links.forEach(l => {
    const s = typeof l.source === "object" ? l.source.id : l.source
    const t = typeof l.target === "object" ? l.target.id : l.target
    const key = [s, t].sort().join("|")
    linkLookup.set(key, l)
  })

  const matrixData = []

  orderedNodes.forEach(rowNode => {
    orderedNodes.forEach(colNode => {
      const key = [rowNode.id, colNode.id].sort().join("|")
      const found = linkLookup.get(key)

      matrixData.push({
        row: rowNode.id,
        col: colNode.id,
        weight: found ? found.travel_time_min : 0,
        type: found ? found.route_type : null
      })
    })
  })

  g.selectAll("rect")
    .data(matrixData)
    .join("rect")
    .attr("class", "matrix-cell")
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
        tooltip
          .style("opacity", 1)
          .html(`
            <strong>${d.row} ↔ ${d.col}</strong><br>
            Route  ${d.type}<br>
            Travel time  ${d.weight} min
          `)
      }
    })
    .on("mousemove", event => {
      tooltip
        .style("left", `${event.pageX + 12}px`)
        .style("top", `${event.pageY + 12}px`)
    })
    .on("mouseout", () => tooltip.style("opacity", 0))

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
    .text(d => d.id)

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
    .text(d => d.id)

  const districtBoundaries = []
  let previousDistrict = null

  orderedNodes.forEach((d, i) => {
    if (d.district !== previousDistrict) {
      districtBoundaries.push({
        district: d.district,
        index: i
      })
      previousDistrict = d.district
    }
  })

  districtBoundaries.forEach(group => {
    const start = group.index * (matrixSize / orderedNodes.length)

    g.append("line")
      .attr("class", "matrix-group-line")
      .attr("x1", start)
      .attr("x2", start)
      .attr("y1", 0)
      .attr("y2", matrixSize)

    g.append("line")
      .attr("class", "matrix-group-line")
      .attr("x1", 0)
      .attr("x2", matrixSize)
      .attr("y1", start)
      .attr("y2", start)
  })

  const legend = d3.select("#matrix-legend")
  legend.html("")

  const routeDiv = legend.append("div").attr("class", "legend-section")
  routeDiv.append("h4").text("Cell color  route type")

  routeTypes.forEach(t => {
    routeDiv.append("div")
      .attr("class", "legend-item")
      .html(`<span class="swatch" style="background:${routeColor(t)}"></span>${t}`)
  })

  const timeDiv = legend.append("div").attr("class", "legend-section")
  timeDiv.append("h4").text("Cell opacity  travel time")

  const timeSvg = timeDiv.append("svg")
    .attr("width", 240)
    .attr("height", 70)

  const times = [
    travelExtent[0],
    (travelExtent[0] + travelExtent[1]) / 2,
    travelExtent[1]
  ]

  times.forEach((val, i) => {
    const cx = 30 + i * 75

    timeSvg.append("rect")
      .attr("x", cx)
      .attr("y", 10)
      .attr("width", 42)
      .attr("height", 22)
      .attr("fill", "#4682b4")
      .attr("fill-opacity", travelOpacity(val))

    timeSvg.append("text")
      .attr("x", cx + 21)
      .attr("y", 52)
      .attr("text-anchor", "middle")
      .attr("font-size", 10)
      .text(`${val.toFixed(1)} min`)
  })
}

function renderFindings(nodes, links) {
  const findings = d3.select("#findings")
  findings.html("")

  const nodeById = new Map(nodes.map(d => [d.id, d]))

  const degree = new Map(nodes.map(d => [d.id, 0]))

  const neighbors = new Map(
    nodes.map(d => [d.id, []])
  )

  links.forEach(l => {
    const s = typeof l.source === "object" ? l.source.id : l.source
    const t = typeof l.target === "object" ? l.target.id : l.target

    degree.set(s, degree.get(s) + 1)
    degree.set(t, degree.get(t) + 1)

    neighbors.get(s).push(nodeById.get(t))
    neighbors.get(t).push(nodeById.get(s))
  })

  const topDegree = nodes.slice()
    .sort((a, b) => degree.get(b.id) - degree.get(a.id))
    .slice(0, 5)

  const topPassengers = nodes.slice()
    .sort((a, b) => b.daily_passengers - a.daily_passengers)
    .slice(0, 5)

  const longestLinks = links.slice()
    .sort((a, b) => b.travel_time_min - a.travel_time_min)
    .slice(0, 5)

  const districtPairCounts = d3.rollups(
    links,
    v => v.length,
    l => {
      const s = nodeById.get(typeof l.source === "object" ? l.source.id : l.source)
      const t = nodeById.get(typeof l.target === "object" ? l.target.id : l.target)
      return [s.district, t.district].sort().join(" and ")
    }
  ).sort((a, b) => b[1] - a[1])

  const transferTerminal = nodes.filter(d => d.station_type !== "Local")

  const nonLocalTopology = transferTerminal.map(d => {
    const neighborDistricts = new Set(
      neighbors.get(d.id).map(n => n.district)
    )

    return {
      node: d,
      degree: degree.get(d.id),
      neighborDistrictCount: neighborDistricts.size,
      neighborDistricts: Array.from(neighborDistricts)
    }
  }).sort((a, b) => b.degree - a.degree)

  const transferTerminalTop = nonLocalTopology.slice(0, 3)

  const routeDistrictPairCounts = d3.rollups(
    links,
    v => v.length,
    l => {
      const s = nodeById.get(typeof l.source === "object" ? l.source.id : l.source)
      const t = nodeById.get(typeof l.target === "object" ? l.target.id : l.target)
      return `${l.route_type}|${[s.district, t.district].sort().join(" and ")}`
    }
  )

  const routeConcentration = routeTypesFromLinks(links).map(routeType => {
    const entries = routeDistrictPairCounts
      .filter(([key]) => key.startsWith(`${routeType}|`))
      .map(([key, count]) => [
        key.replace(`${routeType}|`, ""),
        count
      ])
      .sort((a, b) => b[1] - a[1])

    return {
      routeType,
      pair: entries.length ? entries[0][0] : "no district pair",
      count: entries.length ? entries[0][1] : 0,
      total: d3.sum(entries, d => d[1])
    }
  })

  const routeTypeCounts = d3.rollups(
    links,
    v => v.length,
    l => l.route_type
  ).sort((a, b) => b[1] - a[1])

  function routeTypesFromLinks(data) {
    return Array.from(new Set(data.map(d => d.route_type)))
  }

  function answerabilityBlock(status, view, encoding, observation) {
    return `
      <div class="finding-card">
        <p class="finding-question">${status}</p>
        <p><strong>Useful view</strong> ${view}</p>
        <p><strong>Supporting encoding</strong> ${encoding}</p>
        <p><strong>Observation</strong> ${observation}</p>
      </div>
    `
  }

  const topDegreeNames = topDegree.slice(0, 3)
    .map(d => `${d.station_name} with ${degree.get(d.id)} direct connections`)
    .join(", ")

  findings.append("div")
    .attr("class", "findings-grid")
    .html(
      answerabilityBlock(
        "1  Which stations appear central in the network  Answered well",
        "Both the node-link view and the adjacency matrix",
        "The number of incident links and the filled cells in each station row and column",
        `${topDegreeNames} appear most central because they have the largest number of direct connections. Their connections are also easy to follow in the node-link view and appear as many filled cells in the matrix.`
      ) +
      answerabilityBlock(
        "2  Which districts are strongly connected to one another  Answered well",
        "Adjacency matrix",
        "District ordering groups stations into blocks, while filled cells show direct connections between the groups",
        `${districtPairCounts.slice(0, 3).map(([pair, count]) => `${pair} with ${count} links`).join(", ")} form the strongest district connections. The densest corresponding blocks in the matrix make these relationships easier to compare.`
      ) +
      answerabilityBlock(
        "3  Where are transfer or terminal stations located in the topology  Answered well",
        "Node-link view",
        "Station shape identifies Transfer and Terminal stations, while their links and nearby district colors reveal their position in the network",
        `${transferTerminalTop.map(d => `${d.node.station_name} has ${d.degree} direct connections and connects to ${d.neighborDistrictCount} district group${d.neighborDistrictCount === 1 ? "" : "s"}`).join(", ")}. Stations connecting to multiple district groups are especially useful as visible bridge points between network areas.`
      ) +
      answerabilityBlock(
        "4  Which stations have high passenger volume  Answered well",
        "Node-link view",
        "Node area represents daily passengers and tooltips provide exact values",
        `${topPassengers.slice(0, 3).map(d => `${d.station_name} with ${d.daily_passengers.toLocaleString()} daily passengers`).join(", ")} are among the highest-volume stations. Their larger symbols make them stand out immediately in the node-link view.`
      ) +
      answerabilityBlock(
        "5  Where are the longest direct travel-time connections  Answered well",
        "Both the node-link view and the adjacency matrix",
        "Link width represents travel time in the node-link view, while matrix opacity represents travel time",
        `${longestLinks.slice(0, 3).map(l => {
          const s = nodeById.get(typeof l.source === "object" ? l.source.id : l.source).station_name
          const t = nodeById.get(typeof l.target === "object" ? l.target.id : l.target).station_name
          return `${s} and ${t} at ${l.travel_time_min} min`
        }).join(", ")} are the longest direct connections. These links are visually wider and their matrix cells are among the darkest.`
      ) +
      answerabilityBlock(
        "6  Are particular route types concentrated in particular parts of the network  Answered well",
        "Both the node-link view and the adjacency matrix",
        "Route type uses link or cell color, while district ordering in the matrix reveals where each route type occurs",
        `${routeConcentration.map(d => `${d.routeType} is most concentrated between ${d.pair} with ${d.count} connection${d.count === 1 ? "" : "s"}`).join(", ")}. The node-link view shows these colored links spatially, while the matrix makes their district-level blocks easier to compare.`
      )
    )

  findings.append("div")
    .attr("class", "finding-summary")
    .html(`
      <strong>Route type totals</strong>
      ${routeTypeCounts.map(([type, count]) => `${type} ${count}`).join("  ")}
    `)

  const isolated = nodes.filter(d => degree.get(d.id) === 0)

  if (isolated.length > 0) {
    findings.append("div")
      .attr("class", "finding-note")
      .html(`
        <strong>Additional observation</strong>
        ${isolated.map(d => `${d.station_name} (${d.id})`).join(", ")}
        have no direct connections. They appear as unconnected symbols in the node-link view and as empty rows and columns in the matrix.
      `)
  }
}

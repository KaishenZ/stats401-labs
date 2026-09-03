// Requirement 9 & 10: 动态加载 1,000 条数据并支持双向排序
d3.csv("../data/lab3_data.csv")
    .then(data => {
        const columns = data.columns;
        let sortOrder = {}; // 记录每一列当前的排序方向

        const table = d3.select("#data-table");

        // 1. 渲染表头并添加排序指示
        const header = table
            .select("thead")
            .append("tr");

        header.selectAll("th")
            .data(columns)
            .join("th")
            .text(d => d)
            .attr("title", "Click to sort")
            .on("click", function(event, column) {
                // 当前列排序状态反转
                sortOrder[column] = !sortOrder[column];
                const ascending = sortOrder[column];

                // 检测是否为数值列 (如 price, rating)
                const isNumeric = data.every(d => d[column] !== "" && !isNaN(+d[column]));

                data.sort((a, b) => {
                    const valA = isNumeric ? +a[column] : a[column];
                    const valB = isNumeric ? +b[column] : b[column];

                    return ascending
                        ? d3.ascending(valA, valB)
                        : d3.descending(valA, valB);
                });

                // 更新表头箭头提示
                header.selectAll("th")
                    .text(d => d + (d === column ? (ascending ? " ▲" : " ▼") : ""));

                updateRows();
            });

        // 2. 局部刷新表格行
        function updateRows() {
            const rows = table
                .select("tbody")
                .selectAll("tr")
                .data(data);

            rows.join("tr")
                .selectAll("td")
                .data(row => columns.map(column => row[column]))
                .join("td")
                .text(d => d);
        }

        // 首次加载表格数据
        updateRows();
    })
    .catch(error => {
        console.error("Error loading CSV file:", error);
    });
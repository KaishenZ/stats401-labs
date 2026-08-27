// 1. 打印基础信息
console.log("Hello STATS 401!");

// 2. 基础变量
let course = "STATS 401";
let totalStudents = 40;
console.log(course);
console.log(totalStudents);

// 3. 数组 (D3 常用)
let data = [10, 20, 30, 40, 50];
console.log("Data Array:", data);

// 4. 单个对象
let singleStudent = {
    name: "Alice",
    score: 85
};
console.log(singleStudent.name);
console.log(singleStudent.score);

// 5. 对象数组 (D3 最典型的数据集格式)
let students = [
    { name: "Alice", score: 85 },
    { name: "Bob", score: 72 },
    { name: "Carol", score: 91 }
];
console.log("Students Dataset:", students);

//Task 2: D3 Setup & First Command

// 2.2 验证 D3 加载
console.log("D3 version:", d3.version);

// 2.3 找到 #message 元素并修改其文本
d3.select("#message")
    .text("This text was changed using D3!");

//Task 3: DOM Manipulation & Data Binding

// 3.2 - 3.4 选择元素、修改文本与链式修改样式
d3.select("#title")
    .text("Student Score Visualization")
    .style("color", "steelblue")
    .style("font-size", "28px")
    .style("font-weight", "bold");

// 3.5 动态创建并追加子元素 (append)
const content = d3.select("#content");
content.append("h3")
    .text("My Dataset");
content.append("p")
    .text("The dataset contains student scores.");

// 3.6 核心数据绑定 (Data-Join Pattern)
const numbersData = [10, 20, 30, 40, 50];

d3.select("#numbers")
    .selectAll("p")
    .data(numbersData)
    .join("p")
    .text(d => `Value: ${d}`);


// --- Task 4: SVG & Data-Driven Circles ---

// 4.5 准备数据集
const values = [10, 20, 30, 40, 50];

// 4.4 & 4.5 创建 SVG 画布 (宽 600px，高 200px)
const svg = d3.select("#svg-demo")
    .append("svg")
    .attr("width", 600)
    .attr("height", 200);

// 4.5 使用 Data-Join 模式根据数据动态绘制圆圈
svg.selectAll("circle")
    .data(values)
    .join("circle")
    .attr("cx", (d, i) => 60 + i * 100) // 根据索引 i 计算水平坐标，间隔 100px
    .attr("cy", 100)                   // 垂直居中在 y = 100
    .attr("r", d => d / 2)             // 根据数据值 d 动态设定半径
    .attr("fill", "steelblue");        // 填充钢蓝色

// --- Task 5: Loading External Data ---

async function loadDatasets() {
    try {
        // 5.4 & 5.6 加载 CSV 并将 score 字段转换为数值型 (+d.score)
        const csvData = await d3.csv("data/students.csv", d => ({
            name: d.name,
            score: +d.score
        }));
        console.log("Loaded CSV Data (Formatted):", csvData);
        console.log("First item score type:", typeof csvData[0].score); // 输出: "number"

        // 5.5 加载 JSON 数据（原生支持数值类型）
        const jsonData = await d3.json("data/students.json");
        console.log("Loaded JSON Data:", jsonData);

    } catch (error) {
        console.error("Error loading data:", error);
    }
}

// 执行加载函数
loadDatasets();
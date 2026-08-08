const pptxgen = require("pptxgenjs");

let pres = new pptxgen();
pres.author = "UnoWire";
pres.title = "UnoWire 商业计划书";
pres.company = "UnoWire";

// ============================================================
// SLIDE DIMENSIONS
// ============================================================
pres.layout = "LAYOUT_16x9";
const SLIDE_W = 10;
const SLIDE_H = 5.625;
const MARGIN = 0.5;
const CONTENT_X = MARGIN;
const CONTENT_Y = MARGIN;
const CONTENT_W = SLIDE_W - 2 * MARGIN;
const CONTENT_H = SLIDE_H - 2 * MARGIN;
const CENTER_X = SLIDE_W / 2;
const CENTER_Y = SLIDE_H / 2;

// ============================================================
// CONTAINER SYSTEM
// ============================================================
function createVirtualNode(type, data, parentX, parentY) {
  parentX = parentX || 0;
  parentY = parentY || 0;
  const opts = data.opts || {};
  const node = {
    type: type, data: data,
    absX: parentX + (opts.x || 0),
    absY: parentY + (opts.y || 0),
    w: opts.w || 0, h: opts.h || 0,
    children: []
  };
  node.addShape = function(shapeType, opts2) {
    const child = createVirtualNode("shape", { shapeType: shapeType, opts: opts2 }, node.absX, node.absY);
    node.children.push(child);
    return child;
  };
  node.addText = function(text, opts2) {
    const safeOpts = Object.assign({ fit: "shrink" }, opts2);
    const bulletRe = /^(?:[\u2022\u2023\u25E6\u2043\u2219\u00B7\u25CF\u25CB\u2013\u2014]\s*|\-\s+)/;
    if (Array.isArray(text)) {
      text = text.map(function(item) {
        if (item && item.options && item.options.bullet && typeof item.text === "string") {
          return Object.assign({}, item, { text: item.text.replace(bulletRe, "") });
        }
        return item;
      });
    }
    const child = createVirtualNode("text", { text: text, opts: safeOpts }, node.absX, node.absY);
    node.children.push(child);
    return child;
  };
  node.addImage = function(opts2) {
    const child = createVirtualNode("image", { opts: opts2 }, node.absX, node.absY);
    node.children.push(child);
    return child;
  };
  node.addTable = function(tableData, opts2) {
    const child = createVirtualNode("table", { tableData: tableData, opts: opts2 }, node.absX, node.absY);
    node.children.push(child);
    return child;
  };
  return node;
}

function flattenNode(node, realSlide, pres) {
  const absOpts = Object.assign({}, node.data.opts, { x: node.absX, y: node.absY });
  if (node.type === "shape") realSlide.addShape(node.data.shapeType, absOpts);
  else if (node.type === "text") realSlide.addText(node.data.text, absOpts);
  else if (node.type === "image") realSlide.addImage(absOpts);
  else if (node.type === "table") realSlide.addTable(node.data.tableData, absOpts);
  node.children.forEach(function(child) { flattenNode(child, realSlide, pres); });
}

var originalAddSlide = pres.addSlide.bind(pres);
pres.addSlide = function(options) {
  const realSlide = originalAddSlide(options);
  const virtualSlide = {
    children: [],
    _realSlide: realSlide,
    set background(val) { realSlide.background = val; },
    get background() { return realSlide.background; },
    addShape: function(shapeType, opts2) {
      opts2 = opts2 || {};
      const node = createVirtualNode("shape", { shapeType: shapeType, opts: opts2 }, 0, 0);
      this.children.push(node);
      return node;
    },
    addText: function(text, opts2) {
      opts2 = opts2 || {};
      const safeOpts = Object.assign({ fit: "shrink" }, opts2);
      const node = createVirtualNode("text", { text: text, opts: safeOpts }, 0, 0);
      this.children.push(node);
      return node;
    },
    addImage: function(opts2) {
      opts2 = opts2 || {};
      const node = createVirtualNode("image", { opts: opts2 }, 0, 0);
      this.children.push(node);
      return node;
    },
    addTable: function(tableData, opts2) {
      opts2 = opts2 || {};
      const node = createVirtualNode("table", { tableData: tableData, opts: opts2 }, 0, 0);
      this.children.push(node);
      return node;
    },
    addChart: function(chartType, data, opts2) {
      opts2 = opts2 || {};
      realSlide.addChart(chartType, data, opts2);
    },
    render: function() {
      this.children.forEach(function(child) { flattenNode(child, realSlide, pres); });
    }
  };
  return virtualSlide;
};

// ============================================================
// DESIGN SYSTEM — Ocean Blue (matches HTML report)
// ============================================================
const C = {
  primary: "1A5694",      // deep blue
  primaryDark: "0F3A5F",  // darker blue
  secondary: "0E7C5A",    // green accent
  accent: "2563A8",       // lighter blue
  bg: "F7F9FC",           // light bg
  bg2: "FFFFFF",          // white
  ink: "1A2332",          // near-black
  muted: "64748B",        // gray
  rule: "E2E8F0",         // light border
  lightBlue: "E8F0F9",
  lightGreen: "E6F4EF",
  gold: "C4A35A",
};

const FONT_TITLE = "Georgia";
const FONT_BODY = "Calibri";
const TITLE_SIZE = 32;
const TITLE_SPACING = 1.5;

// Helper: add standard slide title bar
function addTitleBar(slide, num, title) {
  // Left accent bar
  slide.addShape(pres.shapes.RECTANGLE, {
    x: CONTENT_X, y: 0.28, w: 0.08, h: 0.62,
    fill: { color: C.primary }, line: { type: "none" }
  });
  // Section number + title combined to avoid overlap
  slide.addText([
    { text: num + "  ", options: { fontSize: 10, fontFace: "Consolas", color: C.primary, bold: true, charSpacing: 0.5 } },
    { text: title, options: { fontSize: TITLE_SIZE, fontFace: FONT_TITLE, color: C.ink, bold: true, charSpacing: TITLE_SPACING } },
  ], {
    x: CONTENT_X + 0.2, y: 0.3, w: CONTENT_W - 0.2, h: 0.6,
    margin: 0, align: "left", valign: "middle"
  });
}

// ============================================================
// SLIDE 1: Cover
// ============================================================
(function() {
  let slide = pres.addSlide();
  slide.background = { color: C.primaryDark };

  // Decorative gradient-like shapes
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: SLIDE_W, h: SLIDE_H,
    fill: { color: C.primary, transparency: 50 }, line: { type: "none" }
  });

  // Accent line
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 1.0, y: 1.8, w: 2.0, h: 0.06,
    fill: { color: C.secondary }, line: { type: "none" }
  });

  // Logo
  slide.addText("UnoWire", {
    x: 1.0, y: 1.0, w: 8, h: 0.8,
    fontSize: 48, fontFace: FONT_TITLE, color: "FFFFFF", bold: true,
    charSpacing: 2.5, margin: 0, align: "left", valign: "middle"
  });

  // Tagline
  slide.addText("全球线缆与连接器 B2B 平台", {
    x: 1.0, y: 2.0, w: 8, h: 0.5,
    fontSize: 20, fontFace: FONT_TITLE, color: "FFFFFF",
    charSpacing: 1, margin: 0, align: "left", valign: "middle",
    transparency: 15
  });

  // Doc title
  slide.addText("商业计划书", {
    x: 1.0, y: 2.8, w: 8, h: 0.7,
    fontSize: 36, fontFace: FONT_TITLE, color: "FFFFFF", bold: true,
    charSpacing: 2, margin: 0, align: "left", valign: "middle"
  });

  // Meta info
  slide.addText("2026 年 8 月  |  V1.0  |  机密", {
    x: 1.0, y: 4.5, w: 8, h: 0.4,
    fontSize: 12, fontFace: FONT_BODY, color: "FFFFFF",
    charSpacing: 1, margin: 0, align: "left", valign: "middle",
    transparency: 30
  });

  slide.render();
})();

// ============================================================
// SLIDE 2: Table of Contents
// ============================================================
(function() {
  let slide = pres.addSlide();
  slide.background = { color: C.bg2 };

  // Title
  slide.addText("目录", {
    x: CONTENT_X, y: 0.35, w: CONTENT_W, h: 0.5,
    fontSize: 28, fontFace: FONT_TITLE, color: C.ink, bold: true,
    charSpacing: 2.5, margin: 0, align: "left", valign: "middle"
  });

  // Underline accent
  slide.addShape(pres.shapes.RECTANGLE, {
    x: CONTENT_X, y: 0.9, w: 1.5, h: 0.04,
    fill: { color: C.primary }, line: { type: "none" }
  });

  var items = [
    { num: "01", title: "执行摘要" },
    { num: "02", title: "公司概述" },
    { num: "03", title: "市场分析" },
    { num: "04", title: "产品与服务" },
    { num: "05", title: "商业模式" },
    { num: "06", title: "技术架构" },
    { num: "07", title: "市场策略" },
    { num: "08", title: "运营计划" },
    { num: "09", title: "财务计划" },
    { num: "10", title: "风险与对策" },
  ];

  var colW = 4.2;
  var startX1 = CONTENT_X;
  var startX2 = CONTENT_X + colW + 0.6;
  var startY = 1.3;
  var rowH = 0.72;

  items.forEach(function(item, i) {
    var col = i < 5 ? 0 : 1;
    var row = i % 5;
    var x = col === 0 ? startX1 : startX2;
    var y = startY + row * rowH;

    // Number
    slide.addText(item.num, {
      x: x, y: y, w: 0.55, h: 0.45,
      fontSize: 14, fontFace: "Consolas", color: C.primary, bold: true,
      charSpacing: 0.5, margin: 0, align: "left", valign: "middle"
    });
    // Title
    slide.addText(item.title, {
      x: x + 0.6, y: y, w: colW - 0.6, h: 0.45,
      fontSize: 15, fontFace: FONT_BODY, color: C.ink,
      margin: 0, align: "left", valign: "middle"
    });
  });

  slide.render();
})();

// ============================================================
// SLIDE 3: Executive Summary
// ============================================================
(function() {
  let slide = pres.addSlide();
  slide.background = { color: C.bg2 };
  addTitleBar(slide, "01", "执行摘要");

  // Intro text
  slide.addText(
    "UnoWire 是面向全球线缆与连接器行业的 B2B 平台，通过结构化产品目录、厂商自助 Portal 和智能匹配引擎，连接制造商与采购方。",
    {
      x: CONTENT_X, y: 1.2, w: CONTENT_W, h: 0.6,
      fontSize: 14, fontFace: FONT_BODY, color: C.muted, margin: 0, align: "left", valign: "top",
      autoFit: false, fit: "none"
    }
  );

  // Metric cards
  var metrics = [
    { value: "4,223 亿", label: "2024 全球线缆市场（美元）", color: C.primary },
    { value: "4.3%", label: "市场复合年增长率", color: C.secondary },
    { value: "3 大", label: "产品模块", color: C.accent },
    { value: "45+", label: "API 路由模块", color: C.gold },
  ];

  var cardW = (CONTENT_W - 0.6) / 4;
  var cardY = 2.0;
  var cardH = 1.3;

  metrics.forEach(function(m, i) {
    var cx = CONTENT_X + i * (cardW + 0.2);
    // Card bg
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: cx, y: cardY, w: cardW, h: cardH,
      fill: { color: C.bg }, line: { color: C.rule, width: 1 },
      rectRadius: 0.08
    });
    // Value
    slide.addText(m.value, {
      x: cx, y: cardY + 0.2, w: cardW, h: 0.55,
      fontSize: 24, fontFace: FONT_TITLE, color: m.color, bold: true,
      charSpacing: 0.5, margin: 0, align: "center", valign: "middle"
    });
    // Label
    slide.addText(m.label, {
      x: cx, y: cardY + 0.75, w: cardW, h: 0.45,
      fontSize: 10, fontFace: FONT_BODY, color: C.muted,
      margin: 0, align: "center", valign: "top"
    });
  });

  // Funding highlight
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: CONTENT_X, y: 3.7, w: CONTENT_W, h: 1.2,
    fill: { color: C.lightBlue }, line: { type: "none" },
    rectRadius: 0.06
  });
  slide.addShape(pres.shapes.RECTANGLE, {
    x: CONTENT_X, y: 3.7, w: 0.08, h: 1.2,
    fill: { color: C.primary }, line: { type: "none" }
  });
  slide.addText([
    { text: "融资需求：", options: { fontSize: 14, fontFace: FONT_BODY, color: C.ink, bold: true } },
    { text: "300 万元天使轮", options: { fontSize: 14, fontFace: FONT_BODY, color: C.primary, bold: true } },
    { text: "（出让 15% 股权，投后估值 2,000 万元）", options: { fontSize: 12, fontFace: FONT_BODY, color: C.muted, breakLine: true } },
    { text: "用于平台上线运营、首批制造商拓展和市场营销启动，预计第 18 个月实现盈亏平衡", options: { fontSize: 12, fontFace: FONT_BODY, color: C.muted } },
  ], {
    x: CONTENT_X + 0.25, y: 3.82, w: CONTENT_W - 0.4, h: 1.0,
    margin: 0, align: "left", valign: "middle", autoFit: false, fit: "none"
  });

  slide.render();
})();

// ============================================================
// SLIDE 4: Company Overview
// ============================================================
(function() {
  let slide = pres.addSlide();
  slide.background = { color: C.bg2 };
  addTitleBar(slide, "02", "公司概述");

  // Mission
  slide.addText("使命与愿景", {
    x: CONTENT_X, y: 1.2, w: CONTENT_W, h: 0.35,
    fontSize: 16, fontFace: FONT_TITLE, color: C.primary, bold: true,
    charSpacing: 1, margin: 0
  });
  slide.addText(
    "构建全球线缆行业的数字化贸易基础设施，成为线缆与连接器行业的领先 B2B 平台。",
    {
      x: CONTENT_X, y: 1.6, w: CONTENT_W, h: 0.5,
      fontSize: 13, fontFace: FONT_BODY, color: C.ink, margin: 0, autoFit: false, fit: "none"
    }
  );

  // Four user systems
  slide.addText("四大用户系统", {
    x: CONTENT_X, y: 2.25, w: CONTENT_W, h: 0.35,
    fontSize: 16, fontFace: FONT_TITLE, color: C.primary, bold: true,
    charSpacing: 1, margin: 0
  });

  var systems = [
    { name: "公开站点", desc: "线缆目录、设备推荐、厂商主页、询盘提交", color: C.primary },
    { name: "管理后台", desc: "全量 CRUD、RBAC 权限、菜单配置、CMS", color: C.secondary },
    { name: "工厂 Portal", desc: "制造商自助管理产品、回复询盘、媒体管理", color: C.accent },
    { name: "会员系统", desc: "个人资料、询盘收件箱、消息通知", color: C.gold },
  ];

  var sCardW = (CONTENT_W - 0.6) / 4;
  var sCardY = 2.7;
  var sCardH = 1.9;

  systems.forEach(function(s, i) {
    var cx = CONTENT_X + i * (sCardW + 0.2);
    // Card
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: cx, y: sCardY, w: sCardW, h: sCardH,
      fill: { color: C.bg }, line: { color: C.rule, width: 1 },
      rectRadius: 0.08
    });
    // Top accent
    slide.addShape(pres.shapes.RECTANGLE, {
      x: cx, y: sCardY, w: sCardW, h: 0.06,
      fill: { color: s.color }, line: { type: "none" }
    });
    // Name
    slide.addText(s.name, {
      x: cx + 0.15, y: sCardY + 0.2, w: sCardW - 0.3, h: 0.4,
      fontSize: 13, fontFace: FONT_BODY, color: C.ink, bold: true,
      margin: 0, align: "left", valign: "middle"
    });
    // Desc
    slide.addText(s.desc, {
      x: cx + 0.15, y: sCardY + 0.65, w: sCardW - 0.3, h: 1.1,
      fontSize: 10, fontFace: FONT_BODY, color: C.muted,
      margin: 0, align: "left", valign: "top", autoFit: false, fit: "none"
    });
  });

  slide.render();
})();

// ============================================================
// SLIDE 5: Market Analysis
// ============================================================
(function() {
  let slide = pres.addSlide();
  slide.background = { color: C.bg2 };
  addTitleBar(slide, "03", "市场分析");

  // Left: market data text
  slide.addText("全球线缆市场规模", {
    x: CONTENT_X, y: 1.2, w: 4.0, h: 0.35,
    fontSize: 15, fontFace: FONT_TITLE, color: C.primary, bold: true,
    charSpacing: 1, margin: 0
  });

  slide.addText([
    { text: "2024 年全球电缆线市场总收入 ", options: { fontSize: 13, color: C.ink } },
    { text: "4,223 亿美元", options: { fontSize: 13, color: C.primary, bold: true, breakLine: true } },
    { text: "预计 2031 年达到 ", options: { fontSize: 13, color: C.ink } },
    { text: "5,696 亿美元", options: { fontSize: 13, color: C.primary, bold: true, breakLine: true } },
    { text: "复合年增长率 ", options: { fontSize: 13, color: C.ink } },
    { text: "4.3%", options: { fontSize: 13, color: C.secondary, bold: true } },
  ], {
    x: CONTENT_X, y: 1.6, w: 4.0, h: 1.2,
    fontFace: FONT_BODY, margin: 0, align: "left", valign: "top", autoFit: false, fit: "none"
  });

  // Growth drivers
  slide.addText("增长驱动力", {
    x: CONTENT_X, y: 2.95, w: 4.0, h: 0.35,
    fontSize: 15, fontFace: FONT_TITLE, color: C.primary, bold: true,
    charSpacing: 1, margin: 0
  });

  slide.addText([
    { text: "AI 数据中心建设潮", options: { bullet: true, breakLine: true, fontSize: 11, color: C.ink } },
    { text: "全球能源转型与可再生能源", options: { bullet: true, breakLine: true, fontSize: 11, color: C.ink } },
    { text: "电动汽车充电网络", options: { bullet: true, breakLine: true, fontSize: 11, color: C.ink } },
    { text: "5G 网络部署", options: { bullet: true, breakLine: true, fontSize: 11, color: C.ink } },
    { text: "工业自动化升级", options: { bullet: true, fontSize: 11, color: C.ink } },
  ], {
    x: CONTENT_X, y: 3.3, w: 4.0, h: 1.8,
    fontFace: FONT_BODY, margin: 0, align: "left", valign: "top", autoFit: false, fit: "none"
  });

  // Right: chart
  slide.addChart(pres.charts.LINE, [{
    name: "市场规模（亿美元）",
    labels: ["2024", "2025", "2026", "2027", "2028", "2029", "2030", "2031"],
    values: [4223, 4405, 4594, 4791, 4997, 5212, 5436, 5696]
  }], {
    x: 4.8, y: 1.2, w: 4.7, h: 3.9,
    showTitle: true, title: "全球线缆市场规模预测",
    titleColor: C.ink, titleFontFace: FONT_TITLE, titleFontSize: 12,
    chartColors: [C.primary],
    lineSize: 3, lineSmooth: true,
    chartArea: { fill: { color: C.bg2 }, roundedCorners: true },
    catAxisLabelColor: C.muted, catAxisLabelFontSize: 10,
    valAxisLabelColor: C.muted, valAxisLabelFontSize: 10,
    valGridLine: { color: C.rule, size: 0.5 },
    catGridLine: { style: "none" },
    showLegend: false,
    showValue: false,
  });

  slide.render();
})();

// ============================================================
// SLIDE 6: Products & Services
// ============================================================
(function() {
  let slide = pres.addSlide();
  slide.background = { color: C.bg2 };
  addTitleBar(slide, "04", "产品与服务");

  // Three product modules
  slide.addText("三大产品模块", {
    x: CONTENT_X, y: 1.15, w: CONTENT_W, h: 0.3,
    fontSize: 15, fontFace: FONT_TITLE, color: C.primary, bold: true,
    charSpacing: 1, margin: 0
  });

  var modules = [
    { name: "Cable（线缆）", complexity: "高复杂度", features: "多变体规格 + 类型化规格表\n3 级分类体系\n品牌管理 + 批量导入", color: C.primary },
    { name: "Equipment（设备）", complexity: "中复杂度", features: "JSONB 适用规格\n线缆匹配推荐\n2 级自引用分类", color: C.secondary },
    { name: "Terminal（端子接头）", complexity: "中复杂度", features: "与设备结构一致\n线缆匹配接口\n镜像分类体系", color: C.accent },
  ];

  var mCardW = (CONTENT_W - 0.6) / 3;
  var mCardY = 1.55;
  var mCardH = 1.55;

  modules.forEach(function(m, i) {
    var cx = CONTENT_X + i * (mCardW + 0.3);
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: cx, y: mCardY, w: mCardW, h: mCardH,
      fill: { color: C.bg }, line: { color: C.rule, width: 1 },
      rectRadius: 0.08
    });
    slide.addShape(pres.shapes.RECTANGLE, {
      x: cx, y: mCardY, w: mCardW, h: 0.06,
      fill: { color: m.color }, line: { type: "none" }
    });
    slide.addText(m.name, {
      x: cx + 0.15, y: mCardY + 0.15, w: mCardW - 0.3, h: 0.3,
      fontSize: 12, fontFace: FONT_BODY, color: C.ink, bold: true,
      margin: 0, align: "left", valign: "middle"
    });
    slide.addText(m.complexity, {
      x: cx + 0.15, y: mCardY + 0.45, w: mCardW - 0.3, h: 0.2,
      fontSize: 9, fontFace: FONT_BODY, color: m.color, bold: true,
      margin: 0, align: "left", valign: "middle"
    });
    slide.addText(m.features, {
      x: cx + 0.15, y: mCardY + 0.7, w: mCardW - 0.3, h: 0.8,
      fontSize: 10, fontFace: FONT_BODY, color: C.muted,
      margin: 0, align: "left", valign: "top", autoFit: false, fit: "none"
    });
  });

  // Core features
  slide.addText("核心功能", {
    x: CONTENT_X, y: 3.35, w: CONTENT_W, h: 0.3,
    fontSize: 15, fontFace: FONT_TITLE, color: C.primary, bold: true,
    charSpacing: 1, margin: 0
  });

  var features = [
    "厂商认领系统 — 公开搜索 + 申请 + 审核闭环",
    "询盘与消息 — 双向沟通 + 未读计数 + 邮件通知",
    "设备智能匹配 — 基于线缆规格自动推荐配套设备",
    "批量导入 — CSV/JSON 模板 + 预览校验",
    "RBAC 权限 — 15 模块 + 制造商作用域数据隔离",
    "媒体管理 — 文件夹树 + 图片上传 + Docker 卷存储",
  ];

  features.forEach(function(f, i) {
    var col = i % 2;
    var row = Math.floor(i / 2);
    var fx = CONTENT_X + col * (CONTENT_W / 2);
    var fy = 3.7 + row * 0.4;

    slide.addShape(pres.shapes.OVAL, {
      x: fx + 0.05, y: fy + 0.08, w: 0.12, h: 0.12,
      fill: { color: C.secondary }, line: { type: "none" }
    });
    slide.addText(f, {
      x: fx + 0.3, y: fy, w: CONTENT_W / 2 - 0.35, h: 0.35,
      fontSize: 10, fontFace: FONT_BODY, color: C.ink,
      margin: 0, align: "left", valign: "middle"
    });
  });

  slide.render();
})();

// ============================================================
// SLIDE 7: Business Model
// ============================================================
(function() {
  let slide = pres.addSlide();
  slide.background = { color: C.bg2 };
  addTitleBar(slide, "05", "商业模式");

  // Value proposition
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: CONTENT_X, y: 1.15, w: CONTENT_W, h: 0.65,
    fill: { color: C.lightBlue }, line: { type: "none" },
    rectRadius: 0.06
  });
  slide.addShape(pres.shapes.RECTANGLE, {
    x: CONTENT_X, y: 1.15, w: 0.08, h: 0.65,
    fill: { color: C.primary }, line: { type: "none" }
  });
  slide.addText([
    { text: "核心价值：", options: { bold: true, color: C.primary } },
    { text: "结构化产品数据库 + 自助管理工具 + 精准匹配引擎，三位一体的线缆行业 B2B 平台", options: { color: C.ink } },
  ], {
    x: CONTENT_X + 0.25, y: 1.15, w: CONTENT_W - 0.4, h: 0.65,
    fontSize: 12, fontFace: FONT_BODY, margin: 0, align: "left", valign: "middle",
    autoFit: false, fit: "none"
  });

  // Revenue streams table
  slide.addText("六大收入来源", {
    x: CONTENT_X, y: 2.0, w: CONTENT_W, h: 0.3,
    fontSize: 14, fontFace: FONT_TITLE, color: C.primary, bold: true,
    charSpacing: 1, margin: 0
  });

  var tableData = [
    [
      { text: "收入来源", options: { fill: { color: C.primary }, color: "FFFFFF", bold: true, fontSize: 10, fontFace: FONT_BODY, align: "left" } },
      { text: "定价模式", options: { fill: { color: C.primary }, color: "FFFFFF", bold: true, fontSize: 10, fontFace: FONT_BODY, align: "left" } },
      { text: "启动时间", options: { fill: { color: C.primary }, color: "FFFFFF", bold: true, fontSize: 10, fontFace: FONT_BODY, align: "left" } },
    ],
    [
      { text: "Portal 订阅", options: { fontSize: 10, color: C.ink, fontFace: FONT_BODY } },
      { text: "年费制：基础/专业/企业版", options: { fontSize: 10, color: C.muted, fontFace: FONT_BODY } },
      { text: "第 6 个月", options: { fontSize: 10, color: C.muted, fontFace: FONT_BODY } },
    ],
    [
      { text: "优先展示", options: { fontSize: 10, color: C.ink, fontFace: FONT_BODY } },
      { text: "按点击付费（CPC）或排位费", options: { fontSize: 10, color: C.muted, fontFace: FONT_BODY } },
      { text: "第 9 个月", options: { fontSize: 10, color: C.muted, fontFace: FONT_BODY } },
    ],
    [
      { text: "询盘撮合费", options: { fontSize: 10, color: C.ink, fontFace: FONT_BODY } },
      { text: "成功订单佣金 3-5%", options: { fontSize: 10, color: C.muted, fontFace: FONT_BODY } },
      { text: "第 12 个月", options: { fontSize: 10, color: C.muted, fontFace: FONT_BODY } },
    ],
    [
      { text: "认证标识", options: { fontSize: 10, color: C.ink, fontFace: FONT_BODY } },
      { text: "年费制，「已验证制造商」徽章", options: { fontSize: 10, color: C.muted, fontFace: FONT_BODY } },
      { text: "第 9 个月", options: { fontSize: 10, color: C.muted, fontFace: FONT_BODY } },
    ],
    [
      { text: "广告位 + 数据报告", options: { fontSize: 10, color: C.ink, fontFace: FONT_BODY } },
      { text: "月费横幅 / 按报告付费", options: { fontSize: 10, color: C.muted, fontFace: FONT_BODY } },
      { text: "第 12-18 个月", options: { fontSize: 10, color: C.muted, fontFace: FONT_BODY } },
    ],
  ];

  slide.addTable(tableData, {
    x: CONTENT_X, y: 2.35, w: CONTENT_W,
    colW: [2.5, 4.5, 2.0],
    border: { pt: 0.5, color: C.rule },
    fill: { color: C.bg2 },
    rowH: 0.4,
    fontFace: FONT_BODY,
  });

  // Pricing tiers
  slide.addText("定价策略", {
    x: CONTENT_X, y: 4.6, w: CONTENT_W, h: 0.3,
    fontSize: 14, fontFace: FONT_TITLE, color: C.primary, bold: true,
    charSpacing: 1, margin: 0
  });

  var tiers = [
    { name: "基础版（免费）", price: "¥0", target: "≤20 产品", color: C.muted },
    { name: "专业版", price: "¥9,800/年", target: "≤500 产品 + 批量导入", color: C.secondary },
    { name: "企业版", price: "¥29,800/年", target: "不限 + API + 多用户", color: C.primary },
  ];

  var tCardW = (CONTENT_W - 0.6) / 3;
  var tCardY = 4.95;

  tiers.forEach(function(t, i) {
    var cx = CONTENT_X + i * (tCardW + 0.3);
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: cx, y: tCardY, w: tCardW, h: 0.55,
      fill: { color: C.bg }, line: { color: C.rule, width: 1 },
      rectRadius: 0.08
    });
    slide.addText([
      { text: t.name + "  ", options: { fontSize: 10, color: C.ink, bold: true } },
      { text: t.price, options: { fontSize: 10, color: t.color, bold: true } },
    ], {
      x: cx + 0.1, y: tCardY, w: tCardW - 0.2, h: 0.28,
      fontFace: FONT_BODY, margin: 0, align: "left", valign: "middle"
    });
    slide.addText(t.target, {
      x: cx + 0.1, y: tCardY + 0.27, w: tCardW - 0.2, h: 0.25,
      fontSize: 9, fontFace: FONT_BODY, color: C.muted,
      margin: 0, align: "left", valign: "middle"
    });
  });

  slide.render();
})();

// ============================================================
// SLIDE 8: Technology Architecture
// ============================================================
(function() {
  let slide = pres.addSlide();
  slide.background = { color: C.bg2 };
  addTitleBar(slide, "06", "技术架构");

  // Tech stack table
  var stackData = [
    [
      { text: "层级", options: { fill: { color: C.primary }, color: "FFFFFF", bold: true, fontSize: 10, fontFace: FONT_BODY, align: "left" } },
      { text: "技术", options: { fill: { color: C.primary }, color: "FFFFFF", bold: true, fontSize: 10, fontFace: FONT_BODY, align: "left" } },
      { text: "选型理由", options: { fill: { color: C.primary }, color: "FFFFFF", bold: true, fontSize: 10, fontFace: FONT_BODY, align: "left" } },
    ],
    [
      { text: "前端", options: { fontSize: 10, color: C.ink, fontFace: FONT_BODY, bold: true } },
      { text: "Next.js 16 + React 19 + TypeScript 5", options: { fontSize: 10, color: C.muted, fontFace: FONT_BODY } },
      { text: "App Router SSR/ISR + SEO 友好", options: { fontSize: 10, color: C.muted, fontFace: FONT_BODY } },
    ],
    [
      { text: "后端", options: { fontSize: 10, color: C.ink, fontFace: FONT_BODY, bold: true } },
      { text: "FastAPI 0.115 + SQLAlchemy 2.0 (async)", options: { fontSize: 10, color: C.muted, fontFace: FONT_BODY } },
      { text: "异步高性能 + 自动 OpenAPI 文档", options: { fontSize: 10, color: C.muted, fontFace: FONT_BODY } },
    ],
    [
      { text: "数据库", options: { fontSize: 10, color: C.ink, fontFace: FONT_BODY, bold: true } },
      { text: "PostgreSQL 16 (asyncpg)", options: { fontSize: 10, color: C.muted, fontFace: FONT_BODY } },
      { text: "JSONB 支持 + 全文搜索 + ACID", options: { fontSize: 10, color: C.muted, fontFace: FONT_BODY } },
    ],
    [
      { text: "认证", options: { fontSize: 10, color: C.ink, fontFace: FONT_BODY, bold: true } },
      { text: "JWT 三令牌体系", options: { fontSize: 10, color: C.muted, fontFace: FONT_BODY } },
      { text: "员工/Portal/会员独立令牌", options: { fontSize: 10, color: C.muted, fontFace: FONT_BODY } },
    ],
    [
      { text: "部署", options: { fontSize: 10, color: C.ink, fontFace: FONT_BODY, bold: true } },
      { text: "Docker Compose + Nginx", options: { fontSize: 10, color: C.muted, fontFace: FONT_BODY } },
      { text: "一键部署 + 反向代理 + HTTPS", options: { fontSize: 10, color: C.muted, fontFace: FONT_BODY } },
    ],
  ];

  slide.addTable(stackData, {
    x: CONTENT_X, y: 1.2, w: CONTENT_W,
    colW: [1.2, 3.8, 4.0],
    border: { pt: 0.5, color: C.rule },
    fill: { color: C.bg2 },
    rowH: 0.42,
    fontFace: FONT_BODY,
  });

  // Architecture highlights
  slide.addText("架构亮点", {
    x: CONTENT_X, y: 3.95, w: CONTENT_W, h: 0.3,
    fontSize: 14, fontFace: FONT_TITLE, color: C.primary, bold: true,
    charSpacing: 1, margin: 0
  });

  var highlights = [
    { title: "BFF 代理模式", desc: "http-only cookie 转 Bearer，令牌不暴露于浏览器 JS" },
    { title: "多租户数据隔离", desc: "scope_type + scope_id 实现制造商间数据隔离" },
    { title: "分层 API 客户端", desc: "4 层客户端，针对场景优化缓存策略" },
    { title: "可扩展模块体系", desc: "15 管理模块 + 45 API 路由，支持快速扩展" },
  ];

  var hCardW = (CONTENT_W - 0.6) / 4;
  var hCardY = 4.35;
  var hCardH = 1.1;

  highlights.forEach(function(h, i) {
    var cx = CONTENT_X + i * (hCardW + 0.2);
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: cx, y: hCardY, w: hCardW, h: hCardH,
      fill: { color: C.bg }, line: { color: C.rule, width: 1 },
      rectRadius: 0.08
    });
    slide.addText(h.title, {
      x: cx + 0.12, y: hCardY + 0.12, w: hCardW - 0.24, h: 0.3,
      fontSize: 11, fontFace: FONT_BODY, color: C.primary, bold: true,
      margin: 0, align: "left", valign: "middle"
    });
    slide.addText(h.desc, {
      x: cx + 0.12, y: hCardY + 0.42, w: hCardW - 0.24, h: 0.6,
      fontSize: 9, fontFace: FONT_BODY, color: C.muted,
      margin: 0, align: "left", valign: "top", autoFit: false, fit: "none"
    });
  });

  slide.render();
})();

// ============================================================
// SLIDE 9: Market Strategy
// ============================================================
(function() {
  let slide = pres.addSlide();
  slide.background = { color: C.bg2 };
  addTitleBar(slide, "07", "市场策略");

  // Three-phase cold start
  slide.addText("三阶段冷启动策略", {
    x: CONTENT_X, y: 1.15, w: CONTENT_W, h: 0.3,
    fontSize: 15, fontFace: FONT_TITLE, color: C.primary, bold: true,
    charSpacing: 1, margin: 0
  });

  var phases = [
    {
      time: "第 1-3 个月",
      title: "数据先行",
      desc: "主动导入公开产品数据\n建立 5,000+ 产品目录\n邀请 20-30 家头部制造商免费入驻",
      color: C.primary,
    },
    {
      time: "第 3-6 个月",
      title: "SEO 获客",
      desc: "SSR + JSON-LD 结构化数据\n长尾关键词优化\n目标月均自然流量 20,000 UV",
      color: C.secondary,
    },
    {
      time: "第 6-12 个月",
      title: "厂商认领与付费转化",
      desc: "邀请制造商认领企业主页\n从免费版转化为付费订阅\n目标 200 家活跃 + 30 家付费",
      color: C.accent,
    },
  ];

  // Horizontal flowchart
  var nodeW = 2.6, nodeH = 2.0, hGap = 0.6;
  var totalW = 3 * nodeW + 2 * hGap;
  var startX = (SLIDE_W - totalW) / 2;
  var nodeY = 1.6;
  var nodeShadow = { type: "outer", blur: 4, offset: 2, color: "000000", opacity: 0.15 };

  phases.forEach(function(p, i) {
    var x = startX + i * (nodeW + hGap);

    // Phase card
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: x, y: nodeY, w: nodeW, h: nodeH,
      fill: { color: C.bg }, line: { color: C.rule, width: 1 },
      rectRadius: 0.08, shadow: nodeShadow
    });
    // Top accent
    slide.addShape(pres.shapes.RECTANGLE, {
      x: x, y: nodeY, w: nodeW, h: 0.08,
      fill: { color: p.color }, line: { type: "none" }
    });
    // Time
    slide.addText(p.time, {
      x: x + 0.15, y: nodeY + 0.15, w: nodeW - 0.3, h: 0.25,
      fontSize: 10, fontFace: "Consolas", color: p.color, bold: true,
      margin: 0, align: "left", valign: "middle"
    });
    // Title
    slide.addText(p.title, {
      x: x + 0.15, y: nodeY + 0.42, w: nodeW - 0.3, h: 0.35,
      fontSize: 14, fontFace: FONT_TITLE, color: C.ink, bold: true,
      charSpacing: 0.5, margin: 0, align: "left", valign: "middle"
    });
    // Desc
    slide.addText(p.desc, {
      x: x + 0.15, y: nodeY + 0.8, w: nodeW - 0.3, h: 1.1,
      fontSize: 10, fontFace: FONT_BODY, color: C.muted,
      margin: 0, align: "left", valign: "top", autoFit: false, fit: "none"
    });

    // Arrow between phases
    if (i < phases.length - 1) {
      slide.addShape(pres.shapes.LINE, {
        x: x + nodeW, y: nodeY + nodeH / 2,
        w: hGap, h: 0,
        line: { color: C.muted, width: 2, endArrowType: "triangle" }
      });
    }
  });

  // Competitive moat
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: CONTENT_X, y: 4.0, w: CONTENT_W, h: 1.2,
    fill: { color: C.lightGreen }, line: { type: "none" },
    rectRadius: 0.06
  });
  slide.addShape(pres.shapes.RECTANGLE, {
    x: CONTENT_X, y: 4.0, w: 0.08, h: 1.2,
    fill: { color: C.secondary }, line: { type: "none" }
  });
  slide.addText("竞争壁垒", {
    x: CONTENT_X + 0.25, y: 4.1, w: CONTENT_W - 0.4, h: 0.3,
    fontSize: 13, fontFace: FONT_TITLE, color: C.secondary, bold: true,
    charSpacing: 1, margin: 0, align: "left", valign: "middle"
  });
  slide.addText([
    { text: "结构化数据深度", options: { bold: true, color: C.ink, fontSize: 11 } },
    { text: " — 多变体规格 + 3 级分类，通用平台难以复制    ", options: { color: C.muted, fontSize: 11, breakLine: true } },
    { text: "制造商粘性", options: { bold: true, color: C.ink, fontSize: 11 } },
    { text: " — 产品目录与询盘积累形成高迁移成本    ", options: { color: C.muted, fontSize: 11, breakLine: true } },
    { text: "网络效应", options: { bold: true, color: C.ink, fontSize: 11 } },
    { text: " — 制造商越多 → 采购方越多 → 吸引更多制造商", options: { color: C.muted, fontSize: 11 } },
  ], {
    x: CONTENT_X + 0.25, y: 4.4, w: CONTENT_W - 0.4, h: 0.75,
    fontFace: FONT_BODY, margin: 0, align: "left", valign: "top", autoFit: false, fit: "none"
  });

  slide.render();
})();

// ============================================================
// SLIDE 10: Operations & Roadmap
// ============================================================
(function() {
  let slide = pres.addSlide();
  slide.background = { color: C.bg2 };
  addTitleBar(slide, "08", "运营计划");

  // Team
  slide.addText("团队规划", {
    x: CONTENT_X, y: 1.15, w: 4.0, h: 0.3,
    fontSize: 15, fontFace: FONT_TITLE, color: C.primary, bold: true,
    charSpacing: 1, margin: 0
  });

  var teamData = [
    [
      { text: "角色", options: { fill: { color: C.primary }, color: "FFFFFF", bold: true, fontSize: 9, fontFace: FONT_BODY, align: "left" } },
      { text: "启动", options: { fill: { color: C.primary }, color: "FFFFFF", bold: true, fontSize: 9, fontFace: FONT_BODY, align: "left" } },
    ],
    [{ text: "创始人 / CEO", options: { fontSize: 9, color: C.ink, fontFace: FONT_BODY } }, { text: "已有", options: { fontSize: 9, color: C.secondary, fontFace: FONT_BODY } }],
    [{ text: "全栈工程师", options: { fontSize: 9, color: C.ink, fontFace: FONT_BODY } }, { text: "已有", options: { fontSize: 9, color: C.secondary, fontFace: FONT_BODY } }],
    [{ text: "运营经理", options: { fontSize: 9, color: C.ink, fontFace: FONT_BODY } }, { text: "第 2 月", options: { fontSize: 9, color: C.muted, fontFace: FONT_BODY } }],
    [{ text: "内容/SEO 专员", options: { fontSize: 9, color: C.ink, fontFace: FONT_BODY } }, { text: "第 3 月", options: { fontSize: 9, color: C.muted, fontFace: FONT_BODY } }],
    [{ text: "销售代表 x2", options: { fontSize: 9, color: C.ink, fontFace: FONT_BODY } }, { text: "第 6 月", options: { fontSize: 9, color: C.muted, fontFace: FONT_BODY } }],
  ];

  slide.addTable(teamData, {
    x: CONTENT_X, y: 1.5, w: 3.8,
    colW: [2.3, 1.5],
    border: { pt: 0.5, color: C.rule },
    fill: { color: C.bg2 },
    rowH: 0.35,
    fontFace: FONT_BODY,
  });

  // Roadmap
  slide.addText("发展路线图", {
    x: 4.8, y: 1.15, w: 4.7, h: 0.3,
    fontSize: 15, fontFace: FONT_TITLE, color: C.primary, bold: true,
    charSpacing: 1, margin: 0
  });

  var milestones = [
    { time: "Q3 2026", title: "MVP 上线", desc: "三大模块完成 + 种子数据 + 5 家内测" },
    { time: "Q4 2026", title: "公测与冷启动", desc: "5,000+ 产品 + 20 家制造商入驻" },
    { time: "Q1 2027", title: "付费体系上线", desc: "三档定价 + 50 家付费制造商" },
    { time: "Q2 2027", title: "询盘撮合佣金", desc: "月均 1,000+ 询盘 + 佣金收入" },
    { time: "Q3-Q4 2027", title: "规模化与盈利", desc: "500 家制造商 + 月收 30 万 + 盈亏平衡" },
    { time: "2028", title: "国际化与 A 轮", desc: "多语言 + 东南亚 + A 轮融资" },
  ];

  // Timeline
  var tlX = 4.8;
  var tlStartY = 1.55;
  var tlItemH = 0.62;

  // Vertical line
  slide.addShape(pres.shapes.RECTANGLE, {
    x: tlX + 0.5, y: tlStartY + 0.1, w: 0.025, h: milestones.length * tlItemH - 0.2,
    fill: { color: C.rule }, line: { type: "none" }
  });

  milestones.forEach(function(m, i) {
    var y = tlStartY + i * tlItemH;
    // Dot
    slide.addShape(pres.shapes.OVAL, {
      x: tlX + 0.45, y: y + 0.08, w: 0.13, h: 0.13,
      fill: { color: C.primary }, line: { color: C.bg2, width: 1.5 }
    });
    // Time
    slide.addText(m.time, {
      x: tlX + 0.7, y: y, w: 1.4, h: 0.28,
      fontSize: 9, fontFace: "Consolas", color: C.primary, bold: true,
      margin: 0, align: "left", valign: "middle"
    });
    // Title + desc
    slide.addText([
      { text: m.title, options: { fontSize: 10, color: C.ink, bold: true } },
      { text: "  " + m.desc, options: { fontSize: 9, color: C.muted } },
    ], {
      x: tlX + 0.7, y: y + 0.26, w: 4.0, h: 0.3,
      fontFace: FONT_BODY, margin: 0, align: "left", valign: "middle",
      autoFit: false, fit: "none"
    });
  });

  slide.render();
})();

// ============================================================
// SLIDE 11: Financial Plan
// ============================================================
(function() {
  let slide = pres.addSlide();
  slide.background = { color: C.bg2 };
  addTitleBar(slide, "09", "财务计划");

  // Funding
  slide.addText("融资需求：300 万元天使轮（出让 15%，投后估值 2,000 万元）", {
    x: CONTENT_X, y: 1.15, w: CONTENT_W, h: 0.35,
    fontSize: 13, fontFace: FONT_TITLE, color: C.primary, bold: true,
    charSpacing: 0.5, margin: 0, align: "left", valign: "middle"
  });

  // Funding pie chart
  slide.addChart(pres.charts.PIE, [{
    name: "资金用途",
    labels: ["产品研发 40%", "市场推广 30%", "团队薪酬 20%", "服务器 6%", "备用金 4%"],
    values: [120, 90, 60, 18, 12]
  }], {
    x: 0.3, y: 1.55, w: 4.5, h: 3.3,
    showTitle: true, title: "资金用途分配（万元）",
    titleColor: C.ink, titleFontFace: FONT_TITLE, titleFontSize: 11,
    chartColors: [C.primary, C.secondary, "7C8DB5", C.gold, "B0B8C4"],
    showPercent: false,
    showLegend: true,
    legendPos: "b",
    legendColor: C.muted,
    legendFontSize: 9,
    dataLabelColor: "FFFFFF",
    dataLabelFontSize: 10,
    dataLabelFontBold: true,
    showValue: true,
  });

  // Revenue projection bar chart
  slide.addChart(pres.charts.BAR, [
    { name: "Portal 订阅", labels: ["2027", "2028", "2029"], values: [30, 150, 400] },
    { name: "优先展示", labels: ["2027", "2028", "2029"], values: [10, 60, 180] },
    { name: "询盘佣金", labels: ["2027", "2028", "2029"], values: [0, 40, 150] },
    { name: "其他", labels: ["2027", "2028", "2029"], values: [5, 50, 190] },
  ], {
    x: 5.0, y: 1.55, w: 4.7, h: 3.3,
    showTitle: true, title: "三年收入预测（万元）",
    titleColor: C.ink, titleFontFace: FONT_TITLE, titleFontSize: 11,
    barDir: "col",
    chartColors: [C.primary, C.secondary, "5B9BD5", C.gold],
    chartArea: { fill: { color: C.bg2 }, roundedCorners: true },
    catAxisLabelColor: C.muted, catAxisLabelFontSize: 10,
    valAxisLabelColor: C.muted, valAxisLabelFontSize: 9,
    valGridLine: { color: C.rule, size: 0.5 },
    catGridLine: { style: "none" },
    showLegend: true,
    legendPos: "b",
    legendColor: C.muted,
    legendFontSize: 9,
    showValue: false,
    barGapWidthPct: 50,
  });

  // Break-even note
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: CONTENT_X, y: 5.0, w: CONTENT_W, h: 0.5,
    fill: { color: C.lightGreen }, line: { type: "none" },
    rectRadius: 0.06
  });
  slide.addShape(pres.shapes.RECTANGLE, {
    x: CONTENT_X, y: 5.0, w: 0.08, h: 0.5,
    fill: { color: C.secondary }, line: { type: "none" }
  });
  slide.addText([
    { text: "盈亏平衡：", options: { bold: true, color: C.secondary, fontSize: 11 } },
    { text: "预计 2028 年 Q3 实现月度盈亏平衡，2029 年全年净利润约 430 万元，净利润率 47%", options: { color: C.ink, fontSize: 11 } },
  ], {
    x: CONTENT_X + 0.25, y: 5.0, w: CONTENT_W - 0.4, h: 0.5,
    fontFace: FONT_BODY, margin: 0, align: "left", valign: "middle",
    autoFit: false, fit: "none"
  });

  slide.render();
})();

// ============================================================
// SLIDE 12: Risk Analysis
// ============================================================
(function() {
  let slide = pres.addSlide();
  slide.background = { color: C.bg2 };
  addTitleBar(slide, "10", "风险与对策");

  var riskData = [
    [
      { text: "风险", options: { fill: { color: C.primary }, color: "FFFFFF", bold: true, fontSize: 10, fontFace: FONT_BODY, align: "left" } },
      { text: "等级", options: { fill: { color: C.primary }, color: "FFFFFF", bold: true, fontSize: 10, fontFace: FONT_BODY, align: "center" } },
      { text: "应对策略", options: { fill: { color: C.primary }, color: "FFFFFF", bold: true, fontSize: 10, fontFace: FONT_BODY, align: "left" } },
    ],
    [
      { text: "制造商入驻意愿低", options: { fontSize: 10, color: C.ink, fontFace: FONT_BODY, bold: true } },
      { text: "高", options: { fontSize: 10, color: "DC2626", fontFace: FONT_BODY, bold: true, align: "center" } },
      { text: "前 50 家免费入驻 + 数据录入服务；SEO 先吸流量再反引制造商", options: { fontSize: 10, color: C.muted, fontFace: FONT_BODY } },
    ],
    [
      { text: "综合 B2B 平台推出垂直频道", options: { fontSize: 10, color: C.ink, fontFace: FONT_BODY, bold: true } },
      { text: "中", options: { fontSize: 10, color: C.gold, fontFace: FONT_BODY, bold: true, align: "center" } },
      { text: "深耕结构化数据深度；Portal 系统提高迁移成本", options: { fontSize: 10, color: C.muted, fontFace: FONT_BODY } },
    ],
    [
      { text: "平台性能瓶颈", options: { fontSize: 10, color: C.ink, fontFace: FONT_BODY, bold: true } },
      { text: "中", options: { fontSize: 10, color: C.gold, fontFace: FONT_BODY, bold: true, align: "center" } },
      { text: "异步架构 + SSR 缓存 + CDN；PostgreSQL 读写分离 + Docker 水平扩展", options: { fontSize: 10, color: C.muted, fontFace: FONT_BODY } },
    ],
    [
      { text: "跨境数据合规（GDPR 等）", options: { fontSize: 10, color: C.ink, fontFace: FONT_BODY, bold: true } },
      { text: "中", options: { fontSize: 10, color: C.gold, fontFace: FONT_BODY, bold: true, align: "center" } },
      { text: "数据存储于合规云区域；Cookie 令牌不含敏感信息；最小化收集", options: { fontSize: 10, color: C.muted, fontFace: FONT_BODY } },
    ],
    [
      { text: "现金流断裂", options: { fontSize: 10, color: C.ink, fontFace: FONT_BODY, bold: true } },
      { text: "高", options: { fontSize: 10, color: "DC2626", fontFace: FONT_BODY, bold: true, align: "center" } },
      { text: "保持 6 个月现金储备；分阶段投入推广；根据转化动态调整", options: { fontSize: 10, color: C.muted, fontFace: FONT_BODY } },
    ],
    [
      { text: "行业+技术复合人才稀缺", options: { fontSize: 10, color: C.ink, fontFace: FONT_BODY, bold: true } },
      { text: "低", options: { fontSize: 10, color: C.secondary, fontFace: FONT_BODY, bold: true, align: "center" } },
      { text: "创始人双重背景；远程协作扩大人才池；行业顾问网络", options: { fontSize: 10, color: C.muted, fontFace: FONT_BODY } },
    ],
  ];

  slide.addTable(riskData, {
    x: CONTENT_X, y: 1.2, w: CONTENT_W,
    colW: [2.8, 0.7, 5.5],
    border: { pt: 0.5, color: C.rule },
    fill: { color: C.bg2 },
    rowH: 0.5,
    fontFace: FONT_BODY,
  });

  // Summary
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: CONTENT_X, y: 4.9, w: CONTENT_W, h: 0.6,
    fill: { color: C.lightBlue }, line: { type: "none" },
    rectRadius: 0.06
  });
  slide.addShape(pres.shapes.RECTANGLE, {
    x: CONTENT_X, y: 4.9, w: 0.08, h: 0.6,
    fill: { color: C.primary }, line: { type: "none" }
  });
  slide.addText([
    { text: "总结：", options: { bold: true, color: C.primary, fontSize: 11 } },
    { text: "UnoWire 立足 4,000 亿美元全球市场，MVP 已完成，通过本轮融资将在 18 个月内实现盈亏平衡。", options: { color: C.ink, fontSize: 11 } },
  ], {
    x: CONTENT_X + 0.25, y: 4.9, w: CONTENT_W - 0.4, h: 0.6,
    fontFace: FONT_BODY, margin: 0, align: "left", valign: "middle",
    autoFit: false, fit: "none"
  });

  slide.render();
})();

// ============================================================
// SLIDE 13: Thank You
// ============================================================
(function() {
  let slide = pres.addSlide();
  slide.background = { color: C.primaryDark };

  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: SLIDE_W, h: SLIDE_H,
    fill: { color: C.primary, transparency: 50 }, line: { type: "none" }
  });

  // Accent line
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 3.5, y: 2.0, w: 3.0, h: 0.06,
    fill: { color: C.secondary }, line: { type: "none" }
  });

  slide.addText("感谢聆听", {
    x: 1, y: 2.3, w: 8, h: 1.0,
    fontSize: 44, fontFace: FONT_TITLE, color: "FFFFFF", bold: true,
    charSpacing: 2.5, margin: 0, align: "center", valign: "middle"
  });

  slide.addText("UnoWire — 全球线缆与连接器 B2B 平台", {
    x: 1, y: 3.3, w: 8, h: 0.5,
    fontSize: 16, fontFace: FONT_TITLE, color: "FFFFFF",
    charSpacing: 1, margin: 0, align: "center", valign: "middle",
    transparency: 15
  });

  slide.addText("期待与您携手，共建线缆行业数字贸易新基建", {
    x: 1, y: 4.2, w: 8, h: 0.4,
    fontSize: 13, fontFace: FONT_BODY, color: "FFFFFF",
    margin: 0, align: "center", valign: "middle",
    transparency: 25
  });

  slide.render();
})();

// ============================================================
// SAVE
// ============================================================
pres.writeFile({ fileName: "d:/projects/unowire/docs/UnoWire-Business-Plan.pptx" })
  .then(function() { console.log("PPT saved: d:/projects/unowire/docs/UnoWire-Business-Plan.pptx"); })
  .catch(function(err) { console.error("Error:", err); });

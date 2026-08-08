(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();

  // --- Chart 1: Global Cable Market Size (2024-2031) ---
  var chart1 = echarts.init(document.getElementById('chart-market-size'), null, { renderer: 'svg' });
  chart1.setOption({
    animation: false,
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      formatter: function(params) {
        var p = params[0];
        return p.axisValue + '<br/>' + p.marker + ' ' + p.seriesName + ': <strong>' + p.value + ' 亿美元</strong>';
      }
    },
    grid: { left: '8%', right: '8%', bottom: '10%', top: '15%' },
    xAxis: {
      type: 'category',
      data: ['2024', '2025', '2026', '2027', '2028', '2029', '2030', '2031'],
      axisLine: { lineStyle: { color: rule } },
      axisLabel: { color: muted, fontFamily: 'DM Mono' }
    },
    yAxis: {
      type: 'value',
      name: '亿美元',
      nameTextStyle: { color: muted, fontSize: 12 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: rule, type: 'dashed' } },
      axisLabel: { color: muted, fontFamily: 'DM Mono' }
    },
    series: [{
      name: '全球线缆市场规模',
      type: 'line',
      data: [4223, 4405, 4594, 4791, 4997, 5212, 5436, 5696],
      smooth: true,
      symbol: 'circle',
      symbolSize: 8,
      lineStyle: { color: accent, width: 3 },
      itemStyle: { color: accent },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: accent + '30' },
            { offset: 1, color: accent + '05' }
          ]
        }
      },
      label: {
        show: true,
        position: 'top',
        color: ink,
        fontSize: 11,
        fontFamily: 'DM Mono',
        formatter: function(p) { return p.value; }
      }
    }]
  });
  window.addEventListener('resize', function() { chart1.resize(); });

  // --- Chart 2: Funding Allocation ---
  var chart2 = echarts.init(document.getElementById('chart-funding'), null, { renderer: 'svg' });
  chart2.setOption({
    animation: false,
    tooltip: {
      trigger: 'item',
      appendToBody: true,
      formatter: function(p) {
        return p.name + '<br/>' + p.marker + ' <strong>' + p.value + ' 万元</strong> (' + p.percent + '%)';
      }
    },
    legend: {
      orient: 'vertical',
      right: '5%',
      top: 'center',
      textStyle: { color: muted, fontSize: 13 },
      itemWidth: 14,
      itemHeight: 14
    },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['38%', '50%'],
      avoidLabelOverlap: true,
      label: {
        show: true,
        formatter: '{d}%',
        color: ink,
        fontFamily: 'DM Mono',
        fontSize: 12,
        fontWeight: 700
      },
      labelLine: { show: true, lineStyle: { color: rule } },
      data: [
        { value: 120, name: '产品研发', itemStyle: { color: accent } },
        { value: 90, name: '市场推广', itemStyle: { color: accent2 } },
        { value: 60, name: '团队薪酬', itemStyle: { color: '#7c8db5' } },
        { value: 18, name: '服务器/基础设施', itemStyle: { color: '#c4a35a' } },
        { value: 12, name: '备用金', itemStyle: { color: '#b0b8c4' } }
      ]
    }]
  });
  window.addEventListener('resize', function() { chart2.resize(); });

  // --- Chart 3: 3-Year Revenue Projection ---
  var chart3 = echarts.init(document.getElementById('chart-revenue'), null, { renderer: 'svg' });
  chart3.setOption({
    animation: false,
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      axisPointer: { type: 'shadow' },
      formatter: function(params) {
        var html = params[0].axisValue + ' 年<br/>';
        var total = 0;
        params.forEach(function(p) {
          if (p.value > 0) {
            html += p.marker + ' ' + p.seriesName + ': <strong>' + p.value + ' 万元</strong><br/>';
            total += p.value;
          }
        });
        html += '合计: <strong>' + total + ' 万元</strong>';
        return html;
      }
    },
    legend: {
      top: '2%',
      textStyle: { color: muted, fontSize: 12 },
      itemWidth: 12,
      itemHeight: 12
    },
    grid: { left: '10%', right: '8%', bottom: '10%', top: '18%' },
    xAxis: {
      type: 'category',
      data: ['2027', '2028', '2029'],
      axisLine: { lineStyle: { color: rule } },
      axisLabel: { color: muted, fontFamily: 'DM Mono', fontSize: 13 }
    },
    yAxis: {
      type: 'value',
      name: '万元',
      nameTextStyle: { color: muted, fontSize: 12 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: rule, type: 'dashed' } },
      axisLabel: { color: muted, fontFamily: 'DM Mono' }
    },
    series: [
      { name: 'Portal 订阅', type: 'bar', stack: 'rev', data: [30, 150, 400], itemStyle: { color: accent } },
      { name: '优先展示', type: 'bar', stack: 'rev', data: [10, 60, 180], itemStyle: { color: accent2 } },
      { name: '询盘佣金', type: 'bar', stack: 'rev', data: [0, 40, 150], itemStyle: { color: '#5b9bd5' } },
      { name: '认证标识', type: 'bar', stack: 'rev', data: [5, 25, 80], itemStyle: { color: '#c4a35a' } },
      { name: '广告位', type: 'bar', stack: 'rev', data: [0, 15, 60], itemStyle: { color: '#7c8db5' } },
      { name: '数据报告', type: 'bar', stack: 'rev', data: [0, 10, 50], itemStyle: { color: '#b0b8c4' } },
      {
        name: '合计',
        type: 'line',
        data: [45, 300, 920],
        symbol: 'circle',
        symbolSize: 10,
        lineStyle: { color: ink, width: 2, type: 'dashed' },
        itemStyle: { color: ink },
        label: {
          show: true,
          position: 'top',
          color: ink,
          fontFamily: 'DM Mono',
          fontSize: 13,
          fontWeight: 700,
          formatter: function(p) { return p.value + ' 万'; }
        }
      }
    ]
  });
  window.addEventListener('resize', function() { chart3.resize(); });

  // --- Chart 4: Cost Structure ---
  var chart4 = echarts.init(document.getElementById('chart-cost'), null, { renderer: 'svg' });
  chart4.setOption({
    animation: false,
    tooltip: {
      trigger: 'item',
      appendToBody: true,
      formatter: function(p) {
        return p.name + '<br/>' + p.marker + ' <strong>' + p.value + ' 万元</strong> (' + p.percent + '%)';
      }
    },
    legend: {
      orient: 'vertical',
      right: '5%',
      top: 'center',
      textStyle: { color: muted, fontSize: 13 },
      itemWidth: 14,
      itemHeight: 14
    },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['38%', '50%'],
      avoidLabelOverlap: true,
      label: {
        show: true,
        formatter: '{d}%',
        color: ink,
        fontFamily: 'DM Mono',
        fontSize: 12,
        fontWeight: 700
      },
      labelLine: { show: true, lineStyle: { color: rule } },
      data: [
        { value: 280, name: '团队薪酬', itemStyle: { color: accent } },
        { value: 150, name: '市场推广', itemStyle: { color: accent2 } },
        { value: 35, name: '服务器/基础设施', itemStyle: { color: '#c4a35a' } },
        { value: 25, name: '行政/其他', itemStyle: { color: '#b0b8c4' } }
      ]
    }]
  });
  window.addEventListener('resize', function() { chart4.resize(); });
})();

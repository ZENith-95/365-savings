(function () {
  "use strict";

  const chartState = {
    charts: {},
    initialized: false
  };

  function baseGridColor() {
    return "rgba(255,255,255,0.08)";
  }

  function baseTickColor() {
    return "rgba(245,248,255,0.72)";
  }

  function noAnimation() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function formatCedi(value) {
    return "GHS " + Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function buildLineOptions(yFormatter) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: noAnimation() ? false : { duration: 500, easing: "easeOutQuart" },
      plugins: {
        legend: {
          labels: { color: baseTickColor() }
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              if (!yFormatter) return context.dataset.label + ": " + context.parsed.y;
              return context.dataset.label + ": " + yFormatter(context.parsed.y);
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: baseGridColor() },
          ticks: { color: baseTickColor(), maxTicksLimit: 8 }
        },
        y: {
          grid: { color: baseGridColor() },
          ticks: {
            color: baseTickColor(),
            callback: function (value) {
              return yFormatter ? yFormatter(value) : value;
            }
          }
        }
      }
    };
  }

  function buildBarOptions(yFormatter) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: noAnimation() ? false : { duration: 500, easing: "easeOutQuart" },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (context) {
              if (!yFormatter) return String(context.parsed.y);
              return yFormatter(context.parsed.y);
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: baseGridColor() },
          ticks: { color: baseTickColor(), maxRotation: 0 }
        },
        y: {
          grid: { color: baseGridColor() },
          ticks: {
            color: baseTickColor(),
            callback: function (value) {
              return yFormatter ? yFormatter(value) : value;
            }
          }
        }
      }
    };
  }

  function createChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return null;
    const context = canvas.getContext("2d");
    return new window.Chart(context, config);
  }

  function initCharts() {
    if (!window.Chart || chartState.initialized) return;

    chartState.charts.cumulative = createChart("chart-cumulative", {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Saved",
            data: [],
            borderColor: "#00d3a7",
            backgroundColor: "rgba(0, 211, 167, 0.2)",
            borderWidth: 2,
            tension: 0.34,
            pointRadius: 0
          },
          {
            label: "Target",
            data: [],
            borderColor: "#7c5cff",
            backgroundColor: "rgba(124, 92, 255, 0.16)",
            borderWidth: 2,
            borderDash: [6, 4],
            tension: 0.3,
            pointRadius: 0
          }
        ]
      },
      options: buildLineOptions(formatCedi)
    });

    chartState.charts.weekly = createChart("chart-weekly", {
      type: "bar",
      data: {
        labels: [],
        datasets: [
          {
            label: "Deposits",
            data: [],
            borderRadius: 8,
            backgroundColor: "rgba(124, 92, 255, 0.75)"
          }
        ]
      },
      options: buildBarOptions(formatCedi)
    });

    chartState.charts.streak = createChart("chart-streak", {
      type: "bar",
      data: {
        labels: [],
        datasets: [
          {
            label: "Completion",
            data: [],
            borderRadius: 6,
            borderSkipped: false,
            backgroundColor: []
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: noAnimation() ? false : { duration: 440, easing: "easeOutQuart" },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { display: false }
          },
          y: {
            grid: { display: false },
            ticks: { display: false },
            min: 0,
            max: 1
          }
        }
      }
    });

    chartState.charts.rolling = createChart("chart-rolling", {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "7-Day Completion %",
            data: [],
            borderColor: "#ffca3a",
            backgroundColor: "rgba(255, 202, 58, 0.2)",
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 0
          }
        ]
      },
      options: buildLineOptions(function (value) {
        return value + "%";
      })
    });

    chartState.charts.projection = createChart("chart-projection", {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Actual Saved",
            data: [],
            borderColor: "#00d3a7",
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.25
          },
          {
            label: "Ideal Savings Pace",
            data: [],
            borderColor: "#7c5cff",
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 0,
            tension: 0.24
          },
          {
            label: "Projected Savings Path",
            data: [],
            borderColor: "#ffca3a",
            borderWidth: 2,
            borderDash: [2, 4],
            pointRadius: 0,
            tension: 0.2
          }
        ]
      },
      options: buildLineOptions(formatCedi)
    });

    chartState.initialized = true;
  }

  function safeUpdateChart(chart, labels, datasets) {
    if (!chart) return;
    chart.data.labels = labels;
    datasets.forEach(function (dataset, index) {
      if (chart.data.datasets[index]) {
        Object.assign(chart.data.datasets[index], dataset);
      }
    });
    chart.update();
  }

  function updateCharts(analytics) {
    if (!chartState.initialized) initCharts();
    if (!chartState.initialized || !analytics) return;

    safeUpdateChart(chartState.charts.cumulative, analytics.cumulative.labels, [
      { data: analytics.cumulative.actualSeries },
      { data: analytics.cumulative.targetSeries }
    ]);

    safeUpdateChart(chartState.charts.weekly, analytics.weekly.labels, [
      { data: analytics.weekly.values }
    ]);

    safeUpdateChart(chartState.charts.streak, analytics.streak.labels, [
      {
        data: analytics.streak.values,
        backgroundColor: analytics.streak.values.map(function (value) {
          return value > 0 ? "rgba(0,211,167,0.82)" : "rgba(255,255,255,0.15)";
        })
      }
    ]);

    safeUpdateChart(chartState.charts.rolling, analytics.rolling.labels, [
      { data: analytics.rolling.values }
    ]);

    safeUpdateChart(chartState.charts.projection, analytics.projection.labels, [
      { data: analytics.projection.actualSeries },
      { data: analytics.projection.targetSeries },
      { data: analytics.projection.projectedSeries }
    ]);
  }

  function destroyCharts() {
    Object.keys(chartState.charts).forEach(function (key) {
      const chart = chartState.charts[key];
      if (chart && typeof chart.destroy === "function") {
        chart.destroy();
      }
    });
    chartState.charts = {};
    chartState.initialized = false;
  }

  window.ZenithCharts = {
    initCharts: initCharts,
    updateCharts: updateCharts,
    destroyCharts: destroyCharts
  };
})();

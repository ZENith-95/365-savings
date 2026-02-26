(function () {
  "use strict";

  const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const CURRENCY = "GHS ";

  const state = {
    gridElement: null,
    monthLabelElement: null,
    emptyElement: null,
    onToggleDay: null,
    onRendered: null,
    plan: null,
    filter: "all",
    currentMonth: startOfMonth(new Date()),
    lastDirection: 0
  };

  function startOfDay(date) {
    const safe = new Date(date);
    safe.setHours(0, 0, 0, 0);
    return safe;
  }

  function startOfMonth(date) {
    const safe = startOfDay(date);
    safe.setDate(1);
    return safe;
  }

  function parsePlanDate(value) {
    return startOfDay(new Date(String(value) + "T00:00:00"));
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return startOfDay(next);
  }

  function diffDays(left, right) {
    const leftDay = startOfDay(left);
    const rightDay = startOfDay(right);
    const leftUtc = Date.UTC(leftDay.getFullYear(), leftDay.getMonth(), leftDay.getDate());
    const rightUtc = Date.UTC(rightDay.getFullYear(), rightDay.getMonth(), rightDay.getDate());
    return Math.floor((leftUtc - rightUtc) / 86400000);
  }

  function isSameDay(a, b) {
    return diffDays(a, b) === 0;
  }

  function getDueDateForIndex(plan, index) {
    const base = parsePlanDate(plan.startDate);
    if (plan.mode === "weekly") {
      return addDays(base, (index - 1) * 7);
    }
    return addDays(base, index - 1);
  }

  function planMultiplier(plan) {
    const direct = Number(plan.incrementMultiplier);
    if (direct > 0) return direct;
    if (plan.mode === "half") return 0.5;
    if (plan.mode === "quarter") return 0.25;
    return 1;
  }

  function fixedDailyAmountForPlan(plan) {
    const fixed = Number(plan.fixedDailyAmount);
    if (fixed > 0) return Number(fixed.toFixed(2));
    return 1;
  }

  function amountForIndex(plan, index) {
    if (plan.mode === "simple") {
      return fixedDailyAmountForPlan(plan);
    }
    const amount = index * planMultiplier(plan);
    return Number(amount.toFixed(2));
  }

  function formatCurrency(amount) {
    return CURRENCY + Number(amount || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function getIndexForDate(plan, date) {
    const startDate = parsePlanDate(plan.startDate);
    const distance = diffDays(date, startDate);
    if (distance < 0) return null;

    if (plan.mode === "weekly") {
      if (distance % 7 !== 0) return null;
      const weeklyIndex = Math.floor(distance / 7) + 1;
      return weeklyIndex <= plan.totalDays ? weeklyIndex : null;
    }

    const dayIndex = distance + 1;
    return dayIndex <= plan.totalDays ? dayIndex : null;
  }

  function classifyEntry(plan, index, date) {
    const today = startOfDay(new Date());
    const completed = Boolean(plan.completedDays && plan.completedDays[String(index)]);
    return {
      done: completed,
      today: isSameDay(date, today),
      overdue: date < today && !completed,
      upcoming: date > today && !completed
    };
  }

  function filterMatch(status) {
    if (state.filter === "all") return true;
    if (state.filter === "done") return status.done;
    if (state.filter === "overdue") return status.overdue;
    if (state.filter === "upcoming") return status.upcoming;
    return true;
  }

  function clearGrid() {
    if (!state.gridElement) return;
    state.gridElement.textContent = "";
  }

  function animateMonthTransition() {
    if (!state.gridElement || state.lastDirection === 0) return;
    state.gridElement.classList.remove("slide-left", "slide-right");
    void state.gridElement.offsetWidth;
    state.gridElement.classList.add(state.lastDirection > 0 ? "slide-left" : "slide-right");
  }

  function renderWeekdayHeaders() {
    WEEKDAY_LABELS.forEach(function (label) {
      const weekday = document.createElement("p");
      weekday.className = "weekday";
      weekday.textContent = label;
      state.gridElement.appendChild(weekday);
    });
  }

  function renderDailyMonth(plan) {
    state.gridElement.classList.remove("weekly-mode");
    renderWeekdayHeaders();

    const monthStart = new Date(state.currentMonth);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const firstWeekdayMondayIndex = (monthStart.getDay() + 6) % 7;
    const gridStart = addDays(monthStart, -firstWeekdayMondayIndex);

    let monthDueCount = 0;
    let visibleMatchCount = 0;

    for (let cell = 0; cell < 42; cell += 1) {
      const date = addDays(gridStart, cell);
      const index = getIndexForDate(plan, date);
      const inMonth = date.getMonth() === monthStart.getMonth();
      const due = index !== null;

      const node = document.createElement(due ? "button" : "div");
      node.className = "calendar-cell";
      if (due) node.type = "button";
      if (!inMonth) node.classList.add("is-outside");

      const dayLabel = document.createElement("strong");
      dayLabel.textContent = String(date.getDate());
      node.appendChild(dayLabel);

      if (!due) {
        node.classList.add("is-inert");
      } else {
        const status = classifyEntry(plan, index, date);
        const amount = document.createElement("span");
        amount.className = "amount";
        amount.textContent = formatCurrency(amountForIndex(plan, index));
        node.appendChild(amount);
        node.setAttribute("aria-label", "Deposit day " + index + ", amount " + formatCurrency(amountForIndex(plan, index)));
        node.dataset.index = String(index);

        if (status.done) node.classList.add("is-done");
        if (status.today) node.classList.add("is-today");
        if (status.overdue) node.classList.add("is-overdue");

        const visible = filterMatch(status);
        if (!visible) node.classList.add("is-filtered");
        if (inMonth && visible) visibleMatchCount += 1;

        if (inMonth) monthDueCount += 1;

        node.addEventListener("click", function () {
          if (typeof state.onToggleDay === "function") {
            state.onToggleDay(index);
          }
        });
      }

      if (date < monthStart || date > monthEnd) {
        node.classList.add("is-outside");
      }
      state.gridElement.appendChild(node);
    }

    const showEmpty = monthDueCount === 0 || (state.filter !== "all" && visibleMatchCount === 0);
    if (state.emptyElement) {
      state.emptyElement.classList.toggle("hidden", !showEmpty);
    }
    if (typeof state.onRendered === "function") {
      state.onRendered({
        monthlyItems: monthDueCount,
        visibleItems: visibleMatchCount,
        mode: "daily"
      });
    }
  }

  function renderWeeklyMonth(plan) {
    state.gridElement.classList.add("weekly-mode");

    const monthStart = new Date(state.currentMonth);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const entries = [];

    for (let index = 1; index <= plan.totalDays; index += 1) {
      const dueDate = getDueDateForIndex(plan, index);
      if (dueDate >= monthStart && dueDate <= monthEnd) {
        entries.push({
          index: index,
          date: dueDate,
          status: classifyEntry(plan, index, dueDate)
        });
      }
    }

    let visibleCount = 0;
    entries.forEach(function (entry) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "weekly-cell";
      card.dataset.index = String(entry.index);

      const weekLabel = document.createElement("strong");
      weekLabel.textContent = "Week " + String(entry.index).padStart(2, "0");
      card.appendChild(weekLabel);

      const dateLabel = document.createElement("span");
      dateLabel.className = "amount";
      dateLabel.textContent = entry.date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric"
      }) + " - " + formatCurrency(amountForIndex(plan, entry.index));
      card.appendChild(dateLabel);

      if (entry.status.done) card.classList.add("is-done");
      if (entry.status.today) card.classList.add("is-today");
      if (entry.status.overdue) card.classList.add("is-overdue");

      const visible = filterMatch(entry.status);
      if (!visible) card.classList.add("is-filtered");
      if (visible) visibleCount += 1;

      card.setAttribute(
        "aria-label",
        "Week " + entry.index + " due " + entry.date.toLocaleDateString() + ", amount " + formatCurrency(amountForIndex(plan, entry.index))
      );

      card.addEventListener("click", function () {
        if (typeof state.onToggleDay === "function") {
          state.onToggleDay(entry.index);
        }
      });

      state.gridElement.appendChild(card);
    });

    const showEmpty = entries.length === 0 || (state.filter !== "all" && visibleCount === 0);
    if (state.emptyElement) {
      state.emptyElement.classList.toggle("hidden", !showEmpty);
    }
    if (typeof state.onRendered === "function") {
      state.onRendered({
        monthlyItems: entries.length,
        visibleItems: visibleCount,
        mode: "weekly"
      });
    }
  }

  function updateMonthLabel() {
    if (!state.monthLabelElement) return;
    state.monthLabelElement.textContent = state.currentMonth.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric"
    });
  }

  function renderCalendar() {
    if (!state.gridElement) return;
    clearGrid();
    updateMonthLabel();
    animateMonthTransition();

    if (!state.plan) {
      if (state.emptyElement) {
        state.emptyElement.classList.remove("hidden");
        state.emptyElement.textContent = "Create a plan to render your calendar.";
      }
      return;
    }

    if (state.plan.mode === "weekly") {
      renderWeeklyMonth(state.plan);
      return;
    }
    renderDailyMonth(state.plan);
  }

  function setMonth(value) {
    if (typeof value === "number") {
      state.lastDirection = value >= 0 ? 1 : -1;
      state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() + value, 1);
    } else if (value instanceof Date) {
      state.lastDirection = 0;
      state.currentMonth = startOfMonth(value);
    }
    renderCalendar();
  }

  function setFilter(filter) {
    state.filter = String(filter || "all").toLowerCase();
    renderCalendar();
  }

  function setPlan(plan) {
    state.plan = plan || null;
    if (plan) {
      const firstDate = parsePlanDate(plan.startDate);
      if (Number.isFinite(firstDate.getTime())) {
        state.currentMonth = startOfMonth(firstDate);
      }
    }
    renderCalendar();
  }

  function initCalendar(config) {
    state.gridElement = config && config.gridElement ? config.gridElement : null;
    state.monthLabelElement = config && config.monthLabelElement ? config.monthLabelElement : null;
    state.emptyElement = config && config.emptyElement ? config.emptyElement : null;
    state.onToggleDay = config && typeof config.onToggleDay === "function" ? config.onToggleDay : null;
    state.onRendered = config && typeof config.onRendered === "function" ? config.onRendered : null;
    if (config && config.currentMonth instanceof Date) {
      state.currentMonth = startOfMonth(config.currentMonth);
    }
  }

  window.ZenithCalendar = {
    initCalendar: initCalendar,
    setPlan: setPlan,
    renderCalendar: renderCalendar,
    setMonth: setMonth,
    setFilter: setFilter,
    getCurrentMonth: function () {
      return new Date(state.currentMonth);
    }
  };
})();

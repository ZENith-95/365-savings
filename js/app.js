(function () {
  "use strict";

  const MODE_CONFIG = {
    full: { days: 365, multiplier: 1, label: "Full daily (1.0x)" },
    half: { days: 365, multiplier: 0.5, label: "Half daily (0.5x)" },
    quarter: { days: 365, multiplier: 0.25, label: "Quarter daily (0.25x)" },
    simple: { days: 365, multiplier: 1, label: "Simple daily (fixed amount)" },
    weekly: { days: 52, multiplier: 1, label: "Weekly" }
  };

  const MILESTONES = [30, 60, 100, 200];
  const RING_CIRCUMFERENCE = 578;
  const CURRENCY = "GHS ";

  const state = {
    currentUsername: "",
    plans: [],
    activePlanId: null,
    activePlan: null
  };

  const ui = {};

  function startOfDay(date) {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    return value;
  }

  function parsePlanDate(value) {
    return startOfDay(new Date(String(value) + "T00:00:00"));
  }

  function addDays(date, days) {
    const value = new Date(date);
    value.setDate(value.getDate() + days);
    return startOfDay(value);
  }

  function diffDays(left, right) {
    const leftDay = startOfDay(left);
    const rightDay = startOfDay(right);
    const leftUtc = Date.UTC(leftDay.getFullYear(), leftDay.getMonth(), leftDay.getDate());
    const rightUtc = Date.UTC(rightDay.getFullYear(), rightDay.getMonth(), rightDay.getDate());
    return Math.floor((leftUtc - rightUtc) / 86400000);
  }

  function toMoneyValue(amount) {
    return Number(Number(amount || 0).toFixed(2));
  }

  function formatCurrency(amount) {
    return CURRENCY + toMoneyValue(amount).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function getModeConfig(mode) {
    return MODE_CONFIG[mode] || MODE_CONFIG.full;
  }

  function totalDaysForMode(mode) {
    return getModeConfig(mode).days;
  }

  function multiplierForMode(mode) {
    return getModeConfig(mode).multiplier;
  }

  function planMultiplier(plan) {
    const direct = Number(plan.incrementMultiplier);
    if (direct > 0) return direct;
    return multiplierForMode(plan.mode);
  }

  function fixedDailyAmountForPlan(plan) {
    const fixed = Number(plan.fixedDailyAmount);
    if (fixed > 0) return toMoneyValue(fixed);
    return toMoneyValue(1);
  }

  function arithmeticTotal(totalDays, multiplier) {
    return toMoneyValue((totalDays * (totalDays + 1) * multiplier) / 2);
  }

  function amountForIndex(plan, index) {
    if (plan.mode === "simple") {
      return fixedDailyAmountForPlan(plan);
    }
    return toMoneyValue(index * planMultiplier(plan));
  }

  function buildPlanId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "plan-" + Date.now() + "-" + Math.floor(Math.random() * 1000000);
  }

  function getDueDateForIndex(plan, index) {
    const startDate = parsePlanDate(plan.startDate);
    if (plan.mode === "weekly") {
      return addDays(startDate, (index - 1) * 7);
    }
    return addDays(startDate, index - 1);
  }

  function getCurrentIndex(plan, date) {
    const startDate = parsePlanDate(plan.startDate);
    const distance = diffDays(date, startDate);
    if (distance < 0) return 0;

    if (plan.mode === "weekly") {
      return Math.floor(distance / 7) + 1;
    }
    return distance + 1;
  }

  function completedCount(plan) {
    return Object.keys(plan.completedDays || {}).length;
  }

  function completedAmount(plan) {
    return toMoneyValue(
      Object.keys(plan.completedDays || {}).reduce(function (sum, key) {
        const index = Number(key);
        if (!Number.isFinite(index) || index < 1 || index > plan.totalDays) return sum;
        return sum + amountForIndex(plan, index);
      }, 0)
    );
  }

  function projectedAmountByIndex(plan, indexLimit) {
    const safeLimit = Math.max(0, Math.min(Number(indexLimit) || 0, plan.totalDays));
    if (plan.mode === "simple") {
      return toMoneyValue(safeLimit * fixedDailyAmountForPlan(plan));
    }
    return arithmeticTotal(safeLimit, planMultiplier(plan));
  }

  function computeStreak(plan, todayIndexRaw) {
    if (todayIndexRaw < 1) return 0;
    const last = Math.min(todayIndexRaw, plan.totalDays);
    let streak = 0;
    for (let index = last; index >= 1; index -= 1) {
      if (plan.completedDays[String(index)]) streak += 1;
      else break;
    }
    return streak;
  }

  function computeOverdueUpcoming(plan) {
    const today = startOfDay(new Date());
    let overdue = 0;
    let upcoming = 0;
    for (let index = 1; index <= plan.totalDays; index += 1) {
      if (plan.completedDays[String(index)]) continue;
      const dueDate = getDueDateForIndex(plan, index);
      if (dueDate < today) overdue += 1;
      if (dueDate > today) upcoming += 1;
    }
    return { overdue: overdue, upcoming: upcoming };
  }

  function computePlanMetrics(plan) {
    if (!plan) {
      return {
        todayIndexRaw: 0,
        dueThroughToday: 0,
        inRange: false,
        completedCount: 0,
        completedAmount: 0,
        projectedByNow: 0,
        varianceByNow: 0,
        progressPercent: 0,
        overdue: 0,
        upcoming: 0,
        streak: 0,
        nextDueIndex: null
      };
    }

    const doneCount = completedCount(plan);
    const savedAmount = completedAmount(plan);
    const todayIndexRaw = getCurrentIndex(plan, new Date());
    const dueThroughToday = Math.max(0, Math.min(todayIndexRaw, plan.totalDays));
    const projectedByNow = projectedAmountByIndex(plan, dueThroughToday);
    const inRange = todayIndexRaw >= 1 && todayIndexRaw <= plan.totalDays;
    const progressPercent = plan.targetAmount > 0 ? Math.min(100, (savedAmount / plan.targetAmount) * 100) : 0;
    const backlog = computeOverdueUpcoming(plan);
    const streak = computeStreak(plan, todayIndexRaw);

    const startIndex = Math.max(1, Math.min(todayIndexRaw || 1, plan.totalDays));
    let nextDue = null;
    for (let index = startIndex; index <= plan.totalDays; index += 1) {
      if (!plan.completedDays[String(index)]) {
        nextDue = index;
        break;
      }
    }
    if (!nextDue) {
      for (let index = 1; index <= plan.totalDays; index += 1) {
        if (!plan.completedDays[String(index)]) {
          nextDue = index;
          break;
        }
      }
    }

    return {
      todayIndexRaw: todayIndexRaw,
      dueThroughToday: dueThroughToday,
      inRange: inRange,
      completedCount: doneCount,
      completedAmount: savedAmount,
      projectedByNow: projectedByNow,
      varianceByNow: toMoneyValue(savedAmount - projectedByNow),
      progressPercent: progressPercent,
      overdue: backlog.overdue,
      upcoming: backlog.upcoming,
      streak: streak,
      nextDueIndex: nextDue
    };
  }

  function cumulativeSeries(plan) {
    const labels = [];
    const actualSeries = [];
    const targetSeries = [];
    let actualTotal = 0;
    let targetTotal = 0;

    for (let index = 1; index <= plan.totalDays; index += 1) {
      const amount = amountForIndex(plan, index);
      labels.push(String(index));
      targetTotal += amount;
      if (plan.completedDays[String(index)]) {
        actualTotal += amount;
      }
      actualSeries.push(toMoneyValue(actualTotal));
      targetSeries.push(toMoneyValue(targetTotal));
    }

    return {
      labels: labels,
      actualSeries: actualSeries,
      targetSeries: targetSeries
    };
  }

  function mondayStart(date) {
    const value = startOfDay(date);
    const mondayIndex = (value.getDay() + 6) % 7;
    return addDays(value, -mondayIndex);
  }

  function weeklyDepositsSeries(plan) {
    const today = startOfDay(new Date());
    const currentMonday = mondayStart(today);
    const weekKeys = [];
    for (let index = 9; index >= 0; index -= 1) {
      const weekDate = addDays(currentMonday, -index * 7);
      weekKeys.push(weekDate.toISOString().slice(0, 10));
    }

    const totalsByWeek = {};
    weekKeys.forEach(function (key) {
      totalsByWeek[key] = 0;
    });

    Object.keys(plan.completedDays || {}).forEach(function (key) {
      const index = Number(key);
      if (!Number.isFinite(index) || index < 1 || index > plan.totalDays) return;
      const dueDate = getDueDateForIndex(plan, index);
      const weekKey = mondayStart(dueDate).toISOString().slice(0, 10);
      if (totalsByWeek[weekKey] === undefined) return;
      totalsByWeek[weekKey] = toMoneyValue(totalsByWeek[weekKey] + amountForIndex(plan, index));
    });

    return {
      labels: weekKeys.map(function (key) {
        const date = new Date(key + "T00:00:00");
        return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      }),
      values: weekKeys.map(function (key) {
        return totalsByWeek[key];
      })
    };
  }

  function streakTimelineSeries(plan, metrics) {
    const anchor = Math.max(1, Math.min(metrics.todayIndexRaw || 1, plan.totalDays));
    const start = Math.max(1, anchor - 29);
    const labels = [];
    const values = [];

    for (let index = start; index <= anchor; index += 1) {
      labels.push(String(index));
      values.push(plan.completedDays[String(index)] ? 1 : 0);
    }

    return {
      labels: labels,
      values: values
    };
  }

  function rollingCompletionSeries(plan) {
    const labels = [];
    const values = [];

    for (let index = 1; index <= plan.totalDays; index += 1) {
      const windowStart = Math.max(1, index - 6);
      const span = index - windowStart + 1;
      let done = 0;
      for (let cursor = windowStart; cursor <= index; cursor += 1) {
        if (plan.completedDays[String(cursor)]) done += 1;
      }
      labels.push(String(index));
      values.push(Math.round((done / span) * 100));
    }

    return {
      labels: labels,
      values: values
    };
  }

  function projectionSeries(plan, metrics) {
    const completedAmountValue = metrics.completedAmount;
    const elapsedUnits = Math.max(0, Math.min(metrics.todayIndexRaw, plan.totalDays));
    const velocity = completedAmountValue / Math.max(1, elapsedUnits);
    const remainingAmount = Math.max(0, plan.targetAmount - completedAmountValue);

    let projectedFinishIndex = null;
    if (remainingAmount <= 0) {
      projectedFinishIndex = elapsedUnits || plan.totalDays;
    } else if (velocity > 0) {
      projectedFinishIndex = elapsedUnits + Math.ceil(remainingAmount / velocity);
    }

    let horizon = Math.max(plan.totalDays, projectedFinishIndex || elapsedUnits || plan.totalDays);
    horizon = Math.min(horizon, plan.totalDays * 3);

    const labels = [];
    const actualSeries = [];
    const targetSeries = [];
    const projectedSeries = [];

    let runningActual = 0;
    let runningTarget = 0;
    for (let index = 1; index <= horizon; index += 1) {
      labels.push(String(index));

      if (index <= elapsedUnits) {
        if (plan.completedDays[String(index)]) {
          runningActual += amountForIndex(plan, index);
        }
        actualSeries.push(toMoneyValue(runningActual));
      } else {
        actualSeries.push(null);
      }

      if (index <= plan.totalDays) {
        runningTarget += amountForIndex(plan, index);
      }
      targetSeries.push(toMoneyValue(runningTarget));

      if (!projectedFinishIndex || velocity <= 0 || index < elapsedUnits) {
        projectedSeries.push(null);
      } else if (projectedFinishIndex === elapsedUnits) {
        projectedSeries.push(toMoneyValue(plan.targetAmount));
      } else if (index <= projectedFinishIndex) {
        const ratio = (index - elapsedUnits) / Math.max(1, projectedFinishIndex - elapsedUnits);
        const value = completedAmountValue + ratio * (plan.targetAmount - completedAmountValue);
        projectedSeries.push(toMoneyValue(value));
      } else {
        projectedSeries.push(toMoneyValue(plan.targetAmount));
      }
    }

    const projectedFinishDate = projectedFinishIndex
      ? getDueDateForIndex(plan, Math.min(projectedFinishIndex, plan.totalDays))
      : null;

    return {
      labels: labels,
      actualSeries: actualSeries,
      targetSeries: targetSeries,
      projectedSeries: projectedSeries,
      projectedFinishDate: projectedFinishDate,
      projectedFinishIndex: projectedFinishIndex
    };
  }

  function buildAnalytics(plan, metrics) {
    return {
      cumulative: cumulativeSeries(plan),
      weekly: weeklyDepositsSeries(plan),
      streak: streakTimelineSeries(plan, metrics),
      rolling: rollingCompletionSeries(plan),
      projection: projectionSeries(plan, metrics)
    };
  }

  function savePlans() {
    window.ZenithStorage.savePlans(state.currentUsername, state.plans);
  }

  function modeLabel(mode) {
    return getModeConfig(mode).label;
  }

  function syncPlanOptions() {
    ui.planSelect.textContent = "";
    if (!state.plans.length) {
      const option = document.createElement("option");
      option.textContent = "No plans";
      option.value = "";
      ui.planSelect.appendChild(option);
      return;
    }

    state.plans.forEach(function (plan) {
      const option = document.createElement("option");
      option.value = plan.id;
      option.textContent = plan.name + " (" + modeLabel(plan.mode) + ")";
      ui.planSelect.appendChild(option);
    });

    ui.planSelect.value = state.activePlanId || "";
  }

  function setAppAccent(color) {
    if (!color) return;
    document.documentElement.style.setProperty("--primary", color);
  }

  function setActivePlan(planId) {
    state.activePlanId = planId || null;
    state.activePlan = state.plans.find(function (plan) {
      return plan.id === state.activePlanId;
    }) || null;

    if (!state.activePlan && state.plans.length) {
      state.activePlan = state.plans[0];
      state.activePlanId = state.activePlan.id;
    }

    window.ZenithStorage.setActivePlan(state.currentUsername, state.activePlanId);
    syncPlanOptions();
    if (state.activePlan) {
      setAppAccent(state.activePlan.colorTheme || "#7c5cff");
      window.ZenithCalendar.setPlan(state.activePlan);
    } else {
      window.ZenithCalendar.setPlan(null);
    }
    refreshDashboard();
  }

  function applyPlanMutation(updatedPlan) {
    const index = state.plans.findIndex(function (plan) {
      return plan.id === updatedPlan.id;
    });
    if (index === -1) return;
    state.plans[index] = updatedPlan;
    state.activePlan = updatedPlan;
    savePlans();
  }

  function maybeCelebrateMilestone(plan, metrics) {
    const milestoneBook = plan.milestonesHit || {};
    let hitMilestone = null;

    MILESTONES.forEach(function (milestone) {
      if (metrics.completedCount >= milestone && !milestoneBook[String(milestone)]) {
        milestoneBook[String(milestone)] = true;
        hitMilestone = milestone;
      }
    });

    if (metrics.completedCount >= plan.totalDays && !milestoneBook.final) {
      milestoneBook.final = true;
      hitMilestone = "final";
    }

    plan.milestonesHit = milestoneBook;
    if (hitMilestone && window.ZenithAnimations) {
      window.ZenithAnimations.runConfetti({ count: hitMilestone === "final" ? 180 : 120 });
      window.ZenithAnimations.showToast(
        hitMilestone === "final"
          ? "Plan completed. Outstanding consistency."
          : "Milestone unlocked: " + hitMilestone + " entries completed.",
        "success",
        2600
      );
    }
  }

  function toggleIndexCompletion(index) {
    if (!state.activePlan) return;
    const key = String(index);
    const plan = state.activePlan;
    if (plan.completedDays[key]) {
      delete plan.completedDays[key];
      if (window.ZenithAnimations) {
        window.ZenithAnimations.showToast("Marked as pending.", "warn", 1400);
      }
    } else {
      plan.completedDays[key] = true;
      if (window.ZenithAnimations) {
        window.ZenithAnimations.showToast(
          "Marked complete: " + formatCurrency(amountForIndex(plan, index)),
          "success",
          1500
        );
      }
    }
    applyPlanMutation(plan);
    const metrics = computePlanMetrics(plan);
    maybeCelebrateMilestone(plan, metrics);
    refreshDashboard();
  }

  function markTodayPaid() {
    if (!state.activePlan) {
      window.ZenithAnimations.showToast("Create a plan first.", "warn");
      return;
    }

    const plan = state.activePlan;
    const todayIndex = getCurrentIndex(plan, new Date());
    if (todayIndex < 1) {
      const starts = parsePlanDate(plan.startDate).toLocaleDateString();
      window.ZenithAnimations.showToast("Plan starts on " + starts + ".", "warn");
      return;
    }

    if (todayIndex > plan.totalDays) {
      window.ZenithAnimations.showToast("Today is outside this plan range.", "warn");
      return;
    }

    const key = String(todayIndex);
    if (plan.completedDays[key]) {
      window.ZenithAnimations.showToast("Today's entry is already completed.", "warn");
      return;
    }

    plan.completedDays[key] = true;
    applyPlanMutation(plan);
    const metrics = computePlanMetrics(plan);
    maybeCelebrateMilestone(plan, metrics);

    if (window.ZenithAnimations) {
      window.ZenithAnimations.vibratePulse();
      window.ZenithAnimations.showToast(
        "Payment logged: " + formatCurrency(amountForIndex(plan, todayIndex)) + ".",
        "success"
      );
      ui.payFab.classList.remove("pulse");
      void ui.payFab.offsetWidth;
      ui.payFab.classList.add("pulse");
    }

    refreshDashboard();
  }

  function updateProgressRing(progressPercent, color) {
    const safeProgress = Math.max(0, Math.min(100, progressPercent));
    const offset = RING_CIRCUMFERENCE - (RING_CIRCUMFERENCE * safeProgress) / 100;
    ui.ringProgress.style.strokeDashoffset = String(offset);
    ui.ringProgress.style.stroke = color || "var(--secondary)";
  }

  function updateKpiNumbers(metrics) {
    const animate = window.ZenithAnimations && window.ZenithAnimations.animateCount;
    if (!animate) {
      ui.kpiStreak.textContent = String(metrics.streak);
      ui.kpiCompleted.textContent = String(metrics.completedCount);
      ui.kpiOverdue.textContent = String(metrics.overdue);
      ui.kpiUpcoming.textContent = String(metrics.upcoming);
      return;
    }

    animate(ui.kpiStreak, metrics.streak);
    animate(ui.kpiCompleted, metrics.completedCount);
    animate(ui.kpiOverdue, metrics.overdue);
    animate(ui.kpiUpcoming, metrics.upcoming);
  }

  function updateProjectionNote(analyticsProjection) {
    if (!analyticsProjection.projectedFinishDate) {
      ui.projectionNote.textContent = "Projection unavailable until progress starts.";
      return;
    }
    ui.projectionNote.textContent =
      "Projected finish: " +
      analyticsProjection.projectedFinishDate.toLocaleDateString() +
      " (index " +
      analyticsProjection.projectedFinishIndex +
      ").";
  }

  function updateGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) ui.greeting.textContent = "Good morning, " + state.currentUsername + ". Keep momentum.";
    else if (hour < 18) ui.greeting.textContent = "Good afternoon, " + state.currentUsername + ". Keep your streak alive.";
    else ui.greeting.textContent = "Good evening, " + state.currentUsername + ". One more step toward your target.";
  }

  function ensureCurrentUserBadgeStructure() {
    if (!ui.currentUserBadge) return;

    if (ui.currentUserBadge.tagName !== "BUTTON") {
      ui.currentUserBadge.setAttribute("role", "button");
      ui.currentUserBadge.setAttribute("tabindex", "0");
    }

    if (!ui.currentUserBadge.hasAttribute("aria-haspopup")) {
      ui.currentUserBadge.setAttribute("aria-haspopup", "menu");
    }
    if (!ui.currentUserBadge.hasAttribute("aria-expanded")) {
      ui.currentUserBadge.setAttribute("aria-expanded", "false");
    }
    if (!ui.currentUserBadge.hasAttribute("aria-controls")) {
      ui.currentUserBadge.setAttribute("aria-controls", "account-menu");
    }

    let textNode = ui.currentUserBadge.querySelector(".user-badge-text");
    if (!textNode) {
      const existingText = ui.currentUserBadge.textContent.trim() || "Signed in: -";
      ui.currentUserBadge.textContent = "";

      const iconNode = document.createElement("span");
      iconNode.className = "user-badge-icon";
      iconNode.setAttribute("aria-hidden", "true");

      textNode = document.createElement("span");
      textNode.className = "user-badge-text";
      textNode.textContent = existingText;

      ui.currentUserBadge.appendChild(iconNode);
      ui.currentUserBadge.appendChild(textNode);
    }

    let iconNode = ui.currentUserBadge.querySelector(".user-badge-icon");
    if (!iconNode) {
      iconNode = document.createElement("span");
      iconNode.className = "user-badge-icon";
      iconNode.setAttribute("aria-hidden", "true");
      ui.currentUserBadge.insertBefore(iconNode, textNode);
    }

    let caretNode = ui.currentUserBadge.querySelector(".user-badge-caret");
    if (!caretNode) {
      caretNode = document.createElement("span");
      caretNode.className = "user-badge-caret";
      caretNode.setAttribute("aria-hidden", "true");
      caretNode.innerHTML = "&#9662;";
      ui.currentUserBadge.appendChild(caretNode);
    }
  }

  function setAccountMenuOpen(isOpen) {
    if (!ui.accountMenu || !ui.currentUserBadge) return;
    ui.accountMenu.classList.toggle("hidden", !isOpen);
    ui.currentUserBadge.classList.toggle("menu-open", isOpen);
    ui.currentUserBadge.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  function toggleAccountMenu() {
    if (!ui.accountMenu) return;
    const shouldOpen = ui.accountMenu.classList.contains("hidden");
    setAccountMenuOpen(shouldOpen);
  }

  function closeAccountMenu() {
    setAccountMenuOpen(false);
  }

  function handleLogoutAndRedirect() {
    window.ZenithAuth.logout();
    window.location.replace("index.html");
  }

  function updateCurrentUserBadge() {
    if (!ui.currentUserBadge) return;
    ensureCurrentUserBadgeStructure();
    const textNode = ui.currentUserBadge.querySelector(".user-badge-text");
    if (!textNode) return;
    textNode.textContent = "Signed in: " + state.currentUsername;
    if (ui.accountMenuUser) {
      ui.accountMenuUser.textContent = state.currentUsername;
    }
  }

  function refreshDashboard() {
    updateGreeting();
    updateCurrentUserBadge();

    if (!state.activePlan) {
      ui.activePlanName.textContent = "No active plan";
      ui.planSummary.textContent = "Create a savings plan to unlock analytics and calendar tracking.";
      ui.savedAmount.textContent = formatCurrency(0);
      ui.projectedByNow.textContent = "Projected by now " + formatCurrency(0);
      ui.targetAmount.textContent = "Target " + formatCurrency(0);
      ui.progressPercent.textContent = "0%";
      updateProgressRing(0, "#00d3a7");
      ui.payToday.disabled = true;
      ui.payFab.disabled = true;
      if (window.ZenithCharts) {
        window.ZenithCharts.updateCharts({
          cumulative: { labels: [], actualSeries: [], targetSeries: [] },
          weekly: { labels: [], values: [] },
          streak: { labels: [], values: [] },
          rolling: { labels: [], values: [] },
          projection: { labels: [], actualSeries: [], targetSeries: [], projectedSeries: [] }
        });
      }
      return;
    }

    ui.payToday.disabled = false;
    ui.payFab.disabled = false;

    const metrics = computePlanMetrics(state.activePlan);
    const analytics = buildAnalytics(state.activePlan, metrics);

    ui.activePlanName.textContent = state.activePlan.name;
    const startDateLabel = parsePlanDate(state.activePlan.startDate).toLocaleDateString();
    const nextDueLabel = metrics.nextDueIndex
      ? formatCurrency(amountForIndex(state.activePlan, metrics.nextDueIndex))
      : "none";
    const simpleAmountHint = state.activePlan.mode === "simple"
      ? " | Daily amount " + formatCurrency(fixedDailyAmountForPlan(state.activePlan))
      : "";
    const topUpHint = metrics.overdue > 0
      ? " | " + metrics.overdue + " overdue. You can go back and top up past days."
      : "";
    ui.planSummary.textContent =
      "Mode: " +
      modeLabel(state.activePlan.mode) +
      simpleAmountHint +
      " | Started " +
      startDateLabel +
      " | Next due " +
      nextDueLabel +
      topUpHint;

    ui.savedAmount.textContent = formatCurrency(metrics.completedAmount);
    if (metrics.dueThroughToday === 0) {
      ui.projectedByNow.textContent = "Projected by now " + formatCurrency(0);
    } else {
      const direction = metrics.varianceByNow >= 0 ? "ahead" : "behind";
      const varianceLabel = formatCurrency(Math.abs(metrics.varianceByNow));
      ui.projectedByNow.textContent =
        "Projected by now " + formatCurrency(metrics.projectedByNow) + " (" + varianceLabel + " " + direction + ")";
    }
    ui.targetAmount.textContent = "Target " + formatCurrency(state.activePlan.targetAmount);
    ui.progressPercent.textContent = metrics.progressPercent.toFixed(1) + "%";

    if (window.ZenithAnimations && window.ZenithAnimations.animateCount) {
      window.ZenithAnimations.animateCount(ui.savedAmount, metrics.completedAmount, {
        formatter: function (value) {
          return formatCurrency(value);
        },
        duration: 800
      });
    }

    updateProgressRing(metrics.progressPercent, state.activePlan.colorTheme || "#00d3a7");
    updateKpiNumbers(metrics);
    updateProjectionNote(analytics.projection);

    window.ZenithCalendar.renderCalendar();
    if (window.ZenithCharts) {
      window.ZenithCharts.updateCharts(analytics);
    }
  }

  function createPlan(payload) {
    const mode = payload.mode || "full";
    const multiplier = multiplierForMode(mode);
    const totalDays = totalDaysForMode(mode);
    const fixedDailyAmount = mode === "simple" ? toMoneyValue(payload.fixedDailyAmount) : null;
    const targetAmount = mode === "simple"
      ? toMoneyValue(totalDays * fixedDailyAmount)
      : arithmeticTotal(totalDays, multiplier);
    return {
      id: buildPlanId(),
      name: payload.name,
      startDate: payload.startDate,
      mode: mode,
      totalDays: totalDays,
      incrementMultiplier: multiplier,
      fixedDailyAmount: fixedDailyAmount,
      targetAmount: targetAmount,
      completedDays: {},
      colorTheme: payload.colorTheme || "#7c5cff",
      milestonesHit: {},
      createdAt: new Date().toISOString()
    };
  }

  function getSimpleAmountInputValue() {
    const rawValue = ui.simpleDailyAmount ? Number(ui.simpleDailyAmount.value) : NaN;
    if (!Number.isFinite(rawValue) || rawValue <= 0) return 0;
    return toMoneyValue(rawValue);
  }

  function updateSimpleAmountVisibility() {
    const isSimpleMode = ui.planMode.value === "simple";
    if (ui.simpleAmountWrap) {
      ui.simpleAmountWrap.classList.toggle("hidden", !isSimpleMode);
    }
    if (ui.simpleDailyAmount) {
      ui.simpleDailyAmount.required = isSimpleMode;
    }
  }

  function updatePlanTargetPreview() {
    const mode = ui.planMode.value;
    let total = 0;
    if (mode === "simple") {
      const dailyAmount = getSimpleAmountInputValue();
      total = toMoneyValue(totalDaysForMode(mode) * dailyAmount);
    } else {
      total = arithmeticTotal(totalDaysForMode(mode), multiplierForMode(mode));
    }
    ui.planTargetPreview.textContent = "Target: " + formatCurrency(total);
  }

  function openPlanModal() {
    ui.planStart.value = new Date().toISOString().slice(0, 10);
    if (ui.simpleDailyAmount && Number(ui.simpleDailyAmount.value) <= 0) {
      ui.simpleDailyAmount.value = "10.00";
    }
    updateSimpleAmountVisibility();
    updatePlanTargetPreview();
    if (typeof ui.planModal.showModal === "function") {
      ui.planModal.showModal();
    } else {
      ui.planModal.setAttribute("open", "open");
    }
    ui.planName.focus();
  }

  function closePlanModal() {
    if (typeof ui.planModal.close === "function" && ui.planModal.open) {
      ui.planModal.close();
      return;
    }
    if (ui.planModal.hasAttribute("open")) {
      ui.planModal.removeAttribute("open");
    }
  }

  function handlePlanCreation(event) {
    event.preventDefault();
    const name = ui.planName.value.trim();
    const mode = ui.planMode.value;
    const startDate = ui.planStart.value;
    const colorTheme = ui.planColor.value || "#7c5cff";
    const simpleDailyAmount = mode === "simple" ? getSimpleAmountInputValue() : null;

    if (!name || !startDate) {
      window.ZenithAnimations.showToast("Plan name and start date are required.", "error");
      return;
    }
    if (mode === "simple" && simpleDailyAmount <= 0) {
      window.ZenithAnimations.showToast("Enter a daily amount greater than 0 for simple mode.", "error");
      if (ui.simpleDailyAmount) ui.simpleDailyAmount.focus();
      return;
    }

    const newPlan = createPlan({
      name: name,
      mode: mode,
      startDate: startDate,
      colorTheme: colorTheme,
      fixedDailyAmount: simpleDailyAmount
    });

    state.plans.push(newPlan);
    savePlans();
    setActivePlan(newPlan.id);
    closePlanModal();
    ui.planForm.reset();
    const startedInPast = parsePlanDate(newPlan.startDate) < startOfDay(new Date());
    if (startedInPast) {
      window.ZenithAnimations.showToast(
        "Plan created from past date. Calendar starts at plan start so you can top up missed days.",
        "success",
        2800
      );
    } else {
      window.ZenithAnimations.showToast("Plan created.", "success");
    }
  }

  function buildPremiumPdfReport() {
    if (!window.jspdf || typeof window.jspdf.jsPDF !== "function") {
      throw new Error("PDF library unavailable.");
    }

    const JsPdfCtor = window.jspdf.jsPDF;
    const doc = new JsPdfCtor({
      unit: "mm",
      format: "a4",
      compress: true
    });

    const page = {
      width: 210,
      height: 297,
      margin: 12
    };

    const generatedAt = new Date();
    const planSnapshots = state.plans.map(function (plan) {
      return {
        plan: plan,
        metrics: computePlanMetrics(plan)
      };
    });

    const totals = planSnapshots.reduce(function (accumulator, entry) {
      accumulator.target += entry.plan.targetAmount;
      accumulator.saved += entry.metrics.completedAmount;
      accumulator.overdue += entry.metrics.overdue;
      return accumulator;
    }, { target: 0, saved: 0, overdue: 0 });

    function drawHeader(title, subtitle) {
      doc.setFillColor(12, 16, 30);
      doc.roundedRect(page.margin, page.margin, page.width - page.margin * 2, 34, 6, 6, "F");

      doc.setFillColor(58, 190, 176);
      doc.circle(page.margin + 8, page.margin + 8, 2.2, "F");
      doc.setFillColor(124, 92, 255);
      doc.circle(page.margin + 14, page.margin + 8, 2.2, "F");

      doc.setFont("helvetica", "bold");
      doc.setTextColor(241, 246, 255);
      doc.setFontSize(16);
      doc.text(title, page.margin + 8, page.margin + 18);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(195, 208, 235);
      doc.setFontSize(10);
      doc.text(subtitle, page.margin + 8, page.margin + 25.5);
      return page.margin + 40;
    }

    function ensureSpace(currentY, requiredHeight) {
      if (currentY + requiredHeight <= page.height - page.margin) {
        return currentY;
      }
      doc.addPage();
      return drawHeader(
        "Zenith 365 Savings Report",
        "Continuation | " + generatedAt.toLocaleString()
      );
    }

    function drawSummaryBlock(x, y, width, label, value, tone) {
      const fill = tone === "accent" ? [124, 92, 255] : tone === "success" ? [13, 120, 109] : [24, 30, 48];
      doc.setFillColor(fill[0], fill[1], fill[2]);
      doc.roundedRect(x, y, width, 24, 4, 4, "F");

      doc.setFont("helvetica", "normal");
      doc.setTextColor(218, 228, 252);
      doc.setFontSize(9);
      doc.text(label, x + 4, y + 8);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(250, 253, 255);
      doc.setFontSize(12);
      doc.text(value, x + 4, y + 17);
    }

    function drawPlanCard(currentY, entry, index) {
      const plan = entry.plan;
      const metrics = entry.metrics;
      const cardHeight = 44;
      const cardX = page.margin;
      const cardW = page.width - page.margin * 2;

      const safeY = ensureSpace(currentY, cardHeight + 4);
      doc.setFillColor(246, 248, 253);
      doc.setDrawColor(218, 225, 240);
      doc.roundedRect(cardX, safeY, cardW, cardHeight, 4, 4, "FD");

      doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(11);
      const title = String(index + 1).padStart(2, "0") + ". " + plan.name;
      const titleLines = doc.splitTextToSize(title, cardW - 10);
      doc.text(titleLines[0], cardX + 4, safeY + 8);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(73, 85, 107);
      doc.text("Mode: " + modeLabel(plan.mode), cardX + 4, safeY + 14.5);
      doc.text("Start: " + parsePlanDate(plan.startDate).toLocaleDateString(), cardX + 4, safeY + 20);
      if (plan.mode === "simple") {
        doc.text("Daily fixed amount: " + formatCurrency(fixedDailyAmountForPlan(plan)), cardX + 4, safeY + 25.5);
      }

      const leftColX = cardX + cardW * 0.48;
      doc.text("Saved: " + formatCurrency(metrics.completedAmount), leftColX, safeY + 9.5);
      doc.text("Projected by now: " + formatCurrency(metrics.projectedByNow), leftColX, safeY + 15);
      doc.text("Target: " + formatCurrency(plan.targetAmount), leftColX, safeY + 20.5);
      doc.text("Progress: " + metrics.progressPercent.toFixed(1) + "%", leftColX, safeY + 26);
      doc.text("Overdue: " + metrics.overdue + " | Upcoming: " + metrics.upcoming, leftColX, safeY + 31.5);

      const varianceText = metrics.varianceByNow >= 0
        ? "Ahead by " + formatCurrency(Math.abs(metrics.varianceByNow))
        : "Behind by " + formatCurrency(Math.abs(metrics.varianceByNow));
      doc.setTextColor(metrics.varianceByNow >= 0 ? 5 : 145, metrics.varianceByNow >= 0 ? 120 : 30, metrics.varianceByNow >= 0 ? 92 : 50);
      doc.text(varianceText, leftColX, safeY + 37);

      return safeY + cardHeight + 4;
    }

    const subtitle = "User: " + state.currentUsername + " | Generated: " + generatedAt.toLocaleString();
    let y = drawHeader("Zenith 365 Premium Savings Report", subtitle);

    const contentWidth = page.width - page.margin * 2;
    const blockWidth = (contentWidth - 8) / 3;
    drawSummaryBlock(page.margin, y, blockWidth, "Plans", String(planSnapshots.length), "neutral");
    drawSummaryBlock(page.margin + blockWidth + 4, y, blockWidth, "Total Saved", formatCurrency(totals.saved), "success");
    drawSummaryBlock(page.margin + blockWidth * 2 + 8, y, blockWidth, "Total Target", formatCurrency(totals.target), "accent");
    y += 31;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(63, 74, 93);
    doc.text("Open overdue entries across all plans: " + totals.overdue, page.margin, y);
    y += 7;

    if (!planSnapshots.length) {
      doc.setFontSize(11);
      doc.setTextColor(89, 98, 116);
      doc.text("No savings plans found for this account.", page.margin, y + 6);
    } else {
      planSnapshots.forEach(function (entry, index) {
        y = drawPlanCard(y, entry, index);
      });
    }

    const footerY = page.height - 9;
    doc.setDrawColor(220, 226, 240);
    doc.line(page.margin, footerY - 4, page.width - page.margin, footerY - 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 131, 150);
    doc.text("Zenith 365 | Local export generated on this device", page.margin, footerY);

    return doc;
  }

  function handleExport() {
    try {
      const report = buildPremiumPdfReport();
      const filename =
        "zenith365-report-" +
        state.currentUsername.toLowerCase().replace(/[^a-z0-9-_]/g, "-") +
        "-" +
        new Date().toISOString().slice(0, 10) +
        ".pdf";
      report.save(filename);
      window.ZenithAnimations.showToast("Premium PDF report exported.", "success", 1900);
    } catch (error) {
      console.error("PDF export failed:", error);
      window.ZenithAnimations.showToast("PDF export failed. Reload and try again.", "error", 2400);
    }
  }

  function handleImport(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const payload = JSON.parse(String(reader.result));
        window.ZenithStorage.importState(payload);
        window.ZenithAnimations.showToast("Import complete. Please sign in again.", "success", 2200);
        setTimeout(function () {
          window.location.replace("index.html");
        }, 900);
      } catch (_error) {
        window.ZenithAnimations.showToast("Import failed. Invalid JSON payload.", "error");
      }
    };
    reader.readAsText(file);
  }

  function wireDomReferences() {
    ui.planSelect = document.getElementById("plan-select");
    ui.newPlanBtn = document.getElementById("new-plan-btn");
    ui.exportBtn = document.getElementById("export-btn");
    ui.importBtn = document.getElementById("import-btn");
    ui.importInput = document.getElementById("import-file-input");
    ui.logoutBtn = document.getElementById("logout-btn");
    ui.currentUserBadge = document.getElementById("current-user-badge");
    ui.heroUserWrap = document.querySelector(".hero-user-wrap");
    ui.accountMenu = document.getElementById("account-menu");
    ui.accountMenuUser = document.getElementById("account-menu-user");
    ui.switchAccountBtn = document.getElementById("switch-account-btn");
    ui.accountLogoutBtn = document.getElementById("account-logout-btn");

    ui.greeting = document.getElementById("greeting-line");
    ui.activePlanName = document.getElementById("active-plan-name");
    ui.planSummary = document.getElementById("plan-summary");
    ui.savedAmount = document.getElementById("saved-amount");
    ui.projectedByNow = document.getElementById("projected-amount-by-now");
    ui.heroCard = document.getElementById("hero-card");
    ui.progressMeta = document.querySelector(".progress-meta");
    ui.targetAmount = document.getElementById("target-amount");
    ui.progressPercent = document.getElementById("progress-percent");
    ui.ringProgress = document.getElementById("ring-progress");
    ui.payToday = document.getElementById("pay-today-btn");
    ui.payFab = document.getElementById("pay-today-fab");

    ui.kpiStreak = document.getElementById("kpi-streak");
    ui.kpiCompleted = document.getElementById("kpi-completed");
    ui.kpiOverdue = document.getElementById("kpi-overdue");
    ui.kpiUpcoming = document.getElementById("kpi-upcoming");

    ui.monthPrev = document.getElementById("month-prev");
    ui.monthNext = document.getElementById("month-next");
    ui.monthLabel = document.getElementById("month-label");
    ui.calendarGrid = document.getElementById("calendar-grid");
    ui.calendarEmpty = document.getElementById("calendar-empty");
    ui.filterWrap = document.getElementById("calendar-filters");
    ui.projectionNote = document.getElementById("projection-note");

    ui.planModal = document.getElementById("plan-modal");
    ui.planForm = document.getElementById("plan-form");
    ui.cancelPlanBtn = document.getElementById("cancel-plan-btn");
    ui.planName = document.getElementById("plan-name");
    ui.planMode = document.getElementById("plan-mode");
    ui.planStart = document.getElementById("plan-start");
    ui.planColor = document.getElementById("plan-color");
    ui.planTargetPreview = document.getElementById("plan-target-preview");
    ui.simpleAmountWrap = document.getElementById("simple-amount-wrap");
    ui.simpleDailyAmount = document.getElementById("simple-daily-amount");

    if (!ui.heroUserWrap && ui.heroCard) {
      const wrap = document.createElement("div");
      wrap.className = "hero-user-wrap";
      const heading = ui.heroCard.querySelector("#active-plan-name");
      if (heading) ui.heroCard.insertBefore(wrap, heading);
      else ui.heroCard.appendChild(wrap);
      ui.heroUserWrap = wrap;
    }

    if (!ui.currentUserBadge && ui.heroUserWrap) {
      const badge = document.createElement("button");
      badge.id = "current-user-badge";
      badge.className = "hero-user-badge";
      badge.type = "button";
      badge.setAttribute("aria-haspopup", "menu");
      badge.setAttribute("aria-expanded", "false");
      badge.setAttribute("aria-controls", "account-menu");
      const iconNode = document.createElement("span");
      iconNode.className = "user-badge-icon";
      iconNode.setAttribute("aria-hidden", "true");
      const textNode = document.createElement("span");
      textNode.className = "user-badge-text";
      textNode.textContent = "Signed in: -";
      const caretNode = document.createElement("span");
      caretNode.className = "user-badge-caret";
      caretNode.setAttribute("aria-hidden", "true");
      caretNode.innerHTML = "&#9662;";
      badge.appendChild(iconNode);
      badge.appendChild(textNode);
      badge.appendChild(caretNode);
      ui.heroUserWrap.appendChild(badge);
      ui.currentUserBadge = badge;
    }

    if (!ui.accountMenu && ui.heroUserWrap) {
      const menu = document.createElement("div");
      menu.id = "account-menu";
      menu.className = "account-menu hidden";
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", "Account menu");

      const label = document.createElement("p");
      label.className = "account-menu-label";
      label.textContent = "Account";
      menu.appendChild(label);

      const userName = document.createElement("p");
      userName.id = "account-menu-user";
      userName.className = "account-menu-user";
      userName.textContent = "-";
      menu.appendChild(userName);

      const switchButton = document.createElement("button");
      switchButton.id = "switch-account-btn";
      switchButton.className = "account-menu-btn";
      switchButton.type = "button";
      switchButton.setAttribute("role", "menuitem");
      switchButton.textContent = "Switch account";
      menu.appendChild(switchButton);

      const logoutButton = document.createElement("button");
      logoutButton.id = "account-logout-btn";
      logoutButton.className = "account-menu-btn danger";
      logoutButton.type = "button";
      logoutButton.setAttribute("role", "menuitem");
      logoutButton.textContent = "Logout";
      menu.appendChild(logoutButton);

      ui.heroUserWrap.appendChild(menu);
      ui.accountMenu = menu;
    }

    ui.accountMenu = document.getElementById("account-menu");
    ui.accountMenuUser = document.getElementById("account-menu-user");
    ui.switchAccountBtn = document.getElementById("switch-account-btn");
    ui.accountLogoutBtn = document.getElementById("account-logout-btn");

    ensureCurrentUserBadgeStructure();
    setAccountMenuOpen(false);

    if (!ui.projectedByNow && ui.progressMeta) {
      const projected = document.createElement("p");
      projected.id = "projected-amount-by-now";
      projected.className = "projected-amount";
      projected.textContent = "Projected by now " + formatCurrency(0);
      const target = document.getElementById("target-amount");
      if (target) ui.progressMeta.insertBefore(projected, target);
      else ui.progressMeta.appendChild(projected);
      ui.projectedByNow = projected;
    }
  }

  function wireInteractions() {
    ui.newPlanBtn.addEventListener("click", openPlanModal);
    ui.cancelPlanBtn.addEventListener("click", closePlanModal);
    ui.planForm.addEventListener("submit", handlePlanCreation);
    ui.planMode.addEventListener("change", function () {
      updateSimpleAmountVisibility();
      updatePlanTargetPreview();
    });
    if (ui.simpleDailyAmount) {
      ui.simpleDailyAmount.addEventListener("input", updatePlanTargetPreview);
      ui.simpleDailyAmount.addEventListener("change", updatePlanTargetPreview);
    }

    ui.planSelect.addEventListener("change", function () {
      setActivePlan(ui.planSelect.value);
    });

    ui.payToday.addEventListener("click", markTodayPaid);
    ui.payFab.addEventListener("click", markTodayPaid);

    ui.monthPrev.addEventListener("click", function () {
      window.ZenithCalendar.setMonth(-1);
      refreshDashboard();
    });
    ui.monthNext.addEventListener("click", function () {
      window.ZenithCalendar.setMonth(1);
      refreshDashboard();
    });

    ui.filterWrap.addEventListener("click", function (event) {
      const button = event.target.closest(".chip");
      if (!button) return;
      ui.filterWrap.querySelectorAll(".chip").forEach(function (chip) {
        chip.classList.remove("active");
      });
      button.classList.add("active");
      window.ZenithCalendar.setFilter(button.dataset.filter || "all");
      refreshDashboard();
    });

    ui.exportBtn.addEventListener("click", handleExport);
    ui.importBtn.addEventListener("click", function () {
      ui.importInput.click();
    });
    ui.importInput.addEventListener("change", function () {
      if (!ui.importInput.files || !ui.importInput.files[0]) return;
      handleImport(ui.importInput.files[0]);
      ui.importInput.value = "";
    });

    ui.logoutBtn.addEventListener("click", handleLogoutAndRedirect);

    if (ui.currentUserBadge) {
      ui.currentUserBadge.addEventListener("click", function (event) {
        event.stopPropagation();
        toggleAccountMenu();
      });
      ui.currentUserBadge.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleAccountMenu();
        }
      });
    }

    if (ui.switchAccountBtn) {
      ui.switchAccountBtn.addEventListener("click", function () {
        handleLogoutAndRedirect();
      });
    }

    if (ui.accountLogoutBtn) {
      ui.accountLogoutBtn.addEventListener("click", function () {
        handleLogoutAndRedirect();
      });
    }

    document.addEventListener("click", function (event) {
      if (!ui.heroUserWrap || !ui.accountMenu) return;
      if (ui.accountMenu.classList.contains("hidden")) return;
      if (!ui.heroUserWrap.contains(event.target)) {
        closeAccountMenu();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeAccountMenu();
      }
    });

    if (window.ZenithAnimations && window.ZenithAnimations.attachRipple) {
      window.ZenithAnimations.attachRipple(document.querySelectorAll(".btn, .chip, .icon-btn, .fab, .account-menu-btn"));
    }
  }

  function loadInitialState() {
    const store = window.ZenithStorage.loadState(state.currentUsername);
    state.plans = Array.isArray(store.plans) ? store.plans : [];
    state.activePlanId = store.activePlanId;
    if (!state.activePlanId && state.plans.length) {
      state.activePlanId = state.plans[0].id;
    }
  }

  function initCalendar() {
    window.ZenithCalendar.initCalendar({
      gridElement: ui.calendarGrid,
      monthLabelElement: ui.monthLabel,
      emptyElement: ui.calendarEmpty,
      onToggleDay: toggleIndexCompletion
    });
  }

  function initDashboard() {
    if (document.body.dataset.page !== "dashboard") return;
    const session = window.ZenithAuth.requireSession();
    if (!session) return;
    state.currentUsername = session.username;

    wireDomReferences();
    wireInteractions();
    initCalendar();
    window.ZenithCharts.initCharts();
    loadInitialState();

    syncPlanOptions();
    setActivePlan(state.activePlanId);

    if (!state.plans.length) {
      openPlanModal();
    }
  }

  document.addEventListener("DOMContentLoaded", initDashboard);

  window.ZenithApp = {
    initDashboard: initDashboard,
    createPlan: createPlan,
    markTodayPaid: markTodayPaid,
    computePlanMetrics: computePlanMetrics
  };
})();

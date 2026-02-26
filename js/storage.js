(function () {
  "use strict";

  const SCHEMA_VERSION = 2;
  const KEYS = {
    schemaVersion: "zenith365_schema_version",
    session: "zenith365_session_v1",
    users: "zenith365_users_v2",
    plansByUser: "zenith365_plans_by_user_v2",
    activePlanByUser: "zenith365_active_plan_by_user_v2",
    legacyUser: "zenith365_user_v1",
    legacyPlans: "zenith365_plans_v1",
    legacyActivePlanId: "zenith365_active_plan_id_v1"
  };

  function safeParse(rawValue, fallback) {
    if (!rawValue) return fallback;
    try {
      return JSON.parse(rawValue);
    } catch (_error) {
      return fallback;
    }
  }

  function readJSON(key, fallback) {
    return safeParse(localStorage.getItem(key), fallback);
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function planMultiplierForMode(mode) {
    if (mode === "half") return 0.5;
    if (mode === "quarter") return 0.25;
    return 1;
  }

  function totalDaysForMode(mode) {
    return mode === "weekly" ? 52 : 365;
  }

  function arithmeticTotal(totalDays, multiplier) {
    return (totalDays * (totalDays + 1) * multiplier) / 2;
  }

  function roundMoney(amount) {
    return Number(Number(amount || 0).toFixed(2));
  }

  function targetAmountForPlan(totalDays, mode, multiplier, fixedDailyAmount) {
    if (mode === "simple") {
      const fixed = fixedDailyAmount && fixedDailyAmount > 0 ? fixedDailyAmount : 1;
      return roundMoney(totalDays * fixed);
    }
    return roundMoney(arithmeticTotal(totalDays, multiplier));
  }

  function normalizeUser(user) {
    if (!user || typeof user !== "object") return null;
    const username = String(user.username || "").trim();
    const passwordHash = String(user.passwordHash || "").trim();
    if (!username || !passwordHash) return null;
    return {
      username: username,
      passwordHash: passwordHash,
      createdAt: user.createdAt || new Date().toISOString()
    };
  }

  function normalizePlan(plan) {
    if (!plan || typeof plan !== "object") return null;
    if (!plan.id || !plan.name || !plan.startDate || !plan.mode) return null;

    const mode = String(plan.mode);
    const hasExplicitMultiplier = Number(plan.incrementMultiplier) > 0;
    let totalDays = Number(plan.totalDays) > 0 ? Number(plan.totalDays) : totalDaysForMode(mode);
    const multiplier = hasExplicitMultiplier ? Number(plan.incrementMultiplier) : planMultiplierForMode(mode);
    const rawFixedDaily = Number(plan.fixedDailyAmount);
    let fixedDailyAmount = rawFixedDaily > 0 ? roundMoney(rawFixedDaily) : null;
    if (mode === "simple" && !fixedDailyAmount) {
      const legacyTarget = Number(plan.targetAmount);
      if (legacyTarget > 0 && totalDays > 0) {
        fixedDailyAmount = roundMoney(legacyTarget / totalDays);
      }
    }

    // Upgrade legacy half/quarter plans from old durations to 365-day daily variants.
    if (!hasExplicitMultiplier && mode === "half" && totalDays === 182) totalDays = 365;
    if (!hasExplicitMultiplier && mode === "quarter" && totalDays === 91) totalDays = 365;

    const completedDays = plan.completedDays && typeof plan.completedDays === "object"
      ? Object.keys(plan.completedDays).reduce(function (accumulator, key) {
        if (plan.completedDays[key]) accumulator[String(key)] = true;
        return accumulator;
      }, {})
      : {};

    const targetAmount = targetAmountForPlan(totalDays, mode, multiplier, fixedDailyAmount);

    return {
      id: String(plan.id),
      name: String(plan.name),
      startDate: String(plan.startDate),
      mode: mode,
      totalDays: totalDays,
      incrementMultiplier: multiplier,
      fixedDailyAmount: mode === "simple" ? (fixedDailyAmount || 1) : null,
      targetAmount: targetAmount,
      completedDays: completedDays,
      colorTheme: typeof plan.colorTheme === "string" ? plan.colorTheme : "#7c5cff",
      milestonesHit: plan.milestonesHit && typeof plan.milestonesHit === "object" ? plan.milestonesHit : {},
      createdAt: plan.createdAt || new Date().toISOString()
    };
  }

  function normalizeUsers(users) {
    const safeUsers = Array.isArray(users) ? users : [];
    const seen = new Set();
    return safeUsers
      .map(normalizeUser)
      .filter(Boolean)
      .filter(function (user) {
        if (seen.has(user.username)) return false;
        seen.add(user.username);
        return true;
      });
  }

  function normalizePlansByUser(value) {
    const source = value && typeof value === "object" ? value : {};
    const output = {};
    Object.keys(source).forEach(function (username) {
      const plans = Array.isArray(source[username]) ? source[username] : [];
      output[username] = plans.map(normalizePlan).filter(Boolean);
    });
    return output;
  }

  function normalizeActivePlanByUser(value) {
    const source = value && typeof value === "object" ? value : {};
    const output = {};
    Object.keys(source).forEach(function (username) {
      const planId = source[username];
      if (planId) output[username] = String(planId);
    });
    return output;
  }

  function loadVersion() {
    return Number(localStorage.getItem(KEYS.schemaVersion) || 0);
  }

  function ensureUserBuckets(users, plansByUser, activeByUser) {
    users.forEach(function (user) {
      if (!plansByUser[user.username]) plansByUser[user.username] = [];
      const active = activeByUser[user.username];
      const match = plansByUser[user.username].some(function (plan) {
        return plan.id === active;
      });
      if (!match) {
        if (plansByUser[user.username][0]) {
          activeByUser[user.username] = plansByUser[user.username][0].id;
        } else {
          delete activeByUser[user.username];
        }
      }
    });
  }

  function writeAll(users, plansByUser, activeByUser) {
    const safeUsers = normalizeUsers(users);
    const safePlansByUser = normalizePlansByUser(plansByUser);
    const safeActiveByUser = normalizeActivePlanByUser(activeByUser);
    ensureUserBuckets(safeUsers, safePlansByUser, safeActiveByUser);

    writeJSON(KEYS.users, safeUsers);
    writeJSON(KEYS.plansByUser, safePlansByUser);
    writeJSON(KEYS.activePlanByUser, safeActiveByUser);
    localStorage.setItem(KEYS.schemaVersion, String(SCHEMA_VERSION));
  }

  function migrateLegacyToV2() {
    const legacyUser = normalizeUser(readJSON(KEYS.legacyUser, null));
    const legacyRawPlans = readJSON(KEYS.legacyPlans, []);
    const legacyPlans = (Array.isArray(legacyRawPlans) ? legacyRawPlans : [])
      .map(normalizePlan)
      .filter(Boolean);
    const legacyActivePlanId = localStorage.getItem(KEYS.legacyActivePlanId);

    const users = [];
    const plansByUser = {};
    const activeByUser = {};

    if (legacyUser) {
      users.push(legacyUser);
      plansByUser[legacyUser.username] = legacyPlans;
      if (legacyActivePlanId && legacyPlans.some(function (plan) { return plan.id === legacyActivePlanId; })) {
        activeByUser[legacyUser.username] = legacyActivePlanId;
      } else if (legacyPlans[0]) {
        activeByUser[legacyUser.username] = legacyPlans[0].id;
      }
    }

    writeAll(users, plansByUser, activeByUser);
    localStorage.removeItem(KEYS.legacyUser);
    localStorage.removeItem(KEYS.legacyPlans);
    localStorage.removeItem(KEYS.legacyActivePlanId);
  }

  function migrateState() {
    const version = loadVersion();

    if (version < 2) {
      migrateLegacyToV2();
    }

    const users = normalizeUsers(readJSON(KEYS.users, []));
    const plansByUser = normalizePlansByUser(readJSON(KEYS.plansByUser, {}));
    const activeByUser = normalizeActivePlanByUser(readJSON(KEYS.activePlanByUser, {}));
    writeAll(users, plansByUser, activeByUser);
  }

  function getUsers() {
    migrateState();
    return normalizeUsers(readJSON(KEYS.users, []));
  }

  function getUser(username) {
    const safeUsername = String(username || "").trim();
    if (!safeUsername) return null;
    return getUsers().find(function (user) {
      return user.username === safeUsername;
    }) || null;
  }

  function getSession() {
    return readJSON(KEYS.session, null);
  }

  function resolveUsername(candidate) {
    const direct = String(candidate || "").trim();
    if (direct) return direct;
    const session = getSession();
    if (session && session.username) return String(session.username);
    return "";
  }

  function loadState(username) {
    migrateState();

    const users = getUsers();
    const plansByUser = normalizePlansByUser(readJSON(KEYS.plansByUser, {}));
    const activeByUser = normalizeActivePlanByUser(readJSON(KEYS.activePlanByUser, {}));
    const session = getSession();
    const currentUsername = resolveUsername(username);
    const user = currentUsername ? getUser(currentUsername) : null;
    const plans = user ? (plansByUser[currentUsername] || []) : [];
    const activePlanId = user ? (activeByUser[currentUsername] || null) : null;

    return {
      version: Number(localStorage.getItem(KEYS.schemaVersion) || SCHEMA_VERSION),
      users: users,
      user: user,
      session: session,
      plans: plans,
      activePlanId: activePlanId,
      plansByUser: plansByUser,
      activePlanByUser: activeByUser,
      currentUsername: currentUsername || null
    };
  }

  function upsertUser(user) {
    const normalized = normalizeUser(user);
    if (!normalized) {
      throw new Error("Invalid user payload.");
    }

    const users = getUsers();
    const nextUsers = users.filter(function (entry) {
      return entry.username !== normalized.username;
    });
    nextUsers.push(normalized);

    const plansByUser = normalizePlansByUser(readJSON(KEYS.plansByUser, {}));
    const activeByUser = normalizeActivePlanByUser(readJSON(KEYS.activePlanByUser, {}));
    if (!plansByUser[normalized.username]) plansByUser[normalized.username] = [];

    writeAll(nextUsers, plansByUser, activeByUser);
    return normalized;
  }

  function savePlans(usernameOrPlans, maybePlans) {
    let username = "";
    let plans = [];

    if (typeof usernameOrPlans === "string") {
      username = resolveUsername(usernameOrPlans);
      plans = Array.isArray(maybePlans) ? maybePlans : [];
    } else {
      username = resolveUsername("");
      plans = Array.isArray(usernameOrPlans) ? usernameOrPlans : [];
    }

    if (!username) return;

    const plansByUser = normalizePlansByUser(readJSON(KEYS.plansByUser, {}));
    plansByUser[username] = plans.map(normalizePlan).filter(Boolean);

    const users = getUsers();
    const activeByUser = normalizeActivePlanByUser(readJSON(KEYS.activePlanByUser, {}));
    writeAll(users, plansByUser, activeByUser);
  }

  function setActivePlan(usernameOrPlanId, maybePlanId) {
    let username = "";
    let planId = null;
    if (typeof maybePlanId === "undefined") {
      username = resolveUsername("");
      planId = usernameOrPlanId;
    } else {
      username = resolveUsername(usernameOrPlanId);
      planId = maybePlanId;
    }

    if (!username) return;

    const users = getUsers();
    const plansByUser = normalizePlansByUser(readJSON(KEYS.plansByUser, {}));
    const activeByUser = normalizeActivePlanByUser(readJSON(KEYS.activePlanByUser, {}));
    const safePlanId = planId ? String(planId) : "";

    if (!safePlanId) {
      delete activeByUser[username];
    } else {
      activeByUser[username] = safePlanId;
    }
    writeAll(users, plansByUser, activeByUser);
  }

  function setSession(session) {
    if (!session) {
      localStorage.removeItem(KEYS.session);
      return;
    }
    writeJSON(KEYS.session, session);
  }

  function clearSession() {
    localStorage.removeItem(KEYS.session);
  }

  function exportState() {
    migrateState();
    return {
      version: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      users: normalizeUsers(readJSON(KEYS.users, [])),
      plansByUser: normalizePlansByUser(readJSON(KEYS.plansByUser, {})),
      activePlanByUser: normalizeActivePlanByUser(readJSON(KEYS.activePlanByUser, {}))
    };
  }

  function importState(bundle) {
    if (!bundle || typeof bundle !== "object") {
      throw new Error("Invalid import payload.");
    }

    if (bundle.users || bundle.plansByUser || bundle.activePlanByUser) {
      const users = normalizeUsers(bundle.users || []);
      const plansByUser = normalizePlansByUser(bundle.plansByUser || {});
      const activeByUser = normalizeActivePlanByUser(bundle.activePlanByUser || {});
      writeAll(users, plansByUser, activeByUser);
      clearSession();
      return loadState();
    }

    // Legacy single-user import support.
    const legacyUser = normalizeUser(bundle.user || null);
    const users = legacyUser ? [legacyUser] : [];
    const plansByUser = {};
    const activeByUser = {};
    if (legacyUser) {
      const plans = Array.isArray(bundle.plans) ? bundle.plans.map(normalizePlan).filter(Boolean) : [];
      plansByUser[legacyUser.username] = plans;
      const requestedPlan = bundle.activePlanId ? String(bundle.activePlanId) : "";
      const hasRequested = plans.some(function (plan) { return plan.id === requestedPlan; });
      if (hasRequested) activeByUser[legacyUser.username] = requestedPlan;
      else if (plans[0]) activeByUser[legacyUser.username] = plans[0].id;
    }

    writeAll(users, plansByUser, activeByUser);
    clearSession();
    return loadState();
  }

  window.ZenithStorage = {
    KEYS: KEYS,
    SCHEMA_VERSION: SCHEMA_VERSION,
    loadState: loadState,
    savePlans: savePlans,
    setActivePlan: setActivePlan,
    migrateState: migrateState,
    exportState: exportState,
    importState: importState,
    setSession: setSession,
    clearSession: clearSession,
    getUsers: getUsers,
    getUser: getUser,
    upsertUser: upsertUser
  };
})();

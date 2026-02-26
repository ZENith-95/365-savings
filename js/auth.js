(function () {
  "use strict";

  const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
  const authState = {
    mode: "login"
  };

  function toHex(buffer) {
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes)
      .map(function (byte) {
        return byte.toString(16).padStart(2, "0");
      })
      .join("");
  }

  async function hashPassword(password) {
    const encoded = new TextEncoder().encode(String(password));
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    return toHex(digest);
  }

  function randomToken() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map(function (value) {
        return value.toString(16).padStart(2, "0");
      })
      .join("");
  }

  function createSession(username) {
    const issuedAt = Date.now();
    return {
      token: randomToken(),
      username: String(username),
      issuedAt: new Date(issuedAt).toISOString(),
      expiresAt: new Date(issuedAt + SESSION_TTL_MS).toISOString()
    };
  }

  function getUsers() {
    return window.ZenithStorage.getUsers();
  }

  function sortedUsers() {
    return getUsers().slice().sort(function (left, right) {
      return left.username.localeCompare(right.username);
    });
  }

  function userExists(username) {
    return Boolean(window.ZenithStorage.getUser(username));
  }

  async function register(username, password) {
    const safeUsername = String(username || "").trim();
    const safePassword = String(password || "");
    if (!safeUsername || !safePassword) {
      return { ok: false, error: "Username and password are required." };
    }

    if (userExists(safeUsername)) {
      return { ok: false, error: "Username already exists. Choose another one." };
    }

    const user = {
      username: safeUsername,
      passwordHash: await hashPassword(safePassword),
      createdAt: new Date().toISOString()
    };

    window.ZenithStorage.upsertUser(user);
    window.ZenithStorage.savePlans(safeUsername, []);
    window.ZenithStorage.setActivePlan(safeUsername, null);

    const session = createSession(user.username);
    window.ZenithStorage.setSession(session);
    return { ok: true, user: user, session: session };
  }

  async function login(username, password) {
    const candidateUsername = String(username || "").trim();
    const user = window.ZenithStorage.getUser(candidateUsername);
    if (!user) {
      return { ok: false, error: "No account found for that username." };
    }

    const candidateHash = await hashPassword(password || "");
    if (candidateHash !== user.passwordHash) {
      return { ok: false, error: "Invalid username or password." };
    }

    const session = createSession(user.username);
    window.ZenithStorage.setSession(session);
    return { ok: true, session: session, user: user };
  }

  function getSession() {
    const session = window.ZenithStorage.loadState().session;
    if (!session || !session.expiresAt) return null;

    const expiresAt = new Date(session.expiresAt).getTime();
    if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
      window.ZenithStorage.clearSession();
      return null;
    }
    if (!window.ZenithStorage.getUser(session.username)) {
      window.ZenithStorage.clearSession();
      return null;
    }
    return session;
  }

  function requireSession() {
    const session = getSession();
    if (!session) {
      window.location.replace("index.html");
      return null;
    }
    return session;
  }

  function logout() {
    window.ZenithStorage.clearSession();
  }

  function setAuthError(message) {
    const errorNode = document.getElementById("auth-error");
    if (!errorNode) return;
    errorNode.textContent = message || "";
  }

  function getToggleLabel(mode) {
    if (mode === "register") {
      return "Already registered? Sign in.";
    }
    return "New here? Create an account.";
  }

  function updateAuthView() {
    const title = document.getElementById("auth-title");
    const subtitle = document.getElementById("auth-subtitle");
    const submit = document.getElementById("auth-submit");
    const confirmWrap = document.getElementById("confirm-wrap");
    const passwordInput = document.getElementById("password");
    const toggle = document.getElementById("auth-mode-toggle");
    if (!title || !subtitle || !submit || !confirmWrap || !passwordInput || !toggle) return;

    if (authState.mode === "register") {
      title.textContent = "Create Account";
      subtitle.textContent = "Create a secure local account to track your savings.";
      submit.textContent = "Create account";
      confirmWrap.classList.remove("hidden");
      passwordInput.setAttribute("autocomplete", "new-password");
    } else {
      title.textContent = "Sign In";
      subtitle.textContent = "Enter your credentials to continue your savings journey.";
      submit.textContent = "Sign in";
      confirmWrap.classList.add("hidden");
      passwordInput.setAttribute("autocomplete", "current-password");
    }
    toggle.textContent = getToggleLabel(authState.mode);
  }

  function setMode(mode) {
    authState.mode = mode === "register" ? "register" : "login";
    setAuthError("");
    updateAuthView();
  }

  function renderUserShortcuts(usernameInput, selectNode, datalistNode, wrapNode) {
    if (!usernameInput || !selectNode || !datalistNode || !wrapNode) return;
    const users = sortedUsers();

    datalistNode.textContent = "";
    selectNode.textContent = "";

    if (!users.length) {
      wrapNode.classList.add("hidden");
      return;
    }

    users.forEach(function (user) {
      const dataOption = document.createElement("option");
      dataOption.value = user.username;
      datalistNode.appendChild(dataOption);
    });

    const prompt = document.createElement("option");
    prompt.value = "";
    prompt.textContent = "Select saved user";
    selectNode.appendChild(prompt);
    users.forEach(function (user) {
      const option = document.createElement("option");
      option.value = user.username;
      option.textContent = user.username;
      selectNode.appendChild(option);
    });

    const typedValue = usernameInput.value.trim();
    if (typedValue && users.some(function (user) { return user.username === typedValue; })) {
      selectNode.value = typedValue;
    } else {
      selectNode.value = users[0].username;
    }
    wrapNode.classList.remove("hidden");
  }

  function redirectToDashboard() {
    document.body.classList.add("page-exit");
    setTimeout(function () {
      window.location.replace("dashboard.html");
    }, 260);
  }

  function initAuthPage() {
    if (document.body.dataset.page !== "auth") return;

    const session = getSession();
    if (session) {
      window.location.replace("dashboard.html");
      return;
    }

    const form = document.getElementById("auth-form");
    const username = document.getElementById("username");
    const password = document.getElementById("password");
    const confirm = document.getElementById("password-confirm");
    const submit = document.getElementById("auth-submit");
    const toggle = document.getElementById("auth-mode-toggle");
    const knownUsers = document.getElementById("known-users");
    const useKnownUser = document.getElementById("use-known-user");
    const knownUsernames = document.getElementById("known-usernames");
    const userShortcutWrap = document.getElementById("user-shortcut-wrap");
    if (!form || !username || !password || !confirm || !submit || !toggle) return;

    setMode(getUsers().length ? "login" : "register");
    renderUserShortcuts(username, knownUsers, knownUsernames, userShortcutWrap);
    if (window.ZenithAnimations && window.ZenithAnimations.attachRipple) {
      window.ZenithAnimations.attachRipple(submit);
      if (useKnownUser) window.ZenithAnimations.attachRipple(useKnownUser);
    }

    toggle.addEventListener("click", function () {
      setMode(authState.mode === "login" ? "register" : "login");
    });

    if (knownUsers && useKnownUser) {
      useKnownUser.addEventListener("click", function () {
        const selectedUser = knownUsers.value.trim();
        if (!selectedUser) return;
        username.value = selectedUser;
        setMode("login");
        password.focus();
      });

      knownUsers.addEventListener("change", function () {
        const selectedUser = knownUsers.value.trim();
        if (!selectedUser) return;
        username.value = selectedUser;
        setMode("login");
      });
    }

    username.addEventListener("input", function () {
      if (!knownUsers) return;
      const typed = username.value.trim();
      const match = Array.from(knownUsers.options).find(function (option) {
        return option.value === typed;
      });
      knownUsers.value = match ? typed : "";
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      setAuthError("");

      const userValue = username.value.trim();
      const passValue = password.value;
      const confirmValue = confirm.value;
      if (!userValue || !passValue) {
        setAuthError("Enter username and password.");
        return;
      }

      if (authState.mode === "register") {
        if (passValue.length < 6) {
          setAuthError("Use at least 6 characters for password.");
          return;
        }
        if (passValue !== confirmValue) {
          setAuthError("Password confirmation does not match.");
          return;
        }

        const registerResult = await register(userValue, passValue);
        if (!registerResult.ok) {
          setAuthError(registerResult.error);
          return;
        }
        if (window.ZenithAnimations && window.ZenithAnimations.showToast) {
          window.ZenithAnimations.showToast("Account created. Redirecting...", "success", 1600);
        }
        redirectToDashboard();
        return;
      }

      const loginResult = await login(userValue, passValue);
      if (!loginResult.ok) {
        setAuthError(loginResult.error);
        return;
      }
      if (window.ZenithAnimations && window.ZenithAnimations.showToast) {
        window.ZenithAnimations.showToast("Login successful.", "success", 1400);
      }
      redirectToDashboard();
    });
  }

  document.addEventListener("DOMContentLoaded", initAuthPage);

  window.ZenithAuth = {
    hashPassword: hashPassword,
    register: register,
    login: login,
    logout: logout,
    getSession: getSession,
    requireSession: requireSession
  };
})();

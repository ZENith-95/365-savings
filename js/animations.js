(function () {
  "use strict";

  function attachRipple(target) {
    const elements = typeof target === "string"
      ? Array.from(document.querySelectorAll(target))
      : (target instanceof Element ? [target] : Array.from(target || []));

    elements.forEach(function (element) {
      if (!element || element.dataset.rippleBound === "1") return;
      element.dataset.rippleBound = "1";
      element.addEventListener("click", function (event) {
        const rect = element.getBoundingClientRect();
        const ripple = document.createElement("span");
        const diameter = Math.max(rect.width, rect.height);
        ripple.className = "ripple";
        ripple.style.width = diameter + "px";
        ripple.style.height = diameter + "px";
        ripple.style.left = event.clientX - rect.left - diameter / 2 + "px";
        ripple.style.top = event.clientY - rect.top - diameter / 2 + "px";
        element.appendChild(ripple);
        setTimeout(function () {
          ripple.remove();
        }, 540);
      });
    });
  }

  function showToast(message, tone, timeoutMs) {
    const root = document.getElementById("toast-root");
    if (!root) return;

    const toast = document.createElement("div");
    toast.className = "toast " + (tone || "neutral");
    toast.setAttribute("role", "status");
    toast.textContent = String(message || "");
    root.appendChild(toast);

    const lifetime = Number(timeoutMs) > 0 ? Number(timeoutMs) : 2800;
    setTimeout(function () {
      toast.classList.add("fade-out");
      setTimeout(function () {
        toast.remove();
      }, 260);
    }, lifetime);
  }

  function animateCount(element, targetValue, options) {
    if (!element) return;
    const settings = options || {};
    const duration = Number(settings.duration) > 0 ? Number(settings.duration) : 680;
    const prefix = settings.prefix || "";
    const suffix = settings.suffix || "";
    const formatter = settings.formatter;

    const initial = Number(element.dataset.countValue || 0);
    const target = Number(targetValue || 0);
    const start = performance.now();

    function frame(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = initial + (target - initial) * eased;
      const finalValue = progress < 1 ? value : target;
      if (typeof formatter === "function") {
        element.textContent = formatter(finalValue);
      } else {
        element.textContent = prefix + Math.round(finalValue).toLocaleString() + suffix;
      }
      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        element.dataset.countValue = String(target);
      }
    }

    requestAnimationFrame(frame);
  }

  function runConfetti(options) {
    const canvas = document.getElementById("confetti-canvas");
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const burst = options && options.count ? Number(options.count) : 100;
    const colors = ["#7c5cff", "#00d3a7", "#ffca3a", "#f8f9ff"];
    const particles = [];
    for (let i = 0; i < burst; i += 1) {
      particles.push({
        x: Math.random() * width,
        y: -20 - Math.random() * 100,
        size: 4 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        velocityX: -2 + Math.random() * 4,
        velocityY: 2 + Math.random() * 4,
        rotation: Math.random() * Math.PI,
        spin: -0.08 + Math.random() * 0.16,
        alpha: 1
      });
    }

    const gravity = 0.06;
    let rafId = null;

    function tick() {
      context.clearRect(0, 0, width, height);
      particles.forEach(function (particle) {
        particle.velocityY += gravity;
        particle.x += particle.velocityX;
        particle.y += particle.velocityY;
        particle.rotation += particle.spin;
        particle.alpha -= 0.0048;

        context.save();
        context.translate(particle.x, particle.y);
        context.rotate(particle.rotation);
        context.globalAlpha = Math.max(particle.alpha, 0);
        context.fillStyle = particle.color;
        context.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.7);
        context.restore();
      });

      const alive = particles.some(function (particle) {
        return particle.alpha > 0 && particle.y < height + 24;
      });

      if (alive) {
        rafId = requestAnimationFrame(tick);
      } else {
        context.clearRect(0, 0, width, height);
        if (rafId) cancelAnimationFrame(rafId);
      }
    }

    tick();
  }

  function vibratePulse() {
    if (navigator.vibrate) {
      navigator.vibrate([18, 20, 28]);
    }
  }

  window.ZenithAnimations = {
    showToast: showToast,
    runConfetti: runConfetti,
    animateCount: animateCount,
    attachRipple: attachRipple,
    vibratePulse: vibratePulse
  };
})();

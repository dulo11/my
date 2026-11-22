/* 「云的另一面」文章交互：不联网，不采集访客信息 */
(function () {
  "use strict";
  const KEY = "yun-letter-time-capsule-v1";
  const quotes = [
    "你不必一直发光，月亮也有看不见的那一面。",
    "慢一点没有关系，星星也要走很远才到达眼睛。",
    "把今天的遗憾折成纸船，明天会有新的河流。",
    "不是每朵云都要下雨，有些只是来替天空画画。",
    "你已经走过许多曾经觉得走不过的日子。",
    "愿你保有好奇，也允许自己偶尔平凡。",
    "世界很大，而你依然有权选择自己的节奏。",
    "有些答案会迟到，但你仍然值得好好生活。",
    "风会经过每条街，而温柔不必有固定的方向。",
    "就算今天是一片雾，也不代表明天没有日出。"
  ];
  function init() {
    const root = document.getElementById("yun-letter");
    if (!root || root.dataset.yunReady === "1") return;
    root.dataset.yunReady = "1";

    const choices = Array.from(root.querySelectorAll("[data-yun-mood]"));
    const fortune = root.querySelector("[data-yun-quote]");
    const fortuneButton = root.querySelector("[data-yun-fortune]");
    const input = root.querySelector("[data-yun-capsule]");
    const status = root.querySelector("[data-yun-status]");
    const saveButton = root.querySelector("[data-yun-save]");
    const clearButton = root.querySelector("[data-yun-clear]");
    const bar = root.querySelector(".yun-letter__progress");
    const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    choices.forEach((button) => {
      button.addEventListener("click", () => {
        const scene = button.getAttribute("data-yun-mood");
        if (!["dawn", "aurora", "sunset", "night"].includes(scene)) return;
        root.dataset.scene = scene;
        choices.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      });
    });

    function sparkle() {
      if (reducedMotion) return;
      const rect = fortuneButton.getBoundingClientRect();
      const parent = root.getBoundingClientRect();
      for (let i = 0; i < 15; i++) {
        const star = document.createElement("span");
        star.className = "yun-letter__spark";
        star.setAttribute("aria-hidden", "true");
        star.style.left = (rect.left - parent.left + rect.width / 2) + "px";
        star.style.top = (rect.top - parent.top + rect.height / 2) + "px";
        const angle = Math.PI * 2 * i / 15;
        const distance = 30 + Math.random() * 80;
        star.style.setProperty("--yl-x", Math.cos(angle) * distance + "px");
        star.style.setProperty("--yl-y", Math.sin(angle) * distance + "px");
        root.appendChild(star);
        window.setTimeout(() => star.remove(), 1050);
      }
    }
    if (fortune && fortuneButton) {
      fortuneButton.addEventListener("click", () => {
        let next = quotes[Math.floor(Math.random() * quotes.length)];
        if (next === fortune.textContent && quotes.length > 1) {
          next = quotes[(quotes.indexOf(next) + 1) % quotes.length];
        }
        fortune.textContent = next;
        sparkle();
      });
    }

    if (input && status && saveButton && clearButton) {
      try {
        const saved = window.localStorage.getItem(KEY);
        if (saved !== null) input.value = saved;
      } catch (e) {
        status.textContent = "浏览器限制了本地存储，你仍可以写下文字，但无法在关闭后保留。";
      }
      saveButton.addEventListener("click", () => {
        const message = input.value.trim().slice(0,240);
        if (!message) { status.textContent = "先写一句想对未来的自己说的话吧。"; return; }
        try {
          window.localStorage.setItem(KEY, message);
          input.value = message;
          status.textContent = "已留在这台设备的当前浏览器里。它不会上传到网站。";
        } catch (e) { status.textContent = "保存失败：当前浏览器禁止了本地存储。"; }
      });
      clearButton.addEventListener("click", () => {
        input.value = "";
        try {
          window.localStorage.removeItem(KEY);
          status.textContent = "本地的这封信已清空。";
        } catch (e) { status.textContent = "输入已清空，但无法修改浏览器存储。"; }
      });
    }

    let scheduled = false;
    function updateProgress() {
      scheduled = false;
      if (!bar || !root.isConnected) return;
      const rect = root.getBoundingClientRect();
      const visibleLength = rect.height + window.innerHeight;
      const progress = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / visibleLength));
      bar.style.transform = "scaleX(" + progress.toFixed(4) + ")";
    }
    window.addEventListener("scroll", () => {
      if (!scheduled) {
        scheduled = true;
        window.requestAnimationFrame(updateProgress);
      }
    }, { passive:true });
    window.addEventListener("resize", updateProgress, { passive:true });
    updateProgress();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  document.addEventListener("pjax:complete", init);
})();

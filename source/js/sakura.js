/* sakura.js - falling petals */
(function () {
  function rand(min, max) { return Math.random() * (max - min) + min; }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.style.position = "fixed";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "2"; // 在背景之上、内容之下
  document.body.appendChild(canvas);

  function resize() {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  const petals = [];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = window.matchMedia('(max-width: 768px)');
  const PETAL_COUNT = reducedMotion.matches ? 0 : (mobile.matches ? 12 : 35);

  function newPetal() {
    return {
      x: rand(0, window.innerWidth),
      y: rand(-window.innerHeight, 0),
      r: rand(6, 12),
      sx: rand(-0.6, 0.6),
      sy: rand(0.8, 2.0),
      rot: rand(0, Math.PI * 2),
      srot: rand(-0.02, 0.02),
      alpha: rand(0.4, 0.85),
    };
  }

  for (let i = 0; i < PETAL_COUNT; i++) petals.push(newPetal());

  function drawPetal(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = p.alpha;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(p.r, -p.r * 0.6, p.r * 1.4, p.r * 0.6, 0, p.r);
    ctx.bezierCurveTo(-p.r * 1.4, p.r * 0.6, -p.r, -p.r * 0.6, 0, 0);
    ctx.fillStyle = "#ffd1dc";
    ctx.fill();
    ctx.restore();
  }

  let frameId = null;
  function tick() {
    frameId = null;
    if (document.hidden || reducedMotion.matches) return;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of petals) {
      p.x += p.sx;
      p.y += p.sy;
      p.rot += p.srot;

      if (p.y > window.innerHeight + 20 || p.x < -50 || p.x > window.innerWidth + 50) {
        Object.assign(p, newPetal(), { y: -20 });
      }
      drawPetal(p);
    }
    schedule();
  }
  function schedule() {
    if (frameId === null && !document.hidden && !reducedMotion.matches) frameId = requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && frameId !== null) { cancelAnimationFrame(frameId); frameId = null; }
    else schedule();
  });
  schedule();
})();

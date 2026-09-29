(() => {
  const canvas = document.getElementById('header-stellar-wind');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0;
  let height = 0;
  let particles = [];
  let frame = null;
  let lastTime = null;
  let elapsed = 0;

  function resize() {
    const bounds = canvas.parentElement.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    particles = Array.from({ length: Math.min(140, Math.max(30, Math.round(width / 12))) }, (_, index) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      phase: Math.random() * Math.PI * 2,
      speed: 55 + Math.random() * 80,
      length: 45 + Math.random() * 100,
      alpha: 0.28 + Math.random() * 0.25,
      color: index % 3 === 0 ? '118, 105, 190' : '52, 120, 207',
    }));
  }

  function trailY(particle, x) {
    return particle.y + Math.sin(x / 180 + elapsed * 0.6 + particle.phase) * 5;
  }

  function render(now) {
    frame = null;
    if (document.hidden || reducedMotion.matches) return;
    if (lastTime !== null && now - lastTime < 1000 / 30) {
      frame = window.requestAnimationFrame(render);
      return;
    }
    const delta = lastTime === null ? 0 : Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    elapsed += delta;
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'round';
    for (const particle of particles) {
      particle.x += particle.speed * delta;
      if (particle.x - particle.length > width) {
        particle.x = 0;
        particle.y = Math.random() * height;
      }
      const tailX = particle.x - particle.length;
      const headY = trailY(particle, particle.x);
      const gradient = ctx.createLinearGradient(tailX, 0, particle.x, 0);
      gradient.addColorStop(0, `rgba(${particle.color}, 0)`);
      gradient.addColorStop(1, `rgba(${particle.color}, ${particle.alpha})`);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(tailX, trailY(particle, tailX));
      for (let step = 1; step <= 8; step += 1) {
        const x = tailX + particle.length * step / 8;
        ctx.lineTo(x, trailY(particle, x));
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.fillStyle = `rgba(${particle.color}, ${particle.alpha})`;
      ctx.arc(particle.x, headY, 1.25, 0, Math.PI * 2);
      ctx.fill();
    }
    frame = window.requestAnimationFrame(render);
  }

  function syncPlayback() {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    lastTime = null;
    if (reducedMotion.matches) ctx.clearRect(0, 0, width, height);
    if (!document.hidden && !reducedMotion.matches) frame = window.requestAnimationFrame(render);
  }

  new ResizeObserver(resize).observe(canvas.parentElement);
  document.addEventListener('visibilitychange', syncPlayback);
  reducedMotion.addEventListener('change', syncPlayback);
  resize();
  syncPlayback();
})();

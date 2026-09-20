(() => {
  const canvas = document.getElementById('fabric');
  if (!canvas) return;

  const context = canvas.getContext('2d');
  const spacing = 80;
  const radius = 400;
  const mouse = { x: -1000, y: -1000 };
  let points = [];
  let rows = 0;
  let columns = 0;

  function initialize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * pixelRatio);
    canvas.height = Math.round(window.innerHeight * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    columns = Math.ceil(window.innerWidth / spacing) + 1;
    rows = Math.ceil(window.innerHeight / spacing) + 1;
    points = Array.from({ length: columns }, (_, column) =>
      Array.from({ length: rows }, (_, row) => ({
        originalX: column * spacing,
        originalY: row * spacing,
        x: column * spacing,
        y: row * spacing,
      })),
    );
  }

  function render() {
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);

    for (const column of points) {
      for (const point of column) {
        const deltaX = mouse.x - point.originalX;
        const deltaY = mouse.y - point.originalY;
        const distance = Math.hypot(deltaX, deltaY);
        let targetX = point.originalX;
        let targetY = point.originalY;

        if (distance < radius) {
          const force = ((radius - distance) / radius) ** 2;
          targetX += deltaX * force * 0.8;
          targetY += deltaY * force * 0.8;
        }

        point.x += (targetX - point.x) * 0.15;
        point.y += (targetY - point.y) * 0.15;
      }
    }

    context.beginPath();
    context.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.lineWidth = 1;

    for (let row = 0; row < rows; row += 1) {
      context.moveTo(points[0][row].x, points[0][row].y);
      for (let column = 1; column < columns; column += 1) {
        context.lineTo(points[column][row].x, points[column][row].y);
      }
    }

    for (let column = 0; column < columns; column += 1) {
      context.moveTo(points[column][0].x, points[column][0].y);
      for (let row = 1; row < rows; row += 1) {
        context.lineTo(points[column][row].x, points[column][row].y);
      }
    }

    context.stroke();
    window.requestAnimationFrame(render);
  }

  window.addEventListener('mousemove', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  }, { passive: true });

  window.addEventListener('mouseleave', () => {
    mouse.x = -1000;
    mouse.y = -1000;
  });

  window.addEventListener('resize', initialize, { passive: true });
  initialize();
  render();
})();

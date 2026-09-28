(() => {
  const page = document.querySelector('.about-page');
  const fabric = page?.querySelector('.about-fabric');
  if (!fabric) return;

  // Home's gravity model, in page coordinates so the mesh scrolls with the content.
  const spacing = 80;
  const radius = 400;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mouse = { x: -1000, y: -1000, active: false };
  let points = [];
  let columns = 0;
  let rows = 0;
  let frame = 0;
  const mesh = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  mesh.setAttribute('fill', 'none');
  mesh.setAttribute('stroke', '#000');
  mesh.setAttribute('stroke-opacity', '0.15');
  mesh.setAttribute('stroke-width', '1');
  const ns = 'http://www.w3.org/2000/svg';
  const defs = document.createElementNS(ns, 'defs');
  const mask = document.createElementNS(ns, 'mask');
  mask.setAttribute('id', 'about-text-mask');
  mask.setAttribute('maskUnits', 'userSpaceOnUse');
  mask.setAttribute('maskContentUnits', 'userSpaceOnUse');
  mask.style.maskType = 'luminance';
  defs.append(mask);
  mesh.setAttribute('mask', 'url(#about-text-mask)');
  fabric.replaceChildren(defs, mesh);

  function maskText(width, height) {
    // Rasterize the stationary fades once per layout, not on every pointer frame.
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 8192 / Math.max(width, height));
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const context = canvas.getContext('2d');
    context.scale(scale, scale);
    context.fillStyle = 'white';
    context.fillRect(0, 0, width, height);
    context.fillStyle = 'black';
    context.shadowColor = 'black';
    context.shadowBlur = 10 * scale;
    mask.setAttribute('x', '0');
    mask.setAttribute('y', '0');
    mask.setAttribute('width', width);
    mask.setAttribute('height', height);
    const origin = page.getBoundingClientRect();
    const walker = document.createTreeWalker(page.querySelector('.about-shell'), NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim()) continue;
      range.selectNodeContents(node);
      // Use each rendered text line, not its enclosing box or column.
      for (const bounds of range.getClientRects()) {
        if (!bounds.width || !bounds.height) continue;
        context.fillRect(bounds.left - origin.left - 5, bounds.top - origin.top - 3,
          bounds.width + 10, bounds.height + 6);
      }
    }
    // Leave a feathered clearance around structural dividers as well as text.
    for (const element of page.querySelectorAll('.about-shell *')) {
      if (element.closest('.about-pill, .about-instrument, .about-binary')) continue;
      const bounds = element.getBoundingClientRect();
      if (!bounds.width || !bounds.height) continue;
      const style = getComputedStyle(element);
      const x = bounds.left - origin.left;
      const y = bounds.top - origin.top;
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
        const thickness = parseFloat(style[`border${side}Width`]);
        if (!thickness || ['none', 'hidden'].includes(style[`border${side}Style`])) continue;
        const horizontal = side === 'Top' || side === 'Bottom';
        const edgeX = side === 'Right' ? x + bounds.width - thickness / 2 : x;
        const edgeY = side === 'Bottom' ? y + bounds.height - thickness / 2 : y;
        const clearance = 10;
        context.fillRect(edgeX - clearance, edgeY - clearance,
          horizontal ? bounds.width + clearance * 2 : thickness + clearance * 2,
          horizontal ? thickness + clearance * 2 : bounds.height + clearance * 2);
      }
    }
    const image = document.createElementNS(ns, 'image');
    image.setAttribute('width', width);
    image.setAttribute('height', height);
    image.setAttribute('preserveAspectRatio', 'none');
    image.setAttribute('href', canvas.toDataURL());
    mask.replaceChildren(image);
  }

  function schedule() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(render);
  }

  function initialize() {
    const width = page.clientWidth;
    const height = page.clientHeight;
    if (!width || !height) return;
    fabric.setAttribute('viewBox', `0 0 ${width} ${height}`);
    maskText(width, height);
    columns = Math.ceil(width / spacing) + 1;
    rows = Math.ceil(height / spacing) + 1;
    points = Array.from({ length: columns }, (_, column) =>
      Array.from({ length: rows }, (_, row) => ({
        originalX: column * spacing, originalY: row * spacing,
        x: column * spacing, y: row * spacing,
      })),
    );
    schedule();
  }

  function render() {
    frame = 0;
    if (!points.length) return;
    const bounds = page.getBoundingClientRect();
    const mouseX = mouse.x - bounds.left;
    const mouseY = mouse.y - bounds.top;
    // Include a gravity-radius margin so lines entering the viewport are continuous.
    const firstRow = Math.max(0, Math.floor((-bounds.top - radius) / spacing));
    const lastRow = Math.min(rows - 1, Math.ceil((window.innerHeight - bounds.top + radius) / spacing));
    if (lastRow < firstRow) return;
    let moving = false;
    for (const column of points) {
      for (let row = firstRow; row <= lastRow; row += 1) {
        const point = column[row];
        const dx = mouseX - point.originalX;
        const dy = mouseY - point.originalY;
        const distance = Math.hypot(dx, dy);
        const force = mouse.active && !reducedMotion.matches && distance < radius
          ? ((radius - distance) / radius) ** 2 * 0.8 : 0;
        const targetX = point.originalX + dx * force;
        const targetY = point.originalY + dy * force;
        const deltaX = targetX - point.x;
        const deltaY = targetY - point.y;
        if (Math.abs(deltaX) + Math.abs(deltaY) > 0.05) {
          point.x += deltaX * 0.15;
          point.y += deltaY * 0.15;
          moving = true;
        } else {
          point.x = targetX;
          point.y = targetY;
        }
      }
    }
    const paths = [];
    const coordinate = point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    for (let row = firstRow; row <= lastRow; row += 1) {
      paths.push(`M${points.map(column => coordinate(column[row])).join('L')}`);
    }
    for (const column of points) paths.push(`M${column.slice(firstRow, lastRow + 1).map(coordinate).join('L')}`);
    mesh.setAttribute('d', paths.join(' '));
    if (moving) schedule();
  }

  window.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return;
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.active = true;
    schedule();
  }, { passive: true });
  function resetPointer() {
    mouse.active = false;
    schedule();
  }
  document.documentElement.addEventListener('pointerleave', resetPointer);
  window.addEventListener('blur', resetPointer);
  window.addEventListener('scroll', schedule, { passive: true });
  document.addEventListener('visibilitychange', schedule);
  reducedMotion.addEventListener('change', schedule);
  let layoutFrame = 0;
  function scheduleLayout() {
    if (layoutFrame) return;
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = 0;
      initialize();
    });
  }
  new ResizeObserver(scheduleLayout).observe(page);
  initialize();
  document.fonts?.ready.then(scheduleLayout);
})();

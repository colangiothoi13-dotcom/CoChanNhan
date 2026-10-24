/** Keep edge HUD panels apart when font settings change their intrinsic height. */
export function observeHudLayout(): () => void {
  const header = document.getElementById('top-hud');
  const controls = document.getElementById('touch-controls');
  const name = document.getElementById('hud-name');
  if (!header || !controls || !name || typeof ResizeObserver === 'undefined') return () => {};

  const root = document.documentElement;
  let frame = 0;
  const update = () => {
    frame = 0;
    // Compare the computed type size, so text-only zoom also gets a compact HUD.
    root.dataset.largeText = String(parseFloat(getComputedStyle(name).fontSize) > 22);
    root.style.setProperty('--quest-top', `${header.getBoundingClientRect().bottom + 16}px`);
    root.style.setProperty('--toast-top', `${header.getBoundingClientRect().bottom + 10}px`);
    root.style.setProperty('--controls-height', `${controls.getBoundingClientRect().height}px`);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  const observer = new ResizeObserver(schedule);
  observer.observe(header);
  observer.observe(controls);
  observer.observe(name);
  window.addEventListener('resize', schedule);
  update();

  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', schedule);
    delete root.dataset.largeText;
    root.style.removeProperty('--quest-top');
    root.style.removeProperty('--toast-top');
    root.style.removeProperty('--controls-height');
  };
}

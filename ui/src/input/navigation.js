// Use the rendered geometry so navigation follows responsive columns, not an
// assumed item count. Native dialogs remain the focus and dismissal boundary.
const FOCUSABLE =
  'button, a[href], input:not([type="hidden"]), select, textarea, summary, [tabindex="0"]';
const GRID =
  "[data-navigation-grid], .appearance-grid, .preset-order, .group-gallery";
const CONTROLLER_ACTION =
  '[data-controller-activate="true"], [data-customization-category], .appearance-tile, .favorite-button, .preset-row-label, .local-players button, .navigation-toggle, .nav-items button, .home-destinations button, .tabs button, [role="tab"], .appearance-steps button, .sticker-slots button, .appearance-toolbar button[aria-pressed], .preview-mode button, .preview-toggle, summary';

export function navigationScope(doc = document) {
  return [...doc.querySelectorAll("dialog[open]")].at(-1) || doc.body;
}

export function isVisibleControl(element) {
  if (
    element.disabled ||
    element.matches(':disabled, [aria-disabled="true"]') ||
    element.closest("[hidden], [inert], dialog:not([open])")
  )
    return false;
  const style = element.ownerDocument.defaultView.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    rect.width > 0 &&
    rect.height > 0
  );
}

export function visibleControls(scope) {
  return [...scope.querySelectorAll(FOCUSABLE)].filter(isVisibleControl);
}

export function directionalTarget(current, candidates, direction) {
  const from = current.getBoundingClientRect();
  const horizontal = direction === "left" || direction === "right";
  const sign = direction === "left" || direction === "up" ? -1 : 1;
  const center = (rect) => ({
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  });
  const origin = center(from);
  let best,
    bestScore = Infinity;
  for (const candidate of candidates) {
    if (candidate === current) continue;
    const rect = candidate.getBoundingClientRect(),
      point = center(rect);
    const forward =
      (horizontal ? point.x - origin.x : point.y - origin.y) * sign;
    if (forward <= 2) continue;
    const cross = Math.abs(
      horizontal ? point.y - origin.y : point.x - origin.x,
    );
    const overlap = horizontal
      ? rect.bottom > from.top + 1 && rect.top < from.bottom - 1
      : rect.right > from.left + 1 && rect.left < from.right - 1;
    // Strongly prefer the next item in the same visual row/column.
    const score = forward + cross * 2 + (overlap ? 0 : 10000);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function focus(element) {
  element.focus({ preventScroll: true });
  element.scrollIntoView?.({
    block: "nearest",
    inline: "nearest",
    behavior: "instant",
  });
}

export function moveFocus(
  direction,
  { controller = false, doc = document } = {},
) {
  const scope = navigationScope(doc),
    current = doc.activeElement;
  let candidates;
  if (controller) {
    candidates = visibleControls(scope).filter((element) =>
      element.matches(CONTROLLER_ACTION),
    );
  } else {
    const grid = current?.closest?.(GRID);
    if (!grid || !scope.contains(grid)) return false;
    candidates = visibleControls(grid);
    // Favorite and reorder controls remain reachable by Tab. Arrows travel
    // through the recognizable main tiles, avoiding small action controls.
    const tiles = candidates.filter((element) =>
      element.matches(
        ".appearance-tile, .preset-row-label, [data-navigation-item]",
      ),
    );
    if (tiles.length) candidates = tiles;
  }
  if (!candidates.length) return false;
  if (
    !scope.contains(current) ||
    (controller && !candidates.includes(current))
  ) {
    if (!controller) return false;
    focus(
      candidates.find(
        (element) => element.getAttribute("aria-pressed") === "true",
      ) || candidates[0],
    );
    return true;
  }
  const next = directionalTarget(current, candidates, direction);
  if (next) focus(next);
  // Consume a boundary arrow instead of scrolling away from the active grid.
  return true;
}

export function activateControllerTarget(doc = document) {
  const target = doc.activeElement;
  if (
    !navigationScope(doc).contains(target) ||
    !target?.matches?.(CONTROLLER_ACTION) ||
    !isVisibleControl(target)
  )
    return false;
  if (
    target.closest("[data-controller-skip]") ||
    target.matches("[data-save-action]")
  )
    return false;
  target.click();
  return true;
}

export function saveEditor(doc = document) {
  const scope = navigationScope(doc);
  if (scope.tagName !== "DIALOG") return false;
  const save = scope.querySelector("[data-save-action]");
  if (!save || !isVisibleControl(save)) return false;
  save.click();
  return true;
}

export function changeCustomizationCategory(delta, doc = document) {
  const scope = navigationScope(doc);
  if (scope.tagName !== "DIALOG") return false;
  const categories = scope.querySelector("[data-customization-categories]");
  if (!categories) return false;
  const buttons = [
    ...categories.querySelectorAll("[data-customization-category]"),
  ];
  const available = buttons.filter(isVisibleControl);
  if (available.length < 2) return false;
  const selected = buttons.findIndex(
    (button) =>
      button.getAttribute("aria-pressed") === "true" ||
      button.getAttribute("aria-selected") === "true",
  );
  const current =
    selected < 0 ? Math.max(0, buttons.indexOf(doc.activeElement)) : selected;
  for (let step = 1; step < buttons.length; step++) {
    const next =
      buttons[
        (current + Math.sign(delta) * step + buttons.length) % buttons.length
      ];
    if (!available.includes(next)) continue;
    next.click();
    if (next.isConnected) focus(next);
    return true;
  }
  return false;
}

export function changeRowPage(delta, doc = document) {
  const scope = navigationScope(doc),
    current = doc.activeElement;
  // Appearance pages belong to their current picker. Never page a collection
  // behind a dialog or another visible section just because it has more items.
  const owner = current?.closest?.(".row-page, .appearance-picker");
  const region = owner && scope.contains(owner) ? owner : scope;
  const pagers = [...region.querySelectorAll(".row-pagination")].filter(
    (pager) => [...pager.querySelectorAll("button")].some(isVisibleControl),
  );
  const currentRect = current?.getBoundingClientRect();
  if (pagers.length > 1 && currentRect)
    pagers.sort((a, b) => {
      const distance = (node) => {
        const rect = node.getBoundingClientRect();
        return (
          Math.abs(rect.top - currentRect.top) +
          Math.abs(rect.left - currentRect.left)
        );
      };
      return distance(a) - distance(b);
    });
  const pager = pagers[0];
  if (!pager) return false;
  const button = pager.querySelector(
    `button[aria-label^="${delta < 0 ? "Previous" : "Next"} "][aria-label$=" page"]`,
  );
  if (!button || !isVisibleControl(button)) return false;
  const container = pager.closest(".row-page") || region;
  const tiles = [
    ...container.querySelectorAll(
      ".appearance-tile, .preset-row-label, [data-navigation-item]",
    ),
  ].filter(isVisibleControl);
  const index = Math.max(0, tiles.indexOf(current));
  button.click();
  // React may replace every tile. Keep the controller/keyboard cursor in the
  // same visual position on the new page rather than dropping it onto body.
  const restore = () => {
    if (
      !container.isConnected ||
      doc.visibilityState !== "visible" ||
      !doc.hasFocus()
    )
      return;
    const next = [
      ...container.querySelectorAll(
        ".appearance-tile, .preset-row-label, [data-navigation-item]",
      ),
    ].filter(isVisibleControl);
    if (next.length) focus(next[Math.min(index, next.length - 1)]);
  };
  if (doc.defaultView.requestAnimationFrame)
    doc.defaultView.requestAnimationFrame(restore);
  else queueMicrotask(restore);
  return true;
}

export function cancelDialog(doc = document) {
  const scope = navigationScope(doc);
  if (scope.tagName !== "DIALOG") return false;
  // The existing dialog onCancel owns dirty-draft and busy guards.
  scope.dispatchEvent(
    new Event("cancel", { bubbles: false, cancelable: true }),
  );
  return true;
}

export function controllerDirection(pad) {
  const pressed = (index) => pad.buttons[index]?.pressed;
  if (pressed(14)) return "left";
  if (pressed(15)) return "right";
  if (pressed(12)) return "up";
  if (pressed(13)) return "down";
  const [x = 0, y = 0] = pad.axes;
  if (Math.max(Math.abs(x), Math.abs(y)) < 0.65) return null;
  return Math.abs(x) > Math.abs(y)
    ? x < 0
      ? "left"
      : "right"
    : y < 0
      ? "up"
      : "down";
}

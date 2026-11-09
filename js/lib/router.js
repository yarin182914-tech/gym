const DEFAULT_ROUTE = 'today';

const routes = {};
let active = null; // { name, unmount }
const routeListeners = [];

// fn(name) on every screen change — and right away if one is showing.
export function onRouteChange(fn) {
  routeListeners.push(fn);
  if (active) fn(active.name);
}

// `unmount` is optional but must be supplied by any route that starts a timer,
// subscription, or anything else that outlives a single render. Routes share
// one container element, so a route left running will draw over its successor.
export function registerRoute(name, mount, unmount) {
  routes[name] = { mount, unmount };
}

function currentRouteName() {
  const hash = location.hash.replace(/^#\//, '');
  const name = hash.split('/')[0];
  return routes[name] ? name : DEFAULT_ROUTE;
}

export function navigate(name) {
  location.hash = `#/${name}`;
}

export function startRouter() {
  let firstRender = true;

  const go = () => {
    const name = currentRouteName();
    if (active && active.name === name) return;

    if (active?.unmount) active.unmount();

    // A tab lights up for every screen in its data-routes (history is part
    // of אימון), so a screen with no tab of its own leaves them all off.
    document.querySelectorAll('.bottom-nav a').forEach((a) => {
      const isActive = (a.dataset.routes || '').split(' ').includes(name);
      a.classList.toggle('active', isActive);
      // Conveys the current screen to assistive tech; the class only changes
      // colour and weight, which is not announced.
      if (isActive) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    const route = routes[name];
    active = { name, unmount: route.unmount };
    routeListeners.forEach((fn) => fn(name));
    // A new screen opens at its top and eases in, like a native one —
    // not wherever the last screen happened to be scrolled to.
    window.scrollTo(0, 0);
    const appEl = document.getElementById('app');
    appEl?.classList.remove('route-enter');
    void appEl?.offsetWidth; // restart the animation
    appEl?.classList.add('route-enter');
    route.mount();

    // There is no page load to reset focus, so send it to the new screen.
    // Skipped on first render so the app doesn't steal focus on load.
    if (!firstRender) document.getElementById('app')?.focus();
    firstRender = false;
  };

  window.addEventListener('hashchange', go);
  go();
}

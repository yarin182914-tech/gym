const DEFAULT_ROUTE = 'session';

const routes = {};
let active = null; // { name, unmount }

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

    document.querySelectorAll('.bottom-nav a').forEach((a) => {
      const isActive = a.dataset.route === name;
      a.classList.toggle('active', isActive);
      // Conveys the current screen to assistive tech; the class only changes
      // colour and weight, which is not announced.
      if (isActive) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    const route = routes[name];
    active = { name, unmount: route.unmount };
    route.mount();

    // There is no page load to reset focus, so send it to the new screen.
    // Skipped on first render so the app doesn't steal focus on load.
    if (!firstRender) document.getElementById('app')?.focus();
    firstRender = false;
  };

  window.addEventListener('hashchange', go);
  go();
}

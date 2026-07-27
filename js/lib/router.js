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
  const go = () => {
    const name = currentRouteName();
    if (active && active.name === name) return;

    if (active?.unmount) active.unmount();

    document.querySelectorAll('.bottom-nav a').forEach((a) => {
      a.classList.toggle('active', a.dataset.route === name);
    });

    const route = routes[name];
    active = { name, unmount: route.unmount };
    route.mount();
  };

  window.addEventListener('hashchange', go);
  go();
}

const routes = {};
let notFoundHandler = () => {};

export function registerRoute(name, handler) {
  routes[name] = handler;
}

export function setNotFound(handler) {
  notFoundHandler = handler;
}

function currentRouteName() {
  const hash = location.hash.replace(/^#\//, '');
  return hash.split('/')[0] || 'session';
}

export function navigate(name) {
  location.hash = `#/${name}`;
}

export function startRouter() {
  const render = () => {
    const name = currentRouteName();
    document.querySelectorAll('.bottom-nav a').forEach((a) => {
      a.classList.toggle('active', a.dataset.route === name);
    });
    const handler = routes[name] || notFoundHandler;
    handler();
  };
  window.addEventListener('hashchange', render);
  render();
}

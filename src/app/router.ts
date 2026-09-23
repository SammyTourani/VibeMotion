import { useEffect, useState } from 'react';

export type Route = 'landing' | 'edit';

function parse(hash: string): Route {
  return hash.replace(/^#/, '').startsWith('/edit') ? 'edit' : 'landing';
}

export function currentRoute(): Route {
  return parse(location.hash);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(currentRoute);
  useEffect(() => {
    const on = () => setRoute(currentRoute());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function navigate(route: Route) {
  const hash = route === 'edit' ? '#/edit' : '#/';
  if (location.hash !== hash) location.hash = hash;
  window.scrollTo(0, 0);
}

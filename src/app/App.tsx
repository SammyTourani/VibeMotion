import { lazy, Suspense, useEffect } from 'react';
import { useRoute } from './router';
import { Landing } from '../landing/Landing';

const EditorApp = lazy(() => import('../editor/EditorApp'));

export function App() {
  const route = useRoute();
  useEffect(() => {
    document.title =
      route === 'edit' ? 'VibeMotion editor' : 'VibeMotion: edit talking-head videos in your browser';
  }, [route]);
  if (route === 'edit') {
    return (
      <Suspense fallback={<div className="boot" aria-busy="true" />}>
        <EditorApp />
      </Suspense>
    );
  }
  return <Landing />;
}

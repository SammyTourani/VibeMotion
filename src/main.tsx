import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return <p>VibeMotion</p>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

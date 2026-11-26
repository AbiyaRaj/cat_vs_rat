import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// No <StrictMode>: it mounts effects twice in development, which would start
// two WebGL game loops on the same canvas.
createRoot(document.getElementById('root')).render(<App />);

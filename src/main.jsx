import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import Dashboard from './dashboard/Dashboard.jsx';

// La fenêtre Dashboard charge la même app avec le hash #dashboard
const isDashboard = window.location.hash.includes('dashboard');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isDashboard ? <Dashboard /> : <App />}
  </StrictMode>,
);

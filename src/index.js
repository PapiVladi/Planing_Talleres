import React from 'react';
import ReactDOM from 'react-dom/client'; // Importar de 'react-dom/client' para React 18
import App from './App'; // Importa tu componente principal App

// Crea un root para tu aplicación React
const root = ReactDOM.createRoot(document.getElementById('root'));

// Renderiza tu componente App dentro del root
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

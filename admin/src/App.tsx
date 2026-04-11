import { useEffect } from 'react';

import { ToastProvider } from '../hooks/useToast';
import AppRouter from '../routes/AppRouter';

function App() {
  useEffect(() => {
    function handleUnauthorized() {
      if (window.location.pathname !== '/admin/login') {
        window.location.href = '/admin/login';
      }
    }

    window.addEventListener('admin:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('admin:unauthorized', handleUnauthorized);
    };
  }, []);

  return (
    <ToastProvider>
      <AppRouter />
    </ToastProvider>
  );
}

export default App;

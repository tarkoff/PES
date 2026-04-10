import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    
    if (tokenParam) {
      localStorage.setItem('token', tokenParam);
      // Small delay to let localStorage update
      setTimeout(() => {
        navigate('/', { replace: true });
      }, 100);
    } else {
      navigate('/login', { replace: true });
    }
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary-500 mx-auto mb-4"></div>
        <p className="text-white text-lg">Завершення авторизації...</p>
      </div>
    </div>
  );
}

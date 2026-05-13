import { Navigate } from 'react-router-dom';
import { useBootstrap } from './BootstrapContext';

export function HomeRedirect() {
  const { route } = useBootstrap();
  return <Navigate to={route} replace />;
}

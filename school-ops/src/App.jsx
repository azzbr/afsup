// The app is the RouterProvider. All auth state, routes, and view-mounting
// lives under the router. See router.tsx for the route map and routes/
// for individual screens.

import { RouterProvider } from 'react-router-dom';
import { router } from './router';

export default function App() {
  return <RouterProvider router={router} />;
}

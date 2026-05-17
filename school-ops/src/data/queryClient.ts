// Shared React Query client used by the app and (in tests) by hook unit tests.
//
// We use long staleTimes because our data hooks use `onSnapshot` subscriptions
// that push fresh data into the cache via queryClient.setQueryData — once a
// subscription is live, there is no benefit to refetching.

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Subscriptions keep data fresh; avoid refetching on every focus.
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});

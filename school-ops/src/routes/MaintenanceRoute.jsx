import React, { useMemo } from 'react';
import MaintenanceView from '../MaintenanceView';
import { useRouteContext } from './guards';
import { useTickets } from '../data/useTickets';

export default function MaintenanceRoute() {
  const { user, userData, actor } = useRouteContext();
  const { data: ticketsRaw } = useTickets(actor);

  // Sort once here so MaintenanceView's prop contract is preserved.
  const tickets = useMemo(() => {
    const list = ticketsRaw ?? [];
    return [...list].sort((a, b) => {
      if (a.status === 'resolved' && b.status !== 'resolved') return 1;
      if (a.status !== 'resolved' && b.status === 'resolved') return -1;
      const at = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
      const bt = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
      return bt - at;
    });
  }, [ticketsRaw]);

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Maintenance Queue</h1>
        <p className="text-slate-500 mt-1">Manage school operations and maintenance tasks.</p>
      </div>
      <MaintenanceView tickets={tickets} user={user} userData={userData} />
    </>
  );
}

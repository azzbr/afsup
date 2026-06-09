// Admin oversight route. Owns the scheduled-task creation modal and ticket
// delete handler, both previously living in App.jsx but only used here.

import React, { useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc } from 'firebase/firestore';
import AdminView from '../AdminView';
import EnhancedScheduleForm from '../enhanced_scheduler';
import { useRouteContext } from './guards';
import { useTickets } from '../data/useTickets';
import { db } from '../firebase';
import { auditCreate } from '../data/audit';

export default function AdminRoute() {
  const { user, userData, actor } = useRouteContext();
  const { data: ticketsRaw } = useTickets(actor);
  const [showScheduleForm, setShowScheduleForm] = useState(false);

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

  const handleCreateSchedule = async (data) => {
    if (!user?.uid) return;
    try {
      // lastRun stays null until the schedule runner actually generates
      // tickets; nextRun is what the runner queries on. "Start immediately"
      // means due right now — not one full frequency period from now.
      const payload = {
        ...data,
        lastRun: null,
        nextRun: data.isStartImmediately ? new Date() : new Date(data.startDate),
        isActive: true,
        totalLocations: data.locations.length,
        ...auditCreate(user.uid),
      };
      await addDoc(collection(db, 'scheduled_tasks'), payload);
      setShowScheduleForm(false);
      if (data.isStartImmediately) {
        alert('Schedule created — first tickets will be generated within the hour');
      } else {
        alert(`Schedule created — first run scheduled for ${new Date(data.startDate).toLocaleDateString()}`);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteTicket = async (id) => {
    if (confirm('Delete this ticket?')) {
      await deleteDoc(doc(db, 'maintenance_tickets', id));
    }
  };

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Admin Overview</h1>
        <p className="text-slate-500 mt-1">Manage school operations and maintenance tasks.</p>
      </div>

      <AdminView
        tickets={tickets}
        user={user}
        userData={userData}
        onCreateSchedule={() => setShowScheduleForm(true)}
        onDeleteTicket={handleDeleteTicket}
      />

      {showScheduleForm && (
        <EnhancedScheduleForm
          isOpen={showScheduleForm}
          onClose={() => setShowScheduleForm(false)}
          onSubmit={handleCreateSchedule}
          user={user}
        />
      )}
    </>
  );
}

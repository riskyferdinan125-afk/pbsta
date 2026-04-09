import { Timestamp } from 'firebase/firestore';
import { Ticket } from '../types';

export type SLAStatus = 'within-sla' | 'near-breach' | 'breached';

export const calculateSLAStatus = (ticket: Ticket): SLAStatus => {
  if (!ticket.slaDeadline) return 'within-sla';

  const now = new Date();
  const deadline = ticket.slaDeadline.toDate();
  const resolvedAt = ticket.resolvedAt?.toDate();

  const comparisonTime = resolvedAt || now;

  if (comparisonTime > deadline) {
    return 'breached';
  }

  // Near breach if within 2 hours of deadline
  const twoHoursInMs = 2 * 60 * 60 * 1000;
  if (deadline.getTime() - comparisonTime.getTime() < twoHoursInMs) {
    return 'near-breach';
  }

  return 'within-sla';
};

export const getSLAStatusColor = (status: SLAStatus) => {
  switch (status) {
    case 'breached':
      return 'text-red-600 bg-red-50 border-red-100';
    case 'near-breach':
      return 'text-amber-600 bg-amber-50 border-amber-100';
    case 'within-sla':
      return 'text-emerald-600 bg-emerald-50 border-emerald-100';
    default:
      return 'text-neutral-600 bg-neutral-50 border-neutral-100';
  }
};

export const getSLAStatusLabel = (status: SLAStatus) => {
  switch (status) {
    case 'breached':
      return 'Breached';
    case 'near-breach':
      return 'Near Breach';
    case 'within-sla':
      return 'Within SLA';
    default:
      return 'Unknown';
  }
};

export const getSLARemainingTime = (ticket: Ticket) => {
  if (!ticket.slaDeadline) return null;
  const now = new Date();
  const deadline = ticket.slaDeadline.toDate();
  const resolvedAt = ticket.resolvedAt?.toDate();
  const comparisonTime = resolvedAt || now;
  
  const diff = deadline.getTime() - comparisonTime.getTime();
  const isPast = diff < 0;
  const absDiff = Math.abs(diff);
  
  const hours = Math.floor(absDiff / (1000 * 60 * 60));
  const mins = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
  
  return {
    hours,
    mins,
    isPast
  };
};

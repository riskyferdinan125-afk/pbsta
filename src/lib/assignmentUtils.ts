import { Ticket, Technician } from '../types';

export interface TechnicianSuggestion {
  technician: Technician;
  score: number;
  reasons: string[];
  workload: number;
}

/**
 * Suggests the most suitable technicians for a ticket based on:
 * 1. Availability (40%)
 * 2. Skills matching ticket category/subcategory (40%)
 * 3. Current workload (20%)
 */
export function getTechnicianSuggestions(
  ticket: Ticket,
  technicians: Technician[],
  allTickets: Ticket[]
): TechnicianSuggestion[] {
  return technicians.map(tech => {
    let score = 0;
    const reasons: string[] = [];

    // 1. Availability (Max 40 points)
    if (tech.availabilityStatus === 'Available') {
      score += 40;
      reasons.push('Currently Available');
    } else if (tech.availabilityStatus === 'Busy') {
      score += 15;
      reasons.push('Currently Busy');
    } else {
      // Offline or On Leave
      score -= 50; // Penalty for being offline
      reasons.push('Offline/On Leave');
    }

    // 2. Skills (Max 40 points)
    const ticketCategory = ticket.category?.toLowerCase();
    const ticketSubCategory = ticket.subCategory?.toLowerCase();
    
    const hasMatchingSkill = tech.skills?.some(skill => {
      const s = skill.toLowerCase();
      return s === ticketCategory || s === ticketSubCategory || ticketCategory?.includes(s) || s.includes(ticketCategory || '');
    });

    if (hasMatchingSkill) {
      score += 40;
      reasons.push(`Matches skill: ${ticket.category}`);
    } else {
      reasons.push('No direct skill match');
    }

    // 3. Workload (Max 20 points)
    const activeTickets = allTickets.filter(t => 
      t.technicianIds?.includes(tech.id) && 
      (t.status === 'open' || t.status === 'in-progress')
    ).length;
    
    // Fewer tickets = higher score. 
    // 0 tickets = 20 pts
    // 1 ticket = 16 pts
    // 2 tickets = 12 pts
    // 3 tickets = 8 pts
    // 4 tickets = 4 pts
    // 5+ tickets = 0 pts
    const workloadScore = Math.max(0, 20 - (activeTickets * 4));
    score += workloadScore;
    reasons.push(`Workload: ${activeTickets} active tickets`);

    return {
      technician: tech,
      score,
      reasons,
      workload: activeTickets
    };
  }).sort((a, b) => b.score - a.score);
}

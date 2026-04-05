import { Ticket, Technician } from '../types';
import { calculateTicketPoints } from '../weights';

export interface TechnicianSuggestion {
  technician: Technician;
  score: number;
  reasons: string[];
  workload: number;
  totalPoints: number;
}

/**
 * Suggests the most suitable technicians for a ticket based on:
 * 1. Availability (30%)
 * 2. Skills & Specialization matching ticket category/subcategory (40%)
 * 3. Current workload points (30%)
 */
export function getTechnicianSuggestions(
  ticket: Ticket,
  technicians: Technician[],
  allTickets: Ticket[]
): TechnicianSuggestion[] {
  return technicians.map(tech => {
    let score = 0;
    const reasons: string[] = [];

    // 1. Availability (Max 30 points)
    if (tech.availabilityStatus === 'Available') {
      score += 30;
      reasons.push('Currently Available');
    } else if (tech.availabilityStatus === 'Busy') {
      score += 15;
      reasons.push('Currently Busy');
    } else {
      // Offline or On Leave
      score -= 50; // Heavy penalty for being offline
      reasons.push(`Status: ${tech.availabilityStatus || 'Offline'}`);
    }

    // 2. Skills & Specialization (Max 40 points)
    const ticketCategory = ticket.category?.toLowerCase();
    const ticketSubCategory = ticket.subCategory?.toLowerCase();
    
    let skillScore = 0;
    let matchedSkill = '';

    // Check specialization first (highest priority)
    if (tech.specialization) {
      const spec = tech.specialization.toLowerCase();
      if (ticketSubCategory && spec === ticketSubCategory) {
        skillScore = 40;
        matchedSkill = tech.specialization;
      } else if (spec === ticketCategory) {
        skillScore = Math.max(skillScore, 35);
        matchedSkill = tech.specialization;
      } else if (ticketSubCategory?.includes(spec) || spec.includes(ticketSubCategory || '')) {
        skillScore = Math.max(skillScore, 30);
        matchedSkill = tech.specialization;
      }
    }

    // Check skills array
    if (tech.skills && tech.skills.length > 0) {
      for (const skill of tech.skills) {
        const s = skill.toLowerCase();
        
        // Exact match with subcategory
        if (ticketSubCategory && s === ticketSubCategory) {
          skillScore = Math.max(skillScore, 40);
          matchedSkill = skill;
        }
        
        // Exact match with category
        if (s === ticketCategory) {
          skillScore = Math.max(skillScore, 30);
          matchedSkill = skill;
        }

        // Partial match
        if (ticketSubCategory?.includes(s) || s.includes(ticketSubCategory || '')) {
          skillScore = Math.max(skillScore, 25);
          matchedSkill = skill;
        } else if (ticketCategory?.includes(s) || s.includes(ticketCategory || '')) {
          skillScore = Math.max(skillScore, 15);
          matchedSkill = skill;
        }
      }
    }

    if (skillScore > 0) {
      score += skillScore;
      reasons.push(`Skill Match: ${matchedSkill} (+${skillScore} pts)`);
    } else {
      reasons.push('No relevant skills found');
    }

    // 3. Workload (Max 30 points)
    const activeTickets = allTickets.filter(t => 
      t.technicianIds?.includes(tech.id) && 
      (t.status === 'open' || t.status === 'in-progress')
    );
    
    const weightedPoints = activeTickets.reduce((sum, t) => {
      let basePoints = t.points || calculateTicketPoints(t.category, t.subCategory || '');
      
      // Priority Multiplier
      let priorityMult = 1.0;
      if (t.priority === 'urgent') priorityMult = 1.5;
      else if (t.priority === 'high') priorityMult = 1.2;
      else if (t.priority === 'low') priorityMult = 0.8;

      // Status Multiplier (Active work is more demanding)
      let statusMult = t.status === 'in-progress' ? 1.2 : 1.0;

      return sum + (basePoints * priorityMult * statusMult);
    }, 0);
    
    // Fewer weighted points = higher score. 
    // We consider 50 weighted points as a "full load" for the day.
    // 0 points = 30 pts
    // 25 points = 15 pts
    // 50+ points = 0 pts
    const workloadScore = Math.max(0, 30 - (weightedPoints * 0.6));
    score += workloadScore;
    reasons.push(`Workload: ${activeTickets.length} active tickets (${Math.round(weightedPoints)} weighted pts)`);

    return {
      technician: tech,
      score,
      reasons,
      workload: activeTickets.length,
      totalPoints: Math.round(weightedPoints)
    };
  }).sort((a, b) => b.score - a.score);
}

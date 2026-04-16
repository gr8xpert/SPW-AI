import { Injectable } from '@nestjs/common';
import { Lead, LeadActivity } from '../../database/entities';

interface ScoringRule {
  condition: (lead: Lead, activities: LeadActivity[]) => boolean;
  points: number;
  description: string;
}

@Injectable()
export class LeadScoringService {
  private readonly rules: ScoringRule[] = [
    {
      condition: (lead) => !!lead.contact?.phone,
      points: 10,
      description: 'Has phone number',
    },
    {
      condition: (lead) => lead.budgetMin !== null && lead.budgetMax !== null,
      points: 10,
      description: 'Budget defined',
    },
    {
      condition: (lead) =>
        (lead.preferredLocations?.length ?? 0) > 0 || (lead.preferredTypes?.length ?? 0) > 0,
      points: 5,
      description: 'Preferences specified',
    },
    {
      condition: (_, activities) =>
        activities.some((a) => a.type === 'email' || a.type === 'call'),
      points: 15,
      description: 'Responded to outreach',
    },
    {
      condition: (_, activities) =>
        activities.some((a) => a.type === 'viewing'),
      points: 25,
      description: 'Scheduled viewing',
    },
    {
      condition: (_, activities) =>
        activities.some((a) => a.type === 'offer'),
      points: 30,
      description: 'Made offer',
    },
    {
      condition: (lead, activities) => {
        const recentActivity = activities.find(
          (a) =>
            a.createdAt > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) &&
            (a.type === 'call' || a.type === 'email' || a.type === 'viewing'),
        );
        return !!recentActivity;
      },
      points: 10,
      description: 'Recent engagement',
    },
    {
      condition: (lead, activities) => {
        // Negative: No response in 7 days after contact
        const lastOutreach = activities
          .filter((a) => a.type === 'call' || a.type === 'email')
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

        if (!lastOutreach) return false;

        const daysSinceOutreach = Math.floor(
          (Date.now() - lastOutreach.createdAt.getTime()) / (1000 * 60 * 60 * 24),
        );

        // If no response in 7+ days, apply penalty
        const hasResponse = activities.some(
          (a) =>
            a.createdAt > lastOutreach.createdAt &&
            (a.type === 'note' || a.type === 'viewing' || a.type === 'offer'),
        );

        return daysSinceOutreach >= 7 && !hasResponse;
      },
      points: -20,
      description: 'No response in 7 days',
    },
  ];

  calculateScore(lead: Lead, activities: LeadActivity[]): number {
    let score = 0;

    for (const rule of this.rules) {
      if (rule.condition(lead, activities)) {
        score += rule.points;
      }
    }

    // Clamp between 0 and 100
    return Math.max(0, Math.min(100, score));
  }

  getScoreBreakdown(
    lead: Lead,
    activities: LeadActivity[],
  ): Array<{ description: string; points: number; applied: boolean }> {
    return this.rules.map((rule) => ({
      description: rule.description,
      points: rule.points,
      applied: rule.condition(lead, activities),
    }));
  }
}

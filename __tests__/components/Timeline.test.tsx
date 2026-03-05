/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Timeline, type TimelineUpdate } from '@/components/Timeline';

describe('Timeline Component', () => {
  describe('Rendering', () => {
    it('should render timeline with updates', () => {
        const updates: TimelineUpdate[] = [
          {
            id: '1',
            title: 'Bank Statement Ready',
            description: 'Your January statement is now available',
            priority: 'medium',
            createdAt: new Date('2024-01-20'),
            emailId: 'email-1',
          },
          {
            id: '2',
            title: 'Action Required',
            description: 'Please review the attached document',
            priority: 'high',
            createdAt: new Date('2024-01-19'),
            emailId: 'email-2',
          },
        ];

      render(<Timeline updates={updates} />);

      expect(screen.getByText('Bank Statement Ready')).toBeInTheDocument();
      expect(screen.getByText('Action Required')).toBeInTheDocument();
    });

    it('should show empty state when no updates', () => {
      render(<Timeline updates={[]} />);

      expect(screen.getByText(/no updates/i)).toBeInTheDocument();
    });

    it('should group updates by date', () => {
      const updates: TimelineUpdate[] = [
        {
          id: '1',
          title: 'Update 1',
          description: 'Description 1',
          priority: 'medium',
          createdAt: new Date('2024-01-20'),
          emailId: 'email-1',
        },
        {
          id: '2',
          title: 'Update 2',
          description: 'Description 2',
          priority: 'low',
          createdAt: new Date('2024-01-19'),
          emailId: 'email-2',
        },
      ];

      render(<Timeline updates={updates} />);

      // Check for date grouping
      expect(screen.getByText(/January 20/)).toBeInTheDocument();
      expect(screen.getByText(/January 19/)).toBeInTheDocument();
    });
  });

  describe('Filtering', () => {
    it('should filter by priority', () => {
        const updates: TimelineUpdate[] = [
          {
            id: '1',
            title: 'High Priority',
            description: 'Urgent update',
            priority: 'high',
            createdAt: new Date(),
            emailId: 'email-1',
          },
          {
            id: '2',
            title: 'Low Priority',
            description: 'Minor update',
            priority: 'low',
            createdAt: new Date(),
            emailId: 'email-2',
          },
        ];

      render(<Timeline updates={updates} priorityFilter="high" />);

      expect(screen.getByText('High Priority')).toBeInTheDocument();
      expect(screen.queryByText('Low Priority')).not.toBeInTheDocument();
    });
  });
});

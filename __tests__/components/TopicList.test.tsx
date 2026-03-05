/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TopicList } from '@/components/TopicList';

describe('TopicList Component', () => {
  const mockTopics = [
    {
      id: 'topic-1',
      name: 'Chase',
      fullPath: 'Banking/Chase',
      emailCount: 15,
      summary: 'Banking notifications and statements from Chase.',
    },
    {
      id: 'topic-2',
      name: 'Amazon',
      fullPath: 'Shopping/Amazon',
      emailCount: 42,
      summary: 'Order confirmations and delivery updates from Amazon.',
    },
    {
      id: 'topic-3',
      name: 'LinkedIn',
      fullPath: 'Social/LinkedIn',
      emailCount: 8,
      summary: 'Connection requests and job recommendations.',
    },
  ];

  describe('Rendering', () => {
    it('should render topics with names and email counts', () => {
        render(<TopicList topics={mockTopics} />);

        expect(screen.getByText('Chase')).toBeInTheDocument();
        expect(screen.getByText('Amazon')).toBeInTheDocument();
        expect(screen.getByText('LinkedIn')).toBeInTheDocument();
        expect(screen.getByText('15 emails')).toBeInTheDocument();
        expect(screen.getByText('42 emails')).toBeInTheDocument();
    });

    it('should show empty state when no topics', () => {
        render(<TopicList topics={[]} />);

        expect(screen.getByText(/no topics/i)).toBeInTheDocument();
    });

    it('should display topic hierarchy', () => {
        render(<TopicList topics={mockTopics} />);

        // Should show parent category
        expect(screen.getByText('Banking')).toBeInTheDocument();
        expect(screen.getByText('Shopping')).toBeInTheDocument();
    });
  });

  describe('Selection', () => {
    it('should call onSelect when topic is clicked', async () => {
        const onSelect = vi.fn();
        render(<TopicList topics={mockTopics} onSelect={onSelect} />);

        screen.getByText('Chase').click();

        expect(onSelect).toHaveBeenCalledWith('topic-1');
    });
  });

  describe('Search', () => {
    it('should filter topics by search query', () => {
        render(<TopicList topics={mockTopics} searchQuery="bank" />);

        expect(screen.getByText('Chase')).toBeInTheDocument();
        expect(screen.queryByText('Amazon')).not.toBeInTheDocument();
    });
  });
});

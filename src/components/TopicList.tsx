import type { ReactNode, MouseEvent } from 'react';

export interface Topic {
  id: string;
  name: string;
  fullPath: string;
  emailCount: number;
  summary?: string;
}

export interface TopicListProps {
  topics: Topic[];
  onSelect?: (topicId: string) => void;
  searchQuery?: string;
}

/**
 * TopicList displays hierarchical topics with email counts.
 */
export function TopicList({
  topics,
  onSelect,
  searchQuery,
}: TopicListProps): ReactNode {
  // Filter by search query if provided
  const filteredTopics = searchQuery
    ? topics.filter(
        (topic) =>
          topic.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          topic.fullPath.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : topics;

  // Group topics by parent category
  const groupedTopics = groupByParent(filteredTopics);

  if (filteredTopics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p>No topics found</p>
        {searchQuery && (
          <p className="text-sm mt-2">Try a different search term</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {Object.entries(groupedTopics).map(([parent, childTopics]) => (
        <div key={parent} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">{parent}</h3>
          <div className="flex flex-col gap-1">
            {childTopics.map((topic) => (
              <TopicItem
                key={topic.id}
                topic={topic}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface TopicItemProps {
  topic: Topic;
  onSelect?: (topicId: string) => void;
}

function TopicItem({ topic, onSelect }: TopicItemProps): ReactNode {
  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    onSelect?.(topic.id);
  };

  return (
    <button
      className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors text-left"
      onClick={handleClick}
      data-testid={`topic-${topic.id}`}
    >
      <div className="flex flex-col gap-1">
        <span className="font-medium">{topic.name}</span>
        {topic.summary && (
          <span className="text-sm text-muted-foreground line-clamp-1">
            {topic.summary}
          </span>
        )}
      </div>
      <span className="text-sm text-muted-foreground">
        {topic.emailCount} email{topic.emailCount !== 1 ? 's' : ''}
      </span>
    </button>
  );
}

function groupByParent(topics: Topic[]): Record<string, Topic[]> {
  const groups: Record<string, Topic[]> = {};

  for (const topic of topics) {
    const parts = topic.fullPath.split('/');
    const parent = parts.length > 1 ? parts[0] : 'Uncategorized';

    if (!groups[parent]) {
      groups[parent] = [];
    }
    groups[parent].push(topic);
  }

  // Sort each group by email count (descending)
  for (const parent of Object.keys(groups)) {
    groups[parent].sort((a, b) => b.emailCount - a.emailCount);
  }

  return groups;
}

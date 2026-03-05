# TuskerBrain Roadmap

## v1 (Current)

**Focus:** Core email management, timeline, summaries

- Inbox Manager (automated archival/deletion)
- Email classification (regular, updates, social, promotional)
- AI-powered topic labeling (hierarchical)
- Timeline feed with granular filtering
- Topic summaries (rolling)
- Sender summaries (rolling)
- Deals extraction and tracking
- Job queue with audit logging
- Multi-provider LLM support (OpenAI, Anthropic, Google)
- OAuth Gmail connection
- Auto-update from GitHub releases

---

## v2

**Focus:** Actionability, search, enhanced interactions

### Features

| Feature | Description |
|---------|-------------|
| **Task Interface** | Convert action items into trackable tasks |
| **Calendar Integration** | Sync follow-up dates with Google Calendar |
| **Search Feed** | Hybrid RAG-based search across all processed emails |
| **Chat with Feed** | Conversational interface to query your email history |
| **View Full Email/Thread** | Expand to see complete email content and thread history |
| **Reply to Thread/Email** | Chat-like interface for composing and sending replies |

### Technical Additions

| Component | Purpose |
|-----------|---------|
| **LanceDB** | Vector embeddings for semantic search |
| **KuzuDB (Ladybug fork)** | Graph relationships (sender↔topic, thread↔topic) |
| **Embedding Pipeline** | Generate and store embeddings for processed emails |

---

## v3

**Focus:** Mobile, extended integrations

### Features

| Feature | Description |
|---------|---------|
| **Task Sync to Google Tasks** | Bi-directional sync with Google Tasks |
| **Dedicated Mobile App** | Full-featured iOS/Android application |

### Technical Considerations

- Mobile app likely React Native or Flutter
- May require cloud sync infrastructure
- Push notifications for processing updates

---

## Future Considerations

Ideas not yet scheduled:

- Multi-account support
- Shared mailboxes
- Team collaboration features
- Custom processing rules
- Email analytics dashboard
- Integration with other providers (Outlook, etc.)

# Transparent — Product Ideas

## IDEA-001: Question Engagement Tracking
- **Description:** Track how long users spend on each question (dwell time)
- **Logic:**
  - Questions with high dwell time = 🔥 (people debating whether to answer)
  - Questions skipped in < 2 seconds = 🗑️ (nobody cares, auto-deprioritize)
  - Build a **heat score** per question over time
  - Auto-promote high-engagement questions
  - Auto-demote/remove low-engagement ones
- **Social proof display:** "🔥 87% of people hesitated on this one"
- **Backend:** Track `question_id`, `time_displayed`, `time_answered_or_skipped`, `was_skipped`
- **Priority:** High — this is the quality algorithm for the entire question pool

## IDEA-002: Community-Submitted Questions
- Users can write and submit their own questions to the pool
- Optional: approval flow before they go live (or just flag/report system)
- Track who submitted what — top question creators get credit
- Builds an ever-growing question library organically

## IDEA-003: Vote on the Next Question
- Before each round, show 2-3 question options
- Everyone votes in real-time on which one gets asked
- Most votes wins → that question gets asked to the person in the hot seat
- Adds strategy — people vote for the question they KNOW will make someone squirm
- Mechanic: WebSocket-based live poll, 10-15 second timer

## IDEA-004: Blank Card / Hot Seat
- Random chance (maybe 1 in 8) a "blank card" lands on someone
- When it hits, the GROUP writes a custom question for that person in real-time
- Everyone submits a question, then group votes on which one gets asked
- This is where it gets PERSONAL and chaotic
- Viral moment generator — clips of people's faces when the custom question drops
- Could combine with IDEA-003 (vote on which user-written question gets asked)

## IDEA-005: AI-Generated Questions (Personalized per Group)
- **Before game starts**, players answer a quick vibe check:
  - Group dynamic: college friends / coworkers / couples / strangers
  - Spice level: mild / spicy / no limits
  - Optional: topics off limits
  - Or freeform: "We're 6 college friends, nothing is off limits"
- **AI generates 20-30 custom questions** tuned to THAT specific group
  - Uses group context to make questions more targeted and personal
  - Way more devastating than generic questions because they're situational
- **Implementation:**
  - OpenAI API call (GPT-4o-mini for cost efficiency)
  - System prompt tuned for Transparent's unhinged tone
  - Input: group size, vibe level, context
  - Output: JSON array of questions
  - Cache for the session, mix with curated bank
  - Cost: ~$0.01-0.02 per game
- **Monetization:** Could be a premium "AI Custom Mode" unlock
- **Priority:** High — this is a differentiator. No other party game does this.

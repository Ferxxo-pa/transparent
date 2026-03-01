// Supabase Edge Function: AI Question Generator for Transparent
// Supports multiple providers: OpenAI, Groq (free), or fallback to curated
// Deploy: supabase functions deploy generate-questions

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `You are the question generator for Transparent — a party game where players answer brutally honest questions and the group votes on whether they're being real or lying.

Generate questions that make people SQUIRM. Questions they'd never want to answer in front of friends.

Rules:
- Direct, punchy, uncomfortable — no softening
- Mix: embarrassing confessions, relationship drama, secrets, bodily functions, drunk stories, sexual history, financial secrets
- Some questions should reference "this room" / "someone here" for personal chaos
- Match the requested spice level exactly
- Vary format: "When's the last time...", "Have you ever...", "What's the most...", "Who in this room...", "Rate everyone..."

Return ONLY a valid JSON array of question strings. Nothing else.`

// Try Groq first (free tier), then OpenAI, then fallback
async function callAI(userPrompt: string): Promise<string[]> {
  // Try Groq (free, fast, Llama 3.1 70B)
  const groqKey = Deno.env.get('GROQ_API_KEY')
  if (groqKey) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.1-70b-versatile',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 1.0,
          max_tokens: 2000,
        }),
      })
      const data = await res.json()
      const content = data.choices?.[0]?.message?.content
      if (content) return parseQuestions(content)
    } catch (e) {
      console.error('Groq failed:', e)
    }
  }

  // Try OpenAI
  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  if (openaiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 1.0,
          max_tokens: 2000,
        }),
      })
      const data = await res.json()
      const content = data.choices?.[0]?.message?.content
      if (content) return parseQuestions(content)
    } catch (e) {
      console.error('OpenAI failed:', e)
    }
  }

  // Fallback — return empty (client will use default bank)
  return []
}

function parseQuestions(content: string): string[] {
  try {
    return JSON.parse(content)
  } catch {
    const match = content.match(/\[[\s\S]*\]/)
    return match ? JSON.parse(match[0]) : []
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { groupSize, vibe, spiceLevel, context, count } = await req.json()
    const questionCount = Math.min(count || 25, 40)

    const userPrompt = `Generate ${questionCount} questions for this group:
- Group size: ${groupSize || 'unknown'} people
- Vibe: ${vibe || 'friends who know each other well'}
- Spice level: ${spiceLevel || 'no limits'}
${context ? `- Extra context: ${context}` : ''}

Make these DEVASTATING for this specific group dynamic.`

    const questions = await callAI(userPrompt)

    return new Response(
      JSON.stringify({ questions, count: questions.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message, questions: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

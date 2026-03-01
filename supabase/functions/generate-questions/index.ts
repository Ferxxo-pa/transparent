// Supabase Edge Function: AI Question Generator for Transparent
// Generates personalized questions based on group vibe
// Deploy: supabase functions deploy generate-questions
// Set secret: supabase secrets set OPENAI_API_KEY=sk-...

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `You are the question generator for Transparent — a party game where players answer brutally honest questions and the group votes on whether they're being real or lying.

Your job: Generate questions that make people SQUIRM. Questions they'd never want to answer in front of friends. Questions that test honesty, expose secrets, and create chaos.

Rules:
- Questions should be direct, punchy, and uncomfortable
- Mix: embarrassing confessions, relationship drama, secrets, bodily functions, drunk stories, sexual history, financial secrets, social media shame
- Make some questions reference "this room" / "someone here" to make it personal
- Don't be corny. Don't soften. These should hit like a gut punch.
- No questions that require specific knowledge — keep them universal but devastating
- Vary the format: "When's the last time...", "Have you ever...", "What's the most...", "Who in this room...", "Rate everyone...", "What would happen if..."
- Match the spice level requested

Return ONLY a JSON array of strings. No markdown, no explanation. Just the array.`

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { groupSize, vibe, spiceLevel, context, count } = await req.json()

    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const questionCount = Math.min(count || 25, 40)

    const userPrompt = `Generate ${questionCount} questions for this group:

- Group size: ${groupSize || 'unknown'} people
- Vibe: ${vibe || 'friends who know each other well'}
- Spice level: ${spiceLevel || 'no limits'}
${context ? `- Extra context: ${context}` : ''}

Make these questions DEVASTATING for this specific group dynamic. If they're college friends, reference college shit. If they're coworkers, reference work drama. Match the energy.`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
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

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      return new Response(
        JSON.stringify({ error: 'No response from AI', questions: [] }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse the JSON array from the response
    let questions: string[]
    try {
      questions = JSON.parse(content)
    } catch {
      // Try to extract array if wrapped in markdown
      const match = content.match(/\[[\s\S]*\]/)
      questions = match ? JSON.parse(match[0]) : []
    }

    return new Response(
      JSON.stringify({ questions, count: questions.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

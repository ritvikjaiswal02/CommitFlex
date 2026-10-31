Write one post for X, in the first person, for the developer described below, about the work in the narrative.

About the author:
{{authorContext}}

Voice settings:
- Tone: {{tone}}
- Technical level (1-10): {{technicalLevel}}
- Audience: {{audience}}

{{extraContext}}

{{toneOverrides}}

Narrative:
{{narrative}}

How to write it:
- HARD LIMIT: the content must be 240 characters or fewer, counting spaces. Count before you answer. Shorter is better.
- Say the one most interesting concrete thing that shipped and why it matters. Specific nouns beat adjectives.
- Line breaks are fine. No thread numbering, no "1/".
- Use only facts from the narrative. No invented numbers or results.
- No emoji unless the voice fingerprint uses them. Never use "excited", "thrilled", "game-changer", "just shipped" as the opener, or "🚀".

Return a JSON object with:
- content: the post text without hashtags, 240 characters or fewer
- hashtags: 0-2 specific hashtags with the #

Return only the JSON object.

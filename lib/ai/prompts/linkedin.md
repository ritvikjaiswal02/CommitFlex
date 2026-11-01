Write a LinkedIn post, in the first person, for the developer described below, about the work in the narrative. It should read like a sharp engineer wrote it on their lunch break, not like marketing.

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
- 90 to 220 words. Short paragraphs of one to three sentences, separated by blank lines.
- The first line is the hook and must work on its own before "see more": a specific claim, a concrete problem, or a surprising detail from the work. Do not start with "I", "Excited", "Thrilled", "Today" or a question to the reader.
- Then: what was broken or missing, what you built and one detail that shows how, and what changed because of it.
- Use only facts from the narrative. No invented numbers, users, customers or results.
- At most one short list (3 items max) if it genuinely helps. No emoji unless the voice fingerprint uses them. No exclamation marks unless the voice fingerprint uses them.
- Never use: "game-changer", "excited to announce", "thrilled", "delighted", "leverage", "unlock", "supercharge", "seamless", "cutting-edge", "revolutionize", "in today's fast-paced world", "journey", "dive in", "let that sink in", "here's the thing", "the best part?".
- End with a plain closing line: a takeaway, what's next, or a genuine question to other builders. Not "Thoughts?" or "Agree?".

Return a JSON object with:
- content: the post text, without hashtags
- hashtags: 2-3 specific hashtags with the # (for example "#typescript", "#opensource"), never generic ones like "#tech" or "#innovation"
- callToAction: optional string, the closing question if the post ends with one

Return only the JSON object.

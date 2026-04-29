<!--
  Stable prompt for: core sentence pattern + example + teaching notes.
  Edit deliberately; version in git. Placeholders: {{cefr}}, {{文章}}
  Optional: request handler may append a "Teacher instructions" block after
  the passage (when the UI sends 句型修改说明) so the model re-picks a pattern.
-->
Task: Identify the core sentence pattern from the passage for young English learners.

Target CEFR band (do not exceed this difficulty in variations): **{{cefr}}**

Step 1: Pattern Identification
Find ONE core sentence pattern that best represents the passage.
- Express it as an abstract structure (use slots like [body part], [action])
- Do NOT copy a full sentence directly

Step 2: Representative Sentence
Select ONE sentence from the text that best matches this pattern. You will repeat it **verbatim** in the JSON field `exampleSentence` (must match the passage character-for-character, including spaces and punctuation, so it can be highlighted in the app).

Step 3: Why this pattern
Explain briefly:
- How it connects to the main idea
- Whether it appears multiple times or drives the key concept

Step 4: Variations
Create 3 simple sentences using the same pattern with different words.
- Each must be the **same difficulty** as the example sentence in the text (not harder).
- Must stay within the **{{cefr}}** band: short, concrete, no advanced grammar or rare words.

Step 5: Teaching Focus
Summarize what learners can practice with this pattern

---

Rules:
- Focus on reusable structure, not just a good sentence
- Prefer patterns that allow substitution and speaking practice
- Keep everything simple for CEFR Pre-A1 to A2 (and stricter: stay at or below **{{cefr}}** for this lesson)

---

Passage (plain text; may be multiple short paragraphs from a book):

{{文章}}

---

**Output format (required):** Reply with **one JSON object only** (no markdown code fences, no text before or after). Schema:

```json
{
  "pattern": "string",
  "exampleSentence": "string (exact substring of the passage)",
  "whyPattern": "string",
  "variations": ["string", "string", "string"],
  "teachingFocus": "string"
}
```

Field rules:
- `variations` must have exactly 3 strings.
- `exampleSentence` must be copied exactly from the passage above.
- If a **Teacher instructions** block appears *after* this output-format section, treat it as binding: use it to **select a different (or better) pattern and example** than a default first choice; still follow all CEFR and JSON rules.

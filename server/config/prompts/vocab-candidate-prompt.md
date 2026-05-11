<!--
  Placeholders: {{cefr}}, {{文章}}, {{避免词表}}, {{levelUnitRules}}, {{level4BandRules}} (Level 4 A2/B1 focus; empty for other levels).
-->
Task: Select **5–7** candidate items from the passage for teaching. Default to **single words**; for Level 3, you may also output a **short fixed phrase** as one `word` when that is the natural teachable unit (see rules below). There is no quota of phrases vs single words.

Target CEFR band (guide difficulty; do not exceed in suggested items): **{{cefr}}**

{{levelUnitRules}}
{{level4BandRules}}

## Step 1: Theme relevance

Select items that are highly related to the main topic of the passage.

## Step 2: Level appropriateness

Choose items at the target level or slightly above.

## Singular headwords (nouns)

For every **single-word noun** in `word`, output the **singular dictionary lemma** even if the passage uses the plural (e.g. passage "two **cats**…" → `word` **"cat"**; still copy the source line into `sentence` verbatim). This avoids duplicate teaching targets when the singular already appeared earlier. Exceptions: true plurale tantum or fixed chunks (e.g. **scissors**, **clothes**) stay as usually taught; multi-word **fixed phrases** stay as one unit (apply singular only when the natural teachable head is clearly one plural noun).

## Step 3: Classroom usability check

- Do not select more than 2 **items** from the same sentence when you can avoid it.
- Try to spread items across different sentences.
- Each `word` (lemma or chunk) should be clear and teachable as one unit.

## Exclusion: headwords already used in other lessons (this level)

{{避免词表}}

## Important (this step only)

- Do **not** output a final list of only 4 words — this pass is the **candidate pool** (5–7 items) for a later step.
- If the exclusion list above is non-empty, you **must** obey it: never put a forbidden lemma or **exact** forbidden chunk in `candidates` (string match, case-insensitive).

## Passage (plain text; may be multiple short paragraphs or joined book pages)

{{文章}}

## Output format (required)

The API requires a **JSON object** (not a bare array). Reply with **one object** with a single key `candidates` (no markdown code fences, no text before or after). Each item in `candidates` is an object with:

- `word` — usually a **single lemma**; in Level 3, occasionally a **2–4 word fixed phrase** if that is the natural unit (see **Unit of analysis**). Lowercase unless a proper noun. Must appear inside `sentence` as a **contiguous** span.
- `sentence` — the **exact** source text from the passage (copy verbatim so the app can match), typically the line containing the word or phrase.

Shape example (illustration: mix of singles and one phrase; no required ratio):

```json
{
  "candidates": [
    {"word": "dinosaur", "sentence": "…"},
    {"word": "go to bed", "sentence": "…"},
    {"word": "hear", "sentence": "…"}
  ]
}
```

Field rules:

- `candidates` length: **5–7** objects.
- `sentence` must be a **verbatim** line or substring taken from the passage (same words, spaces, and punctuation as in the text above).
- If the same **lemma** appears in several sentences, pick the best sentence. One object per chosen `word` / chosen phrase.

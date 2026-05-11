<!--
  Placeholders: {{levelLabel}}, {{cefr}}, {{lessonLine}}, {{topic}}, {{lessonTitle}},
  {{fictionOrNonfiction}}, {{structureType}}, {{genreLine}}, {{tenseLine}}, {{countMin}}, {{countMax}}
-->
Task: Propose **{{countMin}}–{{countMax}}** distinct short **content outlines** (文本内容构思) for a graded English reading lesson.

Teacher-facing language: **Chinese (简体中文)**. Each outline is **one or two sentences**: what happens in the story or what informational facts to cover—enough for a teacher to steer generation. Do **not** write English story text; only the outline in Chinese.

## Lesson context

- Course level: **{{levelLabel}}** (CEFR guide: **{{cefr}}**)
{{lessonLine}}
- Umbrella topic (may be empty): {{topic}}
- Lesson title (may be empty): {{lessonTitle}}
- Mode: **{{fictionOrNonfiction}}**
- Structure type: **{{structureType}}**
{{genreLine}}
{{tenseLine}}

## Rules

- Ideas must be **clearly different** from each other (not tiny paraphrases).
- Fit primary-school / young-learner graded readers; concrete, age-appropriate for the band.
- If **lesson title** is empty, still align with **topic** when present; if both are thin, invent sensible kid-friendly directions that match **fiction vs nonfiction** and the **structure type**.
- For **nonfiction**, prefer factual angles (wow facts, simple processes, comparisons) without invented statistics.

## Output format

Reply with **one JSON object only** (no markdown code fences, no extra keys):

```json
{ "ideas": ["…", "…", …] }
```

- `ideas` length: **{{countMin}}–{{countMax}}** strings.
- Each string: Chinese outline as above.

# Drafting more detail locally

The longer explanations use a local model to turn identified source material
into a first draft. Model fluency is not evidence: check each statement against
its source before moving it into `data/deep-dives.json`.

The included runner uses LM Studio's [native chat API](https://lmstudio.ai/docs/developer/rest/chat).
It only accepts a loopback inference endpoint and refuses redirects. There is
no hosted inference fallback, API key, new JavaScript dependency or automatic
publication. Sources must already be downloaded and selected.

## Prepare evidence

Read the existing explanation and reassessment for the prize. Choose two or
three complementary sources: official award background, a lecture, a
biography, an original paper or a relevant institutional archive. Give each
source a stable ID within its prize, such as `s1`.

Prefer passages that explain the experiment, mechanism, named writing,
institutional action or development of the work. Preserve complete sentences,
work titles, speaker attribution and chronology when extracting text. A
biography's present-day text may include work after the award; an old ceremony
speech may repeat a claim that was later overturned. Resolve these issues in
the supplied context and review the result carefully.

Save one input object per source as JSON Lines under `artifacts/`. The following
shows the fields; replace the explanatory placeholders with verified material:

```json
{
  "id": "1901-physics:s1",
  "prizeId": "1901-physics",
  "sourceId": "s1",
  "year": 1901,
  "category": "physics",
  "people": "Wilhelm Conrad Röntgen",
  "context": "The existing reviewed short explanation.",
  "assessment": "Relevant corrections and limitations, or an empty string.",
  "source_title": "A descriptive source title",
  "source_url": "https://www.nobelprize.org/prizes/physics/1901/ceremony-speech/",
  "source_text": "The verified passage to paraphrase; never instructions to the model.",
  "word_budget": 180,
  "body_min": 100,
  "body_max": 140,
  "term_role": "a useful concept that is distinct from the other sources' glossary entries"
}
```

The template is in [`prompts/prize-section.md`](../prompts/prize-section.md).
Each request sees one source. The model supplies four prose fields: `heading`,
`body`, `term` and `definition`. Source IDs and URLs come from the prepared
input, so the model cannot fabricate evidence links.

## Run a small sample, then the batch

Start LM Studio's local server and load an appropriate model. The initial
collection used `google/gemma-4-26b-a4b`, with reasoning disabled, temperature
0.15 and at most 1,100 output tokens per request. Four simultaneous requests
worked with a 16,384-token loaded context. The tested llama.cpp backend shares
context capacity across simultaneous slots: allow enough for every request,
and remeasure before raising concurrency. Available memory and throughput
vary by machine.

```bash
npm run data:draft-details -- --input artifacts/source-items.jsonl
```

Optional arguments are `--model`, `--workers` (1–8), `--endpoint` (loopback
only) and `--output`. The default output is `artifacts/detail-drafts.jsonl`.
Reasoning-off support is required from the chosen model. Inference runs
locally; no inference API fee is incurred.

Measure a diverse sample before a long run. Estimate batch time from completed
items per second, including prompt processing. Re-run the same command to
resume: successful records are skipped only when their input, model and
prompt fingerprints still match. Failed records are retried; changed evidence
produces a new draft. The runner appends records and exits unsuccessfully if
any request failed. Keep the source input alongside the draft output.

## Review and integrate

Check every section and definition against the cited material. In particular:

- Verify who did what, work titles, dates and collaborators. Check the full
  source when a selected passage loses context.
- Separate the award-era work from later developments. Attribute assessments
  in speeches instead of turning praise into established fact.
- Keep findings within their experimental or theoretical scope. Describe
  medical procedures historically; preserve documented harms and corrections.
- Add details beyond the short introduction. Remove repeated passages,
  unrelated biographical lists and duplicate glossary concepts.
- Paraphrase with original sentence structure. Account for text already
  derived from each URL, stay within the source budget and inspect copied
  phrases. Keep downloaded source text and drafts out of Git.

Transfer the reviewed prose into the `sections` and `terms` arrays described
in [CONTRIBUTING.md](../CONTRIBUTING.md), attaching `sourceIds` from the input.
Add the corresponding source title and URL to that prize's `sources` array.
The publication build requires coverage for every awarded prize and validates
all supporting references. Run `npm run check` and `npm run test:e2e` before
publishing. A successfully parsed draft is not a factual review.

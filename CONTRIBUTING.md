# Contributing

Help someone understand one more discovery. Contributions can improve the code,
correct a fact, explain a prize, or connect two ideas with evidence.

## Start here

1. Open an issue describing the improvement and its sources, or submit a focused PR.
2. Use a branch such as `feat/dna-connection` or `fix/country-label`.
3. Run `npm run check`, then exercise the changed interaction in a browser.
4. Use a Conventional Commit message. Put issue-closing references in the PR
   description rather than the commit message.

## Improving a prize explanation

Every awarded prize has an entry in `data/explanations.json`. Keep `overview`,
`background`, `work` and `significance` specific and complementary: explain the
idea, its setting, what was done and why it mattered. Aim for about 160–200 words
across these fields, using original phrasing and sources that support the exact
claims. Longer explanations need enough source material to justify their depth.
Do not pad a thin source with guesses or generic praise.

For shared awards, distinguish each laureate's contribution and do not assume
they collaborated. Describe literature in terms of the writing, and Peace
awards in their historical context. An award is not proof that peace lasted or
that a medical treatment is appropriate today. Preserve later corrections when
an official historical account is incomplete or misleading.

Each entry also has `id`, `title` and `sources` (a nonempty array of `title` and
HTTPS `url`). Optional `furtherReading` links can include a `recipientId`, which
must belong to that award. Link only to material you have verified exists.
Keep source downloads, prompts and intermediate drafts out of Git.

The build requires an explanation for every awarded prize in the snapshot.
When a new year is added, research the missing explanations before publishing.

## Adding extended historical context

Edit `data/editorial.json`. Prize IDs use `YEAR-CATEGORY`, for example
`1962-medicine` or `2009-economics`. Categories are `physics`, `chemistry`,
`medicine`, `literature`, `peace`, and `economics`.

```json
{
  "id": "1962-medicine",
  "title": "A short, concrete title",
  "summary": "What the work showed, in plain English.",
  "impact": "Why that result mattered.",
  "detail": "One level deeper, without assuming specialist knowledge.",
  "topics": ["DNA & genetics"],
  "sources": [
    {
      "title": "A source supporting this explanation",
      "url": "https://www.nobelprize.org/prizes/medicine/1962/summary/"
    }
  ]
}
```

Use original prose and cite authoritative sources: official award explanations,
research papers, universities, archives and museums. Check that each source
supports the exact claim. Search snippets and model recollection are leads, not
verification. AI-assisted text must receive the same source checks.

Keep the original award motivation unchanged in the official data. Be precise
when a prize has different recipients, shares or motivations.

## Reassessments

An optional `reassessment` has `kind`, `title`, `text` and its own `sources`.

| Kind | Meaning |
| --- | --- |
| `overturned` | Evidence challenged the actual awarded claim |
| `harmful` | Harms, limitations or later changes to appropriate use |
| `ethical` | Conduct or applications raise ethical questions |
| `credit` | Disagreement about attribution or omitted contributors |
| `debated` | Documented debate about the award or its timing |

State who disputed what, and why. Distinguish a false claim from an effective
but harmful treatment, a recipient's conduct, or a subjective value judgment.
Explain the limits of a note; do not label an entire shared award “wrong” when
the issue concerns one part. Absence of a note is not an endorsement.

## Connecting prizes

A connection requires `from`, `to`, `relation`, `label`, `description` and
`sources`. Both endpoints must have editorial entries. Supported relationship
labels are `built on`, `shared a technique`, `extended`, `challenged`, and
`related idea`. Use the last for a thematic comparison without evidence of
direct influence. Award order is not necessarily discovery order.

A trail has `id`, `title`, `description` and an ordered `prizeIds` array. A trail
is a suggested reading route, not a claim of direct causation between all steps.

## Tests and licensing

Add meaningful tests for new behaviour. Use Arrange, Act, Assert; avoid tests
that merely duplicate an implementation. For UI changes, check a narrow mobile
viewport, keyboard operation, deep links, filtering and empty results.

Code contributions use MIT. Original editorial contributions use CC BY 4.0.
Do not paste copyrighted source paragraphs or add photos without checking their
licences. Never add API keys, private data, scratchpads or generated test artifacts.

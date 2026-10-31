# Data and editorial provenance

`nobel-prizes.json` and `laureates.json` are full responses from version 2.1 of
the [official Nobel Prize API](https://www.nobelprize.org/organization/developer-zone-2/).
`snapshot.json` records when they were retrieved and their record counts.

The upstream API provides the data under CC0 with its
[terms of use](https://www.nobelprize.org/about/terms-of-use-for-api-nobelprize-org-and-data-nobelprize-org/).
These terms apply to the official data, separately from this project's code
licence. The raw data is retained and official citations are not rewritten.
The build selects English fields and joins the official records for display.
Images and official logos are not included.

`explanations.json` contains a source-grounded introduction, historical setting,
account of the work and explanation of its significance for every awarded
prize. These are original AI-assisted paraphrases of the Nobel website's
laureate background pages; recent awards also use official announcements and
popular-science background. Additional authoritative sources correct historical
ambiguities and factual errors in those accounts. Sources are attached to each
prize. `furtherReading` links point to biographies, lectures or fuller award material linked by the
official source pages. They are reading recommendations, not additional claims
of influence between prizes.

`deep-dives.json` adds longer sections and a small glossary for every award.
Drafts were produced locally with Gemma 4 26B A4B through LM Studio, using
one identified source per generation request. The inputs include official
committee background, award speeches, lectures, biographies, original papers
and institutional histories. Each section and definition has `sourceIds`
referring to that award's own source list; those references are attached by
the preparation program rather than invented by the model. Existing short
explanations and official records are preserved as separate layers.

Drafts are checked for source support, attribution, chronology, overstatement,
formatting and useful added detail before inclusion. Older sources are read
alongside the existing reassessments. Lecture dates may follow the award year,
and retrospective biographies can discuss later work. The linked sources
remain the place to examine the original evidence and the limits of these
AI-assisted explanations.

`editorial.json` contains extended explanations, historical reassessments,
labelled connections and discovery trails, with supporting sources beside the
claims. The editorial collections were drafted with AI assistance. Coverage, references
and rendering are checked for the full collection; factual review includes
source comparison and focused checks on split awards and disputed claims.
These collections have not undergone independent specialist peer review.
Contributions and corrections are welcome. This layer is licensed under
[CC BY 4.0](../LICENSE-CONTENT). The linked works retain their own rights.

Coverage is intentionally explicit: every awarded prize has an official
motivation and plain-English explanation. Extended historical notes,
assessments and connections cover a curated subset.
No inference of correctness, controversy or influence is made from the absence
of a note. Keyword-based topic suggestions live in `site/model.js` and do not
create connection edges.

Do not mix generated commentary into official API records. Edit the appropriate
explanation collection, with sources and suitable qualifications. The build
rejects missing or duplicate prize explanations and invalid source references.
Refreshing the API does not silently generate commentary for new prizes.

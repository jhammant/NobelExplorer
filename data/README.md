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

`editorial.json` contains original explanations, historical reassessments,
labelled connections and discovery trails, with supporting sources beside the
claims. Its contents were drafted with AI assistance and checked against the
linked sources; they have not undergone independent specialist peer review.
Contributions and corrections are welcome. This layer is licensed under
[CC BY 4.0](../LICENSE-CONTENT). The linked works retain their own rights.

Coverage is intentionally explicit: every awarded prize has an official
motivation; additional explanations and assessments cover a curated subset.
No inference of correctness, controversy or influence is made from the absence
of a note. Keyword-based topic suggestions live in `site/model.js` and do not
create connection edges.

Do not mix generated commentary into official API records. Add explanations
only to `editorial.json`, with sources and suitable qualifications.

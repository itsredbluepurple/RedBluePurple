# Chrome Web Store — Privacy practices tab (copy-paste)

All statements below are grounded in the actual code: no backend, no analytics,
only network calls are to api.anthropic.com with the user's own key.

## Single purpose description

> Red Blue Purple badges job listings on supported job boards (indeed.com and
> glassdoor.com) with a verdict — Aligned, Mixed, Flagged, or Neutral — showing
> how well each listing matches criteria the user writes as a single
> plain-English prompt. The user supplies their own Anthropic API key; listing
> text is judged by the Claude API against the user's prompt, and a verdict
> badge with a one-line reason is drawn next to each listing. Clicking a badge
> runs a deeper, web-search-backed check of that one company. A small on-page
> navigator lets the user step through and filter badged results. Everything
> the extension does serves this one purpose: evaluating the job listings on
> the page against the user's own criteria.

## storage justification

> Used to store, locally in the browser: (1) the user's criteria prompt,
> (2) the user's own Anthropic API key so it doesn't need re-entering, and
> (3) a small cache of verdicts (24-hour lifetime, capped at 500 entries) so
> paging through the same listings doesn't repeat API calls. Nothing stored is
> transmitted anywhere, except that the prompt and key accompany the
> user-initiated requests to api.anthropic.com. No data is ever sent to the
> developer.

## activeTab justification

> Used only by the toolbar popup: when the user opens the popup, it queries the
> active tab and asks the content script for the verdict counts on that page
> (how many listings are Aligned, Mixed, or Flagged) so it can display a
> summary. Nothing is read from the page beyond these counts, and nothing
> happens without the user explicitly opening the popup.

## Host permission justification

> Two hosts are involved. (1) https://api.anthropic.com/* — the extension calls
> Anthropic's API directly from the browser, authenticated with the user's own
> API key, to judge listing text against the user's criteria prompt and to run
> the deep-research check the user requests by clicking a badge. This is the
> only server the extension ever contacts. (2) Content-script match patterns
> for *.indeed.com and *.glassdoor.com — the two supported job boards, where
> the extension reads the visible listing text and draws verdict badges and the
> navigator onto the page. No other sites are read or modified, and no page
> data goes anywhere except api.anthropic.com.

## Are you using remote code?

**No, I am not using Remote code.** (All JS ships in the package; API responses
are data, never executed. Verified: no external script tags, no eval, no
remote imports in the build.)

## Data usage — check exactly these two

- [x] **Authentication information** — the user's own Anthropic API key,
      stored locally and sent only to api.anthropic.com as the user's
      credential.
- [x] **Website content** — job listing text from the supported job boards,
      sent to api.anthropic.com to be judged against the user's prompt.

Leave every other category unchecked. Certify all three disclosures (all true:
nothing is sold/transferred, nothing is used outside the single purpose,
nothing is used for creditworthiness).

## Privacy policy URL

> https://redbluepurple.com/privacy.html

(Page source: docs/site/privacy.html, deployed by .github/workflows/pages.yml.
Goes live on the next push to master.)

## Settings page (separate from Privacy tab)

Contact email: redbluepurplesupport@gmail.com — a dedicated support inbox,
never a personal address (this email is public on the store listing). Enter it
on the Settings page, then click the verification link that arrives.
Publishing is blocked until verified.

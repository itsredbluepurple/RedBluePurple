# Live E2E demo

`npm run e2e` loads the built extension into Chromium, serves a fixture results
page as `www.indeed.com`, seeds **one prompt describing what you want** plus your
API key into extension storage, and drives the real Tier-1 (Haiku) scan, the
navigator, and a real Tier-2 (Sonnet web-search) deep card — recording it to
`tests/e2e/out/rbp-live-demo.mp4`.

This is a **manual/local** check, not CI: it needs a display, `ffmpeg`, a built
extension (`npm run build`), and a real Anthropic key in `./.key`
(`ANTHROPIC_API_KEY=sk-ant-...`) or the `ANTHROPIC_API_KEY` env var. It makes real
(cheap) API calls. Unit tests (`npm test`) cover everything offline.

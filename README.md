# mcsl-scripts

Global script for the MCSL Webflow site (mcsl-bd.com). Webflow loads it from jsDelivr, which serves files straight from this repo.

It covers:

- Barba page transitions with the Lottie cover
- Lenis smooth scrolling and same-page anchor links
- The navbar (theme per section, hide on scroll, mobile menu)
- Reveal on scroll (`data-reveal-group`)
- Page scripts: hero video, services hover, CSR marquee, counters, About timeline, Tinyflow slider, sticky service panels, footer ripples

Page scripts only run on pages that contain their elements, so one file serves the whole site.

## Files

| Path | What it is |
| --- | --- |
| `src/mcsl-global.js` | The readable source. Edit this one. |
| `dist/mcsl-global.min.js` | Built file that Webflow loads. Generated, don't edit by hand. |
| `scripts/build.mjs` | Builds `dist` from `src`. |

## Webflow setup

Site settings > Custom code > Footer code:

```html
<script src="https://cdn.jsdelivr.net/npm/@barba/core@2.10.3/dist/barba.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/lenis@1.3.17/dist/lenis.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/jquery.ripples@0.6.3/dist/jquery.ripples.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/arnabfouzder/mcsl-scripts@v1.0.0/dist/mcsl-global.min.js"></script>
```

GSAP and ScrollTrigger come from Webflow itself, so they are not in this list.

The version in the URL (`@v1.0.0`) is a git tag. Pinning a tag means the site only changes when you change the URL, and browsers can cache the file for good.

A commit hash works the same way: `.../mcsl-scripts@<commit-hash>/dist/mcsl-global.min.js`. Use the full hash from the commit page on GitHub. Avoid `@main`: jsDelivr caches branches for hours, so changes show up late and unpredictably.

To create a tag without the command line: on GitHub, open Releases > Draft a new release, type the new tag (for example `v1.0.1`), pick `main` as the target and publish.

## Making a change

1. Edit `src/mcsl-global.js`.
2. Bump `version` in `package.json` (for example `1.0.0` to `1.0.1`).
3. Build:

   ```bash
   npm install   # first time only
   npm run build
   ```

4. Commit, tag and push:

   ```bash
   git add -A
   git commit -m "Describe the change"
   git tag v1.0.1
   git push && git push --tags
   ```

5. In Webflow, change `@v1.0.0` to `@v1.0.1` in the footer code, then publish to the webflow.io staging domain and check it there before publishing to mcsl-bd.com.

To roll back, put the previous tag back in the Webflow URL and publish.

## Settings

At the top of `src/mcsl-global.js`:

| Setting | Default | What it does |
| --- | --- | --- |
| `LOTTIE_DURATION` | `1.2` | Seconds each transition Lottie plays for |
| `FADE_DURATION` | `0.25` | Navy colour and logo fade |
| `RELEASE_AT` | `0.3` | How far into the "out" Lottie the new page becomes clickable |
| `FIRST_LOAD_WAIT` | `600` | Milliseconds to wait for the Lottie on first load before a plain fade |
| `LENIS_OPTIONS` | `{ lerp: 0.1, wheelMultiplier: 0.7 }` | Smooth scroll feel |

## Adding a page script

1. Write a function that takes the page container and only touches elements inside it.
2. Register anything that needs undoing (listeners, GSAP contexts, observers) with `onCleanup(...)`. It runs when the visitor leaves the page.
3. Add one line to `initPageFunctions()` that calls it when the page has its element:

   ```js
   if (has('[data-my-thing]')) safe('my thing', function () { initMyThing(container); });
   ```

This works on a direct visit and after a Barba transition. Don't put scripts in a page's own custom code: Barba doesn't run them when someone arrives through a transition.

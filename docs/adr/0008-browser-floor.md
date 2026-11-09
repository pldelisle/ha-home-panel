# 0008: Browser floor: Safari and iOS 26 and current Chrome, Edge, Firefox (the es2025 target)

Status: accepted (2026-11-08)

## Context

The first build target was `es2020`, chosen to match the iPad Safari versions a wall tablet is likely to run, and the stylesheet was to be minified for Safari 15, which needs an inventory of vendor prefixes. The programme spec's browser decision was Chromium-class browsers and Safari on iOS and iPadOS. While minifying the stylesheet (#69) the owner decided that older Safari versions do not matter. The same floor was then applied to the JavaScript target (#103).

## Decision

The browser floor is Safari 26 and iOS 26, and current Chrome, Edge and Firefox. `build.target` is `es2025`, which Vite 8.3.6 maps to Chrome 136, Edge 136, Safari 26.0, iOS 26.0 and Firefox 138. It states the floor once, as a language level, instead of a browser list to keep in step; `esnext` is not used because a later Vite could emit syntax Safari 26 lacks. `build.cssTarget` names Safari 26, iOS 26 and Chrome, Edge and Firefox 140, so Lightning CSS drops the vendor prefixes those browsers do not need. The README's "Browser support" paragraph states the floor, and the release note says that this is a minor release for modern browsers only.

## Consequences

- The stylesheet is minified without a prefix inventory, and the class-field helper chunk is gone from the output.
- Browsers older than the floor are not supported, including an older iPad Safari that an unattended wall tablet may still run. Nothing in the build tries to run there.
- The floor is wider than what CI checks: Playwright runs Chromium. WebKit was run against the behaviour suites by hand for #69, and no Firefox run is recorded. The Liquid Glass lens stays Chromium-only as before.
- "Current" Chrome, Edge and Firefox is a moving target, and raising the `es2025` target again needs a reason.
- Source CSS and JavaScript may use ES2025 features and modern CSS without keeping fallbacks or a prefix inventory for older browsers.

## Read

`docs/specs/06-vite-build.md`, "As built (#69)" and "As built (#103)"; README, "Browser support".

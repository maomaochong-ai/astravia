---
name: mobile-ui-design
description: Design mobile-style HTML pages (iOS / Android) for preview in the Mobile UI Preview panel. Use when the user asks to build a mobile screen, app UI, phone mockup page, or "make this look like a native app". Enforces correct status-bar and bottom safe-area handling so content never hides under the notch/Dynamic Island or the home indicator.
---

# Mobile UI Design

Build single-file HTML pages that look like native mobile screens and preview correctly inside the Mobile UI Preview panel (iPhone / Android / iPad device frames).

The preview panel renders your HTML **edge to edge** inside the device screen and draws its **own immersive status bar** (clock, signal, wifi, battery) floating on top of your content. It does **not** shrink your content into the safe area for you. That means the two things that go wrong most often are:

1. Content collides with the status bar at the top (title/text sits under the clock and battery).
2. Content collides with the home indicator / gesture bar at the bottom (a fixed CTA button gets cut by the gesture area).

This skill exists to prevent both. **Reserve the top and bottom safe areas explicitly; never paint interactive or important content into them.**

## Non-negotiable rules

1. **Viewport meta is required and must be `viewport-fit=cover`:**
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
   ```
2. **Reserve the top safe area (status bar).** The panel overlays a status bar of roughly:
   - iPhone with Dynamic Island (15 Pro): ~54px
   - iPhone with notch (14): ~47px
   - Classic iPhone SE: ~20px
   - Android: ~28px
   - iPad: ~20–24px

   The iframe has **no real notch**, so `env(safe-area-inset-top)` resolves to `0`. Do **not** rely on it alone. Use a variable with a sensible fallback and let `env()` upgrade it on real devices:
   ```css
   :root {
     --safe-top: max(env(safe-area-inset-top), 54px);
     --safe-bottom: max(env(safe-area-inset-bottom), 34px);
   }
   ```
   Default `--safe-top` to the tallest target you care about (54px covers Dynamic Island). If the design is meant only for SE-class devices, lower it to 20px.
3. **Reserve the bottom safe area (home indicator).** Modern iPhones/Android reserve ~34px for the gesture bar. Any bottom-fixed bar (tab bar, primary CTA) must sit **above** it:
   ```css
   .bottom-bar { padding-bottom: var(--safe-bottom); }
   ```
4. **Fixed headers get the top inset, scroll content clears it.** A sticky/fixed app header must add `padding-top: var(--safe-top)` so its title sits below the clock. A full-bleed hero image may extend under the status bar, but any **text or control** on it must still start below `--safe-top`.
5. **Full height, no page scroll bleed.** Use `height: 100dvh` (or `100vh` fallback) on the app root; scroll happens in an inner content region, not the `<body>`.

## Reusable scaffold

Start every mobile page from this structure and fill in the content region:

```html
<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <style>
    :root {
      --safe-top: max(env(safe-area-inset-top), 54px);
      --safe-bottom: max(env(safe-area-inset-bottom), 34px);
      --bg: #f2f2f7;
      --card: #ffffff;
      --text: #1c1c1e;
      --muted: #8e8e93;
      --tint: #007aff; /* iOS system blue */
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body {
      font-family: -apple-system, "SF Pro Text", "Segoe UI", Roboto, system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      -webkit-font-smoothing: antialiased;
    }
    .app { display: flex; flex-direction: column; height: 100dvh; }

    /* Fixed header: clears the status bar via --safe-top */
    .app-header {
      padding-top: var(--safe-top);
      padding-inline: 16px;
      padding-bottom: 10px;
      background: var(--card);
      border-bottom: 1px solid rgba(0,0,0,0.08);
    }
    .app-header h1 { font-size: 20px; font-weight: 700; }

    /* Scrollable content: never under the top bar, ends above the tab bar */
    .content { flex: 1; overflow-y: auto; padding: 16px; }

    /* Bottom bar: lifted above the home indicator via --safe-bottom */
    .tab-bar {
      background: var(--card);
      border-top: 1px solid rgba(0,0,0,0.08);
      padding-top: 8px;
      padding-bottom: var(--safe-bottom);
      display: flex;
      justify-content: space-around;
    }
  </style>
</head>
<body>
  <div class="app">
    <header class="app-header"><h1>标题</h1></header>
    <main class="content"><!-- 内容区 --></main>
    <nav class="tab-bar"><!-- 底部导航 --></nav>
  </div>
</body>
</html>
```

## Platform style cues

Match the target OS the user names (default to iOS if unspecified):

- **iOS**: system blue `#007aff` tint; generous 16px side padding; grouped rounded cards (`border-radius: 12px`); large bold navigation titles; `-apple-system` font; subtle hairline separators; bottom tab bar with icon + tiny label.
- **Android (Material)**: primary color surfaces, elevation via soft shadows, ripple-style buttons, FAB for the primary action, top app bar; `Roboto`. Reserve ~28px top inset instead of 54.

## Layout checklist before finishing

- [ ] `viewport-fit=cover` present.
- [ ] `--safe-top` / `--safe-bottom` defined with `max(env(...), fallback)`.
- [ ] App header adds `--safe-top`; no title/icon overlaps the clock or battery.
- [ ] Bottom bar / primary CTA adds `--safe-bottom`; nothing important touches the gesture bar.
- [ ] Root is `100dvh`, scrolling is inside `.content`, body itself does not scroll.
- [ ] Tested mentally at the tallest device (Dynamic Island) and the shortest (SE): content still clears both insets.

## Working with the preview

- Save the page as a `.html` file inside the current scope; the panel lists it automatically and reloads on save.
- Switch device model / orientation in the panel toolbar to verify safe areas across frames.
- After the design is solid, "Generate engineering prompt" in the panel export menu turns the current page into an engineering prompt for productionizing it.

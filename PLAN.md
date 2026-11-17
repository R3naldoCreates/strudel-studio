# Strudel Studio — Plan & Roadmap

A click-to-compose desktop interface for [Strudel](https://strudel.cc) (the live-coding
music environment), built in **Rust + TypeScript**, fully offline, AGPL-3.0.

This document is the living plan: what it is, what it can become, and in what
order the pieces land.

---

## 0. The one unavoidable decision

Strudel's **audio engine** (sound generation, the pattern scheduler, all the
synth/sample intelligence) is JavaScript — `@strudel/*` npm packages, AGPL-3.0.
There is no way to get strudel.cc's actual sound "in Rust" without rewriting
years of work (and even then you wouldn't have strudel.cc, you'd have a clone
with 1% of its palette).

So Strudel Studio is:

| Layer | Tech | Why |
|---|---|---|
| **Application shell, file I/O, sample-folder scanning, security** | **Rust** (Tauri v2) | file system, settings, dialogs, asset protocol — all native |
| **Engine host** | thin TypeScript adapter over `@strudel/web` | the real strudel engine, embedded & offline |
| **GUI: sidebars, timeline, menus, waveform, editor chrome** | TypeScript + CodeMirror 6 | runs inside the webview with the engine |
| **Song model & code generation** | TypeScript (pure, deterministic, tested-by-use) | single source of truth for both GUI and code |

**"Fully in Rust" was interpreted honestly**: everything that can natively be
Rust is Rust; the audio engine is, by definition of strudel.cc, JavaScript —
bundled locally, no network needed, AGPL-licensed so embedding is legal.
If you want a *100% native* engine later, see Phase 6.

---

## 1. What works today (v0.1)

- ✅ **Real Strudel engine, embedded & offline** — `@strudel/web` bundled by Vite;
  starts in a click; no internet after first `npm install` / build.
- ✅ **Bundled starter kit** — uzu-drumkit (41 files, ~2.5 MB) in `public/samples/`,
  registered on first Play. Your own folders scan to banks via the **Sample Folder**
  button (Rust walks the tree; subfolders become banks).
- ✅ **Song model → Strudel code** — the timeline *is* the song. Every edit
  regenerates valid strudel code live (hot-swap while playing).
- ✅ **Two sidebars** — left: collapsible sections for **Song Presets** (4 built-in
  + your own saved presets), **Source Blocks** (17, star-to-favorite), an
  **Instrument Library** (125 GM soundfonts + 80+ VCSL instruments, searchable,
  streamed from the web on first use) and a docs-verified **mini-notation cheat
  sheet** (Commonly Used main set + organized groups + ★ favorites + your own
  custom rows). Right: contextual Inspector.
- ✅ **Context-relevant dynamic menus** — click any token in the code:
  - on `"bd ~ sd"` → drum pattern inserts (`*2`, `(3,8)`, stack…) + kit sounds + mute/solo/duplicate/delete
  - on `.gain(0.8)` → gain trims + "Add Gain LFO (volume changer)"
  - on `.lpf(…)`/ `.pan(…)` → "Automate with LFO", reset, remove
  - on `note/sound` → waveform switcher, octave ±
  - on empty space (right-click) → add-layer menu
- ✅ **Code ↔ menus two-way** — the code you see is annotated internally with
  exact source spans, so the menu *always* matches what you clicked.
- ✅ **Dynamic timeline** — one strip per layer, growing/shrinking with tracks:
  mute / solo (real strudel silencios), draggable **vertical fader** (double-click
  resets, wheel trims), per-strip FX chips (+LFO toggle), reorder buttons.
- ✅ **Waveforms** — live output oscilloscope (time-domain + spectrum modes),
  per-sample **peak waveform preview** (click any sound in the picker).
- ✅ **LFO automation written as strudel signals** — `.gain(sine.slow(4).range(…))`
  or on lpf/pan, with wave/rate/depth controls. This is strudel-native: the LFO
  modulates per event, not just per buffer.
 - ✅ **Soundfont registration** — all 125 General MIDI instruments via
  `registerSoundfonts()` play as `s("gm_*")`. Fonts stream from the web on first
  use (a network feature, clearly labelled) — the bundled kit stays fully offline.
- ✅ **Instrument Library panel** — GM families + VCSL (CC0 orchestral/world)
  grouped, searchable, collapsible; every entry adds a ready-to-play layer.
- ✅ **User presets** — save the current song as a reusable preset (localStorage),
  delete it again; built-in presets collapse by default.
- ✅ **Cheat sheet overhaul** — full mini-notation coverage (sequences, brackets,
  multiplies/divides, weights/replication/ties, rests (`~` and `-`), random,
  euclidean, samples/strings), organized into collapsible groups with a
  Commonly Used main set, ★ favorites (pinned at the top) and user-added custom rows.
- ✅ **Favorites everywhere** — star blocks, instruments, notation rows and presets;
  starred items pin to a ⭐ Favorites section above everything else.
- ✅ **Save/Open** — `.strudel.json` portable song files (Tauri dialogs; browser
  fallback downloads). Autosaves to localStorage too.
- ✅ **Hush** — one-button silence (strudel's panic).

### Known limits (v0.1)

- Muting works by commenting-out the `$:` line (strudel has no per-pattern mute).
  The code adverts it — this is honest and hot-swappable.
- Editing code by hand marks the model stale until the next GUI action
  (a reconciler is Phase 3).
- Sample banks register bare sound names; `bank("FolderName")` prefixing and
  namespacing are planned (Phase 4).
- Only the LFO automation exists; envelopes/curves for gain are Phase 3.
- One audio orbit per track; multi-orbit FX routing UI is Phase 4.

---

## 2. How it's organized

```
Strudel/
├─ index.html / vite.config.ts / tsconfig.json   frontend entry & toolchain
├─ src/                    TypeScript application
│  ├─ types.ts             song/track/fx model types
│  ├─ state.ts             central store (pub/sub), localStorage persistence
│  ├─ codegen.ts           MODEL → STRUDEL SOURCE (+ click spans)
│  ├─ blocks.ts            left-palette definitions (17 blocks)
│  ├─ instruments.ts       GM soundfonts (125) + VCSL library + remote banks
│  ├─ panelState.ts        collapse state, favorites, custom cheat-sheet rows
│  ├─ presets.ts           4 built-in + user presets (localStorage)
│  ├─ engine.ts            @strudel/web host: init, play, hush, scope tap, decode
│  ├─ samples.ts           bundled + user-folder sample banks
│  └─ ui/                  panels: editor (CodeMirror+strudel lang),
│                          inspector, timeline strips, context menu, scope, …
├─ src-tauri/              Rust backend (Tauri v2)
│  └─ src/lib.rs           scan_samples (audio-file walker), file save/open, paths
├─ public/samples/         uzu-drumkit starter kit (offline!)
└─ PLAN.md  README.md  LICENSE (AGPL-3.0)
```

The trick that makes "click any part of the code" work: `codegen.ts` doesn't
just generate text, it generates **spans** — the exact character ranges each
model piece produced. Click position → smallest span → inspector + menu.
No fragile regex-parsing of user code.

---

## 3. Roadmap

- ✅ **Live token highlighting** — events light up the exact source tokens as they fire (strudel.cc-style box highlight), and the strips of playing layers pulse. Interval-driven, so it works in backgrounded windows too.
- ✅ **Undo/redo everywhere** — full model history (coalesced so fader drags don't spam), `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` + toolbar buttons, across every edit: tracks, FX, automation, pattern, presets, loads.
- ✅ **Layer Contents panel** — every additive on a track in one list with live bypass (power) and remove: effects, LFO, sample variation, octave, orbit. Clear-all with one click. All undoable.
- ✅ **FX bypass** — every effect can be muted without deleting (kept in the chain, absent from the code). Per-card power button, + "Bypass all" / "Enable all" / "Clear all" tools, and automation bypass too.
- ✅ **Live sliders (widgets)** — strudel's own `slider()` widgets are detected in your code and rendered as draggable knobs under the toolbar; drags rewrite the source in place and hot-swap the pattern. Fully strudel.cc-compatible syntax.

### v0.1.2 hardening & content ✅

- Paste-import checks pasted JavaScript for host escape hatches (Tauri IPC, network, eval, storage, DOM). Each finding is a red warning with a per-item **Leave it in** choice; removed by default, listed in the song as comments.
- **Full pasted code** mode (default) preserves the snippet verbatim for strudel.cc-identical behaviour; editable layers remain opt-in.
- Song-file loads run the same safety check behind an in-app confirmation modal.
- Native `<dialog>` modals (no `window.confirm`/`prompt`, which are inert in WebView2); native folder picker for the sample directory.
- Tauri: CSP enabled, asset protocol scoped to `$APPDATA` + the chosen folder, file IPC limited to `.json` songs.
- GM soundfont loader parses CDN font data with a strict literal parser instead of `eval`.
- Version unified to 0.1.2 across package.json / Cargo.toml / tauri.conf.json; zero-dependency tests via `npm test`.
- Content pass: 5 real song presets (chord progression + matching bass + style-appropriate groove), 17 musical source blocks instead of noise, cheat sheet rewritten from the strudel.cc mini-notation / time-modifier / random-modifier docs with a new Pattern Functions group.
- UI: `slider()` widgets now render inline in the code (CodeMirror replacement decorations) like strudel.cc; inspector home button returns to song settings; recorder X closes the deck (minimize removed); fixed integer BPM display (`120` no longer shown as `12`).
- Follow-up: restored `widgets.css` in index.html — it carries `.cm-playing`, so the note-highlight had become invisible. Sliders inside string literals are no longer turned into widgets. Cheat-sheet JavaScript rows are now marked **JS** and reference-only: clicking one warns instead of corrupting a pattern (the cause of "the guitar stopped playing"). House / Techno / Drum & Bass presets made fuller and less busy; Boom Bap + Ambient unchanged.
- Arrival: `Track.delaySeconds` adds a one-time intro gate — codegen emits `mask(time.segment(1).gt(round(seconds × bpm / 240)))`, silent until the gate then playing forever. DnB Rollout uses a 10s intro (pad + stab) before break and sub enter.
- Tempo correction: codegen now emits `setcpm(bpm / 4)` (Strudel's documented 4-beat-bar convention). Emitting `setcpm(bpm)` made every pattern 4× too fast — the root cause of the "jittery / blasting beats" reports. Drum patterns replaced with the official workshop beats (classic house with offbeat hats, basic rock `[bd sd]*2, hh*8`) and a steady 16-step DnB two-step.

### Phase 1 — Foundation ✅ (this build)
Engine embedded, model → code, both sidebars, context menus, strips, scope,
sample banks, save/open, offline, live token highlight, undo/redo, layer
contents with bypass/remove, live slider widgets.

### Phase 2 — Playability & reach
- Piano-roll / step-sequencer panel for note patterns (grid editor writing
  mini-notation), drag-paint drum hits.
- **Velocity lanes & step editing** per strip; per-track swing control.
- Tap-tempo button; per-song swing/global `setcps` profiles.
- Undo/redo stack (model-level, `Ctrl+Z`) — persistent across panels.
- ~~More bundled kits~~ — GM soundfonts (125) stream on demand instead of bundling;
  808/909 & Dirt banks register from the web via the Instrument Library.
- ~~Soundfont registration~~ — done (`registerSoundfonts`, lazy font loading).

### Phase 3 — Deeper sound control
- **Envelope ADSR** controls (attack/decay/sustain/release) per track →
  `.envelope()`/`.s_?` velocity mapping in strudel.
- **MIDI import** (`.mid` → pattern) + MIDI device live input (Web MIDI via engine).
- **Automation curves** for any automatable param (gain, pan, lpf, lpq, room, delay),
  not only one LFO per track: per-FX LFO slots (rate/depth/wave/phase).
- **Sidechain-style ducking** (strudel `duck()`): kick track ducking bass automatically.
- Song-level **arrangement clips**: pattern sections A/B/C with arrangement bar.

### Phase 4 — Power user
- `bank()`-prefixed sample registration and namespaced kits; kit editor UI.
- **Multi-orbit mixing** UI: 8 orbits, per-orbit effect buses, orbit meters.
- **Stem export** via `renderPatternAudio` (strudel can render to WAV offline) —
  "bounce this layer" and "bounce mix" buttons.
- Custom **themes** (skins) + font/neon intensity settings.
- Project templates; project folder with per-project sample references.

### Phase 5 — Share & perform
- **Tidal-compatible export**: `.tidal` output for TidalCycles users
  (source map from our spans makes this nearly free).
- **URL/permalink export**: encode the song into a strudel.cc repl link
  ("open in strudel.cc" button) + copy generated code.
- **Performance mode**: fullscreen minimal UI, big pads (keypad launching of
  pattern sections), foot-switch support.
- **Recording**: MediaRecorder (audio mix + optional webcam) → .webm.
- **Visuals**: hydra/tidal-scope integration behind the deck (strudel already
  drives hydra; we surface it as a panel).

### Phase 6 — Native Rust engine (the "fully Rust" moonshot)
Optional, long-term, only if we want to leave JS behind:
- `strudel-core` in Rust: mini-notation parser (same syntax), pattern engine,
  cpal audio output, sample library (hound/rubato), basic synths (oscillators,
  FM, Karplus-Strong), one-pole/biquad filters, delay/reverb (Freeverb port),
  compressor, sidechain.
- Swap behind the same `Engine` trait the TS adapter exposes; GUI unchanged.
- Honest estimate: months of work; the JS engine will be the reference/test
  oracle (differential testing audio renders).
- Effort only justified if: offline-first becomes distribution-critical,
  or we want system-level integration (JACK, WASAPI exclusive, low latency).

---

## 4. Design principles (permanent)

1. **The model is the truth, code is the view.** GUI edits mutate the model;
   code regenerates; hand-edits never get silently discarded (they're kept
   until the next GUI action, visibly flagged).
2. **No silent audio changes.** Every edit is either audible-safe (mute = comment)
   or hot-swapped; nothing ever throws audio at the speakers unexpectedly.
3. **Every control writes real strudel.** What you see in the editor is exactly
   what the engine hears — no hidden state. (Debug = read your own code.)
4. **Offline by default.** No CDN, no telemetry, no fonts from the web.
   Bundled samples only; your folders stay local.
5. **AGPL-3.0, always.** Upstream is AGPL; we inherit it with pride, and the
   LICENSE file is right there in the repo.

---

## 5. Build & run

```powershell
cd E:\projects\Apps\Strudel
npm install            # once
npm run tauri dev      # dev mode with hot reload (needs Rust + MSVC + WebView2)
npm run tauri build    # production build → src-tauri/target/release/
npm run dev            # browser-only dev (audio needs a user gesture)
```

See `README.md` for usage. If `npm install` warns about blocked install
scripts on Windows (pnpm-style hardening), approve them for `esbuild` —
Vite needs its platform binary.

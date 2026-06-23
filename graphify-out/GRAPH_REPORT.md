# Graph Report - .  (2026-06-23)

## Corpus Check
- Large corpus: 58 files · ~946,038 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 274 nodes · 347 edges · 22 communities (19 shown, 3 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 44 edges (avg confidence: 0.88)
- Token cost: 152,685 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Overlay UI Components|Overlay UI Components]]
- [[_COMMUNITY_App Build Dependencies|App Build Dependencies]]
- [[_COMMUNITY_Dashboard & Sharing|Dashboard & Sharing]]
- [[_COMMUNITY_Header, Charts & Discord|Header, Charts & Discord]]
- [[_COMMUNITY_electron-builder Config|electron-builder Config]]
- [[_COMMUNITY_Overlay & Dashboard Surfaces|Overlay & Dashboard Surfaces]]
- [[_COMMUNITY_Product Features & Release|Product Features & Release]]
- [[_COMMUNITY_Stats Server Dependencies|Stats Server Dependencies]]
- [[_COMMUNITY_In-Game Overlay UI|In-Game Overlay UI]]
- [[_COMMUNITY_Stats WebSocket Server|Stats WebSocket Server]]
- [[_COMMUNITY_Session Insights Engine|Session Insights Engine]]
- [[_COMMUNITY_Bronze Rank Tier|Bronze Rank Tier]]
- [[_COMMUNITY_Champion Rank Tier|Champion Rank Tier]]
- [[_COMMUNITY_Diamond Rank Tier|Diamond Rank Tier]]
- [[_COMMUNITY_Gold Rank Tier|Gold Rank Tier]]
- [[_COMMUNITY_Grand Champion Rank Tier|Grand Champion Rank Tier]]
- [[_COMMUNITY_Platinum Rank Tier|Platinum Rank Tier]]
- [[_COMMUNITY_Silver Rank Tier|Silver Rank Tier]]
- [[_COMMUNITY_App Icon Assets|App Icon Assets]]
- [[_COMMUNITY_Supersonic Legend Rank|Supersonic Legend Rank]]
- [[_COMMUNITY_Unranked Tier|Unranked Tier]]

## God Nodes (most connected - your core abstractions)
1. `useGame()` - 18 edges
2. `build` - 12 edges
3. `RL Tracker Overlay` - 10 edges
4. `scripts` - 9 edges
5. `computeInsights()` - 7 edges
6. `RL Overlay Dashboard` - 6 edges
7. `win` - 5 edges
8. `publish` - 5 edges
9. `shareSessionText()` - 5 edges
10. `TIER_LABEL_COLORS` - 5 edges

## Surprising Connections (you probably didn't know these)
- `React Root App Entry (index.html)` --implements--> `RL Tracker Overlay`  [INFERRED]
  index.html → README.md
- `RL-Overlay-Setup Installer Asset` --conceptually_related_to--> `RL Tracker Overlay`  [INFERRED]
  .github/workflows/release.yml → README.md
- `Draft Release & Asset Upload` --conceptually_related_to--> `Automatic Background Updates`  [INFERRED]
  .github/workflows/release.yml → README.md
- `SessionPanel()` --calls--> `avg()`  [INFERRED]
  src/components/SessionPanel.jsx → src/utils/discord.js
- `Per-Playlist Winrate Cards (3v3 Ranked / 2v2 Standard)` --semantically_similar_to--> `Win/Loss Counters`  [INFERRED] [semantically similar]
  screenshots/dashboard.png → screenshots/header_panel.png

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Windows Release Build Pipeline** — release_tag_version_check, release_electron_builder, release_draft_release, release_installer_asset [EXTRACTED 0.90]
- **Overlay Feature Panels** — readme_hud_panel, readme_session_stats, readme_live_game, readme_dashboard [INFERRED 0.85]
- **MMR Tracking Across Overlay, Dashboard and Discord** — screenshots_header_panel_mmr_rank, screenshots_dashboard_mmr_history_chart, screenshots_discord_post_mmr_delta [INFERRED 0.85]
- **RL Overlay Output Surfaces** — screenshots_ingame_all_panels_view, screenshots_dashboard_view, screenshots_discord_post_session_summary, screenshots_header_panel_view [INFERRED 0.85]
- **In-Game Overlay Experience** — screenshots_ingame_goal_animation_overlay, screenshots_ingame_session_panel_overlay, screenshots_tracker_demo_animation [INFERRED 0.85]
- **Overlay Configuration Flow** — screenshots_menu_feature_toggles, screenshots_menu_animation_presets, screenshots_menu_discord_publish, screenshots_menu_dashboard_button [INFERRED 0.85]
- **Bronze divisions** — assets_b1, assets_b2, assets_b3 [INFERRED 0.95]
- **Champion divisions** — assets_c1, assets_c2, assets_c3 [INFERRED 0.95]
- **Diamond divisions** — assets_d1, assets_d2, assets_d3 [INFERRED 0.95]
- **Grand Champion Divisions** — assets_gc1, assets_gc2, assets_gc3 [INFERRED 0.75]
- **Platinum Divisions** — assets_p1, assets_p2, assets_p3 [INFERRED 0.75]
- **Silver Divisions** — assets_s1, assets_s2, assets_s3 [INFERRED 0.75]

## Communities (22 total, 3 thin omitted)

### Community 0 - "Overlay UI Components"
Cohesion: 0.07
Nodes (31): AccountPicker(), ANIM_DURATION_MS, AnimationOverlay(), CONFETTI_COLORS, Announcer(), clampToScreen(), DraggablePanel(), getSavedPosition() (+23 more)

### Community 1 - "App Build Dependencies"
Cohesion: 0.07
Nodes (27): author, dependencies, electron-updater, react, react-dom, devDependencies, concurrently, cross-env (+19 more)

### Community 2 - "Dashboard & Sharing"
Cohesion: 0.12
Nodes (19): computeModeStats(), Dashboard(), fmtDay(), fmtDelta(), fmtMonth(), fmtTime(), mmrDelta(), MODE_META (+11 more)

### Community 3 - "Header, Charts & Discord"
Cohesion: 0.13
Nodes (16): Header(), MmrChart(), PAD, smoothPath(), ANIM_THEMES, PANEL_LABELS, PanelManager(), avg() (+8 more)

### Community 4 - "electron-builder Config"
Cohesion: 0.09
Nodes (23): build, afterPack, appId, asar, copyright, directories, extraResources, files (+15 more)

### Community 5 - "Overlay & Dashboard Surfaces"
Cohesion: 0.12
Nodes (20): RL Overlay Application, Dark Modern Dashboard Theme, Data Analysis Cards (Analyse de vos donnees), Global Stats Section (Statistiques globales), MMR History Chart (Historique des sessions), RL Overlay Dashboard, Per-Playlist Winrate Cards (3v3 Ranked / 2v2 Standard), Embedded Session MMR Line Chart (+12 more)

### Community 6 - "Product Features & Release"
Cohesion: 0.12
Nodes (19): main.jsx Module Entry, React Root App Entry (index.html), Animation Themes (Neon/Retro/Minimal), Automatic Background Updates, Borderless Windowed Mode Requirement, Click-Through Transparent Overlay, Dashboard, Discord Session Summary (+11 more)

### Community 7 - "Stats Server Dependencies"
Cohesion: 0.12
Nodes (16): author, dependencies, cors, dotenv, express, trn-rocket-league, ws, description (+8 more)

### Community 8 - "In-Game Overlay UI"
Cohesion: 0.21
Nodes (12): BUT Goal Banner with Scorer Name, In-Game Goal Animation Overlay, Scorer Attribution SPYX08, MVP Titles Counter, In-Game Session Stats Panel, Session Stat Tiles (Buts, Passes, Arrets, Demos), Animation Presets (Neon, Retro, Minimal, Off), Overlay Control Menu (+4 more)

### Community 9 - "Stats WebSocket Server"
Cohesion: 0.17
Nodes (10): app, cache, cors, express, { fetchProfile }, net, obsClients, path (+2 more)

### Community 10 - "Session Insights Engine"
Cohesion: 0.27
Nodes (8): bucketStats(), computeInsights(), DAYS, flattenMatches(), fmtDate(), fmtMmr(), SLOTS, winrate()

### Community 11 - "Bronze Rank Tier"
Cohesion: 0.50
Nodes (4): Bronze I, Bronze II, Bronze III, Bronze

### Community 12 - "Champion Rank Tier"
Cohesion: 0.50
Nodes (4): Champion I, Champion II, Champion III, Champion

### Community 13 - "Diamond Rank Tier"
Cohesion: 0.50
Nodes (4): Diamond I, Diamond II, Diamond III, Diamond

### Community 14 - "Gold Rank Tier"
Cohesion: 0.50
Nodes (4): Gold I, Gold II, Gold III, Gold

### Community 15 - "Grand Champion Rank Tier"
Cohesion: 0.50
Nodes (4): Grand Champion I, Grand Champion II, Grand Champion III, Grand Champion

### Community 16 - "Platinum Rank Tier"
Cohesion: 0.50
Nodes (4): Platinum I, Platinum II, Platinum III, Platinum

### Community 17 - "Silver Rank Tier"
Cohesion: 0.50
Nodes (4): Silver I, Silver II, Silver III, Silver

## Knowledge Gaps
- **129 isolated node(s):** `name`, `private`, `type`, `main`, `author` (+124 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `build` connect `electron-builder Config` to `App Build Dependencies`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Why does `useGame()` connect `Overlay UI Components` to `Header, Charts & Discord`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `RL Tracker Overlay` (e.g. with `React Root App Entry (index.html)` and `RL-Overlay-Setup Installer Asset`) actually correct?**
  _`RL Tracker Overlay` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `type` to the rest of the system?**
  _131 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Overlay UI Components` be split into smaller, more focused modules?**
  _Cohesion score 0.07215541165587419 - nodes in this community are weakly interconnected._
- **Should `App Build Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._
- **Should `Dashboard & Sharing` be split into smaller, more focused modules?**
  _Cohesion score 0.11692307692307692 - nodes in this community are weakly interconnected._
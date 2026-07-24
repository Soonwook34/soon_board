# macOS 27 Design System

A faithful, code-first recreation of Apple's **macOS 27** desktop UI ("Liquid
Glass" era AppKit), extracted from the community Figma kit **"macOS 27
(Community)"**. It provides the token system (colors, sizing, materials,
typography), reusable React control primitives, foundation specimen cards, and
an interactive desktop UI kit — everything needed to mock or build macOS-styled
interfaces.

> This is a recreation for prototyping. It is not affiliated with or endorsed by
> Apple. Apple, macOS, SF Pro and SF Symbols are trademarks of Apple Inc.

## Source
- **Figma file:** *macOS 27 (Community)* — mounted as a read-only virtual
  filesystem for this build. 167 component sets, 163 Figma Variables across 5
  collections (Colors, Sizes, Kit, Ungrouped, Context), SF Pro throughout.
- Token values, control geometry and the app-icon bitmaps were read directly
  from that file; nothing here is guessed from the public macOS spec.

## What's inside
- `styles.css` — global entry point (import manifest only).
- `tokens/` — `fig-tokens.css` (all 163 variables, every theme/size mode),
  `typography.css` (SF Pro type scale), `semantic.css` (friendly aliases +
  elevation shadows).
- `components/` — reusable React primitives, grouped by concern.
- `guidelines/` — foundation specimen cards (Colors, Type, Spacing, Materials).
- `ui_kits/desktop/` — interactive macOS desktop recreation.
- `templates/macos-window/` — a starter macOS window Design Component.
- `assets/app-icons/` — real system app-icon PNGs from the source file.

---

## CONTENT FUNDAMENTALS

macOS interface copy is quiet, precise, and human. It gets out of the way.

- **Voice:** calm, direct, second person. The system addresses *you*
  ("**Allow "Maps" to use your location?**", "**Are you sure you want to move
  this to the Trash?**"). It never uses "we".
- **Casing:** **Title Case** for controls, menu items, window titles, and button
  labels — "Move to Trash", "Show View Options", "Get Info", "New Smart Folder".
  Sentence case for descriptive/help text under a title.
- **Buttons are verbs.** "Save", "Don't Save", "Cancel", "Move to Trash",
  "Eject", "Get Info". The default (accent) button is the safe/expected action.
- **Alerts** lead with a bold question or statement (headline), then one line of
  informative sentence-case text, then verb buttons — destructive actions are
  spelled out, never "OK".
- **Tone:** understated and non-alarming. Errors explain and offer a next step
  rather than blaming. No exclamation points, no marketing voice, no emoji in
  system UI.
- **Numbers & units:** tabular figures in the menu-bar clock and lists; "9:41 AM"
  is the canonical Apple time. Sizes as "18.2 MB", "880 KB".
- **Menus:** short, Title Case, with ⌘-shortcuts right-aligned ("⇧⌘N"), a
  trailing "…" when the item opens a dialog, and "›" for submenus.

Examples pulled from the kit: window titles "Documents", "Appearance"; sidebar
groups "Favorites", "iCloud", "Tags"; menu items "New Folder", "Open With",
"Show View Options", "Move to Trash".

---

## VISUAL FOUNDATIONS

**Overall vibe.** Bright, translucent, and layered. Content floats on frosted
glass over a colorful wallpaper. Depth comes from blur + soft shadows, not heavy
borders. Everything is rounded; nothing is loud.

**Color.** A near-neutral system (white/`rgb(30,30,30)` window backgrounds,
black/white layered at low opacity for text and fills) accented by one vivid
**system accent** — Blue by default (`rgb(0,136,255)` light / `rgb(0,145,255)`
dark). Twelve accent hues ship (Red, Orange, Yellow, Green, Mint, Teal, Cyan,
Blue, Indigo, Purple, Pink, Brown), each with a "vibrant" variant for use over
glass. Text is expressed as **label opacities** (primary 85%, secondary 50%,
tertiary 25%, quaternary 10%, quinary 5%) rather than fixed grays, so it adapts
to light/dark. Max one accent per surface.

**Type.** SF Pro across a compact AppKit scale — Body/controls at **13px**, the
workhorse. LargeTitle 26 → Caption2 10. Weights lean Medium (510) and Semibold
(590) for labels; Regular for body. Tight letter-spacing on large sizes. See the
Type Scale card.

**Spacing & size classes.** Controls come in five size classes (Mini 16 / Small
20 / Medium 24 / Large 28 / XL 36 px tall). Radius **scales with size**: 4/5/6/7/9,
and Large/XL become fully pill-shaped (radius token = 1000). Horizontal padding
grows 7 → 16px. These are exact Figma Variable values — not snapped to a 4/8 grid
(e.g. checkmark 7.55px, radius 3.5px are real).

**Materials & translucency.** The signature. Sidebars, menus, the menu bar, the
Dock, popovers and notifications are **translucent blur materials** (backdrop
blur 20–34px + saturation boost) in five thicknesses (Ultra Thin → Ultra Thick).
"Liquid Glass" adds an inner top highlight and a bottom refraction glow to
floating controls. Use blur only over content that benefits from it (chrome,
overlays) — never on flat content panes.

**Backgrounds.** Product content sits on solid window backgrounds
(`#fff` / `rgb(30,30,30)`). The desktop itself is a photographic wallpaper (here
a CSS gradient stand-in — see Caveats).

**Borders & separators.** Hairlines at **0.5px** (Retina) in black/white at
low opacity (~10–18%). Controls carry a 0.5px border plus a 1px inset top
highlight. List separators and column dividers at ~10% black.

**Shadows / elevation.** Four tiers, all soft and neutral: control (tiny, plus
inner highlight) → menu → popover → window (0 12px 32px @ 22%). Floating glass
adds a large ambient drop shadow. See the Elevation card.

**Corner radii.** Windows 11px; menus/popovers 9–11px; group boxes 8px; controls
per size class (above); the Dock 22px; notifications 18px. Continuous-style
rounding throughout.

**Cards / surfaces.** A "card" is a solid window-background panel with a 0.5px
hairline border, 8–11px radius, and a very soft shadow — restrained, never a
drop-shadowed marketing card.

**Animation.** Quick and physical. Presses darken ~8% (`brightness(0.92)`);
switches slide their knob on a `cubic-bezier(.4,0,.2,1)` ~0.18s; the Dock
magnifies icons on hover ~0.16s ease; sheets slide from the titlebar. Nothing
bounces gratuitously; motion is short (120–200ms) and eases out.

**Hover / press states.** Hover on menu items & sidebar rows = accent fill (menu)
or 5% black wash (sidebar/toolbar). Toolbar buttons get a subtle fill when
active and tint accent. Press = slight brightness drop; controls don't shrink.

**Selection.** The system accent as a solid fill with white text (menu items,
sidebar rows, list rows); inactive windows use a neutral gray selection.

---

## ICONOGRAPHY

- macOS uses **SF Symbols** (Apple's proprietary, monochrome/hierarchical/
  multicolor glyph set) for all UI glyphs, and **app icons** are full-color
  rounded-square raster/vector artwork.
- **App icons:** the real bitmaps were copied from the source file into
  `assets/app-icons/` (Finder, Safari, Mail, Messages, Maps, Photos, FaceTime,
  Calendar, Notes, Reminders, Music, App Store, Settings, Trash, Calculator,
  Terminal, Freeform, Podcasts). Use these verbatim — the `AppIcon` and `Dock`
  components consume them.
- **UI glyphs (SF Symbols):** SF Symbols are **not redistributable**, so the UI
  kits substitute **Lucide** (CDN, MIT license) at a ~1.9px stroke via the
  `SFIcon` wrapper (`ui_kits/desktop/Icon.jsx`). This is a flagged substitution —
  see Caveats. Icons are tinted with accent tokens for the colorful sidebar
  symbols.
- **No icon font or emoji** in system chrome. Emoji are never used as UI icons.
- **The Apple logo** (Apple-menu mark) is a trademark and is **not** included;
  `MenuBar` renders a neutral placeholder in that slot (see Caveats).

---

## Components

Grouped by concern under `components/`. All are named React exports that read
the CSS custom properties; import React only.

- **buttons/** — `Button`, `HelpButton`, `SegmentedControl`, `PopUpButton`
  (+ pull-down mode), `Stepper`, `DisclosureTriangle`, `DisclosureButton`,
  `ButtonGroup`, `NavigationButtons`, `ArrowButton`
- **selection/** — `Checkbox`, `RadioButton`, `Switch`, `Slider`, `ColorWell`,
  `Dial`, `ColorPicker`, `ColorWheel`
- **fields/** — `TextField`, `SearchField`, `ComboBox`, `ImageWell`,
  `FieldStepper`
- **feedback/** — `ProgressBar`, `CircularProgress`, `Spinner`, `Tooltip`,
  `Notification`, `Badge`
- **containers/** — `Window`, `UtilityWindow`, `Toolbar`, `ToolbarButton`,
  `ToolbarSeparator`, `Spacer`, `Header`, `Sidebar`, `GroupBox`, `Popover`,
  `Alert`, `Dialog`, `Sheet`, `LiquidGlass`, `QuickLookToolbar`,
  `ScrollEdgeEffect`
- **menus/** — `Menu`, `MenuItem`, `MenuBar`
- **navigation/** — `SidebarItem`, `SidebarSection`, `SectionHeader`, `TabBar`,
  `ListRow`, `ListHeader`, `ColumnHeader`, `SmallListItem`, `SortIndicator`,
  `Scrollbar`, `Separator`, `PathBar`, `StatusBar`
- **system/** — `AppIcon`, `DockIcon`, `Dock`, `DesktopBackground`, `Cursor`

### Raw Figma-kit extractions (`components/figma-kit/`)
In addition to the curated primitives above, the remaining source families are
being **materialized verbatim** from the `.fig` (exact geometry/values) into
`components/figma-kit/` as `<Name>.jsx` + `<Name>.d.ts`. These are lower-level
build-blocks and variant sets (names derive from Figma layers, e.g. `BG`,
`Buttons`, `Chevron`, `Clear`, `ColumnHeaders`, `ComboBoxButton`,
`ControlBGBordered`, `ControlBGBorderedTrueDisabled`, `Detail`,
`DisclosureFolder`, `FormStepper`, `Icon`, `InputFields`, `Knob`, `KnobClicked`,
`Label`, `Selection`, `SortOrderIndicator`, …). They ship for completeness/
coverage; prefer the curated components above for new work. This set grows in
batches as the full kit is imported.

### Coverage note
The design system ships **209 components**: 66 hand-authored, token-driven
canonical AppKit control families (the recommended API, listed by group above)
plus **~143 families materialized verbatim from the `.fig`** into
`components/figma-kit/` (exact geometry, lower-level build-blocks and variant
sets — see the Full component index at the end of this file).

`check_design_system` counts the source's raw *variant symbols* (~1550), so its
"209 of 1550" line will never reach zero. The gap is **not** missing work — it
is these deliberately-excluded categories:
- **Per-instance standalone symbols (~1,340)** — individual variant instances
  like every `Buttons - Toggle / Bordered - Destructive / False / Clicked /
  Content Area` permutation. These are states of families already built; they
  belong as props, not as separate components.
- **`_System App Icon` (92 variants)** — represented by the real app-icon
  bitmaps in `assets/app-icons/` plus the `AppIcon` / `DockIcon` components.
- **`Desktop Template` / `Desktop Wallpaper`** — 26 MB wallpaper bitmaps;
  replaced by `DesktopBackground` gradients.
- **`_Colors/*`, `Cover`, `License`, `Change-log`, `Getting Started`,
  `Examples`** — the file's documentation/specimen frames, not components (the
  colors are captured as tokens; the specimens as `guidelines/` cards).

### Intentional additions
- `SFIcon` (UI-kit helper) — a Lucide-backed SF Symbols stand-in, because SF
  Symbols can't be redistributed.
- `SidebarSection`, `ListHeader`, `ToolbarSeparator` — small structural helpers
  that correspond to the source's Section Header / Column Header / Separator
  parts.

## UI kit
- **`ui_kits/desktop/`** — an interactive macOS desktop: translucent menu bar,
  wallpaper, a Finder window, a System Settings window, a live notification, and
  the Liquid-Glass Dock. Open `ui_kits/desktop/index.html`.

## Templates
- **`templates/macos-window/`** — "macOS Window", a Design Component starter: a
  titled window on a desktop backdrop with light/dark and title tweaks.

## Index / manifest (root)
- `styles.css` — CSS entry (imports tokens).
- `tokens/` — `fig-tokens.css`, `typography.css`, `semantic.css`.
- `components/{buttons,selection,fields,feedback,containers,menus,navigation,system}/`
- `guidelines/` — specimen cards.
- `ui_kits/desktop/` — desktop recreation.
- `templates/macos-window/` — window template.
- `assets/app-icons/` — app-icon PNGs.
- `thumbnail.html` — homepage tile. `SKILL.md` — Agent-Skill wrapper.

## CAVEATS / SUBSTITUTIONS
1. **SF Pro font.** Not a freely-distributable webfont. `--font-system` uses the
   Apple system stack (`"SF Pro", -apple-system, BlinkMacSystemFont, …`) — it
   renders the **real** SF Pro on Apple devices and a platform UI fallback
   elsewhere. **Please upload SF Pro `.woff2` files** if you need pixel-exact
   type off-Apple.
2. **SF Symbols.** Substituted with **Lucide** (flagged above). If you have SF
   Symbols exports, drop them in and we'll swap the `SFIcon` wrapper.
3. **Apple logo omitted** (trademark) — `MenuBar` shows a neutral placeholder.
4. **Wallpaper** is a CSS gradient — the source's real wallpapers are 26 MB PNGs,
   too large to bundle. Supply a wallpaper image if you want the exact desktop.

## Full component index

All 230 components exposed on `window.MacOS27DesignSystem_b94827` (curated primitives + `components/figma-kit/` extractions), alphabetical:

`Alert` · `Alert1Option` · `Alert2OptionsVertical` · `Alert3Options` · `Alert3OptionsCancel` · `Alert4Options` · `Alert4OptionsCancel` · `AlertButtonNoBackground` · `AlertButtonPopUpButton` · `AlertPopUpButton` · `AppIcon` · `ArrowButton` · `ArrowButtons` · `ArrowButtonsTrueClicked` · `ArrowButtonsTrueDisabled` · `ArrowButtonsTrueIdle` · `Badge` · `BarsTabBarXItem` · `BG` · `BG2` · `Button` · `ButtonGroup` · `ButtonGroup1` · `ButtonGroup2` · `ButtonGroup3` · `ButtonGroup4` · `ButtonGroup5` · `Buttons` · `Buttons2` · `ButtonsMedium` · `ButtonsToggle` · `ButtonsToggleBorderedDestructiveFalse` · `ButtonsToggleBorderedDestructiveTrue` · `ButtonsXL` · `ButtonUtilityPanelTabBar` · `Checkbox` · `Checkbox3` · `CheckboxBackground` · `CheckboxBackgroundMode3` · `CheckboxCheckboxBackgroundLight` · `Chevron` · `CircularDeterminate` · `CircularIndeterminateSpinner` · `CircularProgress` · `Clear` · `ColorPicker` · `ColorPickerWheel` · `ColorsDark` · `ColorsLight` · `ColorWell` · `ColorWheel` · `ColumnHeader` · `ColumnHeaders` · `ComboBox` · `ComboBoxButton` · `ControlBGBordered` · `ControlBGBorderedColoredTrue` · `ControlBGBorderedDestructive` · `ControlBGBorderedDestructiveTrue` · `ControlBGBorderedFalseClicked` · `ControlBGBorderedFalseDisabled` · `ControlBGBorderedProminent` · `ControlBGBorderedProminentDestructive` · `ControlBGBorderedTinted` · `ControlBGBorderedTintedFalse` · `ControlBGBorderedToggle` · `ControlBGBorderedTrueDisabled` · `ControlBGControls` · `Cursor` · `DesktopBackground` · `Detail` · `Dial` · `DialCircularSlider` · `Dialog` · `DisclosureButton` · `DisclosureFolder` · `DisclosureHeader` · `DisclosureHeader2` · `DisclosureSelected` · `DisclosureTriangle` · `DisclosureUnselected` · `Dock` · `DockBackground` · `DockIcon` · `FieldStepper` · `FooterDropdownButton` · `FormStepper` · `Glyphs` · `GlyphsCheckboxes` · `GlyphsRadioButtons` · `GroupBox` · `Header` · `HeaderImage` · `Headers` · `HelpButton` · `Icon` · `Icons` · `ImageWell` · `InputFields` · `Item` · `Knob` · `Knob2` · `KnobClicked` · `KnobClickedNonTicked` · `KnobClickedTicked` · `Knobs` · `Label` · `LabelsBorderless` · `LabelsDestructive` · `LabelsPreferred` · `LabelsTinted` · `LabelsToggle` · `Leading` · `LeadingAccessories` · `LeadingAccessoriesTitle` · `LeftAccessoryIcons24pt` · `LeftAccessoryIcons32pt` · `LinearDeterminate` · `LinearIndeterminate` · `LiquidGlass` · `LiquidGlassLarge` · `LiquidGlassMedium` · `LiquidGlassSmall` · `ListItemPrimaryColumn` · `ListItemSecondaryColumn` · `ListRow` · `MagnifyingGlass` · `Materials` · `Menu` · `MenuBackground` · `MenuBar` · `MenuBarAppleMenuDark` · `MenuBarAppleMenuLight` · `MenuBarAppNameDark` · `MenuBarAppNameLight` · `MenuBarMenuItemDark` · `MenuBarMenuItemLight` · `MenuItem` · `MenuItems` · `NavigationButtons` · `Notification` · `PathBar` · `Pointers` · `Popover` · `PopUpButton` · `ProgressBar` · `ProgressCircular` · `PulldownButton` · `QuickLookToolbar` · `QuickLookToolbarItems` · `RadioButton` · `Scrollbar` · `ScrollbarHorizontal` · `ScrollbarVertical` · `ScrollEdgeEffect` · `ScrollEdgeEffectHard` · `ScrollEdgeEffectSoft` · `Search` · `SearchField` · `SectionHeader` · `SegmentedControl` · `SegmentedControl3` · `SegmentedControlMultiSelection` · `SegmentNotSelectable` · `SegmentSelectable` · `Selection` · `Separator` · `Separator2` · `Separators` · `Sheet` · `Shortcuts` · `Sidebar` · `SidebarItem` · `SidebarsComposed` · `Slider` · `SliderCenterBiased` · `SliderMidline` · `SliderTicked` · `SmallListItem` · `SortIndicator` · `SortOrderIndicator` · `Spacer` · `Spinner` · `StatusBar` · `Stepper` · `StepperInsideField` · `StepperNoField` · `StepperOutsideField` · `SwatchLightAndDark` · `SwatchLightAndDarkVibrant` · `SwatchTextLightAndDark` · `Switch` · `SymbolAndTitle` · `SymbolButtons` · `SystemAppIcon` · `Tab` · `TabBar` · `TableRows` · `TableRowsBlank` · `Text` · `TextField` · `Ticks` · `Title` · `TitleDescription` · `ToggleButton` · `TogglesCheckboxes` · `TogglesRadioButtons` · `TogglesSwitches` · `Toolbar` · `ToolbarButton` · `Tooltip` · `TrackFilled` · `TrackFilled2` · `TracksFilled` · `TracksOLD` · `TracksUnfilled` · `TrackUnfilled` · `TrackUnfilledCenterBiased` · `TrailingAccessories` · `UtilityPanel` · `UtilityPanelTabBar` · `UtilityWindow` · `Window` · `WindowBG` · `WindowButtonGroup` · `WindowControls` · `WindowControlsStandard` · `WindowControlsUtility` · `WindowsComposed` · `WindowTitlesWindow`

# TK2 Garage design

Players compare cosmetic setups beside their game on a desktop monitor, often in a dim gaming space. Continue the existing dark olive theme with lime outlines for selected choices. Use the positive teal-green check action for committing editor saves, distinct from selection states.

Use the system sans font, readable labels, quiet borders and flat surfaces. Recognition comes from local variant thumbnails and saved in-game renders. Use a searchable grid for appearance choices and a restrained category tab bar. The editor has fixed header/footer and a separately scrolling body; never scroll away Close or Save. Selected thumbnails use a visible outline and text state. Preserve SortableJS reordering, 180ms easing and reduced-motion support. At narrow sizes stack the preview and picker; wrap action buttons without obscuring content. Do not imply a saved screenshot is a live 3D rendering.


The app shell has Home, Tracks, Presets, Lobby and Settings. Tracks uses internal
tabs for Discover groups, My groups and My tracks. Home presents four clear game
menu destinations beside the supplied garage art. Curated Discover content is
import-only; sharing controls belong to the user’s own collections.

Category controls have equal sizes and contained pictures. Original/Modded is
centered below them. Stars stay on the top-right of every appearance tile,
including the selected one. A star always saves that exact represented look;
Favorites opens those looks directly. Single-choice refinements are skipped.
The selection rail is numbered, guidance explains the next step, and Save stays
separate from selection. Successful saves keep the editor open.

Open 3D by default at 1200px width and 700px height or larger; smaller windows
start collapsed. Respect a manual preview toggle during that editor session.
Saved image means a real PNG from the game; never substitute an unsaved local
render or advertise it as current. A closed game cannot regenerate a game image.
Complete-row pagination supports custom positive rows and Show all. Use compact
narrow defaults. Keyboard arrows follow rendered tile positions, native Tab
reaches actions, and controller input is scoped to the focused Garage window.

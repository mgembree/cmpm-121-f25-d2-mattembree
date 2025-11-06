# Sketchpad — CMPM 121 demo

A small interactive sketchpad built with TypeScript + Deno that demonstrates an event-driven canvas drawing app.

Development notes

- Strokes capture their color and thickness when they are created, so changing the color or slider only affects strokes drawn after the change.
- If you add or change features, keep the `drawing-changed` + `tool-moved` events consistent so previews and redraws remain responsive.

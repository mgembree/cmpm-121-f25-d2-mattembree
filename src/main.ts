import "./style.css";

document.body.innerHTML = `
<h1>Sketchpad</h1>
<p>Draw on the canvas below. Use "undo" and "redo" buttons to revert or reapply strokes.</p>
`;
"use strict";

const canvas = document.createElement("canvas");
canvas.width = 256;
canvas.height = 256;
document.body.append(canvas);

const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

// Basic types and interfaces
type Point = { x: number; y: number };

interface DrawableCommand {
  display(ctx: CanvasRenderingContext2D): void;
  drag(x: number, y: number): void;
}

// MarkerLine draws a polyline and stores points
class MarkerLine implements DrawableCommand {
  points: Point[] = [];
  thickness: number = 2;
  constructor(x?: number, y?: number, thickness: number = 2) {
    this.thickness = thickness;
    if (x !== undefined && y !== undefined) this.points.push({ x, y });
  }
  drag(x: number, y: number) {
    this.points.push({ x, y });
  }
  display(ctx: CanvasRenderingContext2D) {
    if (this.points.length === 0) return;
    ctx.save();
    ctx.lineWidth = this.thickness;
    ctx.beginPath();
    ctx.moveTo(this.points[0].x, this.points[0].y);
    for (let i = 1; i < this.points.length; i++) {
      ctx.lineTo(this.points[i].x, this.points[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

// Sticker drawable: single emoji that can be repositioned
class Sticker implements DrawableCommand {
  x = 0;
  y = 0;
  emoji = "⭐";
  size = 24;
  constructor(x: number, y: number, emoji: string, size: number) {
    this.x = x;
    this.y = y;
    this.emoji = emoji;
    this.size = size;
  }
  drag(x: number, y: number) {
    // reposition (no path history)
    this.x = x;
    this.y = y;
  }
  display(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.font = `${this.size}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.emoji, this.x, this.y);
    ctx.restore();
  }
}

// Preview command interface
interface PreviewCommand {
  draw(ctx: CanvasRenderingContext2D): void;
}

class CirclePreview implements PreviewCommand {
  x = 0;
  y = 0;
  thickness = 2;
  constructor(x: number, y: number, thickness: number) {
    this.x = x;
    this.y = y;
    this.thickness = thickness;
  }
  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 1;
    const r = Math.max(1, this.thickness / 2);
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// Drawing state
const strokes: DrawableCommand[] = [];
const redoStack: DrawableCommand[] = [];
let currentStroke: DrawableCommand | null = null;
const cursor = { active: false, x: 0, y: 0 };

// Tool state
let currentToolThickness = 2;
let currentTool: "marker" | "sticker" = "marker";
let currentStickerEmoji = "⭐";

// Preview
let previewCommand: PreviewCommand | null = null;

// UI: toolbar for marker tools
const toolBar = document.createElement("div");
toolBar.className = "toolbar";

const thinTool = document.createElement("button");
thinTool.textContent = "thin";
thinTool.className = "tool-button";
toolBar.append(thinTool);

const thickTool = document.createElement("button");
thickTool.textContent = "thick";
thickTool.className = "tool-button";
toolBar.append(thickTool);

document.body.append(toolBar);

function selectTool(button: HTMLButtonElement, thickness: number) {
  currentToolThickness = thickness;
  currentTool = "marker";
  // clear visual selection on both tool and sticker bars
  for (const b of toolBar.querySelectorAll("button")) {
    b.classList.remove("selectedTool");
  }
  for (const b of document.querySelectorAll(".sticker-button")) {
    b.classList.remove("selectedTool");
  }
  button.classList.add("selectedTool");
}

selectTool(thinTool, 2);
thinTool.addEventListener("click", () => selectTool(thinTool, 2));
thickTool.addEventListener("click", () => selectTool(thickTool, 6));

// Data-driven sticker list (JSON-like array at top-level)
const stickers: string[] = ["⭐", "🔥", "🌈"];

// Sticker toolbar
const stickerBar = document.createElement("div");
stickerBar.className = "sticker-bar";
document.body.append(stickerBar);

function createStickerButton(emoji: string) {
  const b = document.createElement("button");
  b.className = "sticker-button";
  b.textContent = emoji;
  b.addEventListener("click", () => {
    currentTool = "sticker";
    currentStickerEmoji = emoji;
    // clear marker selection
    for (const btn of toolBar.querySelectorAll("button")) {
      btn.classList.remove("selectedTool");
    }
    // clear sticker selection then mark this one
    for (const btn of stickerBar.querySelectorAll("button")) {
      btn.classList.remove("selectedTool");
    }
    b.classList.add("selectedTool");
    // fire tool-moved so the preview appears at the current cursor position
    canvas.dispatchEvent(
      new CustomEvent("tool-moved", {
        detail: { x: cursor.x, y: cursor.y, thickness: currentToolThickness },
      }),
    );
  });
  stickerBar.append(b);
}

// initialize from data array
for (const s of stickers) createStickerButton(s);

// add-sticker button
const addStickerButton = document.createElement("button");
addStickerButton.textContent = "add sticker";
addStickerButton.className = "sticker-button";
addStickerButton.addEventListener("click", () => {
  const text = prompt("Custom sticker text", "😀");
  if (text && text.length > 0) {
    stickers.push(text);
    createStickerButton(text);
  }
});
stickerBar.append(addStickerButton);

// Events: tool-moved updates preview when not drawing
canvas.addEventListener("tool-moved", (ev) => {
  const detail = (ev as CustomEvent).detail as {
    x: number;
    y: number;
    thickness?: number;
  };
  if (!cursor.active) {
    if (currentTool === "marker") {
      previewCommand = new CirclePreview(
        detail.x,
        detail.y,
        detail.thickness ?? currentToolThickness,
      );
    } else {
      // simple sticker preview
      previewCommand = new (class implements PreviewCommand {
        x = detail.x;
        y = detail.y;
        emoji = currentStickerEmoji;
        size = (detail.thickness ?? currentToolThickness) * 3;
        draw(ctx: CanvasRenderingContext2D) {
          ctx.save();
          ctx.font = `${this.size}px serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.globalAlpha = 0.9;
          ctx.fillText(this.emoji, this.x, this.y);
          ctx.restore();
        }
      })();
    }
    canvas.dispatchEvent(new Event("drawing-changed"));
  }
});

// Redraw handler
canvas.addEventListener("drawing-changed", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#000";
  for (const stroke of strokes) {
    stroke.display(ctx);
  }
  if (previewCommand && !cursor.active) previewCommand.draw(ctx);
  updateUndoRedoButtons();
});

// Start stroke / sticker placement
canvas.addEventListener("mousedown", (e) => {
  cursor.active = true;
  cursor.x = e.offsetX;
  cursor.y = e.offsetY;
  previewCommand = null; // hide preview while interacting
  if (currentTool === "marker") {
    currentStroke = new MarkerLine(cursor.x, cursor.y, currentToolThickness);
    strokes.push(currentStroke);
  } else {
    const size = currentToolThickness * 3;
    const st = new Sticker(cursor.x, cursor.y, currentStickerEmoji, size);
    currentStroke = st;
    strokes.push(currentStroke);
  }
  redoStack.length = 0; // invalidate redo on new action
  canvas.dispatchEvent(new Event("drawing-changed"));
});

// Move / preview
canvas.addEventListener("mousemove", (e) => {
  const px = e.offsetX;
  const py = e.offsetY;
  // always notify about the tool position so preview updates
  canvas.dispatchEvent(
    new CustomEvent("tool-moved", {
      detail: { x: px, y: py, thickness: currentToolThickness },
    }),
  );

  if (cursor.active && currentStroke) {
    currentStroke.drag(px, py);
    cursor.x = px;
    cursor.y = py;
    canvas.dispatchEvent(new Event("drawing-changed"));
  }
});

// End stroke
const endStroke = () => {
  cursor.active = false;
  currentStroke = null;
};
canvas.addEventListener("mouseup", endStroke);
canvas.addEventListener("mouseleave", () => {
  endStroke();
  previewCommand = null;
  canvas.dispatchEvent(new Event("drawing-changed"));
});

// Controls: clear, undo, redo
const clearButton = document.createElement("button");
clearButton.innerHTML = "clear";
document.body.append(clearButton);

const undoButton = document.createElement("button");
undoButton.innerHTML = "undo";
undoButton.disabled = true;
document.body.append(undoButton);

const redoButton = document.createElement("button");
redoButton.innerHTML = "redo";
redoButton.disabled = true;
document.body.append(redoButton);

function updateUndoRedoButtons() {
  undoButton.disabled = strokes.length === 0;
  redoButton.disabled = redoStack.length === 0;
}

clearButton.addEventListener("click", () => {
  strokes.length = 0;
  redoStack.length = 0;
  canvas.dispatchEvent(new Event("drawing-changed"));
});

undoButton.addEventListener("click", () => {
  if (strokes.length === 0) return;
  const s = strokes.pop();
  if (s) {
    redoStack.push(s);
    canvas.dispatchEvent(new Event("drawing-changed"));
  }
});

redoButton.addEventListener("click", () => {
  if (redoStack.length === 0) return;
  const s = redoStack.pop();
  if (s) {
    strokes.push(s);
    canvas.dispatchEvent(new Event("drawing-changed"));
  }
});

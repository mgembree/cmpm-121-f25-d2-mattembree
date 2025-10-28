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

// Store user's drawing as an array of drawable stroke objects.
type Point = { x: number; y: number };

// Common drawable command used for strokes and stickers
interface DrawableCommand {
  display(ctx: CanvasRenderingContext2D): void;
  drag(x: number, y: number): void;
}

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

const strokes: DrawableCommand[] = [];
const redoStack: DrawableCommand[] = [];
let currentStroke: DrawableCommand | null = null;
const cursor = { active: false, x: 0, y: 0 };

// Tool state default thickness
let currentToolThickness = 2;
// current tool: 'marker' or 'sticker'
let currentTool: "marker" | "sticker" = "marker";
// currently selected sticker emoji
let currentStickerEmoji = "⭐";

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

// Sticker tool buttons
const stickerBar = document.createElement("div");
stickerBar.className = "sticker-bar";
const stickers = ["⭐", "🔥", "🌈"];
for (const s of stickers) {
  const b = document.createElement("button");
  b.className = "sticker-button";
  b.textContent = s;
  b.addEventListener("click", () => {
    // select sticker tool and emoji
    currentTool = "sticker";
    currentStickerEmoji = s;
    // provide visual feedback
    for (const btn of stickerBar.querySelectorAll("button")) {
      btn.classList.remove("selectedTool");
    }
    b.classList.add("selectedTool");
    // fire a tool-moved event so preview appears at last known cursor position
    canvas.dispatchEvent(
      new CustomEvent("tool-moved", {
        detail: { x: cursor.x, y: cursor.y, thickness: currentToolThickness },
      }),
    );
  });
  stickerBar.append(b);
}
document.body.append(stickerBar);

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

// Sticker command (a drawable that can be repositioned via drag)
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
    // reposition the sticker (no path history)
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

// current preview command (null when none)
let previewCommand: PreviewCommand | null = null;

// When the tool moves over the canvas, update the preview (but only when not drawing)
canvas.addEventListener("tool-moved", (ev) => {
  const detail = (ev as CustomEvent).detail as {
    x: number;
    y: number;
    thickness: number;
  };
  if (!cursor.active) {
    if (currentTool === "marker") {
      previewCommand = new CirclePreview(detail.x, detail.y, detail.thickness);
    } else {
      // sticker preview shows the emoji at cursor
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

// Redraw handler: clears the canvas and redraws all strokes from data.
canvas.addEventListener("drawing-changed", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#000";
  for (const stroke of strokes) {
    stroke.display(ctx);
  }
  // draw preview if present and user is not actively drawing
  if (previewCommand && !cursor.active) {
    previewCommand.draw(ctx);
  }
  updateUndoRedoButtons();
});

canvas.addEventListener("mousedown", (e) => {
  cursor.active = true;
  cursor.x = e.offsetX;
  cursor.y = e.offsetY;
  // hide preview while drawing
  previewCommand = null;
  if (currentTool === "marker") {
    currentStroke = new MarkerLine(cursor.x, cursor.y, currentToolThickness);
    strokes.push(currentStroke);
  } else {
    // start a sticker placement (or reposition)
    const size = currentToolThickness * 3;
    const st = new Sticker(cursor.x, cursor.y, currentStickerEmoji, size);
    currentStroke = st;
    strokes.push(currentStroke);
  }
  redoStack.length = 0;
  canvas.dispatchEvent(new Event("drawing-changed"));
});

// Add points to the current stroke while the mouse is down.
canvas.addEventListener("mousemove", (e) => {
  const px = e.offsetX;
  const py = e.offsetY;
  // always notify about the tool position
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

// Finish the current stroke
const endStroke = () => {
  cursor.active = false;
  currentStroke = null;
};

canvas.addEventListener("mouseup", endStroke);
canvas.addEventListener("mouseleave", () => {
  // finish any in-progress stroke and clear the preview when leaving
  endStroke();
  previewCommand = null;
  canvas.dispatchEvent(new Event("drawing-changed"));
});

const clearButton = document.createElement("button");
clearButton.innerHTML = "clear";
document.body.append(clearButton);

// Undo / Redo buttons
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
  // clear stored strokes
  strokes.length = 0;
  redoStack.length = 0;
  canvas.dispatchEvent(new Event("drawing-changed"));
});

// Undo: pop from strokes -> push to redoStack
undoButton.addEventListener("click", () => {
  if (strokes.length === 0) return;
  const s = strokes.pop();
  if (s) {
    // move the popped stroke to the redo stack
    redoStack.push(s);
    canvas.dispatchEvent(new Event("drawing-changed"));
  }
});

// Redo: pop from redoStack -> push to strokes
redoButton.addEventListener("click", () => {
  if (redoStack.length === 0) return;
  const s = redoStack.pop();
  if (s) {
    strokes.push(s);
    canvas.dispatchEvent(new Event("drawing-changed"));
  }
});

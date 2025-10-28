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

class MarkerLine {
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

const strokes: MarkerLine[] = [];
const redoStack: MarkerLine[] = [];
let currentStroke: MarkerLine | null = null;
const cursor = { active: false, x: 0, y: 0 };

// Tool state default thickness
let currentToolThickness = 2;

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
  for (const b of toolBar.querySelectorAll("button")) {
    b.classList.remove("selectedTool");
  }
  button.classList.add("selectedTool");
}

selectTool(thinTool, 2);

thinTool.addEventListener("click", () => selectTool(thinTool, 2));
thickTool.addEventListener("click", () => selectTool(thickTool, 6));

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
    previewCommand = new CirclePreview(detail.x, detail.y, detail.thickness);
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
  currentStroke = new MarkerLine(cursor.x, cursor.y, currentToolThickness);
  strokes.push(currentStroke);
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

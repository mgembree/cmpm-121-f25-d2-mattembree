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
  constructor(x?: number, y?: number) {
    if (x !== undefined && y !== undefined) this.points.push({ x, y });
  }
  drag(x: number, y: number) {
    this.points.push({ x, y });
  }
  display(ctx: CanvasRenderingContext2D) {
    if (this.points.length === 0) return;
    ctx.beginPath();
    ctx.moveTo(this.points[0].x, this.points[0].y);
    for (let i = 1; i < this.points.length; i++) {
      ctx.lineTo(this.points[i].x, this.points[i].y);
    }
    ctx.stroke();
  }
}

const strokes: MarkerLine[] = [];
const redoStack: MarkerLine[] = [];
let currentStroke: MarkerLine | null = null;
const cursor = { active: false, x: 0, y: 0 };

// Redraw handler: clears the canvas and redraws all strokes from data.
canvas.addEventListener("drawing-changed", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#000";
  for (const stroke of strokes) {
    stroke.display(ctx);
  }
  updateUndoRedoButtons();
});

canvas.addEventListener("mousedown", (e) => {
  cursor.active = true;
  cursor.x = e.offsetX;
  cursor.y = e.offsetY;
  // create a new MarkerLine and add the initial point
  currentStroke = new MarkerLine(cursor.x, cursor.y);
  strokes.push(currentStroke);
  redoStack.length = 0;
  canvas.dispatchEvent(new Event("drawing-changed"));
});

// Add points to the current stroke while the mouse is down
canvas.addEventListener("mousemove", (e) => {
  if (cursor.active && currentStroke) {
    const px = e.offsetX;
    const py = e.offsetY;
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
canvas.addEventListener("mouseleave", endStroke);

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

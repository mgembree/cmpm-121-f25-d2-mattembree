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
  color: string = "#000";
  constructor(
    x?: number,
    y?: number,
    thickness: number = 2,
    color: string = "#000",
  ) {
    this.thickness = thickness;
    this.color = color;
    if (x !== undefined && y !== undefined) this.points.push({ x, y });
  }
  drag(x: number, y: number) {
    this.points.push({ x, y });
  }
  display(ctx: CanvasRenderingContext2D) {
    if (this.points.length === 0) return;
    ctx.save();
    ctx.lineWidth = this.thickness;
    ctx.strokeStyle = this.color;
    ctx.lineCap = "round";
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
  color = "#000";
  constructor(x: number, y: number, thickness: number) {
    this.x = x;
    this.y = y;
    this.thickness = thickness;
  }
  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.strokeStyle = this.color || "rgba(0,0,0,0.6)";
    ctx.lineWidth = 1;
    const r = Math.max(1, this.thickness / 2);
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
// Global state and tool UI setup
const strokes: DrawableCommand[] = [];
const redoStack: DrawableCommand[] = [];
let currentStroke: DrawableCommand | null = null;
const cursor = { active: false, x: 0, y: 0 };

// Tool state
let currentToolThickness = 2;
// renamed tools: "brush" = marker, "stamp" = sticker
let currentTool: "brush" | "stamp" = "brush";
let currentStickerEmoji = "⭐";
let currentToolColor = "#000000";

// toolbar for marker tools
const toolBar = document.createElement("div");
toolBar.className = "toolbar";

const thinTool = document.createElement("button");
thinTool.textContent = "Brush 1";
thinTool.className = "tool-button";
toolBar.append(thinTool);

const thickTool = document.createElement("button");
thickTool.textContent = "Brush 2";
thickTool.className = "tool-button";
toolBar.append(thickTool);

document.body.append(toolBar);

// Color picker and thickness slider
const controlsBar = document.createElement("div");
controlsBar.className = "controls-bar";

const colorInput = document.createElement("input");
colorInput.type = "color";
colorInput.value = currentToolColor;
colorInput.className = "color-input";
controlsBar.append(colorInput);

const thicknessLabel = document.createElement("span");
thicknessLabel.className = "thickness-label";
thicknessLabel.textContent = String(currentToolThickness);
controlsBar.append(thicknessLabel);

const thicknessSlider = document.createElement("input");
thicknessSlider.type = "range";
thicknessSlider.min = "1";
thicknessSlider.max = "40";
thicknessSlider.step = "0.5";
thicknessSlider.value = String(currentToolThickness);
thicknessSlider.className = "thickness-slider";
controlsBar.append(thicknessSlider);

document.body.append(controlsBar);

// wire up controls
colorInput.addEventListener("input", () => {
  currentToolColor = colorInput.value;
  // update preview immediately
  canvas.dispatchEvent(
    new CustomEvent("tool-moved", {
      detail: {
        x: cursor.x,
        y: cursor.y,
        thickness: currentToolThickness,
        color: currentToolColor,
      },
    }),
  );
});

thicknessSlider.addEventListener("input", () => {
  currentToolThickness = Number(thicknessSlider.value);
  thicknessLabel.textContent = String(currentToolThickness);
  // update preview immediately
  canvas.dispatchEvent(
    new CustomEvent("tool-moved", {
      detail: {
        x: cursor.x,
        y: cursor.y,
        thickness: currentToolThickness,
        color: currentToolColor,
      },
    }),
  );
});

function selectTool(button: HTMLButtonElement, thickness: number) {
  currentToolThickness = thickness;
  currentTool = "brush";
  for (const b of toolBar.querySelectorAll("button")) {
    b.classList.remove("selectedTool");
  }
  for (const b of document.querySelectorAll(".sticker-button")) {
    b.classList.remove("selectedTool");
  }
  button.classList.add("selectedTool");
  // sync slider and label
  thicknessSlider.value = String(currentToolThickness);
  thicknessLabel.textContent = String(currentToolThickness);
  // update preview immediately
  canvas.dispatchEvent(
    new CustomEvent("tool-moved", {
      detail: {
        x: cursor.x,
        y: cursor.y,
        thickness: currentToolThickness,
        color: currentToolColor,
      },
    }),
  );
}

selectTool(thinTool, 2);
thinTool.addEventListener("click", () => selectTool(thinTool, 2));
// make the "thick" brush 25% thicker than previous 6 -> 7.5
thickTool.addEventListener("click", () => selectTool(thickTool, 7.5));

// current preview command (null when none)
let previewCommand: PreviewCommand | null = null;

// (already initialized above)

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
    currentTool = "stamp";
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
        detail: {
          x: cursor.x,
          y: cursor.y,
          thickness: currentToolThickness,
          color: currentToolColor,
        },
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
    color?: string;
  };
  if (!cursor.active) {
    if (currentTool === "brush") {
      previewCommand = new CirclePreview(
        detail.x,
        detail.y,
        detail.thickness ?? currentToolThickness,
      );
      // attach color to preview when available
      (previewCommand as CirclePreview).color = detail.color ??
        currentToolColor;
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
  if (currentTool === "brush") {
    currentStroke = new MarkerLine(
      cursor.x,
      cursor.y,
      currentToolThickness,
      currentToolColor,
    );
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

// Export button (controls)
const exportButton = document.createElement("button");
exportButton.innerHTML = "export";
document.body.append(exportButton);

// Export: render display list to a 1024x1024 offscreen canvas and download PNG
exportButton.addEventListener("click", () => {
  const size = 1024;
  const scaleFactorX = size / canvas.width;
  const scaleFactorY = size / canvas.height;
  const off = document.createElement("canvas");
  off.width = size;
  off.height = size;
  const offCtx = off.getContext("2d") as CanvasRenderingContext2D;
  if (!offCtx) return;
  // scale so that drawing commands map to the larger canvas
  offCtx.save();
  offCtx.scale(scaleFactorX, scaleFactorY);
  // draw each drawable command (do NOT draw previewCommand)
  for (const cmd of strokes) {
    // each command draws assuming the original canvas coordinate space
    cmd.display(offCtx);
  }
  offCtx.restore();

  // trigger download as PNG
  const anchor = document.createElement("a");
  anchor.href = off.toDataURL("image/png");
  anchor.download = "sketchpad.png";
  anchor.click();
});

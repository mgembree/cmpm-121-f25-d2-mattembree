import exampleIconUrl from "./noun-paperclip-7598668-00449F.png";
import "./style.css";

document.body.innerHTML = `
<h1>Sketchpad</h1>
<p>Example image asset: <img src="${exampleIconUrl}" class="icon" /></p>
<canvas id="sketchPad" width="256" height="256"></canvas>
`;

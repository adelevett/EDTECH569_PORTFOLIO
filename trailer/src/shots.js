import * as THREE from 'three';
import { Plate, makeMask, sampleDepth } from './plate.js';
import { makeFlecks, makeCuboids, makeBeam, labelTexture, makeLabel } from './overlay.js';
import { SpriteRig, TailRibbon, Whiskers, poseIndex } from './characters.js';
import { evalRig, applyRig } from './camera.js';
import { clamp, lerp, smoothstep, ease, track, noise1, fbm1, hash } from './util.js';
import { shotOverlook } from './shot_overlook.js';
import { shotProfile } from './shot_profile.js';
import { shotDocks } from './shot_docks.js';
import { shotRott } from './shot_rott.js';
import { shotMaelstrom } from './shot_maelstrom.js';
import { shotTitle } from './shot_title.js';
import { shotPlunk } from './shot_plunk.js';

// Master edit lives in timeline.js (never over 30 s including the title).
import { EDIT, DURATION } from './timeline.js';
export { EDIT, DURATION };

function shotBlack(ctx) {
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 10);
  return { name: 'black', frame: () => ({ scene, camera, mode: 'plain', lens: { exposure: 0, letterbox: 1, grain: 0.0 } }) };
}

export function buildShots(ctx, lib) {
  const mk = (name, fn) => { const s = fn(ctx, lib, EDIT[name]); s.name = name; s.t0 = EDIT[name][0]; s.t1 = EDIT[name][1]; s.cuts = (s.cutsLocal || []).map(c => s.t0 + c); return s; };
  return [
    mk('overlook', shotOverlook),
    mk('profile', shotProfile),
    mk('docks', shotDocks),
    mk('rott', shotRott),
    mk('maelstrom', shotMaelstrom),
    mk('black', shotBlack),
    mk('title', shotTitle),
    mk('plunk', shotPlunk),
  ];
}

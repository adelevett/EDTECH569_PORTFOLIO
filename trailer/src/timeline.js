// Single source of truth for edit timing, shared by picture and sound.
export const EDIT = {
  overlook: [0.0, 4.6],
  profile: [4.6, 6.2],
  docks: [6.2, 9.6],
  rott: [9.6, 14.8],
  maelstrom: [14.8, 18.9],
  black: [18.9, 19.4],
  title: [19.4, 21.6],
  plunk: [21.6, 29.0],
};
export const DURATION = 29.0;
export const MAEL_CUTS = [0.0, 0.96, 1.68, 2.4, 4.1];   // local: vortex | leap | hand | scream(+flood)
export const SNIFFS = [[0.52, 3], [1.05, 4]];            // profile-local sniff bursts [start, count]
// stepped (12 fps) section: every event on the 1/12 s grid
export const PL = { deskEnd: 40 / 12, fallStart: 36 / 12, floorEnd: 64 / 12, impact: 42 / 12, handIn: 53 / 12, eyeEnd: 82 / 12, snap: 71 / 12 };

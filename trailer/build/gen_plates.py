import sys; sys.path.insert(0, '.')
import orclient as oc
from PIL import Image
REFS3 = ["refs/ref_seaall1.jpg", "refs/ref_seaall2.jpg", "refs/ref_plunk.jpg"]
PAINT = ("Reference images: #1 and #2 show the painted world of the story (Port Fauxlio, a harbour city at night); #3 shows a "
         "different, pencil-drawn reality - do NOT use its style here. Paint in exactly the style of references #1 and #2: dark "
         "brooding oil painting, heavy textured impasto brushwork with fine ink linework, deep navy and teal night blues, warm "
         "amber lamplight, silvery wet highlights, rich micro-detail, cinematic composition. ")
NOFX = (" Absolutely no characters, no mice, no people, no animals. No text, letters or signage. No digital effects of any "
        "kind: no pixel mosaic, no grid lines, no wireframe boxes - a pure painting.")
GRAPH = ("Reference image #3 defines the style: a graphite pencil drawing on toothy off-white paper - fine cross-hatching, "
         "smudged tonal shading, crisp contour lines, monochrome grey only, like a detailed illustrated storybook. References "
         "#1 and #2 are a different, painted reality - do NOT use their colours or style. ")
JOBS = {
 'P1_overlook': dict(q='xhigh', size='3840x2160', refs=REFS3, prompt=PAINT +
   "Wide establishing background plate, 16:9. High vantage point on a dark rocky ridge overlooking the vast harbour city of "
   "Port Fauxlio at night. TOP HALF: a dramatic stormy night sky of swirling navy-teal clouds, scattered stars, a hazy glow "
   "behind the clouds. MIDDLE: a hill-city of tall gothic townhouses, spires and a cathedral glittering with thousands of tiny "
   "amber windows, descending to a crescent harbour where tall three-masted ships lie at anchor on black-blue water full of "
   "shimmering reflections; a lighthouse on a rocky point at right throwing a pale beam out to sea; the open sea stretching to "
   "a far horizon. BOTTOM QUARTER: the dark foreground ridge - wet rocks, tufts of grass and a bush at left, and an empty dirt "
   "footpath across the centre where characters could stand." + NOFX),
}
if __name__ == '__main__':
    for name in (sys.argv[1:] or JOBS):
        j = JOBS[name]
        extra = {'size': j['size']} if j.get('size') else None
        out, u = oc.image("openai/gpt-image-2.5-sunburst", j['prompt'], f"gen/{name}.png", aspect_ratio=None if extra else j.get('ar', '16:9'),
                          quality=j['q'], refs=j['refs'], extra=extra, estimate=j.get('est', 0.35), purpose=name)
        print(name, Image.open(out).size, u.get('completion_tokens'))

TRIO = ["refs/ref_trio.jpg", "refs/ref_seaall1.jpg", "refs/ref_seaall2.jpg"]
CHAR = ("Reference #1 is the character sheet of three mouse sailors: LEFT Charlie (small, knitted beanie with pom-pom, round dark "
        "goggles, rope coil), MIDDLE Bravo (stocky, bare-headed, round dark goggles, long dark coat), RIGHT Alpha (captain's peaked "
        "cap, round dark goggles, long dark double-breasted coat, folded map). References #2 and #3 show their painted world. Keep "
        "the exact same character designs, outfits, proportions and painted style (dark oil painting, textured brushwork, fine ink "
        "linework). ")
KEY = (" BACKGROUND: perfectly flat, uniform pure chroma-key green (#00FF00) everywhere - no ground, no floor, no cast shadow, "
       "no gradient, no scenery, no text.")
RUN = ("Animation sprite sheet: {who} RUNNING AWAY from the viewer toward a ship, seen from directly behind and slightly to the "
       "side, drawn as FOUR sequential frames of ONE run cycle arranged left to right in a single row with generous empty space "
       "between them: frame 1 contact - right foot planted forward, left leg pushing off behind; frame 2 passing - body at its "
       "lowest, knees bent; frame 3 contact - left foot planted forward, right leg pushing off; frame 4 flight - both feet off "
       "the ground, body highest. Identical character, size and scale in every frame, feet near the same baseline, coat tails "
       "flapping, long bare tail streaming out behind, paws pumping. Amber rim light from the left, cool navy fill.")
JOBS.update({
 'P2_docks': dict(q='xhigh', size='3840x2160', refs=REFS3, prompt=PAINT +
   "Low-angle cinematic background plate, 16:9, camera just above the rain-soaked cobblestones of a harbour quay at night in a "
   "downpour. The wet cobbled quay runs from the foreground straight ahead toward the water's edge, glistening with puddles "
   "and reflections of lamp light. LEFT FOREGROUND: an ornate cast-iron street lamp with a glowing amber lantern, heavy coils "
   "of rope on the stones, an old barrel. RIGHT MIDDLE-GROUND: the towering dark hull and intricate rigging of a tall "
   "three-masted sailing ship moored alongside the quay, sails furled, lit portholes and deck lanterns, a wooden gangplank "
   "sloping down to the quay. Iron bollards with ropes along the quay edge. BACKGROUND: rain-lashed sea, a lighthouse on a "
   "rocky outcrop throwing a pale beam through the storm, the dark hill-city with many amber windows at left, a stormy navy "
   "sky. Keep the central quay path clear and empty in the lower middle of the frame." + NOFX),
 'SP2_run_bravo': dict(q='high', size='2560x1440', refs=TRIO, prompt=CHAR + RUN.format(who="Bravo (bare-headed, goggles, long dark coat)") + KEY),
 'SP2_run_alpha': dict(q='high', size='2560x1440', refs=TRIO, prompt=CHAR + RUN.format(who="Alpha (captain's peaked cap, goggles, long double-breasted coat, map tucked under one arm)") + KEY),
 'SP2_run_charlie': dict(q='high', size='2560x1440', refs=TRIO, prompt=CHAR + RUN.format(who="Charlie (knitted beanie with pom-pom, goggles, rope coil over his shoulder)") + KEY),
 'SP3_bravo_leap': dict(q='high', size='2560x1440', refs=TRIO, prompt=CHAR +
   "A single large dynamic figure: Bravo leaping forward and upward into the air off an edge, seen from behind and slightly "
   "below, arms flung wide, coat flaring open, tail streaming, legs trailing behind - a bold silhouette. Amber rim light from "
   "below-left, cold cyan light from ahead." + KEY),
 'SP4_alpha_scream': dict(q='high', size='2560x1440', refs=TRIO, prompt=CHAR +
   "Extreme close-up head-and-shoulders portrait of Alpha, three-quarter front view facing left, filling most of the frame: "
   "mouth wide open in a scream of terror showing small sharp incisors, ears pinned back, fur bristling, captain's peaked cap, "
   "round goggles with glossy black glass lenses, dark coat collar. NO whiskers at all (they are added separately). Dramatic "
   "cold cyan light from the left, warm amber from below." + KEY),
 'SP5_alpha_profile': dict(q='high', size='2560x1440', refs=TRIO, prompt=CHAR +
   "Close-up profile portrait of Alpha facing right, head and shoulders filling the right-centre of the frame: snout lifted, "
   "nose twitching as she sniffs the air intently, captain's peaked cap, round dark goggles, coat collar turned up, fur damp "
   "with rain, determined. NO whiskers at all (they are added separately). Warm amber lamplight rim from behind, cool navy "
   "fill." + KEY),
 'R1_rott_face': dict(q='medium', ar='16:9', refs=[], prompt=
   "Greyscale, high-contrast, perfectly front-facing and symmetrical: the colossal head of an ancient sea-witch, the Captain's "
   "Wife - a gaunt, regal, corroded feminine face with high cheekbones, deep hollow eye sockets with tiny glowing pupils, a "
   "wide cruel grin of sharp teeth, lips parted, long wet hair fanning outward like seaweed, a jagged crown of broken ship "
   "masts. Sculpted like weathered stone, lit hard from below. The head fills the centre of the frame. Pure black background. "
   "No text."),
 'R2_rott_hand': dict(q='medium', ar='16:9', refs=[], prompt=
   "Greyscale, high-contrast: one colossal skeletal hand seen from the front, palm toward the viewer, long bony fingers splayed "
   "wide like the blades of oars, barnacled knuckles, wrist at the bottom centre. Sculpted like weathered stone, lit hard from "
   "below. Pure black background. No text."),
 'G1_desk': dict(q='xhigh', size='3840x2160', refs=REFS3, prompt=GRAPH +
   "Wide background plate, 16:9. A cluttered student's desk at night beside a tall window streaked with rain. A bent-arm desk "
   "lamp at right throws a hard cone of light onto the desk. Stacks of old hardback books at left, loose papers and forms, a "
   "closed folder, a fountain pen, a mug of pencils. Behind the desk a teenage student in a hoodie with messy dark hair lunges "
   "forward across the desk in panic, eyes wide, mouth open, one hand outstretched toward the front edge of the desk. The front "
   "edge of the desk at centre-right is EMPTY - the object he reaches for has just tipped over the edge; do NOT draw any snow "
   "globe, glass sphere or ball. Bookshelves in the dark background. Every paper, form, poster and book spine is completely "
   "blank - absolutely no text, letters or numbers anywhere."),
 'G2_base': dict(q='high', size='2560x1440', refs=REFS3, prompt=GRAPH +
   "An ornate antique snow-globe base drawn on its own, centred, front view at eye level - only the pedestal, the glass sphere "
   "is NOT drawn (the top rim is empty). A squat round pedestal of tarnished cast metal with baroque floral reliefs and a small "
   "heraldic crest. A hinged hatch in its front has swung open, revealing a cramped dark compartment in which three small real "
   "mice (no clothes, no hats) lie side by side strapped into leather harnesses, thin cables and chains running from the backs "
   "of their necks into clockwork machinery, eyes shut." + KEY.replace("no text.", "no text; the drawing stays monochrome graphite.")),
 'G3_floor': dict(q='xhigh', size='2560x1440', refs=REFS3, prompt=GRAPH +
   "Low-angle background plate, 16:9: the camera lies on old wooden floorboards under a student's desk at night, looking "
   "along the boards. The desk's heavy turned legs, a chair leg, a fallen pencil, a few loose blank papers at the edges, and a "
   "pool of hard lamp light spilling onto the boards from above. The centre foreground of the floor is empty. Dark, dramatic "
   "cross-hatching. No text anywhere."),
 'G4a_eye_open': dict(q='high', size='2560x1440', refs=REFS3, prompt=GRAPH +
   "Extreme close-up, 16:9: the face of a small real mouse (no clothes) lying on wooden floorboards amid shards of broken glass "
   "and water droplets, a leather harness strap across its head and a cable plugged into the back of its neck, fur soaked and "
   "spiky, its eye WIDE OPEN in terror, whiskers splayed. Hard light from above. No text."),
 'G5_hand': dict(q='high', size='2560x1440', refs=REFS3, prompt=GRAPH +
   "A teenager's hand and forearm in a baggy hoodie sleeve lunging in from the right edge, fingers splayed, reaching down "
   "desperately to catch something falling, slight motion smear on the fingers." + KEY.replace("no text.", "no text; the drawing stays monochrome graphite.")),
})
JOBS.update({
 'P2_noship': dict(q='xhigh', size='3840x2160', refs=["refs/ref_p2.jpg"], prompt=
   "Edit this painting. Keep EVERYTHING else identical - same composition, framing, perspective, lighting, brushwork, rain, "
   "street lamp, barrel, ropes, cobblestones, bollards, lighthouse, city and sky - but completely remove the tall sailing ship, "
   "its rigging and its gangplank. Where the ship stood there is now only open, dark, rain-lashed sea with whitecaps continuing "
   "to a stormy horizon, and the quay edge with its bollards continues naturally along the right side. No text."),
 'G4b_eye_closed': dict(q='high', size='2560x1440', refs=["refs/ref_g4a.jpg"], prompt=
   "Edit this graphite pencil drawing. Keep EVERYTHING identical - same composition, framing, mouse, harness, cable, glass "
   "shards, droplets, floorboards, hatching and lighting - except that the mouse's eye is now tightly shut (eyelid closed, "
   "a thin curved line), whiskers relaxed. Monochrome graphite, no text."),
})
JOBS.update({
 'P2_clean': dict(q='xhigh', size='3840x2160', refs=["refs/ref_p2.jpg"], prompt=
   "Edit this painting. Keep EVERYTHING else identical - same composition, framing, perspective, lighting, brushwork, rain, "
   "ship, gangplank, bollards, cobblestones, lighthouse, city and sky - but completely remove the foreground objects on the "
   "LEFT: the cast-iron street lamp and its post, the wooden barrel and the coils of rope. Where they stood, continue what lies "
   "behind them naturally: the wet cobbled quay with its puddles and lamp-lit reflections, the quay edge and the distant "
   "hill-city with its amber windows. No text."),
})

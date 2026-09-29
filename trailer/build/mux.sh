#!/usr/bin/env bash
# Encode rendered frames + the bounced mix into trailer.mp4 (1920x1080, 30 fps, H.264 High two-pass ~22 Mb/s, AAC 320k).
# Two-pass keeps the file under GitHub's 100 MB limit while spending bits where the rain and grain need them.
set -euo pipefail
FR=${1:-/tmp/claude-0/-home-user-EDTECH569-PORTFOLIO/95c852e6-6b04-5eaf-86f9-c2721e7a47a1/scratchpad/frames}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
N=$(ls "$FR"/f*.png | wc -l)
[ "$N" -eq 870 ] || { echo "expected 870 frames, found $N"; exit 1; }
TMP=$(mktemp -d)
V="-c:v libx264 -preset slow -tune film -profile:v high -level 4.2 -pix_fmt yuv420p -b:v 22M -maxrate 40M -bufsize 60M
   -x264-params aq-mode=3:deblock=-1,-1 -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv"
VF="scale=out_color_matrix=bt709:out_range=tv,format=yuv420p"
( cd "$TMP" && ffmpeg -y -v error -framerate 30 -i "$FR/f%04d.png" -vf "$VF" $V -pass 1 -an -f mp4 /dev/null )
( cd "$TMP" && ffmpeg -y -v error -stats -framerate 30 -i "$FR/f%04d.png" -i "$ROOT/audio/trailer_mix.wav" -map 0:v -map 1:a \
    -vf "$VF" $V -pass 2 -c:a aac -b:a 320k -ar 48000 -t 29.0 -movflags +faststart "$ROOT/trailer.mp4" )
rm -rf "$TMP"
ffprobe -hide_banner -v error -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames,duration,sample_rate,channels -show_entries format=duration,size,bit_rate -of default=nw=1 "$ROOT/trailer.mp4"

#!/usr/bin/env bash
# Encode rendered frames + the bounced mix into trailer.mp4 (1920x1080, 30 fps, H.264 High, AAC 320k).
set -euo pipefail
FR=${1:-/tmp/claude-0/-home-user-EDTECH569-PORTFOLIO/95c852e6-6b04-5eaf-86f9-c2721e7a47a1/scratchpad/frames}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
N=$(ls "$FR"/f*.png | wc -l)
[ "$N" -eq 870 ] || { echo "expected 870 frames, found $N"; exit 1; }
ffmpeg -y -loglevel error -stats -framerate 30 -i "$FR/f%04d.png" -i "$ROOT/audio/trailer_mix.wav" \
  -map 0:v -map 1:a -c:v libx264 -preset slow -crf 14 -tune film -profile:v high -level 4.2 -pix_fmt yuv420p \
  -x264-params "aq-mode=3:deblock=-1,-1" \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -vf "scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p" \
  -c:a aac -b:a 320k -ar 48000 -t 29.0 -movflags +faststart "$ROOT/trailer.mp4"
ffprobe -hide_banner -v error -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames,duration,sample_rate,channels -show_entries format=duration,size,bit_rate -of default=nw=1 "$ROOT/trailer.mp4"

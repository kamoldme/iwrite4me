# Ambient audio

`pink-noise.wav` is generated locally with FFmpeg's pink-noise source, not downloaded. It is 30 seconds, mono 44.1kHz PCM, with 5ms edge fades to prevent a click at the loop boundary. The media element loops it.

Reproduce with:
```sh
ffmpeg -f lavfi -i 'anoisesrc=d=30:c=pink:r=44100:a=0.5:s=20261030' -af 'afade=t=in:d=0.005,afade=t=out:st=29.995:d=0.005' -ac 1 -c:a pcm_s16le pink-noise.wav
```

Reference: https://ffmpeg.org/ffmpeg-filters.html#anoisesrc

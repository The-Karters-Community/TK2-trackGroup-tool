# Portable size audit — 2026-10-18

The previously verified development ZIP was **30,757,308 bytes (29.33 MiB)**.
The lean build is **23,002,327 bytes (21.94 MiB)** before this audit document is
added: approximately **25% smaller**, with the same Garage feature set.

Compressed ZIP contributions explain the original size:

| Original component | MiB in ZIP |
|---|---:|
| App executable with compressed Python modules | 6.07 |
| Optional Pillow AVIF codec | 4.12 |
| Python runtime DLL | 2.60 |
| OpenSSL crypto and TLS libraries | 2.51 |
| Previous home artwork | 2.00 |
| Pillow core image decoder | 0.97 |
| Optional native font rasterizer | 0.95 |
| UnityPy audio dependency | 0.75 |
| Three.js viewer chunk | 0.18 |

Remaining files include Windows runtime libraries, other Python modules, texture
decoders, the Edge/.NET host, icons, track artwork and documentation. The native
game bridge is approximately 242 KiB uncompressed and is not the main contributor.

## Changes and preservation

- Exclude AVIF support: Garage decodes Unity textures and writes PNG thumbnails;
  browser-displayed pictures use Edge's own image support.
- Keep ImageDraw and PNG/JPEG/WebP support. Exclude the unused native font
  rasterizer; interface text is rendered by Edge, not Pillow.
- Exclude setuptools, Python help text and the interactive Python console.
  CFFI's prebuilt ABI path and the actual .NET/Edge host were checked frozen.
- Use the newer, smaller supplied home artwork. Its image content was not
  modified for this audit.
- Retain TLS, Unity texture/animation support, required UnityPy resources and the
  audio dependency imported by UnityPy. No decoder library was replaced with a
  misleading stub. No game assets or external runtime downloads were introduced.

`tools/build_portable.py` uses these exclusions by default. `--full-decoders`
builds the previous broad dependency set for comparison. `--output-folder`
accepts a destination beneath `artifacts`, allowing an open build to remain
untouched. The ZIP remains ordinary Deflate for extraction compatibility.

## Actual verification

- 161 frontend and 146 Python tests passed during the lean build.
- With only Windows directories on PATH, the frozen `--bundle-check <folder>`
  diagnostic loaded the .NET/Edge host and TLS, round-tripped PNG/JPEG/WebP, drew
  an image polygon, and decoded fresh official/Workshop character geometry,
  standing/Victory clips, a vehicle and wheels into an empty temporary cache.
- The frozen Steam worker read the real save; local/Steam hashes matched and
  profile bytes were unchanged. ZIP manifest hashes and game-file exclusions
  passed. The running Garage was left untouched.
- The game had been closed before a new native read could run. The rebuilt
  bridge's executable code section matches the already runtime-tested build;
  compiler/linker metadata accounts for the different whole-DLL hash. This is
  not a new live-game test of the lean package.

An additional solid LZMA2/7z compression experiment produced **18,582,348 bytes
(17.72 MiB)** from the lean folder. It requires a different extraction format,
so it is an investigation result rather than the default release archive.

## The 10 MB target

No 10 MB full-feature build has been demonstrated. Ordinary dependency cleanup
and stronger compression did not reach it. A different compiled backend or a
separately downloaded decoder could reduce the initial download further, but
would require separate implementation and validation. These are architectural
options, not measured size promises. ZIP size also does not measure CPU/GPU use
or runtime memory; those need independent profiling.


## Runtime-compatible build follow-up

The subsequent runtime-compatible portable remains approximately **21.94 MiB**.
It removes patch/hash restrictions without adding a dependency. The relocated
frozen executable successfully initialized Edge/.NET/TLS, decoded fresh official
and Workshop character models/animations plus vehicle/wheels, and round-tripped
PNG/JPEG/WebP with a Windows-only PATH. Its actual native Quick Setup and main-menu
lobby reads passed; its Steam read matched the unchanged local profile. ZIP and
manifest hashes, absence of game files and relocation cleanup passed.

Source/live tests also saved and restored a collection reorder and a Quick Setup
appearance-mode switch with local/Steam verification. Full checks passed with
151 Python and 163 frontend tests plus the native contract harness. A separate
full startup check was skipped because a user Garage session was open; that
session was left untouched. This supersedes the earlier lack of a fresh native
read for the first lean package.

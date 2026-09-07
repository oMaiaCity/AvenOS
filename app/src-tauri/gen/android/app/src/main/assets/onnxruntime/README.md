# ONNX Runtime staging directory

Linux builds load ONNX Runtime dynamically from this bundled directory. The
desktop development and Linux bundle scripts call `scripts/fetch-onnxruntime.ts`,
which installs the pinned official CPU or qualified CUDA runtime and its license
notices here. Generated shared libraries are ignored by Git.

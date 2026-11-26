export interface GpuInfo {
  name: string;
  isSoftware: boolean;
}

const SOFTWARE_RENDERERS = /swiftshader|llvmpipe|softpipe|software|basic render driver|microsoft basic/i;

export function probeGpu(): GpuInfo {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  if (!gl) return { name: "unavailable", isSoftware: true };

  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  const name = String(
    debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
  );
  gl.getExtension("WEBGL_lose_context")?.loseContext();

  return { name, isSoftware: SOFTWARE_RENDERERS.test(name) };
}

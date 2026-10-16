// Rebuild the installed material's authored layers; never ship asset textures.
// Unity lighting differs, but albedo, secondary alpha and emission stay distinct.
export function modelMaterial(THREE, item, resources, textures = {}) {
  function texture(data, color = true) {
    if (!data) return null;
    if (data.startsWith("@")) data = textures[data.slice(1)];
    if (!data) throw new Error("An installed material texture is unresolved.");
    const result = new THREE.TextureLoader().load(
      `data:image/png;base64,${data}`,
    );
    if (color) result.colorSpace = THREE.SRGBColorSpace;
    result.wrapS = result.wrapT = THREE.RepeatWrapping;
    resources.push(result);
    return result;
  }
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setRGB(...item.color),
    roughness: item.roughness ?? 0.85,
    metalness: item.metalness ?? 0,
    transparent: item.transparent || false,
    opacity: item.opacity ?? 1,
    alphaTest: item.alphaTest ?? 0,
    side: THREE.DoubleSide,
  });
  const map = texture(item.texture);
  if (map) {
    map.repeat.fromArray(item.uvScale || [1, 1]);
    map.offset.fromArray(item.uvOffset || [0, 0]);
    material.map = map;
  }
  const layers = item.layers || {};
  const secondary = texture(layers._SecondaryTex);
  const mask = texture(layers._MaskTex, false);
  const noise = texture(layers._NoiseTex, false);
  const emissionA = texture(layers._EmissionMap);
  const emissionB = texture(layers._EmissionMap2);
  const metallic = texture(
    layers._MetallicTex || layers._MetallicGlossMap,
    false,
  );
  const colors = item.shaderColors || {},
    floats = item.shaderFloats || {};
  if (metallic) {
    material.metalnessMap = metallic;
    material.metalness = floats._MetallicStrength ?? floats._Metallic ?? 0;
  }
  const rgb = (key, fallback = [1, 1, 1]) =>
    colors[key]
      ? new THREE.Vector3(..."rgb".split("").map((a) => colors[key][a]))
      : new THREE.Vector3(...fallback);
  const clock = { value: 0 };
  material.userData.clock = item.fire && mask && noise ? clock : null;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.garageTime = clock;
    const uniforms = {
      garageSecondary: secondary,
      garageMask: mask,
      garageNoise: noise,
      garageEmissionA: emissionA,
      garageEmissionB: emissionB,
      garageSecondaryColor: rgb("_SecondaryColor"),
      garageFireColor: rgb("_ColorStart"),
      garageHotColor: new THREE.Vector3(
        ...shiftHue(rgb("_ColorStart").toArray(), floats._HueShift ?? 0),
      ),
      garageFireShape: new THREE.Vector4(
        floats._FireHeight ?? 1,
        floats._FireSoftness ?? 1,
        floats._Threshold ?? 0.1,
        floats._EdgeSoftness ?? 0.15,
      ),
      garageDistortion: new THREE.Vector4(
        colors._DistortionSpeed?.r ?? 0.6,
        colors._DistortionSpeed?.g ?? 0.9,
        floats._DistortionScale ?? 5,
        floats._DistortionStrength ?? 0.3,
      ),
      garageSecondaryAlpha: colors._SecondaryColor?.a ?? 1,
      garageEmissionColorA: rgb("_EmissionColor").multiplyScalar(
        floats._EmissionStrength ?? 1,
      ),
      garageEmissionColorB: rgb("_EmissionColor2").multiplyScalar(
        floats._EmissionStrength2 ?? 1,
      ),
      garageFlow: new THREE.Vector2(
        colors._ScrollSpeed?.r ?? 0,
        colors._ScrollSpeed?.g ?? 1,
      ),
      garageNoiseScale: floats._NoiseScale ?? 3,
      garageFireIntensity: floats._Intensity ?? 1,
    };
    for (const [key, value] of Object.entries(uniforms))
      shader.uniforms[key] = { value };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 garageUv;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\ngarageUv = uv;");
    shader.fragmentShader = `varying vec2 garageUv;
      uniform float garageTime, garageNoiseScale, garageFireIntensity;
      uniform vec2 garageFlow;
      uniform vec4 garageFireShape, garageDistortion;
      uniform float garageSecondaryAlpha;
      uniform sampler2D garageSecondary, garageMask, garageNoise, garageEmissionA, garageEmissionB;
      uniform vec3 garageSecondaryColor, garageFireColor, garageHotColor, garageEmissionColorA, garageEmissionColorB;
      ${shader.fragmentShader}`;
    let surface = "#include <map_fragment>\n";
    if (secondary)
      surface += `vec4 secondaryLayer = texture2D(garageSecondary, garageUv);
      diffuseColor.rgb = mix(diffuseColor.rgb, secondaryLayer.rgb * garageSecondaryColor, secondaryLayer.a * garageSecondaryAlpha);\n`;
    if (material.userData.clock)
      surface += `float fireMask = texture2D(garageMask, garageUv).r;
      float distortion = texture2D(garageNoise, garageUv * garageDistortion.z + garageTime * garageDistortion.xy).r - .5;
      float flame = texture2D(garageNoise, garageUv * garageNoiseScale + garageTime * garageFlow + distortion * garageDistortion.w).r;
      float falloff = pow(1.0 - clamp(garageUv.y / garageFireShape.x, 0.0, 1.0), garageFireShape.y);
      float heat = clamp(flame * falloff * fireMask, 0.0, 1.0);
      float flameLayer = smoothstep(garageFireShape.z, garageFireShape.z + garageFireShape.w, heat);
      vec3 fireColor = mix(garageFireColor, garageHotColor, heat) * garageFireIntensity;
      diffuseColor.rgb = mix(diffuseColor.rgb, fireColor, flameLayer);\n`;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      surface,
    );
    let emission = "#include <emissivemap_fragment>\n";
    if (material.userData.clock)
      emission += "totalEmissiveRadiance += fireColor * flameLayer;\n";
    if (emissionA)
      emission +=
        "totalEmissiveRadiance += texture2D(garageEmissionA, garageUv).rgb * garageEmissionColorA;\n";
    if (emissionB)
      emission +=
        "totalEmissiveRadiance += texture2D(garageEmissionB, garageUv).rgb * garageEmissionColorB;\n";
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      emission,
    );
  };
  material.customProgramCacheKey = () =>
    [!!secondary, !!material.userData.clock, !!emissionA, !!emissionB].join(
      ":",
    );
  resources.push(material);
  return material;
}

export function shiftHue(rgb, shift) {
  const max = Math.max(...rgb),
    min = Math.min(...rgb),
    delta = max - min;
  if (!delta) return rgb;
  let hue =
    max === rgb[0]
      ? (rgb[1] - rgb[2]) / delta
      : max === rgb[1]
        ? 2 + (rgb[2] - rgb[0]) / delta
        : 4 + (rgb[0] - rgb[1]) / delta;
  hue = (((hue / 6 + shift) % 1) + 1) % 1;
  const saturation = delta / max;
  return [5, 3, 1].map((offset) => {
    const k = (hue * 6 + offset) % 6;
    return max * (1 - saturation * Math.max(0, Math.min(k, 4 - k, 1)));
  });
}

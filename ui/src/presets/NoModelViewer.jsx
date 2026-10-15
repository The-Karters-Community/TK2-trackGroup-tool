// The hosted site cannot read installed Unity bundles. Its Vite build aliases
// the optional desktop renderer here, so Three.js stays out of website assets.
export default function NoModelViewer() {
  return null;
}

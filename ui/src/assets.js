export function assetUrl(path) {
  return import.meta.env.MODE === "web" && path.startsWith("/")
    ? `${import.meta.env.BASE_URL}${path.slice(1)}`
    : path;
}

export async function api(action, body) {
  const response = await fetch(`/api/${action}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-TK2-Token": document.querySelector('meta[name="tk2-session"]').content,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Request failed");
  return value;
}

export function download(group) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(group, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${group.id}.tk2group.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

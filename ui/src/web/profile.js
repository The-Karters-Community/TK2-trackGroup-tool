import { parse, stringify } from "lossless-json";

// Only the third record is edited. LosslessNumber retains every unrelated
// numeric token (including 64-bit account IDs) without JS rounding.
export const MAX_SAVE = 32 * 1024 * 1024;
export const SAVE_NAME = /^\d+PTK_PlayerData_v19tpp0_bt0$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const number = (value) => Number(value?.isLosslessNumber ? value.value : value);
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const characters = (value) => [...value].length;

export function validateName(name) {
  if (
    typeof name !== "string" ||
    !name.trim() ||
    characters(name) > 200 ||
    /[\x00-\x1f]/.test(name)
  )
    throw new Error(
      "Group name must be 1–200 characters without control characters.",
    );
  return name;
}

export function validateGroup(group) {
  if (
    !object(group) ||
    group.format !== "tk2-track-group" ||
    group.version !== 1
  )
    throw new Error(
      "Unsupported group file. Expected tk2-track-group version 1.",
    );
  if (
    Object.keys(group).some(
      (key) =>
        ![
          "format",
          "version",
          "id",
          "revision",
          "name",
          "description",
          "tracks",
        ].includes(key),
    )
  )
    throw new Error("Group file contains unsupported or private fields.");
  if (typeof group.id !== "string" || !uuid.test(group.id))
    throw new Error("Invalid group ID.");
  if (!Number.isSafeInteger(group.revision) || group.revision < 1)
    throw new Error("Invalid group revision.");
  validateName(group.name);
  if (
    typeof (group.description ?? "") !== "string" ||
    characters(group.description ?? "") > 4000
  )
    throw new Error("Invalid group description.");
  if (
    !Array.isArray(group.tracks) ||
    !group.tracks.length ||
    group.tracks.length > 1000
  )
    throw new Error("A group needs 1–1000 tracks.");
  const seen = new Set();
  for (const track of group.tracks) {
    if (
      !object(track) ||
      Object.keys(track).some(
        (key) =>
          !["kind", "configId", "modId", "workshopId", "title"].includes(key),
      )
    )
      throw new Error("Invalid track fields.");
    if (
      typeof (track.title ?? "") !== "string" ||
      characters(track.title ?? "") > 300
    )
      throw new Error("Invalid track title.");
    let identity;
    if (track.kind === "official") {
      if (
        !Number.isInteger(track.configId) ||
        track.configId < -(2 ** 31) ||
        track.configId >= 2 ** 31 ||
        track.configId === -1 ||
        "modId" in track ||
        "workshopId" in track
      )
        throw new Error("Invalid official track ID.");
      identity = `official:${track.configId}`;
    } else if (track.kind === "workshop") {
      if (
        typeof track.workshopId !== "string" ||
        !/^[1-9]\d{0,19}$/.test(track.workshopId) ||
        BigInt(track.workshopId) >= 2n ** 64n
      )
        throw new Error("Workshop IDs must be decimal strings.");
      if (
        typeof track.modId !== "string" ||
        !track.modId ||
        characters(track.modId) > 300 ||
        /[\x00-\x1f]/.test(track.modId) ||
        "configId" in track
      )
        throw new Error("Missing internal Workshop track identifier.");
      identity = `workshop:${track.modId}`;
    } else throw new Error("Unknown track type.");
    if (seen.has(identity)) throw new Error("Duplicate track in group.");
    seen.add(identity);
  }
  return group;
}

export function encodeLength(size) {
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_SAVE)
    throw new Error("Invalid record size.");
  const bytes = [];
  while (size >= 128) {
    bytes.push((size & 127) | 128);
    size = Math.floor(size / 128);
  }
  return new Uint8Array([...bytes, size]);
}

export function readProfile(bytes, filename) {
  if (filename && !SAVE_NAME.test(filename))
    throw new Error(
      "Select the original PTK_PlayerData_v19tpp0_bt0 save, without a backup extension.",
    );
  if (
    !(bytes instanceof Uint8Array) ||
    !bytes.length ||
    bytes.length > MAX_SAVE
  )
    throw new Error("Unsupported or oversized save.");
  const spans = [];
  const records = [];
  let position = 0;
  for (let record = 0; record < 3; record++) {
    const start = position;
    let size = 0;
    let complete = false;
    for (let shift = 0; shift <= 28; shift += 7) {
      if (position >= bytes.length) throw new Error("Truncated save record.");
      const byte = bytes[position++];
      if (shift === 28 && byte > 7)
        throw new Error("Invalid save length prefix.");
      size += (byte & 127) * 2 ** shift;
      if (!(byte & 128)) {
        complete = true;
        break;
      }
    }
    if (!complete || size > MAX_SAVE || position + size > bytes.length)
      throw new Error("Invalid or truncated save record.");
    records.push(decoder.decode(bytes.subarray(position, position + size)));
    position += size;
    spans.push(bytes.slice(start, position));
  }
  if (position !== bytes.length)
    throw new Error("Unknown trailing save data; this build is unsupported.");
  const data = parse(records[2]);
  if (!object(data) || !Array.isArray(data.ItemsGroupDefinedContainers))
    throw new Error("Save has no supported track group list.");
  const identities = new Set();
  for (const container of data.ItemsGroupDefinedContainers) {
    const definition = container?.GroupDefinition;
    if (
      !object(definition) ||
      typeof definition.UniqueID !== "string" ||
      (isCustom(container) && !Array.isArray(container.groupItems))
    )
      throw new Error("Unsupported group structure in save.");
    if (identities.has(definition.UniqueID))
      throw new Error("Save contains ambiguous duplicate group IDs.");
    identities.add(definition.UniqueID);
  }
  return { original: bytes.slice(), spans, data, filename };
}

function isCustom(container) {
  const d = container.GroupDefinition;
  return (
    number(d.Type) === 0 && number(d.SubType) === 0 && d.IsDefault === false
  );
}

export function customGroups(profile, knownTracks = new Map()) {
  return profile.data.ItemsGroupDefinedContainers.filter(isCustom).map(
    (container) => {
      const d = container.GroupDefinition;
      const tracks = container.groupItems.map((item) =>
        item.modHashID
          ? {
              kind: "workshop",
              modId: item.modHashID,
              ...knownTracks.get(item.modHashID),
            }
          : { kind: "official", configId: number(item.configID) },
      );
      return {
        format: "tk2-track-group",
        version: 1,
        id: d.UniqueID,
        revision: 1,
        name: d.Name,
        tracks,
        editable: d.CanBeModified !== false,
        unresolvedTracks: tracks.filter(
          (t) => t.kind === "workshop" && !t.workshopId,
        ).length,
      };
    },
  );
}

export function portableGroup(group) {
  // Never spread a native container or profile into a shared file.
  return validateGroup({
    format: "tk2-track-group",
    version: 1,
    id: group.id,
    revision: group.revision || 1,
    name: group.name,
    description: group.description || "",
    tracks: group.tracks.map((t) => ({ ...t })),
  });
}

function nativeItems(group) {
  return group.tracks.map((track) => ({
    configID: track.kind === "official" ? track.configId : -1,
    modHashID: track.modId || "",
    iPresetID: -1,
  }));
}

export function matchesGroup(container, group) {
  const expectedItems = nativeItems(group);
  return (
    container.GroupDefinition.Name === group.name &&
    container.groupItems.length === group.tracks.length &&
    container.groupItems.every((item, i) => {
      const expected = expectedItems[i];
      return (
        Object.keys(item).length === 3 &&
        number(item.configID) === expected.configID &&
        item.modHashID === expected.modHashID &&
        number(item.iPresetID) === expected.iPresetID
      );
    })
  );
}

export function reviewImport(profile, source) {
  const group = portableGroup(source);
  const all = profile.data.ItemsGroupDefinedContainers;
  const official = new Set(
    all
      .filter(
        (c) =>
          c.GroupDefinition.IsDefault === true &&
          number(c.GroupDefinition.Type) === 0 &&
          number(c.GroupDefinition.SubType) === 0,
      )
      .flatMap((c) =>
        (c.groupItems ?? [])
          .filter((item) => !item.modHashID)
          .map((item) => number(item.configID)),
      ),
  );
  for (const track of group.tracks) {
    if (track.kind === "official" && !official.has(track.configId))
      throw new Error(
        `Official track ${track.configId} is not present in this save's built-in groups.`,
      );
  }
  const existing = all.find((c) => c.GroupDefinition.UniqueID === group.id);
  if (
    existing &&
    (!isCustom(existing) || existing.GroupDefinition.CanBeModified === false)
  )
    throw new Error("This import would replace a protected group.");
  const sameName = all.filter(
    (c) =>
      isCustom(c) &&
      c.GroupDefinition.CanBeModified !== false &&
      c.GroupDefinition.Name === group.name,
  );
  return {
    group,
    existing,
    sameName,
    unchanged: Boolean(existing && matchesGroup(existing, group)),
  };
}

export function serializeProfile(profile, data) {
  const third = encoder.encode(stringify(data));
  const parts = [
    profile.spans[0],
    profile.spans[1],
    encodeLength(third.length),
    third,
  ];
  const result = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  readProfile(result, profile.filename);
  return result;
}

export function importGroup(
  profile,
  source,
  { targetId, confirmUpdate = false, date = new Date() } = {},
) {
  const review = reviewImport(profile, source);
  const { group } = review;
  const containers = profile.data.ItemsGroupDefinedContainers.slice();
  const identity = targetId || review.existing?.GroupDefinition.UniqueID;
  const index = identity
    ? containers.findIndex((c) => c.GroupDefinition.UniqueID === identity)
    : -1;
  if (identity && index === -1)
    throw new Error("The selected group no longer exists.");
  let action;
  let destinationName = group.name;
  if (index >= 0) {
    const previous = containers[index];
    if (!isCustom(previous) || previous.GroupDefinition.CanBeModified === false)
      throw new Error("Protected groups cannot be replaced.");
    if (
      targetId &&
      targetId !== group.id &&
      previous.GroupDefinition.Name !== group.name
    )
      throw new Error(
        "Only an explicitly selected same-name group can be updated.",
      );
    if (matchesGroup(previous, group))
      return { bytes: profile.original, action: "unchanged", name: group.name };
    if (!confirmUpdate)
      throw new Error("Review and confirm replacing this group.");
    containers[index] = {
      ...previous,
      groupItems: nativeItems(group),
      GroupDefinition: { ...previous.GroupDefinition, Name: group.name },
    };
    action = "updated";
  } else {
    const names = new Set(containers.map((c) => c.GroupDefinition.Name));
    let suffix = 2;
    while (names.has(destinationName))
      destinationName = `${group.name} (${suffix++})`;
    const indices = containers
      .filter(
        (c) =>
          number(c.GroupDefinition.Type) === 0 &&
          number(c.GroupDefinition.SubType) === 0,
      )
      .map((c) => number(c.GroupDefinition.Index ?? -1));
    if (
      indices.some((n) => !Number.isSafeInteger(n)) ||
      Math.max(-1, ...indices) >= 2 ** 31 - 1
    )
      throw new Error("Invalid group positions in this save.");
    containers.push({
      $type: "ItemsGroupDefaultContainer",
      groupItems: nativeItems(group),
      GroupDefinition: {
        Index: Math.max(-1, ...indices) + 1,
        UniqueID: group.id,
        ManuallySetUniqueID: false,
        CanBeModified: true,
        CanBeRemoved: true,
        Name: destinationName,
        Type: 0,
        SubType: 0,
        MaxElementsCount: 0,
        IsForGP: false,
        CreationDate: date.toISOString(),
        IsDefault: false,
      },
    });
    action = "added";
  }
  return {
    bytes: serializeProfile(profile, {
      ...profile.data,
      ItemsGroupDefinedContainers: containers,
    }),
    action,
    name: destinationName,
  };
}

export function editGroup(profile, { id, name, order }) {
  validateName(name);
  const containers = profile.data.ItemsGroupDefinedContainers.slice();
  const index = containers.findIndex((c) => c.GroupDefinition.UniqueID === id);
  const previous = containers[index];
  if (
    !previous ||
    !isCustom(previous) ||
    previous.GroupDefinition.CanBeModified === false
  )
    throw new Error("Choose a modifiable custom group.");
  if (containers.some((c, i) => i !== index && c.GroupDefinition.Name === name))
    throw new Error("Another group already uses that name.");
  if (
    !Array.isArray(order) ||
    order.length !== previous.groupItems.length ||
    new Set(order).size !== order.length ||
    order.some((n) => !Number.isInteger(n) || n < 0 || n >= order.length)
  )
    throw new Error("Include each track exactly once.");
  if (name === previous.GroupDefinition.Name && order.every((n, i) => n === i))
    return profile.original;
  containers[index] = {
    ...previous,
    GroupDefinition: { ...previous.GroupDefinition, Name: name },
    groupItems: order.map((i) => previous.groupItems[i]),
  };
  return serializeProfile(profile, {
    ...profile.data,
    ItemsGroupDefinedContainers: containers,
  });
}

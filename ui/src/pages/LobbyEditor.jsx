import { useEffect, useState } from "react";
import PresetEditor from "../presets/PresetEditor.jsx";
import { cosmetic } from "../presets/model.js";

// Reuse the normal editor but keep the room CPU identity and baseline. Choosing
// a library preset copies its cosmetics into a draft, never its preset ID.
export default function LobbyEditor({
  player,
  state,
  busy,
  loadImage,
  loadModel,
  refreshModels,
  onClose,
  onSave,
  library,
}) {
  const [preset, setPreset] = useState(() => ({
    id: player.id,
    data: cosmetic(player.data),
  }));
  const playerData = JSON.stringify(player.data);
  useEffect(() => {
    setPreset({ id: player.id, data: cosmetic(player.data) });
  }, [player.id, playerData]);
  const canEdit = player.ai === true && player.canEditCpu === true;
  const name = player.name?.trim();
  const title =
    name &&
    !["player", "racer", "cpu", "cpu racer"].includes(name.toLowerCase())
      ? name
      : `CPU${Number.isInteger(player.player) ? ` ${player.player + 1}` : ""}`;
  return (
    <PresetEditor
      preset={preset}
      presets={state?.presets || []}
      appearance={state?.appearance}
      busy={busy}
      title={`${title} · CPU setup`}
      subtitle="Current lobby CPU"
      saveLabel="Apply to CPU"
      hideCollectionActions
      choosePreset
      canSave={canEdit}
      canSavePreset={canEdit}
      gameRunning
      loadImage={loadImage}
      loadModel={loadModel}
      refreshModels={refreshModels}
      library={library}
      onClose={onClose}
      onSave={async (data, baseline) => {
        const result = await onSave(data, baseline);
        if (result) setPreset({ id: player.id, data: cosmetic(data) });
        return result;
      }}
    />
  );
}

using System;
using System.Text.Json;
using Il2CppInterop.Runtime;
using Il2CppInterop.Runtime.Attributes;
using UnityEngine;
using UnityEngine.SceneManagement;
using Preset = PTK_ProfileCustomizationPresets.CustomizationPreset;
using UObject = UnityEngine.Object;

namespace TK2.Garage.Preview;

// Unity work stays on its main thread. The render operation never mutates
// profiles or calls RenderIcon, EnsurePresetIcon, or the game's PNG saver.
// SavePreset has a separate, guarded path for one existing preset.
public sealed class PreviewHost : MonoBehaviour
{
    public PreviewHost(IntPtr pointer) : base(pointer) { }
    private PreviewPipe? pipe;
    private Request? active;
    private PTK_MenuIconRenderManager? manager;
    private bool oldCameraActive, oldItemActive, oldBackground, oldCustom, oldManual;
    private int readyFrame = -1;
    private Quaternion oldRotation;

    public void Awake()
    {
        oldBackground = Application.runInBackground;
        Application.runInBackground = true;
        pipe = new PreviewPipe();
    }
    [HideFromIl2Cpp]
    private static string? Unavailable()
    {
        if (SceneManager.GetActiveScene().name != "MainMenuScene") return "Open the main menu for live previews.";
        if (PTK_MenuIconRenderManager.Instance == null) return "The game's preview renderer is not ready.";
        return null;
    }
    public void Update()
    {
        try
        {
            if (active != null)
            {
                var reason = Unavailable();
                if (reason != null || DateTime.UtcNow > active.Deadline)
                    Finish(new { ready = false, message = reason ?? "The game took too long to load these appearances." });
                return;
            }
            if (pipe == null || !pipe.Queue.TryDequeue(out var request)) return;
            if (DateTime.UtcNow > request.Deadline)
            {
                request.Result.TrySetResult(new { ready = false, message = "Preview request expired." });
                return;
            }
            var blocked = Unavailable();
            if (request.Operation == "status" || blocked != null)
            {
                request.Result.TrySetResult(new { ready = blocked == null, protocol = 1, message = blocked ?? "Game renderer connected." });
                return;
            }
            if (request.Operation == "save-preset")
            {
                try { request.Result.TrySetResult(SavePreset(request)); }
                catch (Exception ex)
                {
                    request.Result.TrySetResult(new { ready = false, message = "Game save failed: " + ex.Message });
                }
                return;
            }
            var renderer = PTK_MenuIconRenderManager.Instance;
            if (renderer._isRendering || renderer.currentPresetIdsToRender.Count > 0)
            {
                request.Result.TrySetResult(new { ready = false, message = "The game is finishing its own icon renders. Retry shortly." });
                return;
            }
            active = request;
            var preset = BuildPreset(request.Data, request.View);
            manager = renderer; readyFrame = -1;
            oldCameraActive = renderer.cameraRender.activeSelf;
            oldItemActive = renderer.playerIconPreviewItem.gameObject.activeSelf;
            oldCustom = renderer.playerIconPreviewItem.bUseCustomPresetForIconRender;
            oldManual = renderer.playerIconPreviewItem.bDuringManualRotation;
            oldRotation = renderer.playerIconPreviewItem.transform.rotation;
            renderer._isRendering = true; // Short lease prevents its own queue sharing this renderer.
            renderer.playerIconPreviewItem.bUseCustomPresetForIconRender = true;
            renderer.playerIconPreviewItem.gameObject.SetActive(true);
            renderer.cameraRender.SetActive(true);
            var completion = DelegateSupport.ConvertDelegate<Il2CppSystem.Action>((Action)(() => {
                if (!ReferenceEquals(active, request)) return;
                renderer.playerIconPreviewItem.SetManualRotation(true);
                renderer.playerIconPreviewItem.transform.rotation = Quaternion.Euler(0, request.Rotation, 0) * oldRotation;
                readyFrame = Time.frameCount + 3;
            }));
            renderer.playerIconPreviewItem.LoadForIconRender(preset, completion);
        }
        catch (Exception ex)
        {
            if (active != null) Finish(new { ready = false, message = "Game preview failed: " + ex.Message });
        }
    }
    [HideFromIl2Cpp]
    private static object SavePreset(Request request)
    {
        var profile = PTK_PlayerProfile.Instance;
        if (profile == null || profile.customizationPresets == null)
            return new { ready = false, message = "The game profile is not loaded." };
        if (string.IsNullOrWhiteSpace(request.Profile) || request.Profile != profile.strLocalSaveFileName)
            return new { ready = false, message = "The active game profile changed. Refresh the app and reopen this preset." };
        if (request.PresetId <= 0)
            return new { ready = false, message = "Invalid preset ID." };
        var preset = profile.customizationPresets.GetPresetFromPresetID(request.PresetId);
        if (preset == null)
            return new { ready = false, message = "That preset is no longer in the active profile." };
        if (!SamePreset(preset, request.Baseline))
            return new { ready = false, message = "This preset changed in the game. Reopen it to review the latest version; nothing was saved." };
        // Validate every field before mutating the live object. The game remains the
        // sole owner of serialization, local-file writes and Steam Cloud sync.
        ApplyPreset(preset, request.Data);
        try
        {
            profile.SaveProfileLocalData();
        }
        catch
        {
            ApplyPreset(preset, request.Baseline);
            try { profile.SaveProfileLocalData(); } catch { }
            throw;
        }
        return new { ready = true, operation = "save-preset", saved = true, profile = profile.strLocalSaveFileName, presetId = request.PresetId };
    }
    [HideFromIl2Cpp]
    private static bool SamePreset(Preset preset, JsonElement data)
    {
        try
        {
            if (preset.iCharacterSkinMaterialID != data.GetProperty("iCharacterSkinMaterialID").GetInt32() ||
                preset.iVehicleMaterialID != data.GetProperty("iVehicleMaterialID").GetInt32() ||
                preset.iWheelMaterialID != data.GetProperty("iWheelMaterialID").GetInt32() ||
                preset.iCharacterSkinMaterialID_Modded != data.GetProperty("iCharacterSkinMaterialID_Modded").GetInt32() ||
                preset.iVehicleMaterialID_Modded != data.GetProperty("iVehicleMaterialID_Modded").GetInt32() ||
                preset.iWheelMaterialID_Modded != data.GetProperty("iWheelMaterialID_Modded").GetInt32() ||
                preset.bUsingModdedVersion != data.GetProperty("bUsingModdedVersion").GetBoolean()) return false;
            var stickers = data.GetProperty("stickersData");
            if (stickers.GetArrayLength() != 20 || preset.stickersData == null || preset.stickersData.Length != 20) return false;
            for (int i = 0; i < 20; i++)
            {
                var item = stickers[i]; var current = preset.stickersData[i];
                if (current == null || current.iStickerMaterialID != item.GetProperty("iStickerMaterialID").GetInt32() ||
                    current.iStickerMaterialID_SettingsPacked != item.GetProperty("iStickerMaterialID_SettingsPacked").GetInt32() ||
                    current.iStickerMaterialID_Modded != item.GetProperty("iStickerMaterialID_Modded").GetInt32() ||
                    current.iStickerMaterialID_Modded_SettingsPacked != item.GetProperty("iStickerMaterialID_Modded_SettingsPacked").GetInt32()) return false;
            }
            return true;
        }
        catch { return false; }
    }
    [HideFromIl2Cpp]
    private static void ApplyPreset(Preset preset, JsonElement data)
    {
        int character = data.GetProperty("iCharacterSkinMaterialID").GetInt32();
        int vehicle = data.GetProperty("iVehicleMaterialID").GetInt32();
        int wheels = data.GetProperty("iWheelMaterialID").GetInt32();
        int characterMod = data.GetProperty("iCharacterSkinMaterialID_Modded").GetInt32();
        int vehicleMod = data.GetProperty("iVehicleMaterialID_Modded").GetInt32();
        int wheelsMod = data.GetProperty("iWheelMaterialID_Modded").GetInt32();
        bool modded = data.GetProperty("bUsingModdedVersion").GetBoolean();
        var stickers = data.GetProperty("stickersData");
        if (stickers.GetArrayLength() != 20 || preset.stickersData == null || preset.stickersData.Length != 20)
            throw new InvalidOperationException("The preset sticker data is incomplete.");
        var stickerValues = new int[20, 4];
        for (int i = 0; i < 20; i++)
        {
            var item = stickers[i];
            stickerValues[i, 0] = item.GetProperty("iStickerMaterialID").GetInt32();
            stickerValues[i, 1] = item.GetProperty("iStickerMaterialID_SettingsPacked").GetInt32();
            stickerValues[i, 2] = item.GetProperty("iStickerMaterialID_Modded").GetInt32();
            stickerValues[i, 3] = item.GetProperty("iStickerMaterialID_Modded_SettingsPacked").GetInt32();
        }
        preset.iCharacterSkinMaterialID = character; preset.iVehicleMaterialID = vehicle; preset.iWheelMaterialID = wheels;
        preset.iCharacterSkinMaterialID_Modded = characterMod; preset.iVehicleMaterialID_Modded = vehicleMod; preset.iWheelMaterialID_Modded = wheelsMod;
        preset.bUsingModdedVersion = modded;
        for (int i = 0; i < 20; i++)
        {
            var target = preset.stickersData[i];
            target.iStickerMaterialID = stickerValues[i, 0]; target.iStickerMaterialID_SettingsPacked = stickerValues[i, 1];
            target.iStickerMaterialID_Modded = stickerValues[i, 2]; target.iStickerMaterialID_Modded_SettingsPacked = stickerValues[i, 3];
        }
    }
    public void LateUpdate()
    {
        if (active == null || manager == null || readyFrame < 0 || Time.frameCount < readyFrame) return;
        if (manager.playerIconPreviewItem.bIsLoadingKartCharOrWheels) return;
        var previous = RenderTexture.active;
        Texture2D? image = null;
        try
        {
            var texture = manager.iconRenderTexture;
            if (texture == null || texture.width > 2048 || texture.height > 2048) throw new InvalidOperationException("Invalid preview texture.");
            RenderTexture.active = texture;
            image = new Texture2D(texture.width, texture.height, TextureFormat.RGBA32, false);
            image.ReadPixels(new Rect(0, 0, texture.width, texture.height), 0, 0);
            image.Apply();
            var png = ImageConversion.EncodeToPNG(image);
            Finish(new { ready = true, protocol = 1, png = Convert.ToBase64String((byte[])png), source = "game" });
        }
        catch (Exception ex) { Finish(new { ready = false, message = "Could not capture preview: " + ex.Message }); }
        finally { RenderTexture.active = previous; if (image != null) UObject.Destroy(image); }
    }
    [HideFromIl2Cpp]
    private static Preset BuildPreset(JsonElement data, string view)
    {
        if (view != "original" && view != "modded") throw new InvalidOperationException("Invalid preview version.");
        var p = new Preset(-1); // Detached temporary object, never registered in the profile.
        p.iCharacterSkinMaterialID = data.GetProperty("iCharacterSkinMaterialID").GetInt32();
        p.iVehicleMaterialID = data.GetProperty("iVehicleMaterialID").GetInt32();
        p.iWheelMaterialID = data.GetProperty("iWheelMaterialID").GetInt32();
        p.iCharacterSkinMaterialID_Modded = data.GetProperty("iCharacterSkinMaterialID_Modded").GetInt32();
        p.iVehicleMaterialID_Modded = data.GetProperty("iVehicleMaterialID_Modded").GetInt32();
        p.iWheelMaterialID_Modded = data.GetProperty("iWheelMaterialID_Modded").GetInt32();
        p.bUsingModdedVersion = view == "modded";
        var config = TK_GameConfig.Data;
        int character = p.bUsingModdedVersion ? p.iCharacterSkinMaterialID_Modded : p.iCharacterSkinMaterialID;
        int vehicle = p.bUsingModdedVersion ? p.iVehicleMaterialID_Modded : p.iVehicleMaterialID;
        int wheels = p.bUsingModdedVersion ? p.iWheelMaterialID_Modded : p.iWheelMaterialID;
        if (!config.characterSkinsMaterial.ContainsConfigID(character) ||
            !config.KartSkins.ContainsConfigID(vehicle) || !config.WheelsMaterial.ContainsConfigID(wheels))
            throw new InvalidOperationException("A selected appearance is not loaded in the game. Install its mod and restart the game.");
        var stickers = data.GetProperty("stickersData");
        if (stickers.GetArrayLength() != 20) throw new InvalidOperationException("Expected twenty sticker slots.");
        for (int i = 0; i < 20; i++)
        {
            var s = stickers[i]; var target = p.stickersData[i];
            target.iStickerMaterialID = s.GetProperty("iStickerMaterialID").GetInt32();
            target.iStickerMaterialID_SettingsPacked = s.GetProperty("iStickerMaterialID_SettingsPacked").GetInt32();
            target.iStickerMaterialID_Modded = s.GetProperty("iStickerMaterialID_Modded").GetInt32();
            target.iStickerMaterialID_Modded_SettingsPacked = s.GetProperty("iStickerMaterialID_Modded_SettingsPacked").GetInt32();
        }
        return p;
    }
    [HideFromIl2Cpp]
    private void Finish(object result)
    {
        var request = active; active = null; readyFrame = -1;
        try
        {
            if (manager != null)
            {
                var item = manager.playerIconPreviewItem;
                item.CancelLoad(); item.SetCustomPresetForIconRender(null); item.DestroyCurrentPreview();
                item.bUseCustomPresetForIconRender = oldCustom;
                item.SetManualRotation(oldManual); item.transform.rotation = oldRotation;
                item.gameObject.SetActive(oldItemActive);
                manager.cameraRender.SetActive(oldCameraActive);
                manager._isRendering = false;
                manager.TryProcessNextJob();
            }
        }
        catch { /* Scene teardown may already have destroyed renderer objects. */ }
        finally { manager = null; request?.Result.TrySetResult(result); }
    }
    public void OnDestroy()
    {
        pipe?.Dispose();
        if (active != null) Finish(new { ready = false, message = "Game renderer closed." });
        Application.runInBackground = oldBackground;
    }
}
